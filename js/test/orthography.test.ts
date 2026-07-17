// The expected-codepoints pass: every orthography the layout claims must emit
// the EXACT NFC codepoints, not homoglyphs. Encoding bugs in this class are
// invisible — the text renders right, then fails search, collation, and every
// downstream tool. Vietnamese is the hardest case (doubly-accented vowels,
// the horn, canonical-ordering interactions), so it gets the fullest battery,
// including both mark orders for the same-combining-class pairs where NFC
// cannot reorder and only the engine's order-insensitive recompose saves you.

import {describe, expect, test} from "bun:test";
import {typeKeys, type Keystroke} from "../src/index.ts";

const K = (key: string, o: Partial<Keystroke> = {}) => ({key, ...o});
const opt = (key: string) => K(key, {option: true});
const optShift = (key: string) => K(key, {option: true, shift: true});

const cps = (s: string) =>
	[...s].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ");

/** Assert an exact codepoint sequence — toBe on the string plus an explicit
 *  codepoint comparison so a homoglyph failure prints the encodings. */
function emits(keys: Keystroke[], want: string) {
	const got = typeKeys(keys);
	expect(`${got} (${cps(got)})`).toBe(`${want} (${cps(want)})`);
}

// The Vietnamese marks: shape marks (breve ⌥b, circumflex ⌥i, horn ⌥⇧i) and
// tone marks (grave ⌥`, acute ⌥e, hook-above ⌥/, tilde ⌥n, dot-below ⌥⇧.).
const grave = opt("`"), acute = opt("e"), circ = opt("i"), breve = opt("b");
const horn = optShift("i"), tilde = opt("n"), hook = opt("/"), dot = optShift(".");

describe("Vietnamese — every vowel precomposes, in either mark order", () => {
	// [expected, shape mark (or null), tone mark (or null), base]
	const V: [string, Keystroke | null, Keystroke | null, string][] = [
		// a family
		["à", null, grave, "a"], ["á", null, acute, "a"], ["ả", null, hook, "a"],
		["ã", null, tilde, "a"], ["ạ", null, dot, "a"],
		["ă", breve, null, "a"], ["ằ", breve, grave, "a"], ["ắ", breve, acute, "a"],
		["ẳ", breve, hook, "a"], ["ẵ", breve, tilde, "a"], ["ặ", breve, dot, "a"],
		["â", circ, null, "a"], ["ầ", circ, grave, "a"], ["ấ", circ, acute, "a"],
		["ẩ", circ, hook, "a"], ["ẫ", circ, tilde, "a"], ["ậ", circ, dot, "a"],
		// e family
		["è", null, grave, "e"], ["é", null, acute, "e"], ["ẻ", null, hook, "e"],
		["ẽ", null, tilde, "e"], ["ẹ", null, dot, "e"],
		["ê", circ, null, "e"], ["ề", circ, grave, "e"], ["ế", circ, acute, "e"],
		["ể", circ, hook, "e"], ["ễ", circ, tilde, "e"], ["ệ", circ, dot, "e"],
		// i family
		["ì", null, grave, "i"], ["í", null, acute, "i"], ["ỉ", null, hook, "i"],
		["ĩ", null, tilde, "i"], ["ị", null, dot, "i"],
		// o family
		["ò", null, grave, "o"], ["ó", null, acute, "o"], ["ỏ", null, hook, "o"],
		["õ", null, tilde, "o"], ["ọ", null, dot, "o"],
		["ô", circ, null, "o"], ["ồ", circ, grave, "o"], ["ố", circ, acute, "o"],
		["ổ", circ, hook, "o"], ["ỗ", circ, tilde, "o"], ["ộ", circ, dot, "o"],
		["ơ", horn, null, "o"], ["ờ", horn, grave, "o"], ["ớ", horn, acute, "o"],
		["ở", horn, hook, "o"], ["ỡ", horn, tilde, "o"], ["ợ", horn, dot, "o"],
		// u family
		["ù", null, grave, "u"], ["ú", null, acute, "u"], ["ủ", null, hook, "u"],
		["ũ", null, tilde, "u"], ["ụ", null, dot, "u"],
		["ư", horn, null, "u"], ["ừ", horn, grave, "u"], ["ứ", horn, acute, "u"],
		["ử", horn, hook, "u"], ["ữ", horn, tilde, "u"], ["ự", horn, dot, "u"],
		// y family
		["ỳ", null, grave, "y"], ["ý", null, acute, "y"], ["ỷ", null, hook, "y"],
		["ỹ", null, tilde, "y"], ["ỵ", null, dot, "y"],
	];

	test("shape-first order (the canonical way)", () => {
		for (const [want, shape, tone, base] of V) {
			const keys = [shape, tone].filter((m): m is Keystroke => m !== null);
			emits([...keys, K(base)], want);
		}
	});

	test("tone-first order (the way a hurried hand types it)", () => {
		for (const [want, shape, tone, base] of V) {
			const keys = [tone, shape].filter((m): m is Keystroke => m !== null);
			emits([...keys, K(base)], want);
		}
	});

	test("đ is atomic U+0111, capitals ride the base", () => {
		emits([opt("l"), K("d")], "đ");
		emits([opt("l"), K("d", {shift: true})], "Đ");
		emits([circ, acute, K("e", {shift: true})], "Ế");
	});
});

