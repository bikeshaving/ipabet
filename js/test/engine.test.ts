// Parity suite: keystroke sequences → expected text. Every case here is a
// behavioral contract shared with the macOS IME — if the Swift engine and
// this port disagree with a row, one of them is wrong.

import {afterAll, beforeAll, describe, expect, test} from "bun:test";
import {handleKey, handleBackspace, type Keystroke} from "../src/index.ts";
import {typeKeys, setQuoteLocale, setCapitalDigraphs} from "./vectors.ts";

// Capital digraphs are an opt-in setting (they are keystroke-identical to
// holding shift and yelling), so the suites that exercise them turn them on.
setCapitalDigraphs(true);

// Compact keystroke notation: "s" bare, "+H" shift, "~n" option, "~+2"
// option-shift, "^" prefix = shift was RELEASED before this key (breaks a
// chain), "⌫" backspace.
function seq(...keys: string[]): Keystroke[] {
	return keys.map((k) => {
		let shift = false;
		let option = false;
		let shiftBroke = false;
		let key = k;
		let control = false;
		while (key[0] === "+" || key[0] === "~" || key[0] === "^" || key[0] === "!") {
			if (key[0] === "+") shift = true;
			else if (key[0] === "~") option = true;
			else if (key[0] === "!") control = true;   // "!+h" = ⌃⇧H, the escape
			else shiftBroke = true;
			key = key.slice(1);
		}
		return {key, shift, option, shiftBroke, control};
	});
}

function typed(...keys: string[]): string {
	return typeKeys(seq(...keys));
}

const nfc = (s: string) => s.normalize("NFC");

describe("digraph transforms", () => {
	test("ship: s ⇧H i ⇧H p → ʃɪp", () => expect(typed("s", "+h", "i", "+h", "p")).toBe("ʃɪp"));
	test("thing: t ⇧H i ⇧H n ⇧G → θɪŋ", () => expect(typed("t", "+h", "i", "+h", "n", "+g")).toBe("θɪŋ"));
	test("retroflex: t ⇧R → ʈ", () => expect(typed("t", "+r")).toBe("ʈ"));
	test("palatal nasal: n ⇧J → ɲ", () => expect(typed("n", "+j")).toBe("ɲ"));
	test("open back: a ⇧H → ɑ", () => expect(typed("a", "+h")).toBe("ɑ"));
	test("central: a ⇧5 → ɐ", () => expect(typed("a", "+5")).toBe("ɐ"));
	test("y-vowel: i ⇧Y → ɨ", () => expect(typed("i", "+y")).toBe("ɨ"));
	test("y-vowel: o ⇧Y → ɵ", () => expect(typed("o", "+y")).toBe("ɵ"));
	test("y-vowel: e ⇧Y → ɘ", () => expect(typed("e", "+y")).toBe("ɘ"));
	test("strut: u ⇧A → ʌ", () => expect(typed("u", "+a")).toBe("ʌ"));
	test("marks survive the swap: ⌥t prefixes, s̪ then ⇧H keeps bridge", () => {
		// dental prefix, s absorbs it (s̪), then H: ʃ with the bridge preserved
		expect(typed("~t", "s", "+h")).toBe(nfc("ʃ\u{032A}"));
	});
});

describe("shift-chaining (hold shift to continue IPA)", () => {
	// A capital typed right after a special (non-ASCII) IPA glyph is a *pending
	// base*: a following modifier lowers+transforms it, but a capital that gets no
	// modifier stays as typed (it just passed through). Two glyphs of lookback →
	// stateless, capitals preserved by default, acronyms safe. Always on.
	const chain = (...keys: string[]): string => typed(...keys);

	test("held run: t ⇧H⇧I⇧H⇧N⇧G → θɪŋ", () =>
		expect(chain("t", "+h", "+i", "+h", "+n", "+g")).toBe("θɪŋ"));
	test("held run with bare tail: s ⇧H⇧I⇧H p → ʃɪp", () =>
		expect(chain("s", "+h", "+i", "+h", "p")).toBe("ʃɪp"));
	test("pending base transforms when a modifier follows: s ⇧H ⇧I ⇧H → ʃɪ", () =>
		expect(chain("s", "+h", "+i", "+h")).toBe("ʃɪ"));

	// The fixed tradeoff: a capital abutting an IPA glyph with NO modifier stays
	// a capital (as typed) — but transforms if a modifier arrives.
	test("capital preserved after a glyph (no modifier): s ⇧H ⇧T → ʃT", () =>
		expect(chain("s", "+h", "+t")).toBe("ʃT"));
	test("…and transforms if a modifier follows: s ⇧H ⇧T ⇧R → ʃʈ", () =>
		expect(chain("s", "+h", "+t", "+r")).toBe("ʃʈ"));
	test("non-digraph capital after a glyph stays capital: t ⇧H ⇧K → θK", () =>
		expect(chain("t", "+h", "+k")).toBe("θK"));

	// Acronyms stay literal even with the flag on — no special glyph sits behind
	// them, so the pending-base rule never fires (two-glyph lookback).
	test("acronym URL stays URL", () => expect(chain("+u", "+r", "+l")).toBe("URL"));
	test("acronym API stays API", () => expect(chain("+a", "+p", "+i")).toBe("API"));
	// Held-shift acronyms whose pair is a capital digraph FORM it — SHA → ƩA,
	// THE → ΘE — because capital digraphs are always-on; the literal comes from
	// Caps Lock or ⌃⇧ (Caps Lock types literal capitals, so all-caps words). ASCII
	// pairs stay literal, and pH's ɸ is caseless, so PHP is safe untouched.
	// SHA: ⇧S⇧H is a fresh capital digraph Ʃ whether held or (released → still a
	// fresh capital), then ⇧A appends. Literal "SHA" comes from Ctrl+Shift, not a
	// shift release.
	test("⇧S⇧H⇧A → ƩA (capital digraph)", () => expect(chain("+s", "+h", "+a")).toBe("ƩA"));
	test("released is still a fresh capital: ⇧S ^⇧H ⇧A → ƩA", () =>
		expect(chain("+s", "^+h", "+a")).toBe("ƩA"));
	test("PHP stays PHP (pH is not a digraph)", () => expect(chain("+p", "+h", "+p")).toBe("PHP"));
	// The shifted digit is the digit's capital plane — Azerbaijani's Ə lives here.
	test("digit capitals: held ⇧5⇧H → Ə, ⇧7⇧H → Ħ", () => {
		expect(chain("+5", "+h")).toBe("Ə");
		expect(chain("+7", "+h")).toBe("Ħ");
	});
	test("a shift release escapes to the literal: ⇧5 ^⇧H → %H", () =>
		expect(chain("+5", "^+h")).toBe("%H"));
	test("digit capital glottal: held ⇧2⇧H → Ɂ (U+0241, the Dene capital)", () =>
		expect(chain("+2", "+h")).toBe("\u{0241}"));
	test("THE forms the capital theta: ⇧T⇧H⇧E → ΘE (Caps Lock types the literal)", () =>
		expect(chain("+t", "+h", "+e")).toBe("ΘE"));

	// A plain ASCII base (lowercase i) is not special, so a capital after it is
	// just a capital — no chain.
	test("lowercase base doesn't seed a chain: i ⇧P → iP", () =>
		expect(chain("i", "+p")).toBe("iP"));
	// The punctuation shift plane rides nativeChar — the web binding consumes
	// every typing key and re-inserts, so a pass edit must know ⇧` is ~.
	test("shifted punctuation is native: ⇧` → ~, ⇧/ → ?, ⇧' → \"", () => {
		expect(typed("+`")).toBe("~");
		expect(typed("+/")).toBe("?");
		expect(typed("+'")).toBe('"');
	});
	// Daily-driver: held-shift caps keep their capitals UNLESS a pair is a
	// digraph — PATH ends in the TH pair, so it forms Θ, exactly as PUSH forms
	// Ʃ. All-caps words type under Caps Lock; terminals switch to the plain
	// US input source (⌃Space).
	test("held ⇧P⇧A⇧T⇧H forms the theta: ɾPAΘ (Caps Lock types the literal)", () =>
		expect(chain("4", "+h", "+p", "+a", "+t", "+h")).toBe("ɾPAΘ"));
});

describe("clicks (C modifier)", () => {
	test("qC → ǃ", () => expect(typed("q", "+c")).toBe("ǃ"));
	test("tC → ǀ", () => expect(typed("t", "+c")).toBe("ǀ"));
	test("pC → ʘ", () => expect(typed("p", "+c")).toBe("ʘ"));
	test("cC → ǂ", () => expect(typed("c", "+c")).toBe("ǂ"));
	test("lC → ǁ", () => expect(typed("l", "+c")).toBe("ǁ"));
	test("nasal click: ⌥z n ⇧G q ⇧C → ᵑǃ", () =>
		expect(typed("~z", "n", "+g", "q", "+c")).toBe("ᵑǃ"));
	test("voiced click: ⌥z g q ⇧C → ᶢǃ", () =>
		expect(typed("~z", "g", "q", "+c")).toBe("ᶢǃ"));
});

