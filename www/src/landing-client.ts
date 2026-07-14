// The hero demo. Two modes:
//   attract — auto-types engine-verified words (window.__DEMO), lighting each
//             keystroke bar and revealing the glyph, on a loop.
//   live    — the visitor clicks/focuses the hero and types themselves; every
//             keystroke renders as a bar and the IPA builds via the real engine.

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
	steps: [string, string][];
}
declare global {
	interface Window { __DEMO?: Demo[]; }
}

const DEMO: Demo[] = window.__DEMO ?? [];
const demoEl = document.getElementById("demo");
const keysEl = document.querySelector("#demo .keys");
const outEl = document.querySelector("#demo .out .text");
const wordEl = document.querySelector("#demo .word");

if (demoEl && keysEl && outEl && wordEl) {
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
	let live = false;

	// -------------------------------------------------------- attract mode
	async function attract() {
		let di = 0;
		while (!live) {
			const demo = DEMO[di % DEMO.length];
			di++;
			keysEl!.innerHTML = demo.steps.map(([k]) => "<kbd>" + k + "</kbd>").join("");
			outEl!.textContent = "";
			wordEl!.textContent = "";
			await sleep(600);
			const kbds = keysEl!.querySelectorAll("kbd");
			for (let i = 0; i < demo.steps.length && !live; i++) {
				kbds[i].classList.add("hit");
				outEl!.textContent = demo.steps[i][1];
				await sleep(380);
			}
			if (live) return;
			wordEl!.textContent = "“" + demo.word + "”";
			await sleep(2200);
		}
	}

	// ----------------------------------------------------------- live mode
	let labels: string[] = [];
	let buffer = "";
	let pending: Pending = [];

	const segmenter = new Intl.Segmenter();
	function dropLastCluster(text: string): string {
		let last = "";
		for (const s of segmenter.segment(text)) last = s.segment;
		return text.slice(0, text.length - last.length);
	}

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
	function label(k: Keystroke): string {
		const base = k.shift && /^[a-z]$/.test(k.key) ? k.key.toUpperCase() : k.key;
		return (k.option ? "⌥" : "") + (k.shift ? "⇧" : "") + base;
	}
	function applyEdit(edit: Edit, native: string) {
		if (edit.type === "insert") buffer += edit.text;
		else if (edit.type === "replace") buffer = buffer.slice(0, buffer.length - edit.length) + edit.text;
		else if (edit.type === "pass") buffer += native;
	}
	function renderLive() {
		keysEl!.innerHTML = labels.slice(-16).map((l) => `<kbd class="hit">${l}</kbd>`).join("");
		outEl!.textContent = buffer;
		wordEl!.textContent = labels.length ? "" : "your turn — type it";
	}
	function enterLive() {
		if (live) return;
		live = true;
		labels = []; buffer = ""; pending = [];
		renderLive();
	}
	function leaveLive() {
		if (!live) return;
		live = false;
		attract();
	}

	demoEl.setAttribute("tabindex", "0");
	demoEl.addEventListener("focus", enterLive);
	demoEl.addEventListener("blur", leaveLive);
	demoEl.addEventListener("keydown", (e) => {
		if (!live || e.metaKey || e.ctrlKey) return;
		if (e.isComposing || e.keyCode === 229) return;
		if (e.key === "Backspace") {
			e.preventDefault();
			const step = handleBackspace(buffer, pending);
			pending = step.pending;
			if (step.edit.type === "replace") buffer = buffer.slice(0, buffer.length - step.edit.length) + step.edit.text;
			else if (step.edit.type === "pass") buffer = dropLastCluster(buffer);
			if (step.edit.type !== "noop") labels.pop();
			renderLive();
			return;
		}
		const k = keyFromEvent(e);
		if (k === null) return;
		e.preventDefault();
		const step = handleKey(buffer, k, pending);
		pending = step.pending;
		if (step.edit.type !== "noop") { applyEdit(step.edit, nativeChar(k)); labels.push(label(k)); }
		renderLive();
	});

	attract();
}
