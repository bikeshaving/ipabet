// @b9g/ipabet — the IPAbet engine in TypeScript, ported from the macOS IME
// (macos/Sources/InputController.swift). Tables come from spec/ipabet.json.

import spec from "../../spec/ipabet.json";

export interface Keystroke {
	/** The key's unshifted US-layout character: "a", "5", ";", "[" … */
	key: string;
	shift?: boolean;
	option?: boolean;
	/** Shift was physically RELEASED since the previous keystroke. */
	shiftBroke?: boolean;
	/** Caps Lock is engaged. A lock, not a modifier. */
	capsLock?: boolean;
	/** Control is held. Only ⌃⇧<letter> is claimed. */
	control?: boolean;
}

export type Edit =
	/** Insert text at the cursor. */
	| {type: "insert"; text: string}
	/** Replace the last `length` UTF-16 units before the cursor with text. */
	| {type: "replace"; length: number; text: string}
	/** Defer to the host: native character, native delete, native shortcut. */
	| {type: "pass"}
	/** Only the pending composition changed; the document is untouched. */
	| {type: "noop"};

/** Diacritics awaiting a base, held by the HOST. Never a sentinel character in
 *  the document: NBSP+combining occurs in real pasted text. */
export type Pending = readonly string[];

/** An edit, the next pending, and whether a shift release broke an IPA chain.
 *  Only the caller can see a release, so it threads `chainBroken` back in. */
export interface Step {
	edit: Edit;
	pending: Pending;
	chainBroken?: boolean;
}

interface Mark {
	mark: string;
	spacing: boolean;
	double?: string;
	/** The ⌥⇧ form is spacing while the ⌥ form is combining. */
	doubleSpacing?: boolean;
	cycle: string[];
	doubleCycle: string[];
	/** The mark's standalone form. No clone → it rides a no-break space. */
	clone?: string;
}

// ---------------------------------------------------------------- tables

const letters = new Map<string, string>();
for (const e of spec.letters as {key: string; glyph: string}[]) {
	letters.set(e.key, e.glyph);
}

const optMarks = new Map<string, Mark>();
/** A mark and its ⌥⇧ twin are two values of ONE feature, so the twin *replaces*
 *  rather than stacks. Shape-twins that stack are absent from this map. */