describe("airstream: implosives are ⇧P; ejectives are the ⌥⇧q mark", () => {
	test("implosives — voiced stops via ⇧P", () => {
		expect(typed("b", "+p")).toBe("ɓ");
		expect(typed("d", "+p")).toBe("ɗ");
		expect(typed("j", "+p")).toBe("ʄ");
		expect(typed("g", "+p")).toBe("ɠ");
	});
	test("uvular implosive is qP; ɢ stays on gQ", () => {
		expect(typed("q", "+p")).toBe("ʛ");
		expect(typed("g", "+q")).toBe("ɢ");
	});
	// The ejective lives on the mark tier: kʼ is k + U+02BC, a spacing modifier
	// letter — the same encoding shape as rhoticity, so the same law applies
	// (⇧ transforms into atomic glyphs; appended marks live on ⌥). ⌥q is the
	// guttural key and ejectives are the glottalic airstream. No guard: the
	// transcriber owns it, which is what lets ʼ serve orthography (Hausa ʼy,
	// Uzbek tutuq) and ejective clicks alike.
	test("ejective — ⌥⇧q appends ʼ: kʼ tʼ ʃʼ ʈʼ", () => {
		expect(typed("k", "~+q")).toBe("k\u{02BC}");
		expect(typed("t", "~+q")).toBe("t\u{02BC}");
		expect(typed("s", "+h", "~+q")).toBe("ʃ\u{02BC}");
		expect(typed("t", "+r", "~+q")).toBe("ʈ\u{02BC}");
	});
	test("ejective affricate: t ʃ ⌥⇧q → tʃʼ", () =>
		expect(typed("t", "s", "+h", "~+q")).toBe("tʃ\u{02BC}"));
	test("standalone ʼ just emits — orthography needs it bare", () =>
		expect(typed("~+q")).toBe("\u{02BC}"));
	test("the okina takes unshifted — the opening form, as on every quote key", () => {
		expect(typed("~q")).toBe("\u{02BB}");
		expect(typed("o", "~q")).toBe("o\u{02BB}");
	});
	test("there is no ⇧X modifier — X after any base is a literal", () => {
		expect(typed("k", "+x")).toBe("kX");
		expect(typed("a", "+x")).toBe("aX");
	});
	test("the ejective ʼ is U+02BC, not the curly quote U+2019", () => {
		expect(typed("k", "~+q").codePointAt(1)).toBe(0x02BC);
	});
});

describe("number-row bases", () => {
	test("5 ⇧H → ə", () => expect(typed("5", "+h")).toBe("ə"));
	test("2 ⇧H → ʔ", () => expect(typed("2", "+h")).toBe("ʔ"));
	test("4 ⇧H → ɾ", () => expect(typed("4", "+h")).toBe("ɾ"));
	test("7 ⇧H → ħ", () => expect(typed("7", "+h")).toBe("ħ"));
	test("family off the literal digit: 2 ⇧Q → ʡ", () =>
		expect(typed("2", "+q")).toBe("ʡ"));
	test("⇧5 pulls a cardinal toward the center: e ⇧5 → ɜ, o ⇧5 → ɞ", () => {
		expect(typed("e", "+5")).toBe("ɜ");
		expect(typed("o", "+5")).toBe("ɞ");
	});
	test("⇧5 with no base stays the layout's symbol: x ⇧5 → x%", () =>
		expect(typed("x", "+5")).toBe("x%"));
	test("aY completes the y-column: a ⇧Y → ä", () =>
		expect(typed("a", "+y")).toBe("\u{00E4}"));
	test("about: 5 ⇧H b a u ⇧H t → əbaʊt", () =>
		expect(typed("5", "+h", "b", "a", "u", "+h", "t")).toBe("əbaʊt"));
	test("the roots left, so ⇧2 @ ⇧3 # ⇧4 $ ⇧5 % ⇧7 & come back", () => {
		expect(typed("+2")).toBe("@");
		expect(typed("+3")).toBe("#");
		expect(typed("+4")).toBe("$");
		expect(typed("+5")).toBe("%");
		expect(typed("+7")).toBe("&");
	});
	test("bare digits pass natively", () => expect(typed("1", "2")).toBe("12"));
	test("⇧9 passes (native paren)", () => {
		expect(handleKey("", {key: "9", shift: true}).edit).toEqual({type: "pass"});
	});
	test("⇧8 passes (native asterisk — type / manually for the solidus)", () => {
		expect(handleKey("", {key: "8", shift: true}).edit).toEqual({type: "pass"});
	});
});

describe("option diacritics (prefix, dead-key style)", () => {
	// Combining ⌥ diacritics precede the base — the é/ñ muscle memory from the
	// US keyboard. The mark rides an NBSP placeholder; the next base absorbs it.
	test("señor tilde: ⌥n n → ñ", () => expect(typed("s", "e", "~n", "n")).toBe(nfc("señ")));
	test("acute: ⌥e e → é", () => expect(typed("~e", "e")).toBe(nfc("é")));
	test("length is spacing, still postfix: a ⌥; → aː", () => expect(typed("a", "~;")).toBe("aː"));
	// A pending accent is never written to the document. Left unconsumed it
	// commits as its spacing form (⌥e then nothing → ´), like a real dead key.
	test("no base: an unconsumed accent commits as its spacing form", () => {
		expect(typed("~n")).toBe("˜");
		expect(typed("~e")).toBe("´");
		expect(typed("~t")).toBe("\u{032A}");   // dental has no spacing form
	});
	test("dead-key release: ⌥e then a non-base commits ´ then the char", () =>
		expect(typed("~e", ",")).toBe("´,"));
});

describe("second forms on ⌥⇧ (no cycling)", () => {
	// A two-form mark's second form is ⌥⇧, not a double-press.
	test("creaky: ⌥⇧n a → a̰ (⌥n a → ã)", () => {
		expect(typed("~n", "a")).toBe(nfc("a\u{0303}"));
		expect(typed("~+n", "a")).toBe(nfc("a\u{0330}"));
	});
	test("double-acute (extra-high tone): ⌥⇧e e → e̋", () =>
		expect(typed("~+e", "e")).toBe(nfc("e\u{030B}")));
	test("secondary stress is spacing, still postfix: ⌥' → ˈ, ⌥⇧' → ˌ", () => {
		expect(typed("~'")).toBe("ˈ");
		expect(typed("~+'")).toBe("ˌ");
	});
	test("non-syllabic: ⌥o a → a̯ (the diphthong glide — a vowel mark on the vowel key)", () =>
		expect(typed("~o", "a")).toBe(nfc("a\u{032F}")));
	test("the inverted breves pair on o: ⌥⇧o e → ȇ (Slavic long-falling)", () =>
		expect(typed("~+o", "e")).toBe(nfc("e\u{0311}")));
	test("the plain breves pair on b: ⌥⇧b h → ḫ (DIN Arabic)", () =>
		expect(typed("~+b", "h")).toBe(nfc("h\u{032E}")));
	test("breathy: ⌥⇧u a → a̤", () => expect(typed("~+u", "a")).toBe(nfc("a\u{0324}")));
	test("half-long is spacing, still postfix: a ⌥; → aː, ⌥⇧; → ˑ", () => {
		expect(typed("a", "~;")).toBe("aː");
		expect(typed("~+;")).toBe("ˑ");
	});
	// ⌥⇧ = the greater pole (shift-= is "+", shift-. is ">").
	test("backness ± on ⌥=: retracted ⌥= a → a̠, advanced ⌥⇧= a → a̟", () => {
		expect(typed("~=", "a")).toBe(nfc("a\u{0320}"));
		expect(typed("~+=", "a")).toBe(nfc("a\u{031F}"));
	});
	test("height on ⌥.: lowered ⌥. a → a̞, raised ⌥⇧. a → a̝", () => {
		expect(typed("~g", "a")).toBe(nfc("a\u{031E}"));
		expect(typed("~+g", "a")).toBe(nfc("a\u{031D}"));
	});
	// ⌥h matches ⌥='s polarity: shift is the *advanced* pole on both keys
	// (⌥z holds the operators — the prime chord belongs to the workhorse).
	test("tongue-root on ⌥h: RTR ⌥h a → a̙, ATR ⌥⇧h a → a̘", () => {
		expect(typed("~h", "a")).toBe(nfc("a\u{0319}"));
		expect(typed("~+h", "a")).toBe(nfc("a\u{0318}"));
	});
	test("rounding on ⌥w (labialize): less ⌥w o → o̜, more ⌥⇧w o → o̹", () => {
		expect(typed("~w", "o")).toBe(nfc("o\u{031C}"));
		expect(typed("~+w", "o")).toBe(nfc("o\u{0339}"));
	});
	// The ⌥ number row is the tone system in increasing scope, then airflow and
	// transliteration: ⌥1–⌥5 Chao tone bars, ⌥6 downstep (⇧ upstep), ⌥7 global
	// fall (⇧ rise), ⌥8 ingressive (⇧ egressive), ⌥9 the voicing brackets,
	// ⌥0 the Cyrillic primes.
	test("the ⌥ number row is fully claimed, 1 through 0", () => {
		for (const d of "1234567890")
			expect(handleKey("", {key: d, option: true}, []).edit.type, `⌥${d}`).not.toBe("pass");
	});
	// The roots are two-key digraphs, so every shifted digit gives its native
	// symbol directly (⇧2 @, ⇧7 &) and no ⌥⇧-digit escape exists; ⌥⇧1 → ¡ is the
	// one deliberate spend. ⌥⇧9 is the closing voicing bracket — a mark, not an
	// escape.
	test("shifted digits are native symbols directly — no escape needed", () => {
		expect(typed("+2")).toBe("@");
		expect(typed("+7")).toBe("&");
	});
	test("the voicing brackets live on the ( key: ⌥9 ₍, ⌥⇧9 ₎", () => {
		expect(typeKeys(seq("~9"))).toBe("₍");
		expect(typeKeys(seq("~+9"))).toBe("₎");
	});
	test("the one spent ⌥⇧ digit slot: ⌥⇧1 → ¡", () => expect(typed("~+1")).toBe("¡"));
	test("⇧6 is native ^", () => expect(typed("+6")).toBe("^"));
	test("⇧1 is ! (not IPA)", () => expect(typed("+1")).toBe("!"));
});

