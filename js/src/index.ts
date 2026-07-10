// @b9g/ipabet — the IPAbet engine in TypeScript.
//
// A faithful port of the macOS IME's stateless engine
// (macos/Sources/InputController.swift): every keystroke reads the text before
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
	| {type: "pass"}
	/** Only the pending composition changed; the document is untouched. The host
	 *  renders `pending` however it likes (marked text in the IME, a decoration
	 *  on the web). Nothing is ever written to the document to represent it. */
	| {type: "noop"};

/**
 * Diacritics awaiting a base — the dead-key composition, held by the HOST, never
 * smuggled into the document. (A sentinel character can't work: NBSP, and even
 * NBSP+combining, occur in real pasted text and would be mistaken for ours.)
 * The macOS IME renders this as marked text; the web editor draws it itself.
 */
export type Pending = readonly string[];

/** What `handleKey`/`handleBackspace` return: an edit, plus the next pending. */
export interface Step {
	edit: Edit;
	pending: Pending;
}

interface Mark {
	mark: string;
	spacing: boolean;
	double?: string;
	cycle: string[];
	/** Spacing clone (´, ^): the mark's standalone form. No clone → the
	 * combining mark rides a no-break space. */
	clone?: string;
}

// ---------------------------------------------------------------- tables

const letters = new Map<string, string>();
for (const e of spec.letters as {key: string; glyph: string}[]) {
	letters.set(e.key, e.glyph);
}

const optMarks = new Map<string, Mark>();
/** Exclusive duals: a mark and its ⌥⇧ twin are the two values of ONE feature
 *  (advanced/retracted, apical/laminal, syllabic/non-syllabic…). They are
 *  mutually exclusive, so the twin *replaces* rather than stacks — no segment
 *  is both advanced and retracted. Shape-twins that are independent features
 *  (tilde/creaky, diaeresis/breathy) stack, and are absent from this map. */
const exclusiveTwin = new Map<string, string>();
/** combining scalar → its spacing form, for the dead-key preview and for the
 *  flush that commits an unconsumed accent (⌥e then space → ´). */
const cloneOf = new Map<string, string>();
for (const e of spec.marks as {
	opt: string;
	mark: string;
	type: string;
	double?: string;
	cycle?: string[];
	clone?: string;
	doubleClone?: string;
	exclusive?: boolean;
}[]) {
	optMarks.set(e.opt, {
		mark: e.mark,
		spacing: e.type === "spacing",
		double: e.double,
		cycle: e.cycle ?? [],
		clone: e.clone,
	});
	if (e.exclusive === true && e.double !== undefined) {
		exclusiveTwin.set(e.mark, e.double);
		exclusiveTwin.set(e.double, e.mark);
	}
	if (e.clone !== undefined) cloneOf.set(e.mark, e.clone);
	if (e.doubleClone !== undefined && e.double !== undefined) {
		cloneOf.set(e.double, e.doubleClone);
	}
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

// ⌥⇧<digit> slots spent on a character rather than the raw-US escape.
const optShiftDigits: Record<string, string> =
	(spec as {optShift?: Record<string, string>}).optShift ?? {};

const VOWELS = "iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ";

// Voiceless obstruents — the ejectivizable set (⇧P). Plosives + oral
// fricatives; ejectives need voicelessness (sealed glottis) and a closure.
const VOICELESS_OBSTRUENTS = "ptʈckqɸfθsʃʂçxχɬ";

// IPA bases whose descenders collide with a below-ring: the voiceless ring
// rides above these (ŋ̊, ɡ̊, j̊), below everything else (n̥, l̥).
const DESCENDERS = new Set("gɡjɟʄpqyŋɱɳɻɭɽʂʐʝɣɖʈɥɰʒ");

// below-form ⇄ above-form for descender bases (ring, syllabic line); position
// is non-contrastive, the engine owns it. Applied to the *final* base, so a
// mark that landed below on n rides above once ⇧G makes it ŋ.
const POSITIONAL: Record<string, string> = {
	"\u{0325}": "\u{030A}",
	"\u{0329}": "\u{030D}",
};
const POSITIONAL_INV: Record<string, string> = {
	"\u{030A}": "\u{0325}",
	"\u{030D}": "\u{0329}",
};
function reposition(base: string, marks: readonly string[]): string[] {
	const desc = DESCENDERS.has(base[0] ?? "");
	return marks.map((sc) => (desc ? POSITIONAL[sc] : POSITIONAL_INV[sc]) ?? sc);
}

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
		// base takes leading non-combining scalars; once any mark appears,
		// everything after goes to marks (matches the Swift engine).
		if (marks.length === 0 && !isCombining(cp)) base += cp;
		else marks.push(cp);
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
 * Combining ⌥ diacritics are PREFIX (dead-key style, like é/ñ on the US
 * keyboard): the mark comes first and the next base absorbs it. Statelessly,
 * the pending marks live in the HOST's composition state (marked text in the
 * IME), and `emitBase` folds the accumulated stack onto the base that follows.
 * A form's primary is ⌥, its secondary is ⌥⇧ (the mark's `double`); pressing
 * the same form again on the pending placeholder lifts it off (toggle). Marks
 * are independent and can co-occur (ã̯). Spacing marks (length,
 * tone, stress) are standalone glyphs, not decorations, so they stay postfix.
 */
