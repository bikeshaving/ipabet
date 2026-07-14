// The hero: a real <input> wired to the IPAbet engine, with the target's
// keystrokes drawn as bars above it.
//
// The input HOLDS the text. That's the whole point — the caret, selection,
// editing and the mobile soft keyboard all come from the browser rather than
// being reinvented. The only thing we draw ourselves is what genuinely isn't in
// the text: the keystroke bars, the word label, and the armed dead-key accent.
//
// Attract mode types the target words out on a loop; click in and you take over.

import {jsx, renderer} from "@b9g/crank/standalone";
import {
	handleKey,
	handleBackspace,
	previewString,
	nativeChar,
	type Keystroke,
	type Pending,
	type Edit,
} from "../../js/src/index.ts";

interface Demo {
	word: string;
	steps: [string, string, string][]; // [keystroke label, output, pending dead-key]
}
declare global {
	interface Window { __DEMO?: Demo[]; }
}

const DEMO: Demo[] = window.__DEMO ?? [];
const demoEl = document.getElementById("demo");
const input = document.getElementById("demoinput") as HTMLInputElement | null;
const keysEl = document.getElementById("demokeys");
const pendEl = document.getElementById("demopend");
const wordEl = document.getElementById("demoword");

if (demoEl && input && keysEl && pendEl && wordEl && DEMO.length) {
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	let ti = 0;                  // current target word
	let live = false;            // the visitor has taken over
	let pending: Pending = [];   // the armed dead-key — not in the text, so we draw it
	let run = 0;                 // cancels an in-flight demo when state changes

	const target = () => DEMO[ti];
	const text = () => input.value;

	// ------------------------------------------------------------- rendering
	function Bars({hits}: {hits: number}) {
		return target().steps.map(([k], i) => jsx`<kbd class=${i < hits ? "hit" : undefined}>${k}</kbd>`);
	}
	function paint(hits: number, done = false, pend = "") {
		renderer.render(jsx`<${Bars} hits=${hits} />`, keysEl!);
		renderer.render(pend ? jsx`<span class="pend ipa">${pend}</span>` : null, pendEl!);
		renderer.render(done ? jsx`<span>${"“" + target().word + "”"}</span>` : null, wordEl!);
	}
	/** How far along the target's keystrokes we are. Matches the text AND the
	 *  pending accent — after ⌥n the text hasn't moved, so text alone can't tell
	 *  that keystroke apart from the one before it. */
	function walked(): number {
		const steps = target().steps;
		const pend = previewString(pending);
		for (let i = steps.length - 1; i >= 0; i--) {
			if (steps[i][1] === text() && steps[i][2] === pend) return i + 1;
		}
		return 0;
	}
	function paintLive() {
		const hits = walked();
		paint(hits, hits > 0 && hits === target().steps.length, previewString(pending));
	}

	// --------------------------------------------------------- attract mode
	async function demo() {
		const token = ++run;
		for (;;) {
			input!.value = "";
			pending = [];
			paint(0);
			await sleep(600);
			const steps = target().steps;
			for (let i = 0; i < steps.length; i++) {
				if (live || token !== run) return;
				input!.value = steps[i][1];
				paint(i + 1, false, steps[i][2]);
				await sleep(380);
			}
			if (live || token !== run) return;
			paint(steps.length, true);
			await sleep(2200);
			if (live || token !== run) return;
			ti = (ti + 1) % DEMO.length;
		}
	}
	function setTarget(n: number) {
		ti = (n + DEMO.length) % DEMO.length;
		input!.value = "";
		pending = [];
		run++;
		if (live) paint(0);
		else demo();
	}

	// ---------------------------------------------------- the engine ↔ input
	const CODE_KEYS: Record<string, string> = {
		Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
		Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
	};
	function keyFromEvent(e: KeyboardEvent): Keystroke | null {
		let key: string | undefined;
		if (/^Key[A-Z]$/.test(e.code)) key = e.code[3].toLowerCase();
		else if (/^Digit[0-9]$/.test(e.code)) key = e.code[5];
		else key = CODE_KEYS[e.code];
		if (key === undefined) return null;
		return {key, shift: e.shiftKey, option: e.altKey};
	}
	// Soft keyboards report no usable e.code — derive the keystroke from the
	// character instead. Uppercase means shift was used.
	const SHIFTED_DIGIT: Record<string, string> = {
		"!": "1", "@": "2", "#": "3", "$": "4", "%": "5",
		"^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
	};
	function keyFromChar(c: string): Keystroke | null {
		if (/^[a-z]$/.test(c)) return {key: c, shift: false};
		if (/^[A-Z]$/.test(c)) return {key: c.toLowerCase(), shift: true};
		if (/^[0-9]$/.test(c)) return {key: c, shift: false};
		if (SHIFTED_DIGIT[c] !== undefined) return {key: SHIFTED_DIGIT[c], shift: true};
		if ("`-=[]\\;',./".includes(c)) return {key: c, shift: false};
		return null;
	}

	const caret = () => input!.selectionStart ?? input!.value.length;
	function applyAtCaret(edit: Edit, native: string) {
		const start = caret();
		const end = input!.selectionEnd ?? start;
		const before = input!.value.slice(0, start);
		const after = input!.value.slice(end);
		let head: string;
		switch (edit.type) {
			case "insert": head = before + edit.text; break;
			case "replace": head = before.slice(0, before.length - edit.length) + edit.text; break;
			default: head = before + native; break; // "pass"
		}
		input!.value = head + after;
		input!.selectionStart = input!.selectionEnd = head.length;
	}
	function sendKeystroke(k: Keystroke) {
		const step = handleKey(input!.value.slice(0, caret()), k, pending);
		pending = step.pending;
		if (step.edit.type !== "noop") applyAtCaret(step.edit, nativeChar(k));
		paintLive();
	}

	let consumed = false;
	input.addEventListener("keydown", (e) => {
		consumed = false;
		if (e.metaKey || e.ctrlKey) return;
		// Cede ONLY to a real input method, which commits via keyCode 229.
		//
		// Do NOT cede on isComposing: the plain macOS US layout sets it, because
		// ⌥n/⌥e/⌥i/⌥u/⌥` are its own dead keys. Bailing there let macOS insert its
		// ñ while our ˜ stayed armed and landed on the NEXT vowel — "señõr". No IME
		// is involved; those keystrokes are ours, so we take them and preventDefault,
		// which stops macOS composing at all.
		if (e.keyCode === 229) return;
		if (e.key === "Backspace") {
			consumed = true;
			if (input!.selectionStart !== input!.selectionEnd) return; // native
			const step = handleBackspace(input!.value.slice(0, caret()), pending);
			pending = step.pending;
			if (step.edit.type === "noop") { e.preventDefault(); paintLive(); return; }
			if (step.edit.type === "pass") { paintLive(); return; }   // native single-char delete
			e.preventDefault();
			applyAtCaret(step.edit, "");
			paintLive();
			return;
		}
		const k = keyFromEvent(e);
		if (k === null) return; // native key, or a soft keyboard → beforeinput takes it
		e.preventDefault();
		consumed = true;
		sendKeystroke(k);
	});

	input.addEventListener("beforeinput", (e) => {
		if (consumed) { consumed = false; return; }
		const ie = e as InputEvent;
		if (ie.inputType.startsWith("insert") && ie.data) {
			const keys = [...ie.data].map(keyFromChar);
			if (keys.some((k) => k === null)) return; // space, paste — leave it native
			e.preventDefault();
			for (const k of keys) sendKeystroke(k!);
		}
	});

	input.addEventListener("input", paintLive); // paste / dictation

	// ------------------------------------------------------------- live mode
	input.addEventListener("focus", () => {
		if (live) return;
		live = true;
		run++;          // freeze the demo where it is — the text stays as it is
		demoEl!.classList.add("live");
		paintLive();
	});
	input.addEventListener("blur", () => {
		if (!live) return;
		live = false;
		demoEl!.classList.remove("live");
		demo();
	});

	document.getElementById("demoprev")?.addEventListener("click", () => setTarget(ti - 1));
	document.getElementById("demonext")?.addEventListener("click", () => setTarget(ti + 1));

	demo();
}