describe("dental family — spread across keys, no cycle", () => {
	// The coronal place diacritics live on the coronal stops: t̪ is the canonical
	// dental, so ⌥t carries dental/apical; ⌥d carries laminal/linguolabial.
	// ⌥t = dental (a passive place, single). ⌥d = the active-articulator dual:
	// apical (tip) vs laminal (blade) — binary, exhaustive, mutually exclusive.
	test("coronal: dental ⌥t; apical ⌥d / laminal ⌥⇧d", () => {
		expect(typed("~t", "d")).toBe(nfc("d\u{032A}"));   // dental
		expect(typed("~d", "d")).toBe(nfc("d\u{033A}"));   // apical (tip)
		expect(typed("~+d", "d")).toBe(nfc("d\u{033B}"));  // laminal (blade)
	});
});

describe("toggle-off (press the same form again on the pending mark)", () => {
	// Pending lives in host state, not the document. Peeling the last mark leaves
	// an EMPTY composition — nothing is written, so there is no sentinel to
	// collide with a user's real NBSP.
	// ⌥n has a CYCLE, so its repeat press advances instead of toggling; ⌫
	// cancels. Non-cycle keys toggle.
	test("⌥u ⌥u → nothing committed", () => expect(typed("~u", "~u")).toBe(""));
	// The ⌥⇧ second press toggles, exactly like the primary form.
	test("⌥⇧n ⌥⇧n → nothing committed", () => expect(typed("~+n", "~+n")).toBe(""));
	test("single-form macron: ⌥a ⌥a → nothing", () => expect(typed("~a", "~a")).toBe(""));
	test("a peeled composition leaves the next base untouched: ⌥u ⌥u x → x", () =>
		expect(typed("~u", "~u", "x")).toBe("x"));
	test("the nasal-port cycle: ⌥n×1 ã, ×2 a͊, ×3 a͋, ×4 a͌, ×5 wraps to ã", () => {
		expect(typed("~n", "a")).toBe(nfc("a\u{0303}"));
		expect(typed("~n", "~n", "a")).toBe(nfc("a\u{034A}"));
		expect(typed("~n", "~n", "~n", "a")).toBe(nfc("a\u{034B}"));
		expect(typed("~n", "~n", "~n", "~n", "s")).toBe(nfc("s\u{034C}"));
		expect(typed("~n", "~n", "~n", "~n", "~n", "a")).toBe(nfc("a\u{0303}"));
	});
	test("the rounding ladders: ⌥w×2 → spreading; ⌥⇧w×2 → whistled (rounding's endpoint)", () => {
		expect(typed("~w", "~w", "o")).toBe(nfc("o\u{034D}"));
		expect(typed("~+w", "~+w", "s")).toBe(nfc("s\u{034E}"));
		expect(typed("~+w", "~+w", "~+w", "o")).toBe(nfc("o\u{0339}"));  // wraps back to more-rounded
	});
	test("⌫ cancels a mid-cycle pending: ⌥n ⌥n ⌫ x → x", () =>
		expect(typed("~n", "~n", "⌫", "x")).toBe("x"));
	test("airflow completes the arrow run: ⌥8 → ↓ ingressive, ⌥⇧8 → ↑ egressive", () => {
		expect(typed("~8")).toBe("↓");
		expect(typed("~+8")).toBe("↑");
	});
	test("clone-less single-form toggles too: ⌥. ⌥. → nothing", () =>
		expect(typed("~g", "~g")).toBe(""));
	// The y key is the overlay pair: ⌥y stroke, ⌥⇧y tilde overlay (IPA
	// velarized-or-pharyngealized). The l key carries linking ‿ and ‖.
	test("dark l is atomic: ⌥⇧y l → ɫ; ⌥⇧y ⌥⇧y l → l (velarization lifted)", () => {
		expect(typed("~+y", "l")).toBe("ɫ");
		expect(typed("~+y", "~+y", "l")).toBe("l");
	});
	test("velarization fuses to the middle-tilde atoms: ⌥⇧y m → ᵯ, ⌥⇧y ⇧L → Ɫ", () => {
		expect(typed("~+y", "m")).toBe("ᵯ");
		expect(typed("~+y", "+l")).toBe("Ɫ");
	});
	test("velarization on an unlisted base stays an overlay: ⌥⇧y a → a̴", () =>
		expect(typed("~+y", "a")).toBe("a\u{0334}"));
	test("the barred atoms fuse — never the i̵ homoglyph: ⌥y i → ɨ, u → ʉ, o → ɵ, j → ɟ", () => {
		expect(typed("~y", "i")).toBe("\u{0268}");
		expect(typed("~y", "u")).toBe("\u{0289}");
		expect(typed("~y", "o")).toBe("\u{0275}");
		expect(typed("~y", "j")).toBe("\u{025F}");
		expect(typed("~y", "+i")).toBe("\u{0197}"); // Ɨ
	});
	test("guttural digraph: l ⇧Q → ɫ (velarized OR pharyngealized, the chart's wording)", () =>
		expect(typed("l", "+q")).toBe("ɫ"));
	test("stroke fuses to the alphabet: ⌥y l → ł, ⌥y d → đ, capitals too", () => {
		expect(typed("~y", "l")).toBe("ł");
		expect(typed("~y", "d")).toBe("đ");
		expect(typed("~y", "+d")).toBe("Đ");        // pending absorbs the capital
	});
	test("stroke on an unlisted base stays a raw overlay: ⌥y s → s̵", () =>
		expect(typed("~y", "s")).toBe("s\u{0335}"));
	test("the L key: ⌥l → linguolabial, ⌥⇧l → ‖ major group", () => {
		expect(typed("t", "~l")).toBe(nfc("t\u{033C}"));  // linguolabial (prefix)
		expect(typed("a", "~+l")).toBe("a‖");
	});
	test("backspace peels the pending accent before touching the document", () => {
		expect(typed("~n", "⌫")).toBe("");
		expect(typed("~n", "~e", "⌫", "a")).toBe(nfc("ã"));
	});
});

describe("no sentinel: a user's NBSP is just text", () => {
	// NBSP — and even NBSP+combining — occur in real pasted text, so a pending
	// accent must never be represented as document text where it could be
	// mistaken for the user's. Pending is host state; nothing to confuse.
	test("a bare NBSP before the cursor is untouched", () =>
		expect(typeKeys(seq("x"), "\u{00A0}")).toBe("\u{00A0}x"));
	test("a pasted NBSP+tilde is NOT absorbed", () =>
		expect(typeKeys(seq("x"), "\u{00A0}\u{0303}")).toBe("\u{00A0}\u{0303}x"));
	test("a plain letter before the cursor is untouched", () =>
		expect(typeKeys(seq("k"), "r")).toBe("rk"));
});

describe("the two ⌥⇧ laws", () => {
	// LAW 1 — exclusive duals: a mark and its ⌥⇧ twin are the two values of ONE
	// feature, so the twin REPLACES rather than stacks. Nothing is both advanced
	// and retracted, both apical and laminal, both syllabic and non-syllabic.
	test("advanced replaces retracted (⌥= then ⌥⇧=)", () =>
		expect(typed("~=", "~+=", "a")).toBe(nfc("a\u{031F}")));
	test("retracted replaces advanced (⌥⇧= then ⌥=)", () =>
		expect(typed("~+=", "~=", "a")).toBe(nfc("a\u{0320}")));
	test("laminal replaces apical (⌥d then ⌥⇧d)", () =>
		expect(typed("~d", "~+d", "d")).toBe(nfc("d\u{033B}")));
	test("raised replaces lowered (⌥. then ⌥⇧.)", () =>
		expect(typed("~g", "~+g", "a")).toBe(nfc("a\u{031D}")));
	test("the syllabic line's two PLACEMENTS replace each other (⌥s then ⌥⇧s)", () =>
		// one line, above or below — never both
		expect(typed("~s", "~+s", "n")).toBe(nfc("n\u{030D}")));

	// LAW 2 — shape twins are independent features and DO stack: a vowel can be
	// nasalized and creaky at once (ã̰), centralized and breathy at once.
	test("nasalized + creaky stack (⌥n ⌥⇧n a → ã̰)", () => {
		const r = typed("~n", "~+n", "a");
		expect([...r.normalize("NFD")].length).toBe(3);
		expect(r.normalize("NFD")).toContain("\u{0303}");
		expect(r.normalize("NFD")).toContain("\u{0330}");
	});
	test("centralized + breathy stack (⌥u ⌥⇧u a)", () => {
		const r = typed("~u", "~+u", "a").normalize("NFD");
		expect(r).toContain("\u{0308}");
		expect(r).toContain("\u{0324}");
	});
});

describe("⌥j = tie bar (welds two segments)", () => {
	// The tie welds two symbols into ONE segment (postfix, attaching to the glyph
	// before it). It lives on ⌥j — j for join — a postfix joiner; a ⇧-letter joiner
	// would fire between the plain letters of any capitalized word ($PATH).
	test("affricate t͡ʃ: t ⌥j s⇧H", () =>
		expect(typed("t", "~j", "s", "+h")).toBe("t\u{0361}ʃ"));
	test("affricate t͡s: t ⌥j s", () => expect(typed("t", "~j", "s")).toBe("t\u{0361}s"));
	test("affricate d͡ʒ: d ⌥j z⇧H", () =>
		expect(typed("d", "~j", "z", "+h")).toBe("d\u{0361}ʒ"));
	test("untied tʃ stays reachable (the tie is optional in IPA)", () =>
		expect(typed("t", "s", "+h")).toBe("tʃ"));
	test("a diacritic-bearing ASCII base still continues the chain: ⌥t s ⇧H ⇧I ⇧H", () =>
		expect(typed("~t", "s", "+h", "+i", "+h")).toBe(nfc("ʃ\u{032A}ɪ")));
});