describe("IAST / ISO 15919 — the dots and macrons precompose", () => {
	const under = optShift("."), over = opt("."), macron = opt("a"), acuteM = opt("e");
	test("retroflex and nasal series", () => {
		for (const [want, mark, base] of [
			["ṭ", under, "t"], ["ḍ", under, "d"], ["ṇ", under, "n"], ["ṣ", under, "s"],
			["ḥ", under, "h"], ["ḷ", under, "l"], ["ṁ", over, "m"], ["ṅ", over, "n"],
			["ā", macron, "a"], ["ī", macron, "i"], ["ū", macron, "u"], ["ś", acuteM, "s"],
		] as const) emits([mark, K(base)], want);
	});
	test("vocalic r: dot below + macron, either order", () => {
		emits([under, macron, K("r")], "ṝ");
		emits([macron, under, K("r")], "ṝ");
	});
});

describe("Polish, Romanian, Turkish — the hook wars stay won", () => {
	test("Polish", () => {
		for (const [want, mark, base] of [
			["ą", opt("m"), "a"], ["ę", opt("m"), "e"], ["ć", opt("e"), "c"],
			["ń", opt("e"), "n"], ["ś", opt("e"), "s"], ["ź", opt("e"), "z"],
			["ż", opt("."), "z"], ["ł", opt("l"), "l"], ["ó", opt("e"), "o"],
		] as const) emits([mark, K(base)], want);
	});
	test("Romanian comma ≠ Turkish cedilla, still", () => {
		emits([opt(","), K("s")], "ș");
		emits([opt(","), K("t")], "ț");
		emits([opt("c"), K("s")], "ş");
		emits([opt("c"), K("c")], "ç");
	});
});

describe("Pinyin — the ǚ class (diaeresis + caron, same combining class)", () => {
	const dia = opt("u"), caron = opt("v");
	test("tones on ü, either order", () => {
		emits([dia, caron, K("u")], "ǚ");
		emits([caron, dia, K("u")], "ǚ");
		emits([dia, opt("a"), K("u")], "ǖ");
		emits([dia, opt("e"), K("u")], "ǘ");
		emits([dia, opt("`"), K("u")], "ǜ");
	});
	test("plain tone row", () => {
		emits([opt("a"), K("a")], "ā");
		emits([caron, K("a")], "ǎ");
		emits([caron, K("z")], "ž");
	});
});

describe("Yoruba, Navajo — cross-class stacks", () => {
	test("Yoruba dot-below + tone, either order", () => {
		emits([optShift("."), opt("e"), K("e")], "ẹ́");
		emits([opt("e"), optShift("."), K("e")], "ẹ́");
		emits([optShift("."), K("s")], "ṣ");
	});
	test("Navajo ogonek + acute, either order", () => {
		emits([opt("m"), opt("e"), K("a")], "ą́");
		emits([opt("e"), opt("m"), K("a")], "ą́");
	});
});
