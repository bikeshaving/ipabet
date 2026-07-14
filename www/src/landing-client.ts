// The hero: a carousel you can take over.
//
// Attract mode rotates through the target words (window.__DEMO), typing each
// one out with its keystrokes as bars that light up as the sequence is walked.
// The arrows jump between targets. Tap/click in and you take over: rotation
// stops, your keystrokes run through the real engine, the bars light as you
// match the target, and whatever text is already there is kept rather than
// cleared. Click away and it picks the rotation back up.
//
// Input is a real (invisible) <textarea> covering the hero, not a focusable
// <div>: only an editable element raises the soft keyboard on iOS/Android. Two
// input paths feed the engine:
//   keydown     — desktop; gives us e.code, so ⇧ and ⌥ layers all work.
//   beforeinput — soft keyboards, which report no usable e.code. We derive the
//                 keystroke from the character typed, so the bare and ⇧ layers
//                 work on a phone. (⌥ has no soft-keyboard equivalent, so the
//                 diacritic layer is unreachable there — expected.)

import {jsx, renderer} from "@b9g/crank/standalone";
import {
	handleKey,
	handleBackspace,
	nativeChar,
	previewString,
	type Keystroke,
	type Pending,
	type Edit,
} from "../../js/src/index.ts";

interface Demo {
	word: string;
	steps: [string, string, string][]; // [keystroke label, cumulative IPA, pending dead-key]
}
declare global {
	interface Window { __DEMO?: Demo[]; }
}

const DEMO: Demo[] = window.__DEMO ?? [];
const demoEl = document.getElementById("demo");
const inputEl = document.getElementById("demoinput") as HTMLTextAreaElement | null;
const viewEl = document.getElementById("demoview");

/** The hero's display: the target's keystroke bars (lit as far as they've been
 *  walked), the IPA produced so far, and the word once it's complete. */
function HeroView({steps, hits, buffer, pend, word, done}: {
	steps: [string, string, string][];
	hits: number;
	buffer: string;
	pend: string;   // the armed dead-key accent, waiting for its base
	word: string;
	done: boolean;
}) {
	return jsx`
		<div class="keys">
			${steps.map(([k], i) => jsx`<kbd class=${i < hits ? "hit" : undefined}>${k}</kbd>`)}
		</div>
		<div class="out"><span class="text ipa">${buffer}</span>${
			pend ? jsx`<span class="pend ipa">${pend}</span>` : null
		}<span class="caret"></span></div>
		<div class="word">${done ? "“" + word + "”" : ""}</div>`;
}

if (demoEl && inputEl && viewEl && DEMO.length) {
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	let ti = 0;            // current target word
	let live = false;      // the visitor has taken over
	let buffer = "";       // the IPA produced so far
	let pending: Pending = [];
	let run = 0;           // cancels an in-flight demo when state changes

	const target = () => DEMO[ti];

	// ------------------------------------------------------------- rendering
	/** How far along the target's keystroke sequence we've got. Matches BOTH the
	 *  output and the pending dead-key: after ⌥n the buffer is unchanged, so
	 *  buffer alone can't tell that step apart from the one before it. */
	function walked(): number {
		const steps = target().steps;
		const pend = previewString(pending);
		for (let i = steps.length - 1; i >= 0; i--) {
			if (steps[i][1] === buffer && steps[i][2] === pend) return i + 1;
		}
		return 0;
	}
	function paint(hits: number, done = false, pend = "") {
		renderer.render(
			jsx`<${HeroView}
				steps=${target().steps}
				hits=${hits}
				buffer=${buffer}
				pend=${pend}
				word=${target().word}
				done=${done}
			/>`,
			viewEl!,
		);
	}
	function paintLive() {
		const hits = walked();
		paint(hits, hits > 0 && hits === target().steps.length, previewString(pending));
	}

	// --------------------------------------------------------- demo the words
	/** Attract: type out the current target, rest on it, rotate to the next, and
	 *  keep going — until the visitor takes over (focus) or jumps with an arrow,
	 *  either of which bumps `run` and abandons this loop. */
	async function demo() {
		const token = ++run;
		for (;;) {
			buffer = "";
			paint(0);
			await sleep(600);
			const steps = target().steps;
			for (let i = 0; i < steps.length; i++) {
				if (live || token !== run) return;
				buffer = steps[i][1];
				paint(i + 1, false, steps[i][2]); // …including the armed dead-key
				await sleep(380);
			}
			if (live || token !== run) return;
			paint(steps.length, true); // rest on the finished word…
			await sleep(2200);
			if (live || token !== run) return;
			ti = (ti + 1) % DEMO.length; // …then rotate to the next
		}
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