describe("accented capitals (a pending accent absorbs onto a capital base)", () => {
	// The letters table is lowercase-keyed. Without an explicit capital path the
	// accent commits as a spacing clone ("¨A"), breaking every sentence-initial
	// accented word in every European language.
	test("German Ä Ö Ü", () => {
		expect(typed("~u", "+a")).toBe(nfc("Ä"));
		expect(typed("~u", "+o")).toBe(nfc("Ö"));
		expect(typed("~u", "+u")).toBe(nfc("Ü"));
	});
	test("French/Spanish É À Ê Ñ Ç", () => {
		expect(typed("~e", "+e")).toBe(nfc("É"));
		expect(typed("~`", "+a")).toBe(nfc("À"));
		expect(typed("~i", "+e")).toBe(nfc("Ê"));
		expect(typed("~n", "+n")).toBe(nfc("Ñ"));
		expect(typed("~c", "+c")).toBe(nfc("Ç"));   // cedilla lives on ⌥c now
	});
	// It must fire ONLY while an accent pends — acronyms and shift-chaining intact.
	test("acronyms and chaining are untouched", () => {
		expect(typed("+u", "+r", "+l")).toBe("URL");
		expect(typed("+s", "^+h", "+a")).toBe("ƩA"); // fresh capital digraph, not literal
		expect(typed("s", "+h", "+i", "+h")).toBe("ʃɪ");
		expect(typed("4", "+h", "+p", "+a", "+t", "+h")).toBe("ɾPAΘ"); // TH is a digraph pair
	});
});

describe("dot-above / dot-below (⌥g, a Latin-tenant shape twin)", () => {
	test("dot above: ż ṅ ṁ ė", () => {
		expect(typed("~.", "z")).toBe(nfc("ż"));   // Polish
		expect(typed("~.", "n")).toBe(nfc("ṅ"));   // IAST velar nasal
		expect(typed("~.", "e")).toBe(nfc("ė"));   // Lithuanian
	});
	test("dot below: ḥ ṭ ṣ ṛ", () => {
		expect(typed("~+.", "h")).toBe(nfc("ḥ"));
		expect(typed("~+.", "t")).toBe(nfc("ṭ"));
		expect(typed("~+.", "r")).toBe(nfc("ṛ"));
	});
	test("dot above on a capital: Ż", () => expect(typed("~.", "+z")).toBe(nfc("Ż")));
	// t ⇧J does NOT alias to c: an identity-ASCII output from a transform reads
	// as a mistake and swallows the literal fall-through that exposes typos.
	test("no identity-ASCII aliases: t ⇧J stays the honest literal tJ", () =>
		expect(typed("t", "+j")).toBe("tJ"));
});

describe("Latin tenants: orthography the layout must not silently corrupt", () => {
	// Romanian ș ț (comma below) and Turkish ş ţ (cedilla) are different letters
	// that look alike — the classic silent corruption. Each hook has its own key.
	test("Romanian comma-below vs Turkish cedilla are distinct — each on its own key", () => {
		// The cedilla is ⌥c — ABC Extended's cedilla key, and the letter the mark is
		// named for; the comma key carries the comma-shaped marks.
		expect(typed("~,", "s")).toBe(nfc("ș"));    // U+0219 Romanian — comma below, ⌥,
		expect(typed("~,", "t")).toBe(nfc("ț"));    // U+021B
		expect(typed("~c", "s")).toBe(nfc("ş"));    // U+015F Turkish — cedilla, ⌥c
		expect(typed("~c", "c")).toBe(nfc("ç"));    // exactly what ABC Extended types
		expect(typed("~c", "e")).toBe(nfc("ȩ"));    // a general cedilla, not a ç key
	});
	test("Vietnamese horn, and horn stacking with tone", () => {
		// the horn is on ⌥⇧i — ABC Extended's own horn key (the circumflex key's ⇧
		// form: the two Vietnamese vowel-shape marks share the i). VNI's o7/u7
		// digit convention lost the slot to the tone row's global-contour arrows.
		// Hỏi sits on the question key: the hook above is a dotless ?, and hỏi is
		// the questioning tone.
		expect(typed("~+i", "o")).toBe(nfc("ơ"));
		expect(typed("~+i", "u")).toBe(nfc("ư"));
		expect(typed("~`", "~+i", "u")).toBe(nfc("ừ"));   // huyền + horn
		expect(typed("~+i", "~/", "o")).toBe(nfc("ở"));   // horn + hỏi stack
	});
	// ʿayn/hamza are back — paired on ⌥q, the guttural key (⇧Q is the guttural
	// modifier; 2⇧Q/3⇧Q/7⇧Q the guttural family). They transliterate the sounds
	// ʔ ʕ already type. Spacing marks: they just emit.
	test("the palatal hook backs the cedilla: ⌥⇧c t → t̡ (Slavicist palatalization)", () =>
		expect(typed("~+c", "t")).toBe(nfc("t\u{0321}")));
	test("candrabindu rides the nasal letter: ⌥⇧m m → m̐ (IAST)", () =>
		expect(typed("~+m", "m")).toBe(nfc("m\u{0310}")));
	test("macron below rides the macron key: ⌥⇧a → ◌̱ (Semitic ṯ ḏ ẖ)", () => {
		expect(typed("~+a", "t")).toBe(nfc("t\u{0331}"));
		expect(typed("~+a", "d")).toBe(nfc("d\u{0331}"));
	});
	test("half-rings on their arabizi roots: ⌥⇧2 → ʾ (2 = ء), ⌥⇧3 → ʿ (3 = ع)", () => {
		expect(typed("~+2")).toBe("ʾ");
		expect(typed("~+3")).toBe("ʿ");
		expect(typed("d", "~+3", "a")).toBe("dʿa");
	});
	test("the q key: okina unshifted, ejective shifted — œ is a digraph anyway (o⇧E)", () =>
		expect(typed("k", "~+q")).toBe("k\u{02BC}"));
	test("⌥c is the cedilla — a dead key, exactly as on ABC Extended", () => {
		const step = handleKey("", {key: "c", option: true}, []);
		expect(step.edit.type).toBe("noop");        // a dead key writes nothing…
		expect(step.pending).toEqual(["\u0327"]);   // …it arms the cedilla
	});
	test("German ß is the s⇧S ligature digraph", () => {
		expect(typed("s", "+s")).toBe("ß");
		expect(typed("+s", "t", "r", "a", "s", "+s", "e")).toBe("Straße");
		expect(typed("s", "s")).toBe("ss"); // lowercase ss is untouched
	});
	test("prosodic boundaries: ‖ major group on ⌥⇧l; ‿ linking via the tie", () => {
		expect(typed("~+l")).toBe("‖");
		expect(typed("l", "e", "s", "~+j", "~+j")).toBe("les‿");
	});
});

describe("East Asian coverage", () => {
	// Chao tone letters stack into arbitrary contours — the review's headline gap.
	test("Mandarin contours: ⌥1–⌥5 stack", () => {
		expect(typed("m", "a", "~2", "~1", "~4")).toBe("ma˨˩˦");   // dipping 214
		expect(typed("m", "a", "~3", "~5")).toBe("ma˧˥");           // rising 35
	});
	test("tone numerals via the superscript operator: ma²¹⁴", () =>
		expect(typed("m", "a", "~z", "2", "~z", "1", "~z", "4")).toBe("ma²¹⁴"));

	test("Chinese affricates: t ⌥j s⇧J → t͡ɕ, t ⌥j s⇧R → t͡ʂ", () => {
		expect(typed("t", "~j", "s", "+j")).toBe("t\u{0361}ɕ");
		expect(typed("t", "~j", "s", "+r")).toBe("t\u{0361}ʂ");
	});
	test("aspiration via ⌥z: k ⌥z h → kʰ", () => expect(typed("k", "~z", "h")).toBe("kʰ"));

	// All six Vietnamese tones (ngang is unmarked).
	test("Vietnamese tones on a: ngang sắc huyền hỏi ngã nặng", () => {
		expect(typed("a")).toBe("a");
		expect(typed("~e", "a")).toBe(nfc("á"));
		expect(typed("~`", "a")).toBe(nfc("à"));
		expect(typed("~/", "a")).toBe(nfc("ả"));    // hỏi on ⌥/, U+0309
		expect(typed("~n", "a")).toBe(nfc("ã"));
		expect(typed("~+.", "a")).toBe(nfc("ạ"));
	});
	test("Vietnamese implosive: b ⇧P → ɓ", () => expect(typed("b", "+p")).toBe("ɓ"));

	// Korean/Cantonese/Thai coda stops are unreleased; Korean has a fortis series.
	test("unreleased coda stops on ⌥0", () => {
		expect(typed("~0", "p")).toBe(nfc("p\u{031A}"));
		expect(typed("~0", "k")).toBe(nfc("k\u{031A}"));
	});
	test("Cantonese sɐp̚", () => expect(typed("s", "a", "+5", "~0", "p")).toBe(nfc("sɐp\u{031A}")));
	// The strength dimension lives on F (⌥f weak, ⌥⇧f fortis); ⌥p carries
	// the Cyrillic primes.
	test("fortis is ⌥⇧f: ⌥⇧f k → k͈", () =>
		expect(typed("~+f", "k")).toBe(nfc("k\u{0348}")));

	// Vowels East Asianists need, one digraph each.
	test("ɨ ɯ ɤ ʌ are single digraphs", () => {
		expect(typed("i", "+y")).toBe("ɨ");
		expect(typed("u", "+w")).toBe("ɯ");
		expect(typed("o", "+w")).toBe("ɤ");
		expect(typed("u", "+a")).toBe("ʌ");
	});
});

