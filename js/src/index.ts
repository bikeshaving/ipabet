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
	/** Shift was physically RELEASED between the previous keystroke and this one.
	 *  The IME reads this from flagsChanged; it's what tells a held IPA chain
	 *  (ʃ⇧I⇧H → ʃɪ, shift never lifted) apart from a glyph followed by a fresh
	 *  capital (ʃ, release, ⇧I⇧H → ʃIH). A release breaks the chain. */
	shiftBroke?: boolean;
	/** Caps Lock is engaged. It is a LOCK, not a modifier: a letter types its
	 *  CAPITAL literally (the bare layer is native US) and never acts as the ⇧
	 *  modifier. Shift still wins — ⇧ is always the modifier, Caps Lock never is. */
	capsLock?: boolean;
	/** Control is held. Only ⌃⇧<letter> means anything here — the literal-capital
	 *  escape. Every other ⌃ chord is a leader key (tmux ^b, emacs ^x) and the host
	 *  keeps it, so callers pass those straight through and never reach the engine. */
	control?: boolean;
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

/** What `handleKey`/`handleBackspace` return: an edit, the next pending, and
 *  whether an IPA chain was broken by a shift release. The engine owns the chain
 *  RULE but not its FLAG — only the caller can see a release, so the caller
 *  threads `chainBroken` back in (the IME from flagsChanged, the web from keyup). */
export interface Step {
	edit: Edit;
	pending: Pending;
	chainBroken?: boolean;
}

