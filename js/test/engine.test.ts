// Parity suite: keystroke sequences → expected text. Every case here is a
// behavioral contract shared with the macOS IME — if the Swift engine and
// this port disagree with a row, one of them is wrong.

import {describe, expect, test} from "bun:test";
import {typeKeys, handleKey, handleBackspace, type Keystroke} from "../src/index.ts";

// Compact keystroke notation: "s" bare, "+H" shift, "~n" option, "~+2"
// option-shift, "⌫" backspace.
function seq(...keys: string[]): Keystroke[] {
	return keys.map((k) => {
		let shift = false;
		let option = false;
		let key = k;
		while (key[0] === "+" || key[0] === "~") {
			if (key[0] === "+") shift = true;
			else option = true;
			key = key.slice(1);
		}
		return {key, shift, option};
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
	test("central: ⇧5 ⇧A → ɐ", () => expect(typed("+5", "+a")).toBe("ɐ"));
	test("y-vowel: i ⇧Y → ɨ", () => expect(typed("i", "+y")).toBe("ɨ"));
	test("y-vowel: o ⇧Y → ɵ", () => expect(typed("o", "+y")).toBe("ɵ"));
	test("y-vowel: e ⇧Y → ɘ", () => expect(typed("e", "+y")).toBe("ɘ"));
	test("strut: u ⇧A → ʌ", () => expect(typed("u", "+a")).toBe("ʌ"));
	test("marks survive the swap: s ⌥; is unaffected, s̪ ⇧H keeps bridge", () => {
		// dental s, then H: ʃ with the dental bridge preserved
		expect(typed("s", "~d", "+h")).toBe(nfc("ʃ\u{032A}"));
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
	// even acronyms whose pairs *would* be digraphs stay literal (SH, PH, TH):
	test("acronym SHA stays SHA", () => expect(chain("+s", "+h", "+a")).toBe("SHA"));
	test("acronym PHP stays PHP", () => expect(chain("+p", "+h", "+p")).toBe("PHP"));
	test("THE (digraph-bearing caps) stays THE", () => expect(chain("+t", "+h", "+e")).toBe("THE"));

	// A plain ASCII base (lowercase i) is not special, so a capital after it is
	// just a capital — no chain.
	test("lowercase base doesn't seed a chain: i ⇧P → iP", () =>
		expect(chain("i", "+p")).toBe("iP"));
	// Daily-driver: symbol-prefixed caps keep their capitals (identical to the
	// pre-chaining keyboard — chaining adds nothing a daily-driver would notice).
	test("$PATH keeps its caps: ⇧4 ⇧P⇧A⇧T⇧H → ɾPATH", () =>
		expect(chain("+4", "+p", "+a", "+t", "+h")).toBe("ɾPATH"));
});

describe("clicks (C modifier)", () => {
	test("qC → ǃ", () => expect(typed("q", "+c")).toBe("ǃ"));
	test("tC → ǀ", () => expect(typed("t", "+c")).toBe("ǀ"));
	test("pC → ʘ", () => expect(typed("p", "+c")).toBe("ʘ"));
	test("cC → ǂ", () => expect(typed("c", "+c")).toBe("ǂ"));
	test("lC → ǁ", () => expect(typed("l", "+c")).toBe("ǁ"));
	test("nasal click: n ⇧G ⌥p q ⇧C → ᵑǃ", () =>
		expect(typed("n", "+g", "~p", "q", "+c")).toBe("ᵑǃ"));
	test("voiced click: g ⌥p q ⇧C → ᶢǃ", () =>
		expect(typed("g", "~p", "q", "+c")).toBe("ᶢǃ"));
});

describe("airstream: implosives (⇧P, imPlosive) and ejectives (⇧X, eXplosive)", () => {
	test("implosives — voiced stops via ⇧P", () => {
		expect(typed("b", "+p")).toBe("ɓ");
		expect(typed("d", "+p")).toBe("ɗ");
		expect(typed("j", "+p")).toBe("ʄ");
		expect(typed("g", "+p")).toBe("ɠ");
	});
	test("uvular implosive is qP now; gG retired to literal", () => {
		expect(typed("q", "+p")).toBe("ʛ");
		expect(typed("g", "+g")).toBe("gG"); // gG→ʛ removed; ɢ stays on gQ
		expect(typed("g", "+q")).toBe("ɢ");
	});
	test("ejective — ⇧X appends ʼ to a voiceless obstruent", () => {
		expect(typed("k", "+x")).toBe("k\u{02BC}");
		expect(typed("t", "+x")).toBe("t\u{02BC}");
		expect(typed("s", "+x")).toBe("s\u{02BC}");
		expect(typed("s", "+h", "+x")).toBe("ʃ\u{02BC}"); // ʃʼ
		expect(typed("t", "+r", "+x")).toBe("ʈ\u{02BC}"); // ʈʼ (retroflex ejective)
	});
	test("ejective affricate: t ʃ ⇧X → tʃʼ", () =>
		expect(typed("t", "s", "+h", "+x")).toBe("tʃ\u{02BC}"));
	test("⇧X guards to voiceless obstruents — vowel/sonorant/voiced pass to literal X", () => {
		expect(typed("a", "+x")).toBe("aX");
		expect(typed("m", "+x")).toBe("mX");
		expect(typed("z", "+x")).toBe("zX");
	});
	test("the ejective ʼ is U+02BC, not the curly quote U+2019", () => {
		expect(typed("k", "+x").codePointAt(1)).toBe(0x02BC);
	});
});

describe("shifted number row", () => {
	test("⇧5 → ə", () => expect(typed("+5")).toBe("ə"));
	test("⇧2 → ʔ", () => expect(typed("+2")).toBe("ʔ"));
	test("about: ⇧5 b a u ⇧H t → əbaʊt", () =>
		expect(typed("+5", "b", "a", "u", "+h", "t")).toBe("əbaʊt"));
	test("bare digits pass natively", () => expect(typed("1", "2")).toBe("12"));
	test("⇧9 passes (native paren)", () => {
		expect(handleKey("", {key: "9", shift: true})).toEqual({type: "pass"});
	});
	test("⇧8 passes now (solidus removed — type / manually)", () => {
		expect(handleKey("", {key: "8", shift: true})).toEqual({type: "pass"});
	});
});

describe("option diacritics (postfix)", () => {
	test("señor tilde: n ⌥n → ñ", () => expect(typed("s", "e", "n", "~n")).toBe(nfc("señ")));
	test("acute: e ⌥e → é", () => expect(typed("e", "~e")).toBe(nfc("é")));
	test("length: a ⌥; → aː", () => expect(typed("a", "~;")).toBe("aː"));
	test("no base: ⌥n alone emits its spacing clone", () =>
		expect(typed("~n")).toBe("˜"));
	test("no base, clone-less mark rides NBSP: ⌥d alone", () =>
		expect(typed("~d")).toBe("\u{00A0}\u{032A}"));
});

describe("doubling / cycling", () => {
	test("tilde ×2 → creaky (below): a ⌥n ⌥n", () =>
		expect(typed("a", "~n", "~n")).toBe(nfc("a\u{0330}")));
	test("acute cycles: e ⌥e ⌥e → e-double-acute, ×3 wraps to é", () => {
		expect(typed("e", "~e", "~e")).toBe(nfc("e\u{030B}"));
		expect(typed("e", "~e", "~e", "~e")).toBe(nfc("é"));
	});
	test("single-form mark toggles off: a ⌥a ⌥a → a (other form = absence)", () =>
		expect(typed("a", "~a", "~a")).toBe("a"));
	test("circumflex toggles: e ⌥6 ⌥6 → e, ×3 → ê", () => {
		expect(typed("e", "~6", "~6")).toBe("e");
		expect(typed("e", "~6", "~6", "~6")).toBe(nfc("e\u{0302}"));
	});
	test("clone-less single-form toggles too: a ⌥. ⌥. → a", () =>
		expect(typed("a", "~.", "~.")).toBe("a"));
	test("dark l is atomic: l ⌥l → ɫ, ⌥l again → l", () => {
		expect(typed("l", "~l")).toBe("ɫ");
		expect(typed("l", "~l", "~l")).toBe("l");
	});
	test("velarization elsewhere stays an overlay: t ⌥l", () =>
		expect(typed("t", "~l")).toBe("t\u{0334}"));
	test("dental cycle: d ⌥d ⌥d → apical", () =>
		expect(typed("d", "~d", "~d")).toBe(nfc("d\u{033A}")));
	test("stress cycles both ways: ⌥' ⌥' → ˌ, ×3 → ˈ", () => {
		expect(typed("~'")).toBe("ˈ");
		expect(typed("~'", "~'")).toBe("ˌ");
		expect(typed("~'", "~'", "~'")).toBe("ˈ");
	});
});

describe("ring positioning", () => {
	test("n ⌥k → ring below", () => expect(typed("n", "~k")).toBe(nfc("n\u{0325}")));
	test("ŋ ⌥k → ring above (descender)", () =>
		expect(typed("n", "+g", "~k")).toBe(nfc("ŋ\u{030A}")));
	test("syllabic positions too: n ⌥s → n̩, ŋ ⌥s → ŋ̍", () => {
		expect(typed("n", "~s")).toBe(nfc("n\u{0329}"));
		expect(typed("n", "+g", "~s")).toBe(nfc("ŋ\u{030D}"));
	});
	test("syllabic is single-form now: repeat toggles off", () =>
		expect(typed("n", "~s", "~s")).toBe("n"));
});

describe("superscript operator ⌥p", () => {
	test("aspiration: t h ⌥p → tʰ", () => expect(typed("t", "h", "~p")).toBe("tʰ"));
	test("no superscriptable base → literal p", () => expect(typed("~p")).toBe("p"));
});

describe("Chao tone letters (⌥1–⌥5) + register steps (⌥7/⌥8)", () => {
	test("levels: ⌥1→˩ ⌥2→˨ ⌥3→˧ ⌥4→˦ ⌥5→˥", () => {
		expect(typed("~1")).toBe("˩");
		expect(typed("~2")).toBe("˨");
		expect(typed("~3")).toBe("˧");
		expect(typed("~4")).toBe("˦");
		expect(typed("~5")).toBe("˥");
	});
	test("contours stack: m a ⌥3 ⌥5 → ma˧˥ (mid-rising)", () =>
		expect(typed("m", "a", "~3", "~5")).toBe("ma˧˥"));
	test("downstep ⌥7 → ꜜ, upstep ⌥8 → ꜛ", () => {
		expect(typed("~7")).toBe("ꜜ");
		expect(typed("~8")).toBe("ꜛ");
	});
});

describe("rhotic R", () => {
	test("ə ⇧R → ɚ (precomposed)", () => expect(typed("+5", "+r")).toBe("ɚ"));
	test("a ⇧R → a˞ (spacing hook)", () => expect(typed("a", "+r")).toBe("a˞"));
	test("rhoticity is a dimension: e ⇧R → e˞, ʌ ⇧R → ʌ˞", () => {
		expect(typed("e", "+r")).toBe("e˞");
		expect(typed("u", "+a", "+r")).toBe("ʌ˞");
	});
});

describe("option-shift raw escape", () => {
	test("⌥⇧2 → @", () => expect(typed("~+2")).toBe("@"));
	test("⌥⇧h → H (dodges the transform)", () => expect(typed("s", "~+h")).toBe("sH"));
	test("⌥⇧[ passes (native typography)", () =>
		expect(handleKey("", {key: "[", shift: true, option: true})).toEqual({type: "pass"}));
});

describe("backspace peel", () => {
	test("ñ peels to n", () => expect(typed("n", "~n", "⌫")).toBe("n"));
	test("stacked marks peel one at a time", () =>
		expect(typed("a", "~n", "~e", "⌫")).toBe(nfc("ã")));
	test("bare glyph passes to native delete", () => {
		expect(handleBackspace("sa")).toEqual({type: "pass"});
	});
	test("precomposed é (NFC input) still peels", () => {
		expect(typeKeys(seq("⌫"), "caf\u{00E9}")).toBe("cafe");
	});
});

describe("daily-driver invariants", () => {
	test("plain English types plainly", () =>
		expect(typed("h", "e", "l", "l", "o")).toBe("hello"));
	test("capitals with no transform pass as capitals", () =>
		expect(typed("+t", "h", "e")).toBe("The"));
	test("punctuation passes", () => {
		expect(handleKey("", {key: ","})).toEqual({type: "pass"});
	});
});