describe("placement is the transcriber's, not the engine's", () => {
	// Choosing above-vs-below from a hardcoded "descender" set would be a
	// typography model inside a notation engine: it makes explicit requests
	// unreachable (å needs an above-ring on a "descender" base) and such lists
	// drift silently. Placement is a keystroke.
	//
	// The RING defaults ABOVE, because that is ABC Extended's ring key and every
	// Mac finger already knows it. The LINE defaults BELOW, because n̩ l̩ m̩ r̩ are what
	// anyone actually types. Each follows its own frequency; there is no shape rule.
	test("⌥k is the ring ABOVE — always, whatever the base", () => {
		expect(typed("~k", "n", "+g")).toBe(nfc("ŋ\u030A"));  // ŋ̊
		expect(typed("~k", "j")).toBe(nfc("j\u030A"));        // j̊
	});
	test("å is one modifier, exactly as on ABC Extended", () => {
		expect(typed("~k", "a")).toBe("å");
		expect(typed("~k", "+a")).toBe("Å");
	});
	test("⌥⇧k is the ring BELOW — the placement for a base with no descender", () => {
		expect(typed("~+k", "n")).toBe(nfc("n\u0325"));       // n̥
		expect(typed("~+k", "i")).toBe(nfc("i\u0325"));       // i̥ — Japanese
	});
	test("the two placements are exclusive: one ring, never two", () =>
		expect(typed("~k", "~+k", "n")).toBe(nfc("n\u0325")));
	test("⌥s / ⌥⇧s are the syllabic line's two placements", () => {
		expect(typed("~s", "n")).toBe(nfc("n\u0329"));        // n̩ — button
		expect(typed("~+s", "n", "+g")).toBe(nfc("ŋ\u030D"));// ŋ̍
	});
	test("syllabic toggles off cleanly: ⌥s ⌥s → nothing committed", () =>
		expect(typed("~s", "~s")).toBe(""));
});

// ⇧<letter> transforms the glyph before it (t ⇧H → θ), so a capital that forms a
// digraph is otherwise untypeable: "GitHub" comes out "Giθub". ⌃⇧<letter> is the
// escape: it commits the raw capital, bypassing the ⇧-modifier transforms, the
// shift-chain, and the capital-digraph rule.
describe("⌃⇧ escape: the literal capital", () => {
	const spell = (w: string) => [...w].map((c) => (/[A-Z]/.test(c) ? "+" + c.toLowerCase() : c));

	test("without an escape, ⇧H transforms: GitHub → Giθub", () =>
		expect(typed(...spell("GitHub"))).toBe("Giθub"));

	test("⌃⇧H commits the raw capital: GitHub", () =>
		expect(typed(...spell("Git"), "!+h", ...spell("ub"))).toBe("GitHub"));

	test("it bypasses the capital digraph too: ⌃⇧A ⌃⇧E → AE, not Æ", () =>
		expect(typed("!+a", "!+e")).toBe("AE"));

	test("⌃⇧G ⌃⇧H → a literal GH", () => expect(typed("!+g", "!+h")).toBe("GH"));

	test("a plain ⌃ chord is a leader key — the engine declines it", () =>
		// `pass` = "host, this key is yours" (tmux ^b, emacs ^x). typeKeys simulates a
		// pass by inserting the plain US character, so assert the EDIT, not the text.
		expect(handleKey("", seq("!b")[0]).edit.type).toBe("pass"));

	test("the escape flushes a pending mark first: ⌥e ⌃⇧A → ´A", () =>
		expect(typed("~e", "!+a")).toBe("´A"));
});

// A ⌥⇧<letter> with no second form DECLINES, so the host's own Option
// typography survives.
// Terminators and unconvert. Esc and space resolve a pending composition by
// COMMITTING the spacing clones — the US layout's own dead-key behavior
// (⌥e Esc → ´, ⌥e ␣ → ´, probe-verified against the uchr state machine; the
// terminator is consumed). ⌃⌫ is the Japanese IMEs' Ctrl+Backspace: the
// committed transform before the cursor becomes its keystroke spelling.
describe("Esc/space terminate the composition; ⌃⌫ unconverts", () => {
	const K = (key: string, o: Partial<Keystroke> = {}) => ({key, ...o});
	test("Esc commits the pending clone: ⌥e Esc → ´", () =>
		expect(typeKeys([K("e", {option: true}), K("Escape")])).toBe("´"));
	test("⌥n Esc → ˜", () =>
		expect(typeKeys([K("n", {option: true}), K("Escape")])).toBe("˜"));
	test("Esc with nothing pending passes — vim keeps its key", () =>
		expect(typeKeys([K("a"), K("Escape")])).toBe("a"));
	test("space is the same terminator, consumed: ⌥e ␣ → ´ alone", () =>
		expect(typeKeys([K("e", {option: true}), K(" ")])).toBe("´"));
	test("space with nothing pending is a space", () =>
		expect(typeKeys([K("a"), K(" ")])).toBe("a "));
	test("⌃⌫ unconverts the transform: θ → tH (Giθub repairs to GitHub)", () =>
		expect(typeKeys([K("t"), K("h", {shift: true}), K("⌫", {control: true})])).toBe("tH"));
	test("a capital digraph unconverts uppercase: Θ ⌃⌫ → TH", () =>
		expect(typeKeys([K("t", {shift: true}), K("h", {shift: true}), K("⌫", {control: true})])).toBe("TH"));
	test("digit-base glyphs unconvert to their key spelling: ə ⌃⌫ → 5H", () =>
		expect(typeKeys([K("5"), K("h", {shift: true}), K("⌫", {control: true})])).toBe("5H"));
	test("an aliased identity glyph still refuses: c ⌃⌫ → c, not tJ", () =>
		expect(typeKeys([K("c"), K("⌫", {control: true})])).toBe("c"));
	test("an identity glyph refuses — the chord stays the host's: s ⌃⌫ → s", () =>
		expect(typeKeys([K("s"), K("⌫", {control: true})])).toBe("s"));
	test("a cluster carrying marks refuses (⌫ peels first): ã ⌃⌫ → ã", () =>
		expect(typeKeys([K("n", {option: true}), K("a"), K("⌫", {control: true})])).toBe(nfc("ã")));
	test("a transform whose glyph decomposes still unconverts: ä ⌃⌫ → aY", () =>
		expect(typeKeys([K("a"), K("y", {shift: true}), K("⌫", {control: true})])).toBe("aY"));
	test("ç too, uppercase: Ç ⌃⌫ → CH", () =>
		expect(typeKeys([K("c", {shift: true}), K("h", {shift: true}), K("⌫", {control: true})])).toBe("CH"));
	test("⌃⌫ while marks pend peels, like plain ⌫: ⌥n ⌃⌫ x → x", () =>
		expect(typeKeys([K("n", {option: true}), K("⌫", {control: true}), K("x")])).toBe("x"));
});

describe("⌥⇧ is not an escape", () => {
	test("a key whose mark has a second form still applies it: a ⌥⇧e b → ab̋", () =>
		expect(typed("a", "~+e", "b")).toBe(nfc("ab\u{030B}")));

	test("pressing it twice toggles the mark off, it does NOT escape", () =>
		expect(typed("a", "~+e", "~+e")).toBe("a"));

	test("a key with no second form declines, so the host's ⌥⇧ typography survives", () =>
		// Declining is a `pass`: on macOS the host then types its own ¿. (typeKeys
		// simulates a pass with the plain US character, hence the edit-level assert.)
		// ⌥⇧/ is unclaimed — hỏi never grew a second form.
		expect(handleKey("", seq("~+/")[0]).edit.type).toBe("pass"));
});

// Shift-chaining rebases a capital only when a real IPA SEGMENT sits before it —
// a non-ASCII letter or combining mark. Terminals report the empty cell before
// the cursor as U+00A0 NBSP; a bare "non-ASCII" test would read that as a
// segment and LOWERCASE-rebase every start-of-line capital (θ where a fresh
// capital digraph Θ belongs). (typeKeys(seq, initial) seeds the buffer,
// standing in for what the app reports before the cursor.)
describe("chaining seeds only on a real segment, not any non-ASCII char", () => {
	const withInitial = (init: string, ...ks: string[]) => typeKeys(seq(...ks), init);

	test("NBSP before ⇧T⇧H is a fresh CAPITAL digraph, not a lowercase rebase", () =>
		expect(withInitial("\u00A0", "+t", "+h")).toBe("\u00A0Θ"));
	test("curly quote before ⇧T⇧H: fresh capital, not a chain", () =>
		expect(withInitial("\u201C", "+t", "+h")).toBe("\u201CΘ"));
	test("em dash before ⇧T⇧H: fresh capital, not a chain", () =>
		expect(withInitial("\u2014", "+t", "+h")).toBe("\u2014Θ"));
	test("a real segment still seeds the chain: ʃ⇧T⇧R → ʃʈ", () =>
		expect(typed("s", "+h", "+t", "+r")).toBe("ʃʈ"));
	test("an ASCII base carrying a tie still seeds it: t ⌥j s ⌥⇧q → t͡sʼ", () =>
		expect(typed("t", "~j", "s", "~+q")).toBe(nfc("t\u{0361}s\u{02BC}")));
});

