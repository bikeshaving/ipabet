// The hero: a real <input> bound to the engine via the shared ipa-input binding,
// with the target's keystrokes drawn as bars above it.
//
// The input holds the text — caret, selection, editing and the mobile keyboard
// come from the browser. We draw only what genuinely isn't in the text: the
// keystroke bars, the word label, and the armed dead-key accent.
//
// Attract mode types the target words out on a loop; click in and you take over.

import {jsx, renderer} from "@b9g/crank/standalone";
import {bindIpaInput} from "./ipa-input.ts";

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

	let ti = 0;        // current target word
	let live = false;  // the visitor has taken over
	let run = 0;       // cancels an in-flight demo when state changes

	const target = () => DEMO[ti];

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
	function walked(pend: string): number {
		const steps = target().steps;
		for (let i = steps.length - 1; i >= 0; i--) {
			if (steps[i][1] === input!.value && steps[i][2] === pend) return i + 1;
		}
		return 0;
	}
	function paintLive(pend = ipa.pendingText()) {
		const hits = walked(pend);
		paint(hits, hits > 0 && hits === target().steps.length, pend);
	}

	// The one engine↔input binding, shared with /type.
	const ipa = bindIpaInput(input, (pend) => paintLive(pend));

	// --------------------------------------------------------- attract mode
	async function demo() {
		const token = ++run;
		for (;;) {
			input!.value = "";
			ipa.reset();
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
		ipa.reset();
		run++;
		if (live) paint(0);
		else demo();
	}

	// ------------------------------------------------------------- live mode
	input.addEventListener("focus", () => {
		if (live) return;
		live = true;
		run++; // freeze the demo where it is — the text stays as it is
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
