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
	return {
		code: "", key: "", shiftKey: false, altKey: false, metaKey: false, ctrlKey: false,
		isComposing: false, keyCode: 0, inputType: "", data: null,
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
	g: {code: "KeyG", key: "g"}, "5": {code: "Digit5", key: "5"},
};

function setup() {
	const f = new FakeField();
	const ipa = bindIPAInput(f as any, () => {});
	const press = (
		ch: string,
		mods: {shift?: boolean; option?: boolean; isComposing?: boolean; keyCode?: number} = {},
	) => {
		f.dispatch("keydown", ev({
			...KEY[ch],
			shiftKey: !!mods.shift,
			altKey: !!mods.option,
			isComposing: !!mods.isComposing,
			keyCode: mods.keyCode ?? 0,
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
	return {f, ipa, press, tap};
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