// Shift-chaining continues a transcription with held shift (ʃ⇧I⇧H → ʃɪ). The
// chain breaks on a shift RELEASE, so releasing and re-pressing shift types a
// literal capital after an IPA glyph — the natural escape. A held run keeps
// chaining. ("^" marks a release before that keystroke.)
// Hold shift to continue a chain in LOWERCASE; a release ends the chain, so the
// next shifted digraph is a fresh CAPITAL. Release is NOT a literal-escape (that
// is Ctrl+Shift) — it just resets to capital. (A prior "ʃIH literal via release"
// is gone; literal capitals after IPA will come from Ctrl+Shift.)
describe("shift release ends the chain → next digraph is a fresh capital", () => {
	test("held: ʃ⇧I⇧H → ʃɪ (lowercase continuation)", () =>
		expect(typed("s", "+h", "+i", "+h")).toBe(nfc("ʃɪ")));
	test("released: ʃ ^⇧I ⇧H → ʃꞮ (fresh capital)", () =>
		expect(typed("s", "+h", "^+i", "+h")).toBe(nfc("ʃꞮ")));
	test("held: ʃ⇧T⇧R → ʃʈ (lowercase continuation)", () =>
		expect(typed("s", "+h", "+t", "+r")).toBe("ʃʈ"));
	test("released: ʃ ^⇧T ⇧R → ʃƮ (fresh capital)", () =>
		expect(typed("s", "+h", "^+t", "+r")).toBe(nfc("ʃƮ")));
	// A release disarms; an unshifted IPA-producing key does NOT. An Option
	// diacritic (⌥t dental, no shift) leaves s̪ live, so ⇧H still chains to ʃ.
	test("an unshifted diacritic keeps the chain live: ⌥t s ⇧H → ʃ̪", () =>
		expect(typed("~t", "s", "+h")).toBe(nfc("ʃ\u{032A}")));
	// $PATH never *chains* (the final T is preceded by a literal A, not an IPA
	// segment) — but TH is a digraph pair, so the fresh-capital rule forms Θ,
	// exactly as PUSH forms Ʃ. Caps Lock (or the US input source) types the literal.
	test("$PATH → ɾPAΘ (fresh capital digraph, not a chain)", () =>
		expect(typed("4", "+h", "+p", "+a", "+t", "+h")).toBe("ɾPAΘ"));
});

// Capital digraphs: capitalize the base, capitalize the result. Held shift forms
// them (⇧A⇧E → Æ); a shift release just ends the chain. Every real uppercase is
// reachable — orthographic (Ŋ Ɛ Ɔ), phantom (Ʃ Ʈ), Greek (Θ Β Χ), and the
// hand-mapped Dene glottal (Ɂ). Only a plain-ASCII result (tJ→c→C) is excluded,
// being nonsense as a digraph. The IPA has no capitals, so this is purely an
// orthographic courtesy for the writing systems that do.
describe("capital digraphs (capitalize the base → capitalize the result)", () => {
	test("European: Æ Œ Ø", () => {
		expect(typed("+a", "+e")).toBe("Æ");
		expect(typed("+o", "+e")).toBe("Œ");
		expect(typed("+e", "+w")).toBe(nfc("Ø"));
	});
	test("African: Ɛ Ɔ Ŋ Ɖ", () => {
		expect(typed("+e", "+h")).toBe("Ɛ");
		expect(typed("+o", "+h")).toBe("Ɔ");
		expect(typed("+n", "+g")).toBe("Ŋ");
		expect(typed("+d", "+r")).toBe("Ɖ");
	});
	test("phantom Latin capitals are reachable too: Ʃ Ʈ", () => {
		expect(typed("+s", "+h")).toBe("Ʃ");
		expect(typed("+t", "+r")).toBe("Ʈ");
	});
	test("lowercase base → lowercase result: a⇧E → æ", () =>
		expect(typed("a", "+e")).toBe("æ"));
	test("Title Case is safe (modifier not shifted): ⇧S h i p → Ship", () =>
		expect(typed("+s", "h", "i", "p")).toBe("Ship"));
	test("Greek capital theta forms: ⇧T⇧H → Θ (U+0398)", () =>
		expect(typed("+t", "+h")).toBe("\u{0398}"));
	test("the other Greek capitals form too: ⇧B⇧H → Β (U+0392), ⇧Q⇧H → Χ (U+03A7)", () => {
		expect(typed("+b", "+h")).toBe("\u{0392}");
		expect(typed("+q", "+h")).toBe("\u{03A7}");
	});
	test("Caps Lock declines the digraph: locked T then locked-⇧H stays TH", () =>
		expect(typeKeys([
			{key: "t", capsLock: true},
			{key: "h", shift: true, capsLock: true},
		])).toBe("TH"));
	test("ASCII uppercase excluded: ⇧T⇧J → TJ (not C)", () =>
		expect(typed("+t", "+j")).toBe("TJ"));
	test("a release starts a fresh capital, not a literal: ⇧A ^⇧E → Æ", () =>
		expect(typed("+a", "^+e")).toBe("Æ"));
	test("does not disturb a lowercase chain: ə ⇧O⇧H → əɔ", () =>
		expect(typed("5", "+h", "+o", "+h")).toBe(nfc("əɔ")));
	// A release BEFORE the capital (from typing the previous lowercase word) must
	// NOT break the digraph — only a release BETWEEN base and modifier does. So the
	// digraph gates on heldFromPrev (previous key), not the persistent chain state:
	// "The Æble" works, while ʃ⟨release⟩⇧I⇧H is still the chain escape.
	test("release before the capital is fine: The ⇧A⇧E → The Æ", () =>
		expect(typed("+t", "h", "e", " ", "^+a", "+e")).toBe("The Æ"));
	test("a release ends the chain → fresh capital: ʃ ⟨release⟩ ⇧I⇧H → ʃꞮ", () =>
		expect(typed("s", "+h", "^+i", "+h")).toBe(nfc("ʃꞮ")));
	// Hold shift and the run continues in LOWERCASE (Ɣɣɣ: first fresh capital,
	// then chained lowercase). A release ends the chain, so the next digraph is a
	// fresh capital again — you can always type another capital after releasing.
	test("held run: ⇧G⇧H⇧G⇧H⇧G⇧H → Ɣɣɣ", () =>
		expect(typed("+g", "+h", "+g", "+h", "+g", "+h")).toBe(nfc("Ɣɣɣ")));
	test("release starts a fresh capital: ⇧G⇧H g⇧H ^⇧G⇧H → ƔɣƔ", () =>
		expect(typed("+g", "+h", "g", "+h", "^+g", "+h")).toBe(nfc("ƔɣƔ")));
	test("two capitals across a release: ⇧A⇧E ^⇧N⇧G → ÆŊ", () =>
		expect(typed("+a", "+e", "^+n", "+g")).toBe(nfc("ÆŊ")));
	// A prior capital digraph's uppercase (Æ, Ŋ) is orthographic, not chain content,
	// so a second capital digraph after it works even across a shift release.
	test("consecutive capital digraphs: ⇧A⇧E ⟨release⟩ ⇧N⇧G → ÆŊ", () =>
		expect(typed("+a", "+e", "^+n", "+g")).toBe("ÆŊ"));
});

describe("raise operator ⌥z — prefix, like the ⌥ diacritics", () => {
	test("aspiration: t ⌥z h → tʰ", () => expect(typed("t", "~z", "h")).toBe("tʰ"));
	test("the operator is an instruction, not a character — it leaves nothing", () =>
		expect(typed("~z")).toBe(""));
	test("space lifts the arm and stays a space: ⌥z space → ' '", () =>
		expect(typed("~z", " ")).toBe(" "));
	test("no raised form in Unicode → the arm lifts, the glyph lands plain", () =>
		expect(typed("~+z", "g")).toBe("g"));
	test("a raised glyph still transforms: ⌥z s ⇧H → ᶴ", () =>
		expect(typed("~z", "s", "+h")).toBe("ᶴ"));
	test("⌥0 is the no-release dead key", () =>
		expect(typed("~0", "b")).toBe(nfc("b\u{031A}")));
});

describe("stress and steps are spacing — never dead keys", () => {
	// ˌ ˑ ↗ ꜛ are ⌥⇧ doubles of spacing marks and must INSERT, not pend —
	// the bug: a missing doubleSpacing made ˌ trail the next letter ("abˌ").
	test("secondary stress lands in place: a ⌥⇧' b → aˌb", () =>
		expect(typed("a", "~+'", "b")).toBe("aˌb"));
	test("half-long: a ⌥⇧; b → aˑb", () => expect(typed("a", "~+;", "b")).toBe("aˑb"));
	test("global rise: a ⌥⇧7 b → a↗b", () => expect(typed("a", "~+7", "b")).toBe("a↗b"));
	test("upstep: a ⌥⇧6 b → aꜛb", () => expect(typed("a", "~+6", "b")).toBe("aꜛb"));
});

describe("rhoticity ⌥r — postfix like length", () => {
	test("hook appends: a ⌥r → a˞", () => expect(typed("a", "~r")).toBe("a˞"));
	test("schwa fuses: 5 ⇧H ⌥r → ɚ", () => expect(typed("5", "+h", "~r")).toBe("ɚ"));
	test("open-mid fuses: e ⇧5 ⌥r → ɝ", () => expect(typed("e", "+5", "~r")).toBe("ɝ"));
	test("fused glyph keeps its marks: ə̃ ⌥r → ɚ̃", () =>
		expect(nfc(typed("~n", "5", "+h", "~r"))).toBe(nfc("ɚ\u{0303}")));
	test("⌥⇧r is the retroflex hook below, prefix: ⌥⇧r a → a̢", () =>
		expect(nfc(typed("~+r", "a"))).toBe(nfc("a\u{0322}")));
	test("vowel ⇧R does not rhoticize — the modifier tier only transforms", () =>
		expect(typed("a", "+r")).toBe("aR"));
});

