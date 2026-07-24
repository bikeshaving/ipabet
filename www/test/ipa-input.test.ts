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

// Capital digraphs are an opt-in setting (they are keystroke-identical to
// holding shift and yelling), so the suites that exercise them turn them on.
import {setCapitalDigraphs} from "../../js/src/index.ts";
setCapitalDigraphs(true);

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
	"5": {code: "Digit5", key: "5"}, y: {code: "KeyY", key: "y"},
	q: {code: "KeyQ", key: "q"},
};

function setup() {
	const f = new FakeField();
	const ipa = bindIPAInput(f as any, () => {});
	const press = (
		ch: string,
		mods: {shift?: boolean; option?: boolean; isComposing?: boolean; keyCode?: number;
			capsLock?: boolean; control?: boolean} = {},
	) => {
		const e = f.dispatch("keydown", ev({
			...KEY[ch],
			shiftKey: !!mods.shift,
			altKey: !!mods.option,
			isComposing: !!mods.isComposing,
			keyCode: mods.keyCode ?? 0,
			capsLock: !!mods.capsLock,
			ctrlKey: !!mods.control,
		}));
		// the caret always trails the text in these sequences
		f.selectionStart = f.selectionEnd = f.value.length;
		return e;
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

test("digit base + modifier gives the homeless glyphs: 5 ⇧H → ə", () => {
	const {f, press} = setup();
	press("5");
	press("h", {shift: true});
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

test("soft keyboard: a digit base + modifier — 5 then H → ə", () => {
	const {f, tap} = setup();
	tap("5"); tap("H");
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

// -------------------------------------------------------------- ⌃⇧ escape

test("REGRESSION: the web had NO escape — ⌃⇧ letter commits the literal capital", () => {
	// The escape moved from ⌥⇧ to ⌃⇧ in the IME, but the browser binding dropped
	// every ⌃ chord, so on the site a ⇧-digraph capital was simply untypeable:
	// "GitHub" came out Giθub with no way out.
	const {f, press} = setup();
	press("g"); press("i"); press("t");
	press("h", {control: true, shift: true}); // ⌃⇧H — literal, no θ
	expect(f.value).toBe("gitH");
});

test("a plain ⌃ chord is still the host's (leader keys, shortcuts)", () => {
	const {f} = setup();
	const e = f.dispatch("keydown", ev({code: "KeyB", key: "b", ctrlKey: true}));
	expect(f.value).toBe("");         // ^b never reached the engine…
	expect(e.defaultPrevented).toBe(false); // …and tmux still gets it
});

// The native-IME standdown: at the first signature of a system input method
// acting on the field, the page engine stops consuming keys entirely. The
// signature is a REPLACEMENT insertion, not a composition — the plain macOS US
// layout opens a composition for its own dead keys (⌥e ⌥u ⌥i ⌥n ⌥`) with no
// input method anywhere, and treating that as the signal disabled the engine
// for the rest of the session on the first Option key pressed.
test("a composition does NOT stand the engine down — layout dead keys start one", () => {
	const {f, press} = setup();
	f.dispatch("compositionstart", ev({}));
	expect(press("s").defaultPrevented).toBe(true);
	expect(press("h", {shift: true}).defaultPrevented).toBe(true);
	expect(f.value).toBe("ʃ");
});

test("an Option chord is ours even when macOS reports keyCode 229", () => {
	const {f, press} = setup();
	// ⌥e is a US-layout dead key: macOS reports 229 exactly as a real IME does.
	expect(press("e", {option: true, keyCode: 229}).defaultPrevented).toBe(true);
	press("a");
	expect(f.value).toBe("á");
});

test("the layout's own Option character does not stand the engine down", () => {
	const {f, press} = setup();
	// An Option chord the engine declines: macOS inserts œ natively (⌥q on a
	// layout we do not claim). Native output, not evidence of an input method.
	press("q", {option: true});
	f.dispatch("beforeinput", ev({inputType: "insertText", data: "œ"}));
	expect(press("s").defaultPrevented).toBe(true);
	expect(press("h", {shift: true}).defaultPrevented).toBe(true);
});

test("a replacement insertion (macOS IME signature) stands the engine down", () => {
	const {f, press} = setup();
	press("s");
	expect(f.value).toBe("s"); // page engine alive until the signature
	f.dispatch("beforeinput", ev({inputType: "insertReplacementText", data: "ʃ"}));
	// With s before the caret, a live engine would transform ⇧H → ʃ. It must not.
	expect(press("h", {shift: true}).defaultPrevented).toBe(false);
	expect(f.value).toBe("s");
});


// The macOS US layout composes its OWN dead keys, and — probe-verified in
// Chrome — finishes before the letter's keydown is dispatched. This replays
// that exact event order for ⌥e followed by ⌥q, which used to leave "´œ".
test("a layout dead key leaves nothing behind: ⌥e ⌥q → ʻ, not ´œ", () => {
	const {f, press} = setup();
	const field = f as any;
	// ⌥e — TSM composes ´ into the field before our keydown arrives.
	field.dispatch("keydown", ev({key: "Alt", keyCode: 18, altKey: true}));
	field.dispatch("compositionstart", ev({}));
	f.value = "´"; f.selectionStart = f.selectionEnd = 1;
	field.dispatch("input", ev({inputType: "insertCompositionText", data: "´"}));
	expect(f.value).toBe("");                       // taken back immediately
	press("e", {option: true, keyCode: 229});       // our accent arms
	field.dispatch("input", ev({inputType: "insertFromComposition", data: "´"}));
	field.dispatch("compositionend", ev({data: "´"}));
	expect(f.value).toBe("");
	// ⌥q — the ʻokina. A spacing mark, so the armed accent commits before it.
	press("q", {option: true});
	expect(f.value).toBe("´ʻ");
});

test("a real input method still composes freely — no Option, no interference", () => {
	const {f} = setup();
	const field = f as any;
	field.dispatch("keydown", ev({key: "a", code: "KeyA", keyCode: 229}));
	field.dispatch("compositionstart", ev({}));
	f.value = "あ";
	field.dispatch("input", ev({inputType: "insertCompositionText", data: "あ"}));
	field.dispatch("compositionend", ev({data: "あ"}));
	expect(f.value).toBe("あ");   // untouched: we only take the field back under Option
});