/** The dead-key preview: each pending mark as its spacing glyph where one
 *  exists (⌥e → ´, matching the US layout's terminator), else the bare
 *  combining glyph. Never a dotted circle — U+25CC renders enormous in some
 *  hosts, and Apple's dead keys always show a real spacing character. */
export function previewString(pending: Pending): string {
	return pending.map((sc) => cloneOf.get(sc) ?? sc).join("");
}

/** Commit an unconsumed accent as its spacing form (dead-key convention:
 *  ⌥e then space → ´), clearing the composition. */
function flush(pending: Pending): Step {
	if (pending.length === 0) return {edit: {type: "noop"}, pending: []};
	return {edit: {type: "insert", text: previewString(pending)}, pending: []};
}

/** Combining diacritic (⌥/⌥⇧): stack it into the pending composition. The same
 *  form again peels it off. An exclusive dual replaces its twin — nothing is
 *  both advanced and retracted; independent shape-twins (tilde/creaky) stack. */
function pendingDiacritic(scalar: string, pending: Pending): Step {
	let next: string[];
	if (pending[pending.length - 1] === scalar) {
		next = pending.slice(0, -1);
	} else {
		const twin = exclusiveTwin.get(scalar);
		const rest = twin !== undefined ? pending.filter((m) => m !== twin) : [...pending];
		next = [...rest, scalar];
	}
	return {edit: {type: "noop"}, pending: next};
}

/** Spacing mark (stress, length, tone letter): insert it in place, postfix. */
function applySpacing(scalar: string): Edit {
	return {type: "insert", text: scalar};
}

/** Apply a mark's primary (⌥) or secondary (⌥⇧, the `double`) form. */
function applyMark(m: Mark, pending: Pending, secondary = false): Step {
	const scalar = secondary && m.double !== undefined ? m.double : m.mark;
	if (!m.spacing) return pendingDiacritic(scalar, pending);
	const f = flush(pending);                       // a pending accent commits first
	const text = (f.edit.type === "insert" ? f.edit.text : "") + scalar;
	return {edit: {type: "insert", text}, pending: []};
}

/** Emit a base glyph, committing any pending prefix diacritics onto it. */
function emitBase(glyph: string, pending: Pending): Step {
	if (pending.length === 0) return {edit: {type: "insert", text: glyph}, pending: []};
	// dark l: overlay + l is the atomic ɫ, not a ragged l̴
	if (pending.length === 1 && pending[0] === "\u{0334}" && glyph === "l") {
		return {edit: {type: "insert", text: "ɫ"}, pending: []};
	}
	const marks = reposition(glyph, [...pending]);
	return {edit: {type: "insert", text: recompose(glyph, marks)}, pending: []};
}

/** ⌥p: superscriptize the previous glyph (`t` `h` ⌥p → tʰ). */
function superscriptize(textBefore: string): Edit {
	const p = lastCluster(textBefore);
	if (p !== undefined) {
		const {base, marks} = decompose(p);
		const sup = sups.get(base);
		if (sup !== undefined) return replaceCluster(p, recompose(sup, marks));
	}
	return {type: "insert", text: "p"};
}

// ---------------------------------------------------------------- engine