describe("lower operator ⌥⇧z — the raise's shifted twin, also prefix", () => {
	test("digit lowers: x ⌥⇧z 2 → x₂", () => expect(typed("x", "~+z", "2")).toBe("x₂"));
	test("math run: l o g ⌥⇧z 2 → log₂", () => expect(typed("l", "o", "g", "~+z", "2")).toBe("log₂"));
	test("schwa lowers: ⌥⇧z 5 ⇧H → ₔ", () => expect(typed("~+z", "5", "+h")).toBe("ₔ"));
	test("the twin replaces — nothing is raised and lowered at once", () =>
		expect(typed("~z", "~+z", "h")).toBe("ₕ"));
	test("the same chord again lifts it off", () =>
		expect(typed("~z", "~z", "h")).toBe("h"));
});

describe("the tone row: levels ⌥1–⌥5, step ⌥6, contour ⌥7", () => {
	test("levels: ⌥1→˩ ⌥2→˨ ⌥3→˧ ⌥4→˦ ⌥5→˥", () => {
		expect(typed("~1")).toBe("˩");
		expect(typed("~2")).toBe("˨");
		expect(typed("~3")).toBe("˧");
		expect(typed("~4")).toBe("˦");
		expect(typed("~5")).toBe("˥");
	});
	test("contours stack: m a ⌥3 ⌥5 → ma˧˥ (mid-rising)", () =>
		expect(typed("m", "a", "~3", "~5")).toBe("ma˧˥"));
	test("step: ⌥6 → ꜜ, ⌥⇧6 → ꜛ (shift is the upward member)", () => {
		expect(typed("~6")).toBe("ꜜ");
		expect(typed("~+6")).toBe("ꜛ");
	});
	test("unaspirated on the schwa digit: k ⌥⇧5 → k˭ (the neutral release)", () =>
		expect(typed("k", "~+5")).toBe("k\u{02ED}"));
	test("the alveolar mark rides the alveolar-tap digit: ⌥⇧4 t → t͇", () =>
		expect(typed("~+4", "t")).toBe(nfc("t\u{0347}")));
	test("contour: ⌥7 → ↘, ⌥⇧7 → ↗", () => {
		expect(typed("~7")).toBe("↘");
		expect(typed("~+7")).toBe("↗");
	});
	test("the Cyrillic primes: ⌥p → ʹ, ⌥⇧p → ʺ (Gorʹkij, obʺekt)", () => {
		expect(typed("s", "~p")).toBe("s\u{02B9}");
		expect(typed("~+p")).toBe("\u{02BA}");
	});
	test("comma above completes the comma key: ⌥⇧, k → k̓ (PNW glottalization)", () =>
		expect(typed("~+,", "k")).toBe(nfc("k\u{0313}")));
});

describe("locale quotes on the bracket keys", () => {
	test("en (default): ⌥[ “ ⌥⇧[ ” ⌥] ‘ ⌥⇧] ’ — byte-identical to native", () => {
		expect(typed("~[") + typed("~+[") + typed("~]") + typed("~+]")).toBe("“”‘’");
	});
	test("de: low-9 primaries come back", () => {
		setQuoteLocale("de");
		expect(typed("~[") + typed("~+[")).toBe("„“");
		expect(typed("~]") + typed("~+]")).toBe("‚‘");
		setQuoteLocale("en");
	});
	test("fr: the guillemets return as primaries, singles as secondaries", () => {
		setQuoteLocale("fr");
		expect(typed("~[") + typed("~+[")).toBe("«»");
		expect(typed("~]") + typed("~+]")).toBe("‹›");
		setQuoteLocale("en");
	});
	test("unknown locale falls back to the default", () => {
		setQuoteLocale("zz");
		expect(typed("~[")).toBe("“");
	});
});

describe("the doubled-letter law: X⇧X is X's orthographic cousin", () => {
	test("g⇧G → ɡ — the exact U+0261, g's own other form; capital Ɡ via held chain", () => {
		expect(typed("g", "+g")).toBe("\u{0261}");
		expect(typed("+g", "+g")).toBe("\u{A7AC}"); // Ɡ
		expect(typed("~z", "g", "+g")).toBe("ᶢ");    // the sup table already keyed ɡ
	});
	test("t⇧T → þ (Icelandic), capitals via held chain: ⇧T⇧T → Þ", () => {
		expect(typed("t", "+t")).toBe("þ");
		expect(typed("+t", "+t")).toBe("Þ");
	});
	test("i⇧I → ı (Turkish) — and ⇧I⇧I stays II (ı uppercases to plain ASCII I)", () => {
		expect(typed("i", "+i")).toBe("ı");
		expect(typed("+i", "+i")).toBe("II");
	});
	test("the West African hooks: k⇧K → ƙ, y⇧Y → ƴ, f⇧F → ƒ", () => {
		expect(typed("k", "+k")).toBe("ƙ");
		expect(typed("y", "+y")).toBe("ƴ");
		expect(typed("f", "+f")).toBe("ƒ");
	});
	test("l⇧L is literal — the ela geminada lives on the dot key, not the letter law", () => {
		expect(typed("l", "+l")).toBe("lL");
		expect(typed("+l", "+l")).toBe("LL");
	});
	test("the interpunct is the dot key's double-press: ⌥. ⌥. → ·", () => {
		expect(typed("~.", "~.")).toBe("\u{00B7}");
		expect(typed("c", "e", "l", "~.", "~.", "l", "a")).toBe("cel·la");
		// The double-press claims only the toggle-off; the mark itself, and ⌫, are untouched.
		expect(typed("~.", "n")).toBe(nfc("ṅ"));
		expect(typed("~.", "⌫", "x")).toBe("x");
	});
});

describe("the joiners: affricate tie, or the standalone spacing tie", () => {
	test("⌥j above, ⌥⇧j below — the affricate joiner attaches to the segment", () => {
		expect(typed("t", "~j", "s")).toBe(nfc("t\u{0361}s"));
		expect(typed("t", "~+j", "s")).toBe(nfc("t\u{035C}s"));
	});
	test("pressed again on the joiner it made → the standalone spacing tie", () => {
		expect(typed("t", "~j", "~j")).toBe(nfc("t\u{2040}"));   // overtie
		expect(typed("t", "~+j", "~+j")).toBe(nfc("t\u{203F}")); // undertie
	});
	test("nothing to attach to (start of line, or after a space) → the spacing tie", () => {
		expect(typed("~j")).toBe(nfc("\u{2040}"));
		expect(typed("~+j")).toBe(nfc("\u{203F}"));
		expect(typed("a", " ", "~j")).toBe(nfc("a \u{2040}"));
	});
});

describe("rhotic hook on any vowel", () => {
	test("rhoticity is a dimension: e ⌥r → e˞, ʌ ⌥r → ʌ˞", () => {
		expect(typed("e", "~r")).toBe("e˞");
		expect(typed("u", "+a", "~r")).toBe("ʌ˞");
	});
});

describe("option-shift digits pass native", () => {
	test("⇧2 → @ (the root is 2 ⇧H)", () => expect(typed("+2")).toBe("@"));

	// A ⌥⇧ key with no second form declines, so the host types its own character
	// and the ⇧-transform never fires. (⌥⇧/ — hỏi has no second form.)
	test("⌥⇧/ declines, so no transform reaches back", () =>
		expect(handleKey("s", {key: "/", shift: true, option: true}).edit.type).toBe("pass"));
	test("the grapheme brackets: ⌥\\ → ⟨, ⌥⇧\\ → ⟩ (citing orthography: ⟨c⟩ spells /k/)", () => {
		expect(typed("~\\")).toBe("⟨");
		expect(typed("~+\\")).toBe("⟩");
	});
	test("⌥⇧[ is the locale's close-primary (en: ”) — claimed, not passed", () =>
		expect(handleKey("", {key: "[", shift: true, option: true}).edit).toEqual({type: "insert", text: "”"}));
});

