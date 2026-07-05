// @b9g/ipabet — the IPAbet engine in TypeScript.
//
// A faithful port of the macOS IME's stateless engine
// (ime/Sources/InputController.swift): every keystroke reads the text before
// the cursor and returns an edit — insert, replace-the-previous-cluster, or
// pass (defer to the host's native behavior). There is no composition state.
// All previous-glyph rules operate on the decomposed (NFD) view of the last
// grapheme cluster and recompose to NFC on write, so precomposed é and
// unfused n̥ behave identically. Tables come from spec/ipabet.json — the
// same single source of truth the IME loads.

import spec from "../../spec/ipabet.json";

export interface Keystroke {
	/** The key's unshifted US-layout character: "a", "5", ";", "[" … */
	key: string;
	shift?: boolean;
	option?: boolean;
}

export type Edit =
	/** Insert text at the cursor. */
	| {type: "insert"; text: string}
	/** Replace the last `length` UTF-16 units before the cursor with text. */
	| {type: "replace"; length: number; text: string}
	/** Defer to the host: native character, native delete, native shortcut. */
	| {type: "pass"};

interface Mark {
	mark: string;
	spacing: boolean;
	double?: string;
	cycle: string[];
	/** Spacing clone (´, ^): the mark's standalone form. No clone → the
	 * combining mark rides a no-break space. */
	clone?: string;
}

function standalone(m: Mark): string {
	return m.clone ?? "\u{00A0}" + m.mark;
}

// ---------------------------------------------------------------- tables

const letters = new Map<string, string>();
for (const e of spec.letters as {key: string; glyph: string}[]) {
	letters.set(e.key, e.glyph);
}

const optMarks = new Map<string, Mark>();
for (const e of spec.marks as {
	opt: string;
	mark: string;
	type: string;
	double?: string;
	cycle?: string[];
	clone?: string;
}[]) {
	optMarks.set(e.opt, {
		mark: e.mark,
		spacing: e.type === "spacing",
		double: e.double,
		cycle: e.cycle ?? [],
		clone: e.clone,
	});
}

const sups = new Map<string, string>();
for (const e of (spec.superscripts as {table: {base: string; sup: string}[]})
	.table) {
	sups.set(e.base, e.sup);
}

// transformation index: (previous output glyph + keystroke) → combined glyph
const transforms = new Map<string, string>();
for (const [key, glyph] of letters) {
	if (key.length === 2) {
		const prev = letters.get(key[0]);
		if (prev !== undefined) transforms.set(prev + key[1], glyph);
	}
}

// US layout, shift plane, for the ⌥⇧ raw escape (digits only need the map;
// letters are just uppercased).
const SHIFTED_DIGITS: Record<string, string> = {
	"1": "!", "2": "@", "3": "#", "4": "$", "5": "%",
	"6": "^", "7": "&", "8": "*", "9": "(", "0": ")",
};

const VOWELS = "iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ";

// IPA bases whose descenders collide with a below-ring: the voiceless ring
// rides above these (ŋ̊, ɡ̊, j̊), below everything else (n̥, l̥).
const DESCENDERS = new Set("gɡjɟʄpqyŋɱɳɻɭɽʂʐʝɣɖʈɥɰʒ");

const RING_BELOW = "̥";
const RING_ABOVE = "̊";

// ---------------------------------------------------------------- unicode

const segmenter = new Intl.Segmenter();

/** The last grapheme cluster of `text`, or undefined. */
function lastCluster(text: string): string | undefined {
	if (text.length === 0) return undefined;
	// Segment only a small tail window, like the IME's 16-unit read.
	const tail = text.slice(-32);
	let last: string | undefined;
	for (const s of segmenter.segment(tail)) last = s.segment;
	return last;
}

function isCombining(cp: string): boolean {
	return /\p{M}/u.test(cp);
}

/** Split a cluster into its base glyph and trailing combining marks (NFD). */
function decompose(cluster: string): {base: string; marks: string[]} {
	let base = "";
	const marks: string[] = [];
	for (const cp of cluster.normalize("NFD")) {
		if (isCombining(cp)) marks.push(cp);
		else if (marks.length === 0) base += cp;
		else base += cp; // non-mark after marks: keep with base (degenerate)
	}
	return {base, marks};
}