/**
 * The IPAbet keystroke handler. Mirrors the IME's handle():
 * bare keys are plain US, ⇧number → IPA glyph, ⇧letter → transform of the
 * previous glyph, ⌥ → prefix (dead-key) diacritics, ⌥⇧ → raw-US escape on
 * letters/digits. Command/control chords and anything unmapped pass.
 */
export function handleKey(textBefore: string, k: Keystroke, pending: Pending = []): Step {
	const key = k.key;
	const shift = k.shift ?? false;
	const option = k.option ?? false;
	/** Any key that neither stacks a diacritic nor absorbs one commits the pending
	 *  accent first (dead-key convention: ⌥e then space → ´), then does its own
	 *  thing. A `pass` becomes an insert of accent + the native character, since a
	 *  single Edit can't both commit and defer. */
	const withFlush = (edit: Edit): Step => {
		if (pending.length === 0) return {edit, pending: []};
		const pre = previewString(pending);
		if (edit.type === "insert") return {edit: {type: "insert", text: pre + edit.text}, pending: []};
		if (edit.type === "pass") return {edit: {type: "insert", text: pre + nativeChar(k)}, pending: []};
		return {edit, pending: []};
	};
	// Non-typing keys (arrows, Enter): defer entirely, and leave the composition
	// alone — swallowing them to commit an accent would eat navigation.
	if (key.length !== 1) return {edit: {type: "pass"}, pending};

	// Option-Shift: the secondary form of a two-form mark (⌥⇧n → creaky,
	// ⌥⇧' → secondary stress). Where the key holds no such mark it's the
	// raw-US escape on letters/digits (⌥⇧H → H, ⌥⇧2 → @); punctuation passes
	// so the host's own Option typography (curly quotes, dashes) survives.
		if (option && shift) {
			const m2 = optMarks.get(key);
			if (m2 !== undefined && m2.double !== undefined) return applyMark(m2, pending, true);
			if (/[a-z]/i.test(key)) return withFlush({type: "insert", text: key.toUpperCase()});
			if (/[0-9]/.test(key)) {
				// A slot spent deliberately (⌥⇧1 → ¡, ⌥⇧6 → ß).
				const over = optShiftDigits[key];
				if (over !== undefined) return withFlush({type: "insert", text: over});
				// The raw-US escape exists only because ⇧<digit> is an IPA glyph, leaving
				// the shifted character otherwise unreachable (⇧2 is ʔ, so @ lives here).
				// Where ⇧<digit> is unclaimed the escape is redundant — pass, and the
				// host's own ⌥⇧8 ° ⌥⇧9 · ⌥⇧0 ‚ survive.
				if (letters.has(key)) return withFlush({type: "insert", text: SHIFTED_DIGITS[key] ?? key});
			}
			return withFlush({type: "pass"});
		}

		// Option: the prefix (dead-key) diacritic layer, keyed by the unshifted US char.
		// An unassigned key passes — digits included, so the host's ⌥6 §, ⌥7 ¶, ⌥8 •
		// survive. (This used to insert the bare digit, destroying them to produce a
		// character the unshifted digit key already types.)
		if (option) {
			const m = optMarks.get(key);
			if (m !== undefined) return applyMark(m, pending);
			if (key === "p") return withFlush(superscriptize(textBefore));
			return withFlush({type: "pass"});
		}

	// Number row: bare → native digit; Shift → the IPA glyph (⇧5 → ə);
	// number keys with no glyph (9, 0) pass so ( and ) stay native.
	if (/[0-9]/.test(key)) {
		if (shift) {
			const glyph = letters.get(key);
			if (glyph !== undefined) return emitBase(glyph, pending);
		}
		return withFlush({type: "pass"});
	}

	const s = shift ? key.toUpperCase() : key;

	// Shift-letter modifiers transform the previous glyph in place; any
	// combining marks already on it survive the swap (decomposed view).
	const p = pending.length === 0 ? lastCluster(textBefore) : undefined;
	if (p !== undefined) {
		let {base, marks} = decompose(p);
		// Shift-chaining: a capital typed right after a special (non-ASCII) IPA
		// glyph is a *pending base* — lower it so a following modifier transforms
		// it, while a capital that never gets a modifier simply stays as typed
		// (it already passed through natively). Two glyphs of lookback keep this
		// stateless and preserve caps by default: "ʃ⇧T" → ʃT, but "ʃ⇧T⇧R" → ʃʈ.
		// Acronyms never have a special glyph behind them, so they stay literal.
		if (shift && /^[A-Z]$/.test(base)) {
			// Is the glyph behind this pending capital IPA content? Test the WHOLE
			// cluster, not just its base: "t͡" is ASCII t carrying a tie (U+0361),
			// and "s̪" is ASCII s carrying a bridge — both are plainly IPA, and a
			// base-only test would break the chain right after ⇧1 or a diacritic.
			const p2 = lastCluster(textBefore.slice(0, textBefore.length - p.length));
			if (p2 !== undefined && [...p2].some((c) => c.codePointAt(0)! > 127)) {
				base = base.toLowerCase();
			}
		}
		const combo = transforms.get(base + s);
		if (combo !== undefined) {
			return {edit: replaceCluster(p, recompose(combo, reposition(combo, marks))), pending: []};
		}
		// vowel rhoticization: R after any vowel. ə and ɜ have precomposed
		// rhotic glyphs (ɚ ɝ); every other vowel takes the spacing hook ˞.
		if (s === "R" && base.length > 0 && VOWELS.includes(base[0])) {
			let out: string;
			if (base === "ə") out = recompose("ɚ", marks);
			else if (base === "ɜ") out = recompose("ɝ", marks);
			else out = recompose(base, marks) + "˞";
			return {edit: replaceCluster(p, out), pending: []};
		}
		// ejective: X (eXplosive) after a voiceless obstruent appends ʼ (U+02BC).
		// Open class, guarded like R; a non-obstruent falls through to a literal X.
		if (s === "X" && base.length > 0 && VOICELESS_OBSTRUENTS.includes(base[0])) {
			return {edit: replaceCluster(p, recompose(base, marks) + "\u{02BC}"), pending: []};
		}
	}

	// letter / click base glyph — committing any pending prefix diacritics
	const glyph = letters.get(s);
	if (glyph !== undefined) return emitBase(glyph, pending);

	// A pending accent absorbs onto a CAPITAL base: ⌥u ⇧A → Ä. The letters table
	// is lowercase-keyed, so without this the capital misses and the accent
	// commits as a spacing clone ("¨A"). That broke every accented capital in
	// every language — Ä Ö Ü É Á Ñ Ç — i.e. every sentence-initial word.
	// Only fires while an accent pends, so acronyms and shift-chaining are
	// untouched (the transform path is already skipped when pending).
	if (pending.length > 0 && /^[A-Z]$/.test(s)) return emitBase(s, pending);

	// capitals with no transform, punctuation: native. Under shift-chaining this
	// is also how a chained base is emitted — a capital, pending a modifier that
	// may lower+transform it (handled above via two-glyph lookback).
	return withFlush({type: "pass"});
}

