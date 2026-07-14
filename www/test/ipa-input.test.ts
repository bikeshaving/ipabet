// bindIPAInput, driven headlessly.
//
// The binding is a function over DOM events, so it needs no browser — just a
// field with .value/.selectionStart and synthetic events. Every bug this file
// was shipped with is pinned here as a regression, above all the macOS dead-key
// one: ⌥n arms OUR accent while macOS arms ITS OWN, and if we cede the next
// keystroke to a nonexistent IME, macOS writes ñ itself while our ˜ stays armed
// and lands on the following vowel — "señõr".

import {test, expect} from "bun:test";
import {bindIPAInput} from "../src/ipa-input.ts";

// --------------------------------------------------------------- test double

class FakeField {
	value = "";
	selectionStart = 0;
	selectionEnd = 0;
	#listeners: Record<string, Array<(e: any) => void>> = {};
	addEventListener(type: string, fn: (e: any) => void) {
		(this.#listeners[type] ??= []).push(fn);
	}
	dispatch(type: string, e: any) {
		for (const fn of this.#listeners[type] ?? []) fn(e);
		return e;
	}
}

function ev(over: Record<string, unknown> = {}) {
	const caps = !!(over as any).capsLock;
	return {
		code: "", key: "", shiftKey: false, altKey: false, metaKey: false, ctrlKey: false,
		isComposing: false, keyCode: 0, inputType: "", data: null,
		// Caps Lock is invisible to e.shiftKey — only getModifierState reports it.
		getModifierState: (m: string) => (m === "CapsLock" ? caps : false),
		defaultPrevented: false,
		preventDefault() { (this as any).defaultPrevented = true; },
		...over,
	};
}

/** A physical keypress. `mac` lets a test say "macOS reports this mid-composition". */
const KEY: Record<string, {code: string; key: string}> = {
	s: {code: "KeyS", key: "s"}, e: {code: "KeyE", key: "e"}, n: {code: "KeyN", key: "n"},
	o: {code: "KeyO", key: "o"}, r: {code: "KeyR", key: "r"}, i: {code: "KeyI", key: "i"},
	p: {code: "KeyP", key: "p"}, h: {code: "KeyH", key: "h"}, t: {code: "KeyT", key: "t"},
	g: {code: "KeyG", key: "g"}, a: {code: "KeyA", key: "a"}, u: {code: "KeyU", key: "u"},
	"5": {code: "Digit5", key: "5"},
};

function setup() {
	const f = new FakeField();
	const ipa = bindIPAInput(f as any, () => {});
	const press = (
		ch: string,
		mods: {shift?: boolean; option?: boolean; isComposing?: boolean; keyCode?: number; capsLock?: boolean} = {},
	) => {
		f.dispatch("keydown", ev({
			...KEY[ch],
			shiftKey: !!mods.shift,
			altKey: !!mods.option,
			isComposing: !!mods.isComposing,
			keyCode: mods.keyCode ?? 0,
			capsLock: !!mods.capsLock,
		}));
		// the caret always trails the text in these sequences
		f.selectionStart = f.selectionEnd = f.value.length;
	};
	/** A soft keyboard: no usable e.code, so only beforeinput carries the character. */
	const tap = (data: string) => {
		f.dispatch("keydown", ev({code: "", key: data}));
		f.dispatch("beforeinput", ev({inputType: "insertText", data}));
		f.selectionStart = f.selectionEnd = f.value.length;
	};
	/** Let go of shift — the only thing that breaks an IPA chain. */
	const shiftUp = () => f.dispatch("keyup", ev({key: "Shift"}));
	return {f, ipa, press, tap, shiftUp};
}

// -------------------------------------------------------------------- bare

test("bare keys type plain US", () => {
	const {f, press} = setup();
	press("s"); press("e");
	expect(f.value).toBe("se");
});

// ------------------------------------------------------------------- shift

test("⇧letter transforms the previous glyph: s ⇧H → ʃ", () => {
	const {f, press} = setup();
	press("s"); press("h", {shift: true});
	expect(f.value).toBe("ʃ");
});

test("a whole word: ship = s ⇧H i ⇧H p → ʃɪp", () => {
	const {f, press} = setup();
	press("s"); press("h", {shift: true}); press("i"); press("h", {shift: true}); press("p");
	expect(f.value).toBe("ʃɪp");
});

test("⇧digit gives the homeless glyphs: ⇧5 → ə", () => {
	const {f, press} = setup();
	press("5", {shift: true});
	expect(f.value).toBe("ə");
});

// ------------------------------------------------------------------ option

test("⌥ is a PREFIX dead key: it arms an accent and writes nothing", () => {
	const {f, ipa, press} = setup();
	press("s"); press("e");
	press("n", {option: true});
	expect(f.value).toBe("se");          // the text has not moved…
	expect(ipa.pendingText()).toBe("˜"); // …the accent is armed
});

test("the base absorbs the armed accent: ⌥n then n → ñ", () => {
	const {f, ipa, press} = setup();
	press("s"); press("e"); press("n", {option: true}); press("n");
	expect(f.value).toBe("señ");
	expect(ipa.pendingText()).toBe("");
});

// ---------------------------------------------------- the señõr regression

test("REGRESSION: macOS flags the post-dead-key keystroke as composing — we must NOT cede it", () => {
	// macOS's own US layout treats ⌥n as a dead key, so the NEXT keydown arrives
	// with isComposing = true. No IME is involved. If we bail there, macOS inserts
	// its own ñ while our ˜ stays armed and lands on the next vowel → "señõr".
	const {f, ipa, press} = setup();
	press("s");
	press("e");
	press("n", {option: true});                 // ⌥n — arms ˜ (and macOS's dead key)
	press("n", {isComposing: true});            // macOS says "composing" — it is NOT an IME
	press("o");
	press("r");
	expect(f.value).toBe("señor");   // not "señõr"
	expect(ipa.pendingText()).toBe("");
});

test("a REAL input method (keyCode 229) is still ceded — we must not double-transform", () => {
	const {f, press} = setup();
	press("s");
	press("h", {shift: true, keyCode: 229}); // an IME owns this keystroke
	expect(f.value).toBe("s");               // untouched — the IME will write it
});

// --------------------------------------------------------- soft keyboards

test("soft keyboard: characters drive the engine when there is no e.code", () => {
	const {f, tap} = setup();
	tap("s"); tap("H");            // uppercase means shift was used
	expect(f.value).toBe("ʃ");
});

test("soft keyboard: a shifted-digit symbol is ⇧digit — % → ə", () => {
	const {f, tap} = setup();
	tap("%");
	expect(f.value).toBe("ə");
});

test("soft keyboard does not double-fire when keydown already handled the key", () => {
	const {f} = setup();
	const field = f as any;
	// keydown resolves the key (desktop), so the beforeinput that follows must
	// be ignored — otherwise every letter would be typed twice.
	field.dispatch("keydown", ev({code: "KeyS", key: "s"}));
	field.dispatch("beforeinput", ev({inputType: "insertText", data: "s"}));
	expect(f.value).toBe("s"); // not "ss"
});

// ---------------------------------------------------------------- backspace

test("backspace peels an armed accent before touching the text", () => {
	const {f, ipa, press} = setup();
	press("s"); press("n", {option: true});
	expect(ipa.pendingText()).toBe("˜");
	f.dispatch("keydown", ev({key: "Backspace"}));
	expect(ipa.pendingText()).toBe(""); // the accent went, not the s
	expect(f.value).toBe("s");
});

test("reset() drops an armed accent", () => {
	const {ipa, press} = setup();
	press("n", {option: true});
	expect(ipa.pendingText()).toBe("˜");
	ipa.reset();
	expect(ipa.pendingText()).toBe("");
});

// ---------------------------------------------------------------- caps lock

test("Caps Lock types a CAPITAL — the bare layer is native US", () => {
	const {f, press} = setup();
	press("h", {capsLock: true});
	expect(f.value).toBe("H"); // not "h", and not a transform
});

test("REGRESSION: Caps Lock is a LOCK, not the ⇧ modifier — T then H is TH, not θ", () => {
	// Caps Lock was read nowhere: we derived shift from the shift flag alone, so a
	// letter emitted its lowercase base and Caps Lock did nothing at all. It must
	// now type capitals — but it must NEVER act as the modifier.
	const {f, press} = setup();
	press("t", {capsLock: true});
	press("h", {capsLock: true});
	expect(f.value).toBe("TH"); // ⇧ transforms; Caps Lock does not
});

test("a capital is inert: ⇧H after a locked T is still TH, never θ", () => {
	// The modifier table is lowercase-keyed on purpose — that is the same
	// acronym-safety the Ctrl+Shift literal escape relies on. A capital is text,
	// not a transformable glyph, so nothing can reach back and eat it.
	const {f, press} = setup();
	press("t", {capsLock: true});              // literal T
	press("h", {capsLock: true, shift: true}); // ⇧H finds no T rule → native H
	expect(f.value).toBe("TH");
});

test("a pending accent still absorbs onto a Caps Lock capital: ⌥u then A → Ä", () => {
	const {f, ipa, press} = setup();
	f.dispatch("keydown", ev({code: "KeyU", key: "u", altKey: true})); // ⌥u — diaeresis
	expect(ipa.pendingText()).toBe("¨");
	press("a", {capsLock: true});
	expect(f.value).toBe("Ä");
	expect(ipa.pendingText()).toBe("");
});

// -------------------------------------------------------------- shift chain

test("hold ⇧ and the chain continues: s ⇧H⇧I⇧H → ʃɪ", () => {
	const {f, press} = setup();
	press("s");
	press("h", {shift: true}); // → ʃ
	press("i", {shift: true}); // a capital, pending a modifier
	press("h", {shift: true}); // …which lowers and transforms it
	expect(f.value).toBe("ʃɪ");
});

test("REGRESSION: releasing ⇧ breaks the chain — the browser must see the keyup", () => {
	// The engine owns the rule but not the flag: the caller threads chainBroken,
	// because only the caller can see the release. The web binding never did, so
	// the chain was permanently live here — a release did nothing and no capital
	// digraph could fire after a special glyph. The IME reads it from flagsChanged.
	const {f, press, shiftUp} = setup();
	press("s");
	press("h", {shift: true}); // → ʃ
	shiftUp();                 // chain broken: what follows is a FRESH capital run
	press("a", {shift: true});
	press("e", {shift: true}); // ⇧A⇧E is the capital digraph, not a chain
	expect(f.value).toBe("ʃÆ");
});

test("a fresh IPA segment re-arms the chain after a break", () => {
	const {f, press, shiftUp} = setup();
	press("s"); press("h", {shift: true}); // ʃ
	shiftUp();
	press("t");                            // bare base — chain still broken
	press("h", {shift: true});             // a transform: θ, and the chain re-arms
	press("i", {shift: true});
	press("h", {shift: true});
	expect(f.value).toBe("ʃθɪ");
});