function recompose(base: string, marks: readonly string[]): string {
	return (base + marks.join("")).normalize("NFC");
}

function replaceCluster(cluster: string, text: string): Edit {
	return {type: "replace", length: cluster.length, text};
}

// ---------------------------------------------------------------- marks

/**
 * Combining mark: decorate the previous glyph. Repeat presses cycle through
 * the mark's forms (double / positional twin / cycle variants), wrapping
 * around. A mark with only one form CAPS: the press emits the mark's
 * standalone form (spacing clone, or NBSP-carried) instead of stacking a
 * duplicate — mark keys never remove (backspace peels). With no glyph to
 * decorate, the standalone form likewise. (A bare combining mark can't be
 * "inserted after" a cluster: Unicode attaches it right back — that IS
 * stacking.)
 */
function applyCombining(m: Mark, textBefore: string): Edit {
	const p = lastCluster(textBefore);
	if (p === undefined) return {type: "insert", text: standalone(m)};
	if (p === m.clone) return {type: "insert", text: standalone(m)};
	const {base, marks} = decompose(p);
	let scalar = m.mark;
	if (scalar === RING_BELOW && DESCENDERS.has(base[0] ?? "")) {
		scalar = RING_ABOVE; // ring below → ring above on a descender base
	}
	const last = marks[marks.length - 1];
	if (last !== undefined) {
		const forms = [scalar];
		if (m.double !== undefined) forms.push(m.double);
		forms.push(...m.cycle);
		const i = forms.indexOf(last);
		if (forms.length > 1 && i !== -1) {
			const next = forms[(i + 1) % forms.length];
			return replaceCluster(p, recompose(base, [...marks.slice(0, -1), next]));
		}
		if (last === scalar) {
			// already wears it, no other form: cap
			return {type: "insert", text: standalone(m)};
		}
	}
	return replaceCluster(p, recompose(base, [...marks, scalar]));
}

/**
 * Spacing mark: insert in place. Same mark again upgrades it; on the
 * upgraded form it cycles back (ˈ ⇄ ˌ) rather than stacking a stray mark.
 */
function applySpacing(m: Mark, textBefore: string): Edit {
	if (m.double !== undefined) {
		const p = lastCluster(textBefore);
		if (p === m.mark) return replaceCluster(p, m.double);
		if (p === m.double) return replaceCluster(p, m.mark);
	}
	return {type: "insert", text: m.mark};
}

function applyMark(m: Mark, textBefore: string): Edit {
	return m.spacing ? applySpacing(m, textBefore) : applyCombining(m, textBefore);
}

/** ⌥4: superscriptize the previous glyph (`t` `h` ⌥4 → tʰ). */
function superscriptize(textBefore: string): Edit {
	const p = lastCluster(textBefore);
	if (p !== undefined) {
		const {base, marks} = decompose(p);
		const sup = sups.get(base);
		if (sup !== undefined) return replaceCluster(p, recompose(sup, marks));
	}
	return {type: "insert", text: "4"};
}

// ---------------------------------------------------------------- engine

/**
 * The IPAbet keystroke handler. Mirrors the IME's handle():
 * bare keys are plain US, ⇧number → IPA glyph, ⇧letter → transform of the
 * previous glyph, ⌥ → postfix diacritics, ⌥⇧ → raw-US escape on
 * letters/digits. Command/control chords and anything unmapped pass.
 */