/**
 * Backspace: peel the last combining mark off the previous cluster (é → e,
 * n̥ → n); a bare glyph passes so the host deletes it natively.
 */
export function handleBackspace(textBefore: string, pending: Pending = []): Step {
	// Backspace peels the pending accent first — the dead key is undone before
	// the document is touched at all.
	if (pending.length > 0) return {edit: {type: "noop"}, pending: pending.slice(0, -1)};
	const p = lastCluster(textBefore);
	if (p === undefined) return {edit: {type: "pass"}, pending: []};
	const {base, marks} = decompose(p);
	if (marks.length === 0) return {edit: {type: "pass"}, pending: []};
	// orphan combining mark: let the host delete the whole cluster
	if (base.length === 0) return {edit: {type: "pass"}, pending: []};
	return {edit: replaceCluster(p, recompose(base, marks.slice(0, -1))), pending: []};
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
		case "noop":
			return text;   // only the composition changed
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
	let pending: Pending = [];
	for (const k of keys) {
		const step =
			k.key === "⌫" ? handleBackspace(text, pending) : handleKey(text, k, pending);
		pending = step.pending;
		if (k.key === "⌫" && step.edit.type === "pass") {
			// native delete: drop the last grapheme cluster
			const p = lastCluster(text);
			text = p === undefined ? text : text.slice(0, text.length - p.length);
		} else {
			text = applyEdit(text, step.edit, nativeChar(k));
		}
	}
	// An accent still pending at the end commits as its spacing form — what the
	// IME does on commitComposition when focus leaves.
	if (pending.length > 0) text += previewString(pending);
	return text;
}
