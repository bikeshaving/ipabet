// Parity suite: keystroke sequences → expected text. Every case here is a
// behavioral contract shared with the macOS IME — if the Swift engine and
// this port disagree with a row, one of them is wrong.

import {describe, expect, test} from "bun:test";
import {typeKeys, handleKey, handleBackspace, type Keystroke} from "../src/index.ts";

// Compact keystroke notation: "s" bare, "+H" shift, "~n" option, "~+2"
// option-shift, "^" prefix = shift was RELEASED before this key (breaks a
// chain), "⌫" backspace.
function seq(...keys: string[]): Keystroke[] {
	return keys.map((k) => {
		let shift = false;
		let option = false;
		let shiftBroke = false;
		let key = k;
		while (key[0] === "+" || key[0] === "~" || key[0] === "^") {
			if (key[0] === "+") shift = true;
			else if (key[0] === "~") option = true;
			else shiftBroke = true;
			key = key.slice(1);
		}
		return {key, shift, option, shiftBroke};
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
		expect(handleKey("", {key: "9", shift: true}).edit).toEqual({type: "pass"});
	});
	test("⇧8 passes now (solidus removed — type / manually)", () => {
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
	test("non-syllabic: ⌥⇧s a → a̯ (diphthong glide; twin of syllabic ⌥s)", () =>
		expect(typed("~+s", "a")).toBe(nfc("a\u{032F}")));
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
	// ⌥q matches ⌥='s polarity: shift is the *advanced* pole on both keys.
	test("tongue-root on ⌥q (throat): RTR ⌥q a → a̙, ATR ⌥⇧q a → a̘", () => {
		expect(typed("~q", "a")).toBe(nfc("a\u{0319}"));
		expect(typed("~+q", "a")).toBe(nfc("a\u{0318}"));
	});
	test("rounding on ⌥w (labialize): less ⌥w o → o̜, more ⌥⇧w o → o̹", () => {
		expect(typed("~w", "o")).toBe(nfc("o\u{031C}"));
		expect(typed("~+w", "o")).toBe(nfc("o\u{0339}"));
	});
	// ⌥7 now carries ʿayn; the free slots are ⌥8 and (since cedilla moved to
	// the comma key) ⌥c. An unassigned ⌥ digit inserts the digit; an unassigned
	// ⌥ letter passes, so the host's own Option typography (⌥c → ç) survives.
	// Unassigned ⌥ keys pass, digits included, so the host's own Option typography
	// survives: ⌥6 §, ⌥7 ¶, ⌥8 •. And the ⌥⇧ escape only exists where ⇧<digit> is
	// an IPA glyph — ⌥⇧8/9/0 pass, leaving the host's ° · ‚ alone.
	test("unassigned ⌥ digits pass to the host", () => {
		for (const d of ["6", "7"])
			expect(handleKey("", {key: d, option: true}, []).edit.type, `⌥${d}`).toBe("pass");
	});
	test("redundant ⌥⇧ digit escapes pass to the host", () => {
		for (const d of ["8", "9", "0"])
			expect(handleKey("", {key: d, option: true, shift: true}, []).edit.type, `⌥⇧${d}`).toBe("pass");
	});
	test("load-bearing ⌥⇧ digit escapes survive (⇧2 is ʔ, so @ lives here)", () => {
		expect(typed("~+2")).toBe("@");
		expect(typed("~+7")).toBe("&");
	});
	test("the one spent ⌥⇧ digit slot: ⌥⇧1 → ¡", () => expect(typed("~+1")).toBe("¡"));
	test("⌥⇧6 is the ^ escape now that ⇧6 is the tie", () => expect(typed("~+6")).toBe("^"));
	test("⇧1 is ! again, now the tie bar left the number row", () =>
		expect(typed("+1")).toBe("!"));
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
		expect(typed("~9", "d")).toBe(nfc("d\u{033C}"));   // linguolabial (parked)
	});
});