const exclusiveTwin = new Map<string, string>();
/** combining scalar → its spacing form. */
const cloneOf = new Map<string, string>();
for (const e of spec.marks as {
	opt: string;
	mark: string;
	type: string;
	double?: string;
	doubleSpacing?: boolean;
	cycle?: string[];
	doubleCycle?: string[];
	clone?: string;
	doubleClone?: string;
	exclusive?: boolean;
}[]) {
	optMarks.set(e.opt, {
		mark: e.mark,
		spacing: e.type === "spacing",
		double: e.double,
		doubleSpacing: e.doubleSpacing === true,
		cycle: e.cycle ?? [],
		doubleCycle: e.doubleCycle ?? [],
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

const subs = new Map<string, string>();
for (const e of (spec.subscripts as {table: {base: string; sub: string}[]})
	.table) {
	subs.set(e.base, e.sub);
}

/** ⌥z / ⌥⇧z pend as sentinels, not combining scalars: nothing is stacked onto
 *  the base, the base is SUBSTITUTED. */
const RAISE = "\u{0001}sup";
const LOWER = "\u{0001}sub";
// Preview ⁻ / ₋: the bar sits where the glyph will land. Every other small mark
// (^ + − ↑) is already a diacritic's clone, or is IPA's own raised/lowered pair.
cloneOf.set(RAISE, "\u{207B}");
cloneOf.set(LOWER, "\u{208B}");
/** An operator is an instruction, not a character: unconsumed, it commits
 *  nothing and lifts. */
const OPERATORS = new Set([RAISE, LOWER]);

/** Raised/lowered glyph → its plain base, for unraise-transform-re-raise. */
const unsup = new Map<string, string>();
for (const [base, sup] of sups) if (!unsup.has(sup)) unsup.set(sup, base);
const unsub = new Map<string, string>();
for (const [base, sub] of subs) if (!unsub.has(sub)) unsub.set(sub, base);

// glyph → its two-key spelling, for ⌃⌫ unconvert (θ → "tH"). First key wins.
const unconvertKey = new Map<string, string>();

// transformation index: (previous output glyph + keystroke) → combined glyph
const transforms = new Map<string, string>();
for (const [key, glyph] of letters) {
	if (key.length === 2) {
			// A leading digit is a literal base a modifier transforms (5H → ɜ).
		const prev = /[0-9]/.test(key[0]) ? key[0] : letters.get(key[0]);
		if (prev !== undefined) transforms.set(prev + key[1], glyph);
		if (!unconvertKey.has(glyph)) unconvertKey.set(glyph, key);
	}
}

// US shift plane; letters are just uppercased.
const SHIFTED_DIGITS: Record<string, string> = {
	"1": "!", "2": "@", "3": "#", "4": "$", "5": "%",
	"6": "^", "7": "&", "8": "*", "9": "(", "0": ")",
};
// Punctuation shift plane: the web binding re-inserts, so a pass edit must know
// ⇧` is ~. The IME never needs it — a declined key is typed by the host.
const SHIFTED_PUNCT: Record<string, string> = {
	"`": "~", "-": "_", "=": "+", "[": "{", "]": "}", "\\": "|",
	";": ":", "'": "\"", ",": "<", ".": ">", "/": "?",
};

// The quote locale is CONFIGURATION, not composition state.
const QUOTE_LOCALES = (spec as {quotes: {default: string; locales: Record<string, string[]>}}).quotes;
let quoteLocale = QUOTE_LOCALES.default;
/** Set the active quote locale (en, de, fr, ch, pl, ru, sv). Unknown → default. */
export function setQuoteLocale(locale: string): void {
	quoteLocale = locale in QUOTE_LOCALES.locales ? locale : QUOTE_LOCALES.default;
}
function quoteQuad(): string[] {
	return QUOTE_LOCALES.locales[quoteLocale] ?? QUOTE_LOCALES.locales[QUOTE_LOCALES.default];
}

// ⌥⇧<digit> slots spent on a character rather than the raw-US escape.
const optShiftDigits: Record<string, string> =
	(spec as {optShift?: Record<string, string>}).optShift ?? {};

// A capital digraph capitalizes its result; a plain-ASCII result is excluded
// (⇧T⇧J stays "TJ"). ʔ is caseless in Unicode — Ɂ is the one hand map.
const HAND_CAPS: Record<string, string> = {"\u{0294}": "\u{0241}"}; // ʔ → Ɂ
function capitalOf(low: string): string | undefined {
	const hand = HAND_CAPS[low];
	if (hand !== undefined) return hand;
	const up = low.toUpperCase();
	if (up !== low && [...up].length === 1 && up.codePointAt(0)! > 0x7f) {
		return up;
	}
	return undefined;
}


// The tie bar (⌥j) and its below-form (⌥⇧j). The other chord flips placement,
// the same chord again toggles sliding ͢ and back.
const TIE = "͡";
const TIE_BELOW = "͜";
const SLIDE = "͢";
const TIES = [TIE, TIE_BELOW];

/** ⌥j / ⌥⇧j: emit a joiner, or rewrite the one just emitted. */
function emitJoiner(textBefore: string, start: string, pending: Pending): Step {
	const p = lastCluster(textBefore);
	if (p !== undefined && pending.length === 0) {
		const last = [...p].pop()!;
		const next =
			last === start ? SLIDE :                         // same again → sliding
			last === SLIDE ? start :                         // …and back
			TIES.includes(last) ? start : undefined;         // other tie → placement flip
		if (next !== undefined) {
			return {edit: {type: "replace", length: last.length, text: next}, pending: []};
		}
	}
	return emitBase(start, pending);
}

// Each above/below placement is its own keystroke (⌥k/⌥⇧k, ⌥s/⌥⇧s, ⌥j/⌥⇧j).
// The engine emits the mark asked for, on the base asked for.

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
		// Once any mark appears, everything after goes to marks (matches Swift).
		if (marks.length === 0 && !isCombining(cp)) base += cp;
		else marks.push(cp);
	}
	return {base, marks};
}

// Marks of the SAME combining class never reorder under NFC, so a tone typed
// before its shape mark freezes as a permanent homoglyph of ế. So try every
// arrangement (≤3 in practice) and keep the shortest NFC.
function recompose(base: string, marks: readonly string[]): string {
	if (marks.length <= 1) return (base + marks.join("")).normalize("NFC");
	let best: string | undefined;
	for (const perm of permutations([...marks])) {
		const s = (base + perm.join("")).normalize("NFC");
		if (best === undefined || [...s].length < [...best].length) best = s;
	}
	return best!;
}

function permutations<T>(items: T[]): T[][] {
	if (items.length <= 1) return [items];
	const out: T[][] = [];
	for (let i = 0; i < items.length; i++) {
		const rest = [...items.slice(0, i), ...items.slice(i + 1)];
		for (const p of permutations(rest)) out.push([items[i], ...p]);
	}
	return out;
}

function replaceCluster(cluster: string, text: string): Edit {
	return {type: "replace", length: cluster.length, text};
}

// ---------------------------------------------------------------- marks

/** Combining ⌥ diacritics are PREFIX (dead-key style): the mark comes first and
 *  the next base absorbs it. Spacing marks (length, tone, stress) are postfix. */
/** The dead-key preview: each pending mark as its spacing glyph. Never a dotted
 *  circle — U+25CC renders enormous in some hosts. */
export function previewString(pending: Pending): string {
	return pending.map((sc) => cloneOf.get(sc) ?? sc).join("");
}

/** Commit an unconsumed accent as its spacing form (⌥e then space → ´). */
function flush(pending: Pending): Step {
	if (pending.length === 0) return {edit: {type: "noop"}, pending: []};
	const text = commitString(pending);
	// An operator alone leaves nothing behind: the arm just lifts.
	if (text === "") return {edit: {type: "noop"}, pending: []};
	return {edit: {type: "insert", text}, pending: []};
}

/** What a pending composition writes when it commits: a mark as its spacing
 *  clone, an operator as nothing. */
function commitString(pending: Pending): string {
	return pending.filter((sc) => !OPERATORS.has(sc))
		.map((sc) => cloneOf.get(sc) ?? sc).join("");
}

/** Stack a diacritic into the pending composition. The same form again peels it
 *  off, unless the key declares a CYCLE, which advances and wraps. */
function pendingDiacritic(scalar: string, pending: Pending, cycle: string[] = []): Step {
	let next: string[];
	const top = pending[pending.length - 1];
	const family = [scalar, ...cycle];
	const at = top === undefined ? -1 : family.indexOf(top);
	if (at >= 0 && cycle.length > 0) {
		next = [...pending.slice(0, -1), family[(at + 1) % family.length]];
	} else if (top === scalar) {
		next = pending.slice(0, -1);
	} else {
		const twin = exclusiveTwin.get(scalar);
		const rest = twin !== undefined ? pending.filter((m) => m !== twin) : [...pending];
		next = [...rest, scalar];
	}
	return {edit: {type: "noop"}, pending: next};
}

/** Apply a mark's primary (⌥) or secondary (⌥⇧, the `double`) form. */
function applyMark(m: Mark, pending: Pending, secondary = false): Step {
	const scalar = secondary && m.double !== undefined ? m.double : m.mark;
	// Spacing belongs to the FORM, not the key.
	const spacing = secondary && m.double !== undefined ? m.doubleSpacing === true : m.spacing;
	if (!spacing) return pendingDiacritic(scalar, pending, secondary ? m.doubleCycle : m.cycle);
	const f = flush(pending);                       // a pending accent commits first
	const text = (f.edit.type === "insert" ? f.edit.text : "") + scalar;
	return {edit: {type: "insert", text}, pending: []};
}

// NFC cannot fuse an overlay, so every combination Unicode encodes atomically
// must be emitted atomic — a raw combining render is a permanent homoglyph
// (i̵ beside ɨ fails search forever). Diagonal-slash atoms stay out, ł excepted.
const STROKED = new Map(Object.entries({
	l: "ł", L: "Ł", d: "đ", D: "Đ", t: "ŧ", T: "Ŧ", g: "ǥ", G: "Ǥ",
	h: "ħ", H: "Ħ", b: "ƀ", B: "Ƀ", z: "ƶ", Z: "Ƶ",
	i: "ɨ", I: "Ɨ", u: "ʉ", U: "Ʉ", o: "ɵ", O: "Ɵ", j: "ɟ",
	r: "ɍ", R: "Ɍ", y: "ɏ", Y: "Ɏ", c: "ȼ", C: "Ȼ", p: "ᵽ", P: "Ᵽ",
	k: "ꝁ", K: "Ꝁ", "2": "ƻ",
}));

// Unicode's middle-tilde letters, plus the dark ls.
const TILDED = new Map(Object.entries({
	l: "ɫ", L: "Ɫ", b: "ᵬ", d: "ᵭ", f: "ᵮ", m: "ᵯ", n: "ᵰ",
	p: "ᵱ", r: "ᵲ", s: "ᵴ", t: "ᵵ", z: "ᵶ",
}));

/** Emit a base glyph, committing any pending prefix diacritics onto it. */
function emitBase(glyph: string, pending: Pending): Step {
	if (pending.length === 0) return {edit: {type: "insert", text: glyph}, pending: []};
	// Raise/lower substitutes the glyph itself; any marks then ride the result.
	const op = pending.find((x) => x === RAISE || x === LOWER);
	if (op !== undefined) {
		const rest = pending.filter((x) => x !== op);
		const moved = (op === RAISE ? sups : subs).get(glyph);
		// No such form in Unicode → the operator lifts and the glyph lands plain.
		const text = recompose(moved ?? glyph, rest);
		return {edit: {type: "insert", text}, pending: []};
	}
	// tilde overlay: middle-tilde atoms (ɫ Ɫ ᵯ …) — ɫ is also a digraph, l⇧Q
	if (pending.length === 1 && pending[0] === "\u{0334}") {
		const t = TILDED.get(glyph);
		if (t !== undefined) return {edit: {type: "insert", text: t}, pending: []};
	}
	// stroke overlay: the orthographic letters are precomposed (⌥y l → ł, ⌥y d → đ)
	if (pending.length === 1 && pending[0] === "\u{0335}") {
		const s = STROKED.get(glyph);
		if (s !== undefined) return {edit: {type: "insert", text: s}, pending: []};
	}
	const marks = [...pending];
	return {edit: {type: "insert", text: recompose(glyph, marks)}, pending: []};
}

/** ⌥z / ⌥⇧z: arm the raise or the lower. Same chord again lifts it; the twin
 *  replaces. */
function pendingOperator(op: string, pending: Pending): Step {
	if (pending.includes(op)) {
		return {edit: {type: "noop"}, pending: pending.filter((x) => x !== op)};
	}
	const twin = op === RAISE ? LOWER : RAISE;
	return {edit: {type: "noop"}, pending: [...pending.filter((x) => x !== twin), op]};
}

// ---------------------------------------------------------------- engine

/**
 * The IPAbet keystroke handler, mirroring the IME's handle().
 *
 * Shift-chaining lets a capital continue a transcription (ʃ⇧I⇧H → ʃɪ), gated on
 * a *broken* flag the caller threads in. This owns the flag; handleKeyCore only
 * reads it.
 */
export function handleKey(
	textBefore: string,
	k: Keystroke,
	pending: Pending = [],
	chainBroken = false,
): Step {
	const brokenIn = chainBroken || (k.shiftBroke ?? false);
	const step = handleKeyCore(textBefore, k, pending, !brokenIn);
	// A transform or a non-ASCII insert is a fresh IPA glyph and re-arms the chain.
	const e = step.edit;
	const seg = e.type === "replace" || (e.type === "insert" && /[^\x00-\x7f]/.test(e.text));
	return {...step, chainBroken: seg ? false : brokenIn};
}

function handleKeyCore(textBefore: string, k: Keystroke, pending: Pending, chainLive: boolean): Step {
	const key = k.key;
	const shift = k.shift ?? false;
	const option = k.option ?? false;
	/** Any key that neither stacks nor absorbs a diacritic commits the pending
	 *  accent first. A `pass` becomes an insert, since one Edit can't do both. */
	const withFlush = (edit: Edit): Step => {
		if (pending.length === 0) return {edit, pending: []};
		const pre = commitString(pending);
		if (pre === "") return {edit, pending: []};
		if (edit.type === "insert") return {edit: {type: "insert", text: pre + edit.text}, pending: []};
		if (edit.type === "pass") return {edit: {type: "insert", text: pre + nativeChar(k)}, pending: []};
		return {edit, pending: []};
	};
	// Esc commits the spacing clones, and is consumed only while marks pend —
	// otherwise it stays vim's key.
	if (key === "Escape" && k.control !== true && !option) {
		return pending.length > 0 ? flush(pending) : {edit: {type: "pass"}, pending};
	}
	// Non-typing keys (arrows, Enter) defer and leave the composition alone.
	if (key.length !== 1) return {edit: {type: "pass"}, pending};

	// ⌃⇧<letter> — the literal-capital escape, bypassing everything downstream.
	// On Control because ⌃ chords are leader keys the host keeps.
	if (k.control === true) {
		if (shift && /^[a-z]$/.test(key)) {
			return withFlush({type: "insert", text: key.toUpperCase()});
		}
		return {edit: {type: "pass"}, pending}; // leader keys: the host owns them
	}

	// Space commits the clone and is CONSUMED; with nothing pending it stays a space.
	if (key === " " && !option && pending.length > 0) {
		const f = flush(pending);
		// An operator alone lifts; swallowing the space would eat a real keystroke.
		if (f.edit.type === "noop") return {edit: {type: "pass"}, pending: []};
		return f;
	}

	// Option-Shift: a mark's second form. With no second form it DECLINES, so the
	// host's own Option typography passes.
		if (option && shift) {
			// The tie's BELOW form, for colliding descenders (t͜ɕ d͜ʒ).
			if (key === "j") return emitJoiner(textBefore, TIE_BELOW, pending);
			// ⌥⇧z arms the lower — the shifted twin of ⌥z's raise.
			if (key === "z") return pendingOperator(LOWER, pending);
			// Locale quotes: ⌥⇧[ closes primary, ⌥⇧] closes secondary.
			if (key === "[") return withFlush({type: "insert", text: quoteQuad()[1]});
			if (key === "]") return withFlush({type: "insert", text: quoteQuad()[3]});
			const m2 = optMarks.get(key);
			if (m2 !== undefined && m2.double !== undefined) return applyMark(m2, pending, true);
			if (/[0-9]/.test(key)) {
				// A deliberately spent slot. Other digits never reach here.
				const over = optShiftDigits[key];
				if (over !== undefined) return withFlush({type: "insert", text: over});
				if (letters.has(key)) return withFlush({type: "insert", text: SHIFTED_DIGITS[key] ?? key});
			}
			return withFlush({type: "pass"});
		}

		// Option: the prefix diacritic layer. Unassigned keys pass, so ⌥6 § survives.
		if (option) {
			// The tie bar is a postfix JOINER: it attaches to the PREVIOUS segment.
			if (key === "j") return emitJoiner(textBefore, TIE, pending);
			// Locale quotes: ⌥[ opens primary, ⌥] opens secondary.
			if (key === "[") return withFlush({type: "insert", text: quoteQuad()[0]});
			if (key === "]") return withFlush({type: "insert", text: quoteQuad()[2]});
			// Unicode has no combining rhotic hook, so ˞ is spacing and the join is the
			// font's job. The one join owed is ə/ɜ → the precomposed ɚ/ɝ.
			if (key === "r" && pending.length === 0) {
				const p = lastCluster(textBefore);
				if (p !== undefined) {
					const {base, marks} = decompose(p);
					if (base === "ə") return withFlush(replaceCluster(p, recompose("ɚ", marks)));
					if (base === "ɜ") return withFlush(replaceCluster(p, recompose("ɝ", marks)));
				}
			}
			// ⌥. on its own pending dot commits the INTERPUNCT (l ⌥. ⌥. l → l·l).
			if (key === "." && pending.length === 1 && pending[0] === "\u{0307}") {
				return {edit: {type: "insert", text: "\u{00B7}"}, pending: []};
			}
			const m = optMarks.get(key);
			if (m !== undefined) return applyMark(m, pending);
			// ⌥z arms the raise — the operators live on the prime chord.
			if (key === "z") return pendingOperator(RAISE, pending);
			return withFlush({type: "pass"});
		}

	// Number row: every digit is native, and a bare digit is a base a modifier
	// transforms (5H → ɜ). A pending diacritic absorbs onto it.
	if (/[0-9]/.test(key)) {
		if (!shift && pending.length > 0) return emitBase(key, pending);
		return withFlush({type: "pass"});
	}

	// Caps Lock types the literal capital and never acts as the ⇧ modifier, so
	// Caps-Lock T then H is "TH", not θ. A pending accent still absorbs.
	if (k.capsLock && !shift && /^[a-z]$/.test(key)) {
		return emitBase(key.toUpperCase(), pending);
	}

	const s = shift ? key.toUpperCase() : key;

	// Shift-letter modifiers transform the previous glyph in place; its combining
	// marks survive the swap.
	const p = pending.length === 0 ? lastCluster(textBefore) : undefined;
	if (p !== undefined) {
		let {base, marks} = decompose(p);
		// A capital right after an IPA segment with shift still held is a pending
		// base — lower it so this modifier transforms it (ʃ⇧T⇧R → ʃʈ). Otherwise it
		// is a fresh capital digraph (⇧A⇧E → Æ). The segment test is a non-ASCII
		// LETTER or mark, not merely non-ASCII: terminals report the empty
		// start-of-line cell as NBSP, and a bare `> 127` test rebases it into θ.
		if (shift && k.capsLock !== true && /^[A-Z]$/.test(base)) {
			const p2 = lastCluster(textBefore.slice(0, textBefore.length - p.length));
			const p2Segment =
				p2 !== undefined && [...p2].some((c) => c.codePointAt(0)! > 127 && /[\p{L}\p{M}]/u.test(c));
			if (p2Segment && chainLive) {
				base = base.toLowerCase(); // live chain → lowercase continuation
			} else {
				const low = transforms.get(base.toLowerCase() + s);
				if (low !== undefined) {
					// See capitalOf.
					const up = capitalOf(low);
					if (up !== undefined) {
						return {edit: replaceCluster(p, recompose(up, marks)), pending: []};
					}
				}
			}
		}
		// The shifted digit is the digit's capital plane (⇧5⇧Y → Ə).
		if (shift && chainLive && k.capsLock !== true) {
			const digit = Object.keys(SHIFTED_DIGITS).find((d) => SHIFTED_DIGITS[d] === base);
			if (digit !== undefined) {
				const low = transforms.get(digit + s);
				if (low !== undefined) {
					const up = capitalOf(low);
					if (up !== undefined) {
						return {edit: replaceCluster(p, recompose(up, marks)), pending: []};
					}
				}
			}
		}
		const combo = transforms.get(base + s);
		if (combo !== undefined) {
			return {edit: replaceCluster(p, recompose(combo, marks)), pending: []};
		}
		// A raised or lowered glyph still transforms: unraise, transform, re-raise.
		// This is what lets the operator be prefix — armed, it could never know
		// when a digraph ends.
		const plainSup = unsup.get(base);
		const plain = plainSup ?? unsub.get(base);
		if (plain !== undefined) {
			const t = transforms.get(plain + s);
			const back = t === undefined ? undefined
				: (plainSup !== undefined ? sups : subs).get(t);
			if (back !== undefined) {
				return {edit: replaceCluster(p, recompose(back, marks)), pending: []};
			}
		}
	}

	// letter / click base glyph — committing any pending prefix diacritics
	const glyph = letters.get(s);
	if (glyph !== undefined) return emitBase(glyph, pending);

	// A pending accent absorbs onto a CAPITAL base (⌥u ⇧A → Ä); the letters table
	// is lowercase-keyed, so without this it would commit as a spacing clone.
	if (pending.length > 0 && /^[A-Z]$/.test(s)) return emitBase(s, pending);

	// capitals with no transform, punctuation: native.
	return withFlush({type: "pass"});
}

/** Backspace: peel the last combining mark off the previous cluster; a bare
 *  glyph passes so the host deletes it natively. */
export function handleBackspace(textBefore: string, pending: Pending = []): Step {
	// The pending accent is peeled first, before the document is touched.
	if (pending.length > 0) return {edit: {type: "noop"}, pending: pending.slice(0, -1)};
	const p = lastCluster(textBefore);
	if (p === undefined) return {edit: {type: "pass"}, pending: []};
	const {base, marks} = decompose(p);
	if (marks.length === 0) return {edit: {type: "pass"}, pending: []};
	// orphan combining mark: let the host delete the whole cluster
	if (base.length === 0) return {edit: {type: "pass"}, pending: []};
	return {edit: replaceCluster(p, recompose(base, marks.slice(0, -1))), pending: []};
}

/** ⌃⌫ — unconvert: the committed transform before the cursor becomes its literal
 *  keystroke spelling (θ → "tH"), stateless via the reverse map. */
export function handleUnconvert(textBefore: string, pending: Pending = []): Step {
	if (pending.length > 0) return handleBackspace(textBefore, pending);
	const p = lastCluster(textBefore);
	if (p !== undefined) {
		const {base, marks} = decompose(p);
		if (marks.length === 0 && base.length > 0) {
			const low = base.toLowerCase();
			const key = unconvertKey.get(low);
			if (key !== undefined) {
				return {edit: replaceCluster(p, base === low ? key : key.toUpperCase()), pending: []};
			}
		}
	}
	return {edit: {type: "pass"}, pending: []};
}

/** Apply an edit to a buffer. `pass` inserts the keystroke's native character
 *  when one is given, else nothing. */
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
	if (k.shift) return SHIFTED_PUNCT[k.key] ?? k.key; // ⇧` is ~, ⇧/ is ? …
	if (k.option) return ""; // host Option typography is host-specific
	return k.key;
}

/** Run a sequence of keystrokes against a buffer. Backspace is {key: "⌫"}. */
export function typeKeys(keys: Keystroke[], initial = ""): string {
	let text = initial;
	let pending: Pending = [];
	let chainBroken = false;
	for (const k of keys) {
		const step: Step =
			k.key === "⌫"
				? k.control === true
					? handleUnconvert(text, pending)
					: handleBackspace(text, pending)
				: handleKey(text, k, pending, chainBroken);
		pending = step.pending;
		chainBroken = step.chainBroken ?? false;
		if (k.key === "⌫" && step.edit.type === "pass") {
			// ⌃⌫ that found nothing to unconvert stays the host's chord.
			if (k.control !== true) {
				const p = lastCluster(text);
				text = p === undefined ? text : text.slice(0, text.length - p.length);
			}
		} else {
			text = applyEdit(text, step.edit, nativeChar(k));
		}
	}
	// A still-pending accent commits as its spacing form.
	if (pending.length > 0) text += commitString(pending);
	return text;
}