export function handleKey(textBefore: string, k: Keystroke): Edit {
	const key = k.key;
	const shift = k.shift ?? false;
	const option = k.option ?? false;
	if (key.length !== 1) return {type: "pass"};

	// Option-Shift: raw-US escape on letters/digits; punctuation passes so
	// the host's own Option typography (curly quotes, dashes) survives.
	if (option && shift) {
		if (/[a-z]/i.test(key)) return {type: "insert", text: key.toUpperCase()};
		if (/[0-9]/.test(key)) {
			return {type: "insert", text: SHIFTED_DIGITS[key] ?? key};
		}
		return {type: "pass"};
	}

	// Option: the postfix diacritic layer, keyed by the unshifted US char.
	if (option) {
		if (key === "4") return superscriptize(textBefore);
		const m = optMarks.get(key);
		if (m !== undefined) return applyMark(m, textBefore);
		if (/[0-9]/.test(key)) return {type: "insert", text: key};
		return {type: "pass"};
	}

	// Number row: bare → native digit; Shift → the IPA glyph (⇧5 → ə);
	// number keys with no glyph (9, 0) pass so ( and ) stay native.
	if (/[0-9]/.test(key)) {
		if (shift) {
			const glyph = letters.get(key);
			if (glyph !== undefined) return {type: "insert", text: glyph};
		}
		return {type: "pass"};
	}

	const s = shift ? key.toUpperCase() : key;

	// Shift-letter modifiers transform the previous glyph in place; any
	// combining marks already on it survive the swap (decomposed view).
	const p = lastCluster(textBefore);
	if (p !== undefined) {
		const {base, marks} = decompose(p);
		const combo = transforms.get(base + s);
		if (combo !== undefined) return replaceCluster(p, recompose(combo, marks));
		// vowel rhoticization: R after any vowel. ə and ɜ have precomposed
		// rhotic glyphs (ɚ ɝ); every other vowel takes the spacing hook ˞.
		if (s === "R" && base.length > 0 && VOWELS.includes(base[0])) {
			let out: string;
			if (base === "ə") out = recompose("ɚ", marks);
			else if (base === "ɜ") out = recompose("ɝ", marks);
			else out = recompose(base, marks) + "˞";
			return replaceCluster(p, out);
		}
	}

	// letter / click base glyph
	const glyph = letters.get(s);
	if (glyph !== undefined) return {type: "insert", text: glyph};

	// capitals with no transform, punctuation: native
	return {type: "pass"};
}

/**
 * Backspace: peel the last combining mark off the previous cluster (é → e,
 * n̥ → n); a bare glyph passes so the host deletes it natively.
 */
export function handleBackspace(textBefore: string): Edit {
	const p = lastCluster(textBefore);
	if (p === undefined) return {type: "pass"};
	const {base, marks} = decompose(p);
	if (marks.length === 0) return {type: "pass"};
	// orphan combining mark: let the host delete the whole cluster
	if (base.length === 0) return {type: "pass"};
	return replaceCluster(p, recompose(base, marks.slice(0, -1)));
}

/**
 * Apply an edit to a buffer. `pass` inserts the keystroke's native character
 * when one is given (what the host would have typed), else nothing.
 */
export function applyEdit(text: string, edit: Edit, native = ""): string {
	switch (edit.type) {
		case "insert":
			return text + edit.text;
		case "replace":
			return text.slice(0, text.length - edit.length) + edit.text;
		case "pass":
			return text + native;
	}
}

/** The native (US) character a keystroke would type, for pass fallbacks. */
export function nativeChar(k: Keystroke): string {
	if (k.key.length !== 1) return "";
	if (k.shift && /[a-z]/i.test(k.key)) return k.key.toUpperCase();
	if (k.shift && /[0-9]/.test(k.key)) return SHIFTED_DIGITS[k.key] ?? "";
	if (k.option) return ""; // host Option typography is host-specific
	return k.key;
}

/**
 * Convenience: run a sequence of keystrokes against a buffer, applying pass
 * edits with their native character. Backspace is the keystroke {key: "⌫"}.
 */
export function typeKeys(keys: Keystroke[], initial = ""): string {
	let text = initial;
	for (const k of keys) {
		const edit =
			k.key === "⌫" ? handleBackspace(text) : handleKey(text, k);
		if (k.key === "⌫" && edit.type === "pass") {
			// native delete: drop the last grapheme cluster
			const p = lastCluster(text);
			text = p === undefined ? text : text.slice(0, text.length - p.length);
		} else {
			text = applyEdit(text, edit, nativeChar(k));
		}
	}
	return text;
}