describe("toggle-off (press the same form again on the pending mark)", () => {
	// Pending lives in host state, not the document. Peeling the last mark leaves
	// an EMPTY composition — nothing is written, so there is no sentinel to
	// collide with a user's real NBSP.
	test("⌥n ⌥n → nothing committed", () => expect(typed("~n", "~n")).toBe(""));
	// The ⌥⇧ second press is no longer a toggle: it is the escape (see below).
	// Toggle-off on the PRIMARY ⌥ form is untouched, and backspace still cancels.
	test("⌥⇧n ⌥⇧n → escapes to a raw N", () => expect(typed("~+n", "~+n")).toBe("N"));
	test("single-form macron: ⌥a ⌥a → nothing", () => expect(typed("~a", "~a")).toBe(""));
	test("a peeled composition leaves the next base untouched: ⌥n ⌥n x → x", () =>
		expect(typed("~n", "~n", "x")).toBe("x"));
	test("clone-less single-form toggles too: ⌥. ⌥. → nothing", () =>
		expect(typed("~g", "~g")).toBe(""));
	// velarized lives on ⌥l: U+0334 is velarized OR pharyngealized, so ⌥g would be
	// cross-tier-consistent for only half the mark, while ⌥l keeps ɫ = l + overlay.
	test("dark l is atomic: ⌥l l → ɫ; ⌥l ⌥l l → l (velarization lifted)", () => {
		expect(typed("~l", "l")).toBe("ɫ");
		expect(typed("~l", "~l", "l")).toBe("l");
	});
	test("velarization elsewhere stays an overlay: ⌥l t → t̴", () =>
		expect(typed("~l", "t")).toBe("t\u{0334}"));
	test("backspace peels the pending accent before touching the document", () => {
		expect(typed("~n", "⌫")).toBe("");
		expect(typed("~n", "~e", "⌫", "a")).toBe(nfc("ã"));
	});
});