describe("backspace re-arms the prefix stack", () => {
	// Marks are prefix keystrokes: the base was typed LAST, so ⌫ undoes the
	// base and the marks pend again — the fix for a wrong base is one key.
	test("ñ ⌫ o → õ: the base swaps, the mark survives", () =>
		expect(typed("~n", "n", "⌫", "o")).toBe(nfc("õ")));
	test("a whole stack re-arms at once", () =>
		expect(typed("~n", "~e", "a", "⌫", "o")).toBe(typed("~n", "~e", "o")));
	test("⌫ again peels the re-armed stack: ñ ⌫ ⌫ o → o", () =>
		expect(typed("~n", "n", "⌫", "⌫", "o")).toBe("o"));
	test("bare glyph passes to native delete", () => {
		expect(handleBackspace("sa").edit).toEqual({type: "pass"});
	});
	test("precomposed é (NFC input) re-arms its acute", () =>
		expect(typeKeys(seq("⌫", "i"), "caf\u{00E9}")).toBe(nfc("cafí")));
	test("a trailing tie is postfix — it peels, the base stays: t͡ ⌫ → t", () =>
		expect(typed("t", "~j", "⌫")).toBe("t"));

	// The operators are not marks: they arm, and ⌫ disarms them without
	// touching the document, the same as a mark that never landed.
	test("an armed raise peels: ⌥z ⌫ h → h, not ʰ", () =>
		expect(typed("~z", "⌫", "h")).toBe("h"));
	test("an armed lower peels: ⌥⇧z ⌫ 2 → 2", () =>
		expect(typed("+~z", "⌫", "2")).toBe("2"));
	test("a landed raise is a glyph, so ⌫ takes the glyph: tʰ ⌫ → t", () =>
		expect(typed("t", "~z", "h", "⌫")).toBe("t"));

	// A glyph the engine fused into one codepoint has no marks to re-arm, so
	// the host deletes it whole. ɚ is ə plus a hook and Unicode encodes it
	// atomically.
	test("a precomposed rhotic peels as one glyph: ɚ ⌫ → nothing", () =>
		expect(typed("5", "+h", "~r", "⌫")).toBe(""));
	test("a digraph result peels as one glyph: θ ⌫ → nothing", () =>
		expect(typed("t", "+h", "⌫")).toBe(""));

	// Depth. Three marks re-arm as three, in order, and land on the new base.
	test("three marks re-arm together: ṍ̜ ⌫ o keeps all three", () =>
		expect(typed("~n", "~e", "~w", "a", "⌫", "o")).toBe(typed("~n", "~e", "~w", "o")));
	test("peeling twice unwinds one mark at a time", () => {
		expect(typed("~n", "~e", "a", "⌫", "⌫", "o")).toBe(typed("~n", "o"));
		expect(typed("~n", "~e", "a", "⌫", "⌫", "⌫", "o")).toBe("o");
	});
	test("a stack far past anything a transcription needs still peels", () => {
		const marks = ["~n", "~e", "~w", "~h", "~v", "~b", "~k", "~t", "~m", "~g"];
		expect(typed(...marks, "a", "⌫", "o")).toBe(typed(...marks, "o"));
	});

	// Text this engine did not type. A cluster arriving as NFC has to decompose
	// before its marks can re-arm, and the marks may be more than one.
	test("an external two-mark cluster re-arms both: ṍ ⌫ a → ã́", () =>
		expect(typeKeys(seq("⌫", "a"), "\u{1E4D}")).toBe(nfc("a\u{0303}\u{0301}")));
	test("an external cedilla re-arms onto a new base: ç ⌫ s → ş", () =>
		expect(typeKeys(seq("⌫", "s"), "\u{00E7}")).toBe(nfc("\u{015F}")));
	test("an astral character is one glyph to the host", () =>
		expect(handleBackspace("\u{1F600}").edit).toEqual({type: "pass"}));
	test("a lone combining mark with no base is the host's to delete", () =>
		expect(handleBackspace("\u{0303}").edit).toEqual({type: "pass"}));
	test("an empty document has nothing to peel", () =>
		expect(handleBackspace("").edit).toEqual({type: "pass"}));

	// Peeling and the terminators meet: ⌫ empties the stack, so the Space that
	// follows has nothing to commit and is just a space.
	test("⌫ then Space commits nothing: ⌥n ⌫ ␣ → a bare space", () =>
		expect(typed("~n", "⌫", " ")).toBe(" "));
	test("without the peel, Space commits the spacing form", () =>
		expect(typed("~n", " ")).toBe("\u{02DC}"));

	// A spacing mark is postfix: it is already document text, so ⌫ deletes it
	// natively rather than re-arming anything.
	test("a spacing length mark is text, not a pending mark: aː ⌫ → a", () =>
		expect(typed("a", "~;", "⌫")).toBe("a"));
});

describe("daily-driver invariants", () => {
	test("plain English types plainly", () =>
		expect(typed("h", "e", "l", "l", "o")).toBe("hello"));
	test("capitals with no transform pass as capitals", () =>
		expect(typed("+t", "h", "e")).toBe("The"));
	test("punctuation passes", () => {
		expect(handleKey("", {key: ","}).edit).toEqual({type: "pass"});
	});
});

// ------------------------------------------------------- the tie bar's two forms

describe("tie bar", () => {
	test("⌥j ties above: t ⌥j s → t͡s", () =>
		expect(typed("t", "~j", "s")).toBe("t\u{0361}s"));

	test("⌥⇧j ties below — the form for colliding descenders", () =>
		// The below-form (U+035C) is explicit on ⌥⇧j, no toggle: d͜ʒ instead of d͡ʒ,
		// where the bar would hit the ʒ's tail. Placement is the transcriber's.
		expect(typed("d", "~+j", "z", "+h")).toBe("d\u{035C}ʒ"));

	test("above and below are independent keys, not a toggle", () => {
		expect(typed("t", "~j", "s")).toBe("t\u{0361}s");
		expect(typed("t", "~+j", "s")).toBe("t\u{035C}s");
	});

	test("⌥j with no tie behind it still just ties", () =>
		expect(typed("k", "~j", "p")).toBe("k\u{0361}p"));
});

// -------------------------------------------------------------- the last chart hole

describe("heng", () => {
	test("x ⇧H → ɧ, the Swedish sj-sound (simultaneous ʃ and x)", () =>
		expect(typed("x", "+h")).toBe("ɧ"));
});


// ---------------------------------------------- extIPA, placed by shape not by meaning

describe("extIPA marks land on the keys their SHAPE claims", () => {
	// The four that derive. Each is one glyph already in the layout, relocated — so

	test("⌥⇧t is DENTOLABIAL — the dental bridge, relocated above", () =>
		expect(typed("~+t", "t")).toBe(nfc("t͆")));

	test("⌥⇧x is FRICTIONAL — the X, relocated below", () =>
		expect(typed("~+x", "s")).toBe(nfc("s͓")));

	test("the voicing brackets unite on the ( key: unshifted opens, shift closes", () => {
		// ₍ and ₎ carry extIPA's whole (de)voicing system: ₍z, z̥₎, ₍z̥₎.
		expect(typed("~9")).toBe("₍");
		expect(typed("~+9")).toBe("₎");
		expect(typed("~9", "z")).toBe("₍z");   // spacing: it just lands
	});

	test("the 0 key: no-release on ⌥0; the sliding tie ͢ on ⌥⇧0", () => {
		expect(typed("~0", "k")).toBe(nfc("k̚"));
		expect(typed("t", "~+0", "s")).toBe(nfc("t\u{0362}s"));  // sliding, postfix
	});

	test("the force pair on F: ⌥f weak, ⌥⇧f strong (fortis), shift the greater pole", () => {
		expect(typed("~f", "s")).toBe(nfc("s\u{0349}"));
		expect(typed("~+f", "k")).toBe(nfc("k\u{0348}"));   // k͈ — Korean fortis
		expect(typed("~f", "~+f", "k")).toBe(nfc("k\u{0348}"));  // one dimension: replaces
	});
});

describe("contour tones: a contour is its level tones typed in order", () => {
	const nf = (s: string) => s.normalize("NFC");
	test("high rising ˦˥: ⌥e ⌥⇧e e → e᷄", () =>
		expect(nf(typed("~e", "~+e", "e"))).toBe(nf("e\u{1DC4}")));
	test("low rising ˩˨: ⌥⇧` ⌥` e → e᷅", () =>
		expect(nf(typed("~+`", "~`", "e"))).toBe(nf("e\u{1DC5}")));
	test("rising-falling ˧˦˧: ⌥a ⌥e ⌥a e → e᷈", () =>
		expect(nf(typed("~a", "~e", "~a", "e"))).toBe(nf("e\u{1DC8}")));
	test("mid falling ˧˩: ⌥a ⌥` e → e᷆", () =>
		expect(nf(typed("~a", "~`", "e"))).toBe(nf("e\u{1DC6}")));
	test("high falling ˥˧: ⌥e ⌥a e → e᷇", () =>
		expect(nf(typed("~e", "~a", "e"))).toBe(nf("e\u{1DC7}")));
	test("dipping ˥˩˥: ⌥e ⌥` ⌥e e → e᷉", () =>
		expect(nf(typed("~e", "~`", "~e", "e"))).toBe(nf("e\u{1DC9}")));
	test("rising ˩˥ composes to the caron: ⌥⇧` ⌥⇧e e → ě", () =>
		expect(nf(typed("~+`", "~+e", "e"))).toBe(nf("ě")));
	test("falling ˥˩ composes to the circumflex: ⌥⇧e ⌥⇧` e → ê", () =>
		expect(nf(typed("~+e", "~+`", "e"))).toBe(nf("ê")));
	test("an exclusive twin with no contour still replaces: ⌥= ⌥⇧= e → e̟", () =>
		expect(nf(typed("~=", "~+=", "e"))).toBe(nf("e\u{031F}")));
	test("a contour rides other marks: ⌥n ⌥e ⌥⇧e e → ẽ᷄", () =>
		expect(nf(typed("~n", "~e", "~+e", "e"))).toBe(nf("e\u{0303}\u{1DC4}")));
	test("the level marks alone are unchanged: ⌥e e → é", () =>
		expect(nf(typed("~e", "e"))).toBe(nf("é")));
});

describe("capital digraphs are OFF by default — holding shift yells", () => {
	beforeAll(() => setCapitalDigraphs(false));
	afterAll(() => setCapitalDigraphs(true));
	/** Shift HELD across a whole word, the way a person yells. */
	const yell = (w: string) => typed(...[...w].map((c) => "+" + c.toLowerCase()));
	test("the words a capital digraph used to eat", () => {
		expect(yell("SHIP")).toBe("SHIP");
		expect(yell("THE")).toBe("THE");
		expect(yell("THINK")).toBe("THINK");
		expect(yell("CHAT")).toBe("CHAT");
		expect(yell("GHOST")).toBe("GHOST");
		expect(yell("NOTHING")).toBe("NOTHING");
		expect(yell("RIGHT")).toBe("RIGHT");
		expect(yell("THANKS")).toBe("THANKS");
	});
	test("the shifted-digit capital plane is off too: ⇧5⇧H stays %H", () =>
		expect(typed("+5", "+h")).toBe("%H"));
	test("lowercase transforms are untouched: s ⇧H → ʃ", () =>
		expect(typed("s", "+h")).toBe("ʃ"));
	test("the held chain still continues a real glyph: ʃ⇧I⇧H → ʃɪ", () =>
		expect(typed("s", "+h", "+i", "+h")).toBe("ʃɪ"));
	test("switched on, the digraph forms again: ⇧S⇧H → Ʃ", () => {
		setCapitalDigraphs(true);
		expect(typed("+s", "+h")).toBe("Ʃ");
		setCapitalDigraphs(false);
	});
});