interface Mark {
	mark: string;
	spacing: boolean;
	double?: string;
	/** The ⌥⇧ form is spacing even though the ⌥ form is combining. A key can carry
	 *  one of each: ⌥9 is the linguolabial seagull (combining, prefix), and ⌥⇧9 is
	 *  extIPA's pre-voicing bracket ₍ (a standalone character, postfix). Spacing is
	 *  a property of the FORM, not of the key. */
	doubleSpacing?: boolean;
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
	doubleSpacing?: boolean;
	cycle?: string[];
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

// transformation index: (previous output glyph + keystroke) → combined glyph
const transforms = new Map<string, string>();
for (const [key, glyph] of letters) {
	if (key.length === 2) {
		// A leading digit is a LITERAL base. The number-row families used to hang off
		// the shifted-digit root glyph (⇧5 → ə, then ə+H → ɜ); now the bare digit is
		// the base a modifier transforms — 5H → ɜ, 2Q → ʡ — and the roots are ordinary
		// two-key digraphs too (5Y → ə, 2H → ʔ). So ⇧2–7 fall through to native
		// @ # $ % ^ &, and the tie bar left the number row for ⌥j (join).
		const prev = /[0-9]/.test(key[0]) ? key[0] : letters.get(key[0]);
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

// A capital digraph's uppercase must be LATIN — θ/χ/β uppercase into Greek
// Θ/Χ/Β, which is never wanted in a Latin/IPA context (and keeps "THE" literal).
const isGreekUpper = (c: string): boolean => {
	const n = c.codePointAt(0)!;
	return n >= 0x370 && n <= 0x3ff;
};


// The tie bar (⌥j) and its below-form (⌥⇧j). The tie goes BELOW when the glyphs'
// descenders would collide with a bar above (t͜ɕ, d͜ʒ, k͜p).
const TIE = "͡";
const TIE_BELOW = "͜";

// Voiceless obstruents — the ejectivizable set (⇧P). Plosives + oral
// fricatives; ejectives need voicelessness (sealed glottis) and a closure.
const VOICELESS_OBSTRUENTS = "ptʈckqɸfθsʃʂçxχɬ";

// Mark PLACEMENT is the transcriber's, never the engine's.
//
// Three marks have an above/below form — the tie bar, the voiceless ring, and the
// syllabic line — and the engine used to choose two of them for you, by looking up
// the base in a hardcoded set of "glyphs with descenders". That is a TYPOGRAPHY
// model living inside a NOTATION engine, and it was wrong in both directions: it
// silently pushed an explicit ring back below (so å, a letter, was untypeable), and
// its descender list had drifted — ɲ ʎ ɸ β ç ʑ and ɧ were all missing, so it buried
// rings in their tails anyway. Nobody notices that class of bug, because the
// codepoint is right and only the rendering collides.
//
// So the list is gone. Every placement is now a keystroke: ⌥k / ⌥⇧k for the ring,
// ⌥s / ⌥⇧s for the syllabic line, ⌥j / ⌥⇧j for the tie. The engine emits exactly
// the mark you asked for, on the base you asked for.

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

/** Apply a mark's primary (⌥) or secondary (⌥⇧, the `double`) form. */
function applyMark(m: Mark, pending: Pending, secondary = false): Step {
	const scalar = secondary && m.double !== undefined ? m.double : m.mark;
	// Spacing belongs to the FORM, not the key: ⌥9 is a combining seagull (prefix),
	// while ⌥⇧9 is the ₍ voicing bracket, a standalone character that goes postfix.
	const spacing = secondary && m.double !== undefined ? m.doubleSpacing === true : m.spacing;
	if (!spacing) return pendingDiacritic(scalar, pending);
	const f = flush(pending);                       // a pending accent commits first
	const text = (f.edit.type === "insert" ? f.edit.text : "") + scalar;
	return {edit: {type: "insert", text}, pending: []};
}

// The stroke overlay's precomposed family (⌥l is ABC Extended's stroke dead key):
// NFC cannot fuse an overlay, so these must be emitted atomic, like ɫ. The set
// matches what ABC Extended itself resolves — Polish ł, Vietnamese đ, Sámi ŧ ǥ,
// Maltese ħ, ƀ ƶ. An unlisted base takes the raw combining overlay.
const STROKED = new Map(Object.entries({
	l: "ł", L: "Ł", d: "đ", D: "Đ", t: "ŧ", T: "Ŧ", g: "ǥ", G: "Ǥ",
	h: "ħ", H: "Ħ", b: "ƀ", z: "ƶ", Z: "Ƶ",
}));

/** Emit a base glyph, committing any pending prefix diacritics onto it. */
function emitBase(glyph: string, pending: Pending): Step {
	if (pending.length === 0) return {edit: {type: "insert", text: glyph}, pending: []};
	// dark l: overlay + l is the atomic ɫ, not a ragged l̴ (also a digraph, l⇧Q)
	if (pending.length === 1 && pending[0] === "\u{0334}" && glyph === "l") {
		return {edit: {type: "insert", text: "ɫ"}, pending: []};
	}
	// stroke overlay: the orthographic letters are precomposed (⌥l l → ł, ⌥l d → đ)
	if (pending.length === 1 && pending[0] === "\u{0335}") {
		const s = STROKED.get(glyph);
		if (s !== undefined) return {edit: {type: "insert", text: s}, pending: []};
	}
	const marks = [...pending];
	return {edit: {type: "insert", text: recompose(glyph, marks)}, pending: []};
}

/** ⌥z: superscriptize the previous glyph (`t` `h` ⌥z → tʰ). */
function superscriptize(textBefore: string): Edit {
	const p = lastCluster(textBefore);
	if (p !== undefined) {
		const {base, marks} = decompose(p);
		const sup = sups.get(base);
		if (sup !== undefined) return replaceCluster(p, recompose(sup, marks));
	}
	return {type: "insert", text: "z"};
}

/** ⌥⇧z: subscriptize the previous glyph (`x` `2` ⌥⇧z → x₂). */
function subscriptize(textBefore: string): Edit {
	const p = lastCluster(textBefore);
	if (p !== undefined) {
		const {base, marks} = decompose(p);
		const sub = subs.get(base);
		if (sub !== undefined) return replaceCluster(p, recompose(sub, marks));
	}
	return {type: "insert", text: "z"};
}

// ---------------------------------------------------------------- engine

/**
 * The IPAbet keystroke handler. Mirrors the IME's handle():
 * bare keys are plain US, ⇧number → IPA glyph, ⇧letter → transform of the
 * previous glyph, ⌥ → prefix (dead-key) diacritics, ⌥⇧ → a mark's second form
 * (plus the raw-US escape on the number row), ⌃⇧letter → the literal capital.
 * Command chords, other control chords, and anything unmapped pass.
 */
/**
 * Shift-chaining lets a capital continue a transcription (ʃ⇧I⇧H → ʃɪ). The gate
 * is a *broken* flag, threaded by the caller: a shift RELEASE breaks the chain,
 * so a capital typed after releasing-and-repressing shift stays literal (ʃ,
 * release, ⇧I⇧H → ʃIH) — that is how you escape a chain to type a real capital.
 * Producing a fresh IPA segment (a transform, or a non-ASCII base/diacritic —
 * including the ⌥8 tie, which is unshifted) re-arms it. Note: a release DISARMS,
 * an unshifted key does NOT — the tie and the Option diacritics are IPA too.
 * This owns the flag; `handleKeyCore` only reads whether the chain is live.
 */
export function handleKey(
	textBefore: string,
	k: Keystroke,
	pending: Pending = [],
	chainBroken = false,
): Step {
	const brokenIn = chainBroken || (k.shiftBroke ?? false);
	const step = handleKeyCore(textBefore, k, pending, !brokenIn);
	// A fresh IPA glyph clears the break and starts a new live chain: a transform
	// (`replace`) or an inserted non-ASCII glyph (5 ⇧Y → ə, the ⌥j tie). A literal
	// capital or ASCII base is neither, so it carries the flag unchanged.
	const e = step.edit;
	const seg = e.type === "replace" || (e.type === "insert" && /[^\x00-\x7f]/.test(e.text));
	return {...step, chainBroken: seg ? false : brokenIn};
}

function handleKeyCore(textBefore: string, k: Keystroke, pending: Pending, chainLive: boolean): Step {
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

	// ⌃⇧<letter> — the literal-capital escape. ⇧<letter> transforms the glyph before
	// it, so a capital that forms a digraph is otherwise untypeable ("GitHub" comes
	// out "Giθub"). This commits the raw capital and bypasses everything downstream:
	// the ⇧-modifier transforms, the shift-chain, the capital-digraph rule. So
	// ⌃⇧G ⌃⇧H is a literal "GH" and ⌃⇧A ⌃⇧E a literal "AE".
	//
	// It lives on Control because Control is inert here — ⌃ chords are leader keys
	// and the host keeps them, so nothing else competes. Letters only. It used to
	// live on ⌥⇧<letter>, which is why that layer could never be spent; the IME
	// moved years of logic here and this engine was left behind, so the website had
	// no escape at all (⇧-digraph capitals were simply untypeable on /type).
	if (k.control === true) {
		if (shift && /^[a-z]$/.test(key)) {
			return withFlush({type: "insert", text: key.toUpperCase()});
		}
		return {edit: {type: "pass"}, pending}; // leader keys: the host owns them
	}

	// Option-Shift: the secondary form of a two-form mark (⌥⇧n → creaky,
	// ⌥⇧' → secondary stress), and on the number row the raw-US escape.
	//
	// It is NOT the literal-capital escape any more — that moved to ⌃⇧<letter>,
	// which the browser owns and the IME implements. This engine still carried the
	// retired version (⌥⇧H → H, plus a double-press-on-a-pending-mark hack to share
	// the chord with a mark's second form), so the web and the IME disagreed: the
	// same keystroke escaped on one and applied a mark on the other. A ⌥⇧<letter>
	// with no second form now DECLINES, so the host's own Option typography passes.
		if (option && shift) {
			// The tie bar's BELOW form (⌥⇧j → U+035C, for colliding descenders: t͜ɕ,
			// d͜ʒ). Above is ⌥j; both emit immediately, appending onto the previous
			// segment. Explicit — no toggle, no placement guessing.
			if (key === "j") return emitBase(TIE_BELOW, pending);
			// ⌥⇧z lowers the previous glyph — the shifted twin of ⌥z's raise.
			if (key === "z") return withFlush(subscriptize(textBefore));
			const m2 = optMarks.get(key);
			if (m2 !== undefined && m2.double !== undefined) return applyMark(m2, pending, true);
			if (/[0-9]/.test(key)) {
				// A slot spent deliberately (⌥⇧1 → ¡). Every other ⌥⇧<digit> now passes
				// to native: no shifted digit is an IPA glyph any more (the roots are
				// digraphs, the tie left for ⌥j), so the raw-US escape is fully retired
				// and ⌥⇧2 restores €, with ⌥⇧8 °, ⌥⇧9 ·, ⌥⇧0 ‚ all surviving.
				const over = optShiftDigits[key];
				if (over !== undefined) return withFlush({type: "insert", text: over});
				if (letters.has(key)) return withFlush({type: "insert", text: SHIFTED_DIGITS[key] ?? key});
			}
			return withFlush({type: "pass"});
		}

		// Option: the prefix (dead-key) diacritic layer, keyed by the unshifted US char.
		// An unassigned key passes — digits included, so the host's ⌥6 §, ⌥7 ¶, ⌥8 •
		// survive. (This used to insert the bare digit, destroying them to produce a
		// character the unshifted digit key already types.)
		if (option) {
			// The tie bar is a postfix combining JOINER (t ⌥j s → t͡s): it attaches to
			// the PREVIOUS segment, unlike the prefix dead-key diacritics, so it emits
			// immediately. ⌥j — j for JOIN. (Below-form ⌥⇧j is in the block above.)
			if (key === "j") return emitBase(TIE, pending);
			// Rhoticity ⌥r emits immediately — Unicode has no combining rhotic hook,
			// so ˞ is a spacing character and the visual join onto the vowel is the
			// font's job, not the engine's. The one real join the engine owes is
			// ə/ɜ → the precomposed ɚ/ɝ, fused here the way ⌥l + l fuses to ɫ.
			if (key === "r" && pending.length === 0) {
				const p = lastCluster(textBefore);
				if (p !== undefined) {
					const {base, marks} = decompose(p);
					if (base === "ə") return withFlush(replaceCluster(p, recompose("ɚ", marks)));
					if (base === "ɜ") return withFlush(replaceCluster(p, recompose("ɝ", marks)));
				}
			}
			const m = optMarks.get(key);
			if (m !== undefined) return applyMark(m, pending);
			// ⌥z raises the previous glyph — the operators live on the prime chord.
			if (key === "z") return withFlush(superscriptize(textBefore));
			return withFlush({type: "pass"});
		}

	// Number row: every digit is native now. Bare digit → native digit (a BASE — a
	// following modifier transforms it, 5H → ɜ, in the modifier path below). Shift →
	// native symbol (⇧2 @ … ⇧6 ^ ⇧7 &): the roots are two-key digraphs and the tie
	// bar left for ⌥j, so no shifted digit is claimed. A pending prefix diacritic
	// absorbs onto the (bare) digit base (⌥g then 5 ⇧A → ɐ̞); otherwise pass so the
	// digit stays a real keystroke (counts, prefixes, shortcuts).
	if (/[0-9]/.test(key)) {
		if (!shift && pending.length > 0) return emitBase(key, pending);
		return withFlush({type: "pass"});
	}

	// Caps Lock is a LOCK, not a modifier. With it engaged (and shift not held) a
	// letter types its CAPITAL, literally — the bare layer is native US, and every
	// other app types capitals here. It must NOT act as the ⇧ modifier: ⇧ is the
	// modifier, always, and Caps Lock never is (so Caps-Lock T then H is "TH", not
	// θ). A pending accent still absorbs onto the capital (⌥u then Caps-Lock a → Ä).
	//
	// Without this we read only the shift flag, so the key emitted its lowercase
	// base and Caps Lock did nothing at all — you could not type a capital.
	if (k.capsLock && !shift && /^[a-z]$/.test(key)) {
		return emitBase(key.toUpperCase(), pending);
	}

	const s = shift ? key.toUpperCase() : key;

	// Shift-letter modifiers transform the previous glyph in place; any
	// combining marks already on it survive the swap (decomposed view).
	const p = pending.length === 0 ? lastCluster(textBefore) : undefined;
	if (p !== undefined) {
		let {base, marks} = decompose(p);
		// Shift-chaining: a capital right after an IPA segment, with shift still
		// held, is a *pending base* — lower it so this modifier transforms it
		// (ʃ⇧T⇧R → ʃʈ). Two gates, both required:
		//   chainLive — the chain has not been broken by a shift release since the
		//              last segment. Releasing shift after ʃ makes ⇧I⇧H literal: ʃIH.
		//   p2       — the char before the capital is a real IPA segment, not the
		//              previous LITERAL capital. This is what keeps $PATH → ɾPATH:
		//              the final T is preceded by A, so the run breaks there.
		// A capital that never gets a modifier stays as typed (ʃ⇧T → ʃT).
		// A shifted (capital) modifier-base has exactly one question: are we in a
		// LIVE chain — shift held continuously since an IPA segment? If so, this
		// capital CONTINUES the chain and is lowered so the modifier transforms it
		// (hold shift to keep transcribing: ʃ⇧I⇧H → ʃɪ, and Ɣ⇧G⇧H → Ɣɣ). Otherwise
		// — a fresh word, or the chain was ended by a shift release — it is a fresh
		// capital DIGRAPH: ⇧A⇧E → Æ, ⇧N⇧G → Ŋ. Release doesn't escape to literal
		// (that is Ctrl+Shift); it just ends the chain, so the next capital is
		// capital again. The segment test is a non-ASCII letter or combining mark,
		// NOT merely non-ASCII: a terminal reports the empty start-of-line cell as
		// U+00A0 NBSP (160 > 127), which the old bare `> 127` rebased into θ.
		if (shift && /^[A-Z]$/.test(base)) {
			const p2 = lastCluster(textBefore.slice(0, textBefore.length - p.length));
			const p2Segment =
				p2 !== undefined && [...p2].some((c) => c.codePointAt(0)! > 127 && /[\p{L}\p{M}]/u.test(c));
			if (p2Segment && chainLive) {
				base = base.toLowerCase(); // live chain → lowercase continuation
			} else {
				const low = transforms.get(base.toLowerCase() + s);
				if (low !== undefined) {
					const up = low.toUpperCase();
					// A real Latin-Extended capital — orthographic (Ŋ Ɛ) or phantom (Ʃ
					// Ʈ). Excluded: Greek uppercases (θ→Θ, wrong script, keeps "THE"
					// literal) and plain ASCII (tJ→c→C, so ⇧T⇧J stays "TJ").
					if (up !== low && [...up].length === 1 && up.codePointAt(0)! > 0x7f && !isGreekUpper(up)) {
						return {edit: replaceCluster(p, recompose(up, marks)), pending: []};
					}
				}
			}
		}
		const combo = transforms.get(base + s);
		if (combo !== undefined) {
			return {edit: replaceCluster(p, recompose(combo, marks)), pending: []};
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
	let chainBroken = false;
	for (const k of keys) {
		const step =
			k.key === "⌫" ? handleBackspace(text, pending) : handleKey(text, k, pending, chainBroken);
		pending = step.pending;
		chainBroken = step.chainBroken ?? false;
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