describe("no sentinel: a user's NBSP is just text", () => {
	// The old engine wrote NBSP+combining into the document to represent a pending
	// accent. NBSP — and even NBSP+combining — occur in real pasted text, so it
	// could be mistaken for ours. Pending is host state now; nothing to confuse.
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
	test("non-syllabic replaces syllabic (⌥s then ⌥⇧s)", () =>
		expect(typed("~s", "~+s", "n")).toBe(nfc("n\u{032F}")));

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

describe("⇧6 = tie bar (welds two segments)", () => {
	// The tie welds two symbols into ONE segment (postfix, attaching to the glyph
	// before it). It lives on ⇧6, a number-row glyph — an unguarded ⇧-letter
	// joiner would fire inside acronyms.
	test("affricate t͡ʃ: t ⇧6 s⇧H", () =>
		expect(typed("t", "+6", "s", "+h")).toBe("t\u{0361}ʃ"));
	test("affricate t͡s: t ⇧6 s", () => expect(typed("t", "+6", "s")).toBe("t\u{0361}s"));
	test("affricate d͡ʒ: d ⇧6 z⇧H", () =>
		expect(typed("d", "+6", "z", "+h")).toBe("d\u{0361}ʒ"));
	test("untied tʃ stays reachable (the tie is optional in IPA)", () =>
		expect(typed("t", "s", "+h")).toBe("tʃ"));

	// The tie must not break a held-shift run: "t͡" (ASCII t + U+0361) is IPA, so a
	// following ⇧S⇧H still chains.
	test("held-shift affricate: t ⇧6 ⇧S ⇧H → t͡ʃ", () =>
		expect(typed("t", "+6", "+s", "+h")).toBe("t\u{0361}ʃ"));
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
		expect(typed("~,", "+c")).toBe(nfc("Ç"));
	});
	// It must fire ONLY while an accent pends — acronyms and shift-chaining intact.
	test("acronyms and chaining are untouched", () => {
		expect(typed("+u", "+r", "+l")).toBe("URL");
		expect(typed("+s", "+h", "+a")).toBe("SHA");
		expect(typed("s", "+h", "+i", "+h")).toBe("ʃɪ");
		expect(typed("+4", "+p", "+a", "+t", "+h")).toBe("ɾPATH");
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
	test("palatalize series is complete: t ⇧J → c", () => expect(typed("t", "+j")).toBe("c"));
});

describe("Latin tenants: orthography the layout must not silently corrupt", () => {
	// ⌥c s used to give ş (cedilla, U+015F) where Romanian needs ș (U+0219).
	// Silent corruption — it looked right. The two below-hooks now share ⌥c.
	test("Romanian comma-below vs Turkish cedilla are distinct", () => {
		expect(typed("~+,", "s")).toBe(nfc("ș"));   // U+0219 Romanian
		expect(typed("~+,", "t")).toBe(nfc("ț"));   // U+021B
		expect(typed("~,", "s")).toBe(nfc("ş"));    // U+015F Turkish
		expect(typed("~,", "c")).toBe(nfc("ç"));
	});
	test("Vietnamese horn, and horn stacking with tone", () => {
		expect(typed("~y", "o")).toBe(nfc("ơ"));
		expect(typed("~y", "u")).toBe(nfc("ư"));
		expect(typed("~`", "~y", "u")).toBe(nfc("ừ"));   // huyền + horn
		expect(typed("~h", "~y", "o")).toBe(nfc("ở"));   // hỏi + horn
	});
	// ʿayn/hamza were dropped: their one natural home (⌥⇧2/⌥⇧3, beside ʔ ʕ) is the
	// load-bearing @ / # escape, and ʔ ʕ cover the sounds. ⌥c now passes to host.
	test("ʿayn is gone; ⌥c passes to the host", () =>
		expect(handleKey("", {key: "c", option: true}, []).edit.type).toBe("pass"));
	test("German ß is the s⇧S ligature digraph", () => {
		expect(typed("s", "+s")).toBe("ß");
		expect(typed("+s", "t", "r", "a", "s", "+s", "e")).toBe("Straße");
		expect(typed("s", "s")).toBe("ss"); // lowercase ss is untouched
	});
	test("prosodic boundaries: ‿ linking, ‖ major group", () => {
		expect(typed("~z")).toBe("‿");
		expect(typed("~+z")).toBe("‖");
	});
});

describe("East Asian coverage", () => {
	// Chao tone letters stack into arbitrary contours — the review's headline gap.
	test("Mandarin contours: ⌥1–⌥5 stack", () => {
		expect(typed("m", "a", "~2", "~1", "~4")).toBe("ma˨˩˦");   // dipping 214
		expect(typed("m", "a", "~3", "~5")).toBe("ma˧˥");           // rising 35
	});
	test("tone numerals via the superscript operator: ma²¹⁴", () =>
		expect(typed("m", "a", "2", "~p", "1", "~p", "4", "~p")).toBe("ma²¹⁴"));

	test("Chinese affricates: t ⇧6 s⇧J → t͡ɕ, t ⇧6 s⇧R → t͡ʂ", () => {
		expect(typed("t", "+6", "s", "+j")).toBe("t\u{0361}ɕ");
		expect(typed("t", "+6", "s", "+r")).toBe("t\u{0361}ʂ");
	});
	test("aspiration via ⌥p: k h ⌥p → kʰ", () => expect(typed("k", "h", "~p")).toBe("kʰ"));

	// All six Vietnamese tones (ngang is unmarked).
	test("Vietnamese tones on a: ngang sắc huyền hỏi ngã nặng", () => {
		expect(typed("a")).toBe("a");
		expect(typed("~e", "a")).toBe(nfc("á"));
		expect(typed("~`", "a")).toBe(nfc("à"));
		expect(typed("~h", "a")).toBe(nfc("ả"));   // hỏi, U+0309
		expect(typed("~n", "a")).toBe(nfc("ã"));
		expect(typed("~+.", "a")).toBe(nfc("ạ"));
	});
	test("Vietnamese implosive: b ⇧P → ɓ", () => expect(typed("b", "+p")).toBe("ɓ"));

	// Korean/Cantonese/Thai coda stops are unreleased; Korean has a fortis series.
	test("unreleased coda stops on ⌥j", () => {
		expect(typed("~j", "p")).toBe(nfc("p\u{031A}"));
		expect(typed("~j", "k")).toBe(nfc("k\u{031A}"));
	});
	test("Cantonese sɐp̚", () => expect(typed("s", "+5", "+a", "~j", "p")).toBe(nfc("sɐp\u{031A}")));
	test("Korean fortis on ⌥0: k͈ t͈ p͈ s͈", () => {
		expect(typed("~0", "k")).toBe(nfc("k\u{0348}"));
		expect(typed("~0", "s")).toBe(nfc("s\u{0348}"));
	});
	test("fortis affricate stacks with the tie: t ⇧6 ⌥0 s⇧J → t͡ɕ͈", () =>
		expect(typed("t", "+6", "~0", "s", "+j")).toBe("t\u{0361}ɕ\u{0348}"));

	// Vowels East Asianists need, one digraph each.
	test("ɨ ɯ ɤ ʌ are single digraphs", () => {
		expect(typed("i", "+y")).toBe("ɨ");
		expect(typed("u", "+w")).toBe("ɯ");
		expect(typed("o", "+w")).toBe("ɤ");
		expect(typed("u", "+a")).toBe("ʌ");
	});
});

describe("ring positioning", () => {
	test("⌥k n → ring below", () => expect(typed("~k", "n")).toBe(nfc("n\u{0325}")));
	test("⌥k n ⇧G → ring rides above the descender (prefixed before ŋ exists)", () =>
		expect(typed("~k", "n", "+g")).toBe(nfc("ŋ\u{030A}")));
	test("syllabic repositions too: ⌥s n → n̩, ⌥s n ⇧G → ŋ̍", () => {
		expect(typed("~s", "n")).toBe(nfc("n\u{0329}"));
		expect(typed("~s", "n", "+g")).toBe(nfc("ŋ\u{030D}"));
	});
	test("syllabic toggles off cleanly: ⌥s ⌥s → nothing committed", () =>
		expect(typed("~s", "~s")).toBe(""));
});

// ⇧<letter> transforms the glyph before it (t ⇧H → θ), so a capital that forms a
// digraph is otherwise untypeable: "GitHub" comes out "Giθub". ⌥⇧<letter> is the
// escape. On keys whose ⌥⇧ already holds a mark's second form, the FIRST press
// leaves that mark pending and emits nothing; a SECOND press commits the raw
// capital instead. Nothing is lost: a second press used to empty pending and emit
// nothing at all, and backspace still cancels a pending mark silently.
describe("⌥⇧ escape: the raw capital shares the chord with the mark", () => {
	const spell = (w: string) => [...w].map((c) => (/[A-Z]/.test(c) ? "+" + c.toLowerCase() : c));

	test("a key with no mark escapes on the first press: GitHub", () =>
		expect(typed(...spell("Git"), "~+h", ...spell("ub"))).toBe("GitHub"));

	test("without the escape, ⇧H transforms: GitHub → Giθub", () =>
		expect(typed(...spell("GitHub"))).toBe("Giθub"));

	test("a key with a mark escapes on the second press: newWidget", () =>
		expect(typed(...spell("new"), "~+w", "~+w", ...spell("idget"))).toBe("newWidget"));

	test("first press is still the mark: a ⌥⇧e b → ab̋", () =>
		expect(typed("a", "~+e", "b")).toBe(nfc("ab\u{030B}")));

	test("second press commits the capital: a ⌥⇧e ⌥⇧e → aE", () =>
		expect(typed("a", "~+e", "~+e")).toBe("aE"));

	test("escaping only unwinds a lone mark, never a stack: ⌥n ⌥⇧e ⌥⇧e a → ã", () =>
		expect(typed("~n", "~+e", "~+e", "a")).toBe(nfc("\u{00E3}")));

	test("primary ⌥ toggle-off is untouched: a ⌥e ⌥e → a", () =>
		expect(typed("a", "~e", "~e")).toBe("a"));

	test("backspace still cancels a pending mark silently", () =>
		expect(typed("a", "~+e", "⌫", "b")).toBe("ab"));

	// A key with no mark on ⌥⇧ escapes to the raw capital on the first press (there
	// is nothing to be pending). ⌥c is unassigned since ʿayn was dropped.
	test("a mark-free ⌥⇧ letter is the capital escape: ⌥⇧c → C", () =>
		expect(typed("~+c")).toBe("C"));
});

// Shift-chaining rebases a capital only when a real IPA SEGMENT sits before it —
// a non-ASCII letter or combining mark. Terminals report the empty cell before
// the cursor as U+00A0 NBSP; the old "non-ASCII" test read that as a segment and
// rebased every start-of-line capital, so "TH" became θ. (typeKeys(seq, initial)
// seeds the buffer, standing in for what the app reports before the cursor.)
describe("chaining seeds only on a real segment, not any non-ASCII char", () => {
	const withInitial = (init: string, ...ks: string[]) => typeKeys(seq(...ks), init);

	test("NBSP before ⇧T⇧H stays literal (the terminal bug)", () =>
		expect(withInitial("\u00A0", "+t", "+h")).toBe("\u00A0TH"));
	test("curly quote before ⇧T⇧H stays literal", () =>
		expect(withInitial("\u201C", "+t", "+h")).toBe("\u201CTH"));
	test("em dash before ⇧T⇧H stays literal", () =>
		expect(withInitial("\u2014", "+t", "+h")).toBe("\u2014TH"));
	test("a real segment still seeds the chain: ʃ⇧T⇧R → ʃʈ", () =>
		expect(typed("s", "+h", "+t", "+r")).toBe("ʃʈ"));
	test("an ASCII base carrying a tie still seeds it: t ⇧6 s ⇧X → t͡sʼ", () =>
		expect(typed("t", "+6", "s", "+x")).toBe(nfc("t\u{0361}s\u{02BC}")));
});

// Shift-chaining continues a transcription with held shift (ʃ⇧I⇧H → ʃɪ). The
// chain breaks on a shift RELEASE, so releasing and re-pressing shift types a
// literal capital after an IPA glyph — the natural escape. A held run keeps
// chaining. ("^" marks a release before that keystroke.)
describe("shift-release escapes a chain to a literal capital", () => {
	test("held: ʃ⇧I⇧H → ʃɪ", () => expect(typed("s", "+h", "+i", "+h")).toBe(nfc("ʃɪ")));
	test("released: ʃ ^⇧I ⇧H → ʃIH (literal)", () =>
		expect(typed("s", "+h", "^+i", "+h")).toBe("ʃIH"));
	test("held: ʃ⇧T⇧R → ʃʈ", () => expect(typed("s", "+h", "+t", "+r")).toBe("ʃʈ"));
	test("released: ʃ ^⇧T ⇧R → ʃTR (literal)", () =>
		expect(typed("s", "+h", "^+t", "+r")).toBe("ʃTR"));
	// A release disarms; an unshifted IPA-producing key does NOT. An Option
	// diacritic (⌥t dental, no shift) leaves s̪ live, so ⇧H still chains to ʃ.
	test("an unshifted diacritic keeps the chain live: ⌥t s ⇧H → ʃ̪", () =>
		expect(typed("~t", "s", "+h")).toBe(nfc("ʃ\u{032A}")));
	// $PATH stays literal with or without releases: the final T is preceded by a
	// literal A, not an IPA segment, so the run breaks there regardless.
	test("$PATH → ɾPATH", () => expect(typed("+4", "+p", "+a", "+t", "+h")).toBe("ɾPATH"));
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
	test("downstep ⌥o → ꜜ, upstep ⌥⇧o → ꜛ (twin)", () => {
		expect(typed("~o")).toBe("ꜜ");
		expect(typed("~+o")).toBe("ꜛ");
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
		expect(handleKey("", {key: "[", shift: true, option: true}).edit).toEqual({type: "pass"}));
});

describe("backspace peel", () => {
	test("ñ peels to n", () => expect(typed("~n", "n", "⌫")).toBe("n"));
	test("stacked marks peel one at a time", () =>
		expect(typed("~n", "~e", "a", "⌫")).toBe(nfc("ã")));
	test("bare glyph passes to native delete", () => {
		expect(handleBackspace("sa").edit).toEqual({type: "pass"});
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
		expect(handleKey("", {key: ","}).edit).toEqual({type: "pass"});
	});
});
