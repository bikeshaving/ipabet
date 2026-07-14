// The hero: a mini drill, not a carousel.
//
// It holds one TARGET word at a time (window.__DEMO), showing that word's
// keystrokes as bars that light up as the sequence is walked. It demos the
// current word on its own, but never auto-advances — you cycle targets with the
// arrows. Tap/click in and you take over: your keystrokes run through the real
// engine, the bars light as you match the target, and whatever text is already
// there is kept rather than cleared.
//
// Input is a real (invisible) <textarea> covering the hero, not a focusable
// <div>: only an editable element raises the soft keyboard on iOS/Android. Two
// input paths feed the engine:
//   keydown     — desktop; gives us e.code, so ⇧ and ⌥ layers all work.
//   beforeinput — soft keyboards, which report no usable e.code. We derive the
//                 keystroke from the character typed, so the bare and ⇧ layers
//                 work on a phone. (⌥ has no soft-keyboard equivalent, so the
//                 diacritic layer is unreachable there — expected.)

import {
	handleKey,
	handleBackspace,
	nativeChar,
	type Keystroke,
	type Pending,
	type Edit,
} from "../../js/src/index.ts";

interface Demo {
	word: string;
	steps: [string, string][]; // [keystroke label, cumulative IPA after it]
}
declare global {
	interface Window { __DEMO?: Demo[]; }
}

const DEMO: Demo[] = window.__DEMO ?? [];
const demoEl = document.getElementById("demo");
const inputEl = document.getElementById("demoinput") as HTMLTextAreaElement | null;
const keysEl = document.querySelector("#demo .keys");
const outEl = document.querySelector("#demo .out .text");
const wordEl = document.querySelector("#demo .word");

if (demoEl && inputEl && keysEl && outEl && wordEl && DEMO.length) {
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	let ti = 0;            // current target word
	let live = false;      // the visitor has taken over
	let buffer = "";       // the IPA produced so far
	let pending: Pending = [];
	let run = 0;           // cancels an in-flight demo when state changes

	const target = () => DEMO[ti];

	// ------------------------------------------------------------- rendering
	/** How far along the target's keystroke sequence the buffer has got. */
	function walked(): number {
		const steps = target().steps;
		for (let i = steps.length - 1; i >= 0; i--) if (steps[i][1] === buffer) return i + 1;
		return 0;
	}
	function paint(hits: number, done = false) {
		keysEl!.innerHTML = target().steps
			.map(([k], i) => `<kbd${i < hits ? ' class="hit"' : ""}>${k}</kbd>`)
			.join("");
		outEl!.textContent = buffer;
		wordEl!.textContent = done ? "“" + target().word + "”" : "";
	}
	function paintLive() {
		const hits = walked();
		paint(hits, hits > 0 && hits === target().steps.length);
	}

	// --------------------------------------------------------- demo the word
	async function demo() {
		const token = ++run;
		buffer = "";
		paint(0);
		await sleep(600);
		const steps = target().steps;
		for (let i = 0; i < steps.length; i++) {
			if (live || token !== run) return;
			buffer = steps[i][1];
			paint(i + 1);
			await sleep(380);
		}
		if (live || token !== run) return;
		paint(steps.length, true); // rest on the finished word — no auto-advance
	}

	function setTarget(n: number) {
		ti = (n + DEMO.length) % DEMO.length;
		buffer = "";
		pending = [];
		run++; // cancel any in-flight demo
		if (live) paint(0);
		else demo();
	}

	// ------------------------------------------------------- engine plumbing
	const segmenter = new Intl.Segmenter();
	const dropLastCluster = (t: string) => {
		let last = "";
		for (const s of segmenter.segment(t)) last = s.segment;
		return t.slice(0, t.length - last.length);
	};
	function applyEdit(edit: Edit, native: string) {
		if (edit.type === "insert") buffer += edit.text;
		else if (edit.type === "replace") buffer = buffer.slice(0, buffer.length - edit.length) + edit.text;
		else if (edit.type === "pass") buffer += native;
	}
	function sendKeystroke(k: Keystroke) {
		const step = handleKey(buffer, k, pending);
		pending = step.pending;
		if (step.edit.type !== "noop") applyEdit(step.edit, nativeChar(k));
		paintLive();
	}
	function doBackspace() {
		const step = handleBackspace(buffer, pending);
		pending = step.pending;
		if (step.edit.type === "replace") buffer = buffer.slice(0, buffer.length - step.edit.length) + step.edit.text;
		else if (step.edit.type === "pass") buffer = dropLastCluster(buffer);
		paintLive();
	}

	// -------------------------------------------------- desktop: physical keys
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

	// ------------------------------------------- soft keyboards: characters
	// A phone gives us the character, not the physical key. An uppercase letter
	// means shift was used; a shifted-digit symbol means ⇧ + that digit.
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

	// ------------------------------------------------------------ live mode
	function enterLive() {
		if (live) return;
		live = true;
		run++;           // freeze the demo where it is
		pending = [];    // ...but KEEP `buffer` — you continue from what's there
		demoEl!.classList.add("live");
		paintLive();
	}
	function leaveLive() {
		if (!live) return;
		live = false;
		demoEl!.classList.remove("live");
		demo();
	}

	inputEl.addEventListener("focus", enterLive);
	inputEl.addEventListener("blur", leaveLive);

	inputEl.addEventListener("keydown", (e) => {
		if (!live || e.metaKey || e.ctrlKey) return;
		if (e.isComposing || e.keyCode === 229) return;
		if (e.key === "Backspace") { e.preventDefault(); doBackspace(); return; }
		const k = keyFromEvent(e);
		if (k === null) return; // no usable e.code (soft keyboard) — beforeinput takes it
		e.preventDefault();
		sendKeystroke(k);
	});

	inputEl.addEventListener("beforeinput", (e) => {
		if (!live) return;
		const ie = e as InputEvent;
		e.preventDefault(); // the textarea must stay empty; we paint the display
		if (ie.inputType === "deleteContentBackward") { doBackspace(); return; }
		if (ie.inputType.startsWith("insert") && ie.data) {
			for (const ch of ie.data) {
				const k = keyFromChar(ch);
				if (k) sendKeystroke(k);
			}
		}
	});

	// The arrows live outside #demo so tapping them doesn't pull focus into it.
	document.getElementById("demoprev")?.addEventListener("click", () => setTarget(ti - 1));
	document.getElementById("demonext")?.addEventListener("click", () => setTarget(ti + 1));

	demo();
}
