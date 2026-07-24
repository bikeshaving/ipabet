import {jsx} from "@b9g/crank/standalone";
import type {Context} from "@b9g/crank/standalone";
import {bindIPAInput, type IPABinding} from "../clients/ipa-input.ts";
import {displayKeys, KEYMODE_EVENT} from "../clients/keycaps.ts";
import {handleKey, applyEdit, nativeChar, previewString, type Pending} from "../../../js/src/index.ts";
import {parseKey, formatKey as keyLabel} from "../keystrokes.ts";

// The typing demo: a real <input> bound to the engine, with the target's
// keystrokes drawn as bars above it. Server-rendered (bars visible before any
// JS) and hydrated by clients/typing-demo.ts. The input holds the text, so
// caret, selection and the mobile keyboard come from the browser.

export interface Demo {
	word: string;
	steps: [string, string, string][]; // [keystroke label, output, pending dead-key]
}

// The hero demo, authored as KEYSTROKES; the engine computes the output after each
// one, so the demo cannot drift from the notation.
function demo(word: string, ...keys: string[]) {
	let buffer = "";
	let pending: Pending = [];
	const steps: [string, string, string][] = []; // [key label, output, pending]
	for (const kk of keys) {
		const k = parseKey(kk);
		const step = handleKey(buffer, k, pending);
		pending = step.pending;
		buffer = applyEdit(buffer, step.edit, nativeChar(k));
		steps.push([keyLabel(kk), buffer, previewString(pending)]);
	}
	return {word, steps};
}

export const DEMOS: Demo[] = [
	demo("ship", "s", "+h", "i", "+h", "p"),
	demo("vision", "v", "i", "+h", "z", "+h", "5", "+h", "n"),
	demo("thing", "t", "+h", "i", "+h", "n", "+g"),
	demo("bird", "b", "e", "+5", "~r", "d"),
	demo("about", "5", "+h", "b", "a", "u", "+h", "t"),
	demo("über", "y", "~;", "b", "a", "+5"),
	demo("loch", "l", "o", "+a", "x"),
	demo("señor", "s", "e", "~n", "n", "o", "r"),
	demo("Français", "f", "r", "+q", "~n", "a", "+h", "s", "e", "+h"),
	demo("Muḥammad", "m", "u", "7", "+h", "a", "m", "m", "a", "d"),
	demo("Zhōu", "t", "+r", "~j", "s", "+r", "o", "u", "+h"),
	demo("Hawaiʻi", "+h", "a", "w", "a", "i", "~q", "i"),
	demo("ǃXóõ", "q", "+c", "+x", "~e", "o", "~n", "o"),
];

/** Look up a subset of the tour by word ("ship vision thing"); unknown words
 *  drop, and an empty pick falls back to the full tour — prose names its
 *  examples, this resolves them identically on server and client. */
export function pickDemos(words?: string | null): Demo[] {
	if (!words) return DEMOS;
	const picked = words.split(/[\s,]+/).filter(Boolean)
		.map((w) => DEMOS.find((d) => d.word === w))
		.filter((d): d is Demo => d !== undefined);
	return picked.length ? picked : DEMOS;
}

const IS_CLIENT = typeof window !== "undefined";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function* TypingDemo(this: Context, {demos, still = false}: {demos: Demo[]; still?: boolean}) {
	let input: HTMLInputElement | undefined;
	let ipa: IPABinding | undefined;
	let ti = 0;        // current target word
	let live = false;  // the visitor has taken over
	let run = 0;       // cancels an in-flight demo when state changes
	let hits = 0, done = false, pend = "";

	const target = () => demos[ti];
	const paint = (h: number, d = false, p = "") => this.refresh(() => { hits = h; done = d; pend = p; });

	/** How far along the target's keystrokes we are. Matches the text AND the
	 *  pending accent — after ⌥n the text hasn't moved. */
	const walked = (p: string): number => {
		const steps = target().steps;
		for (let i = steps.length - 1; i >= 0; i--) {
			if (steps[i][1] === input!.value && steps[i][2] === p) return i + 1;
		}
		return 0;
	};
	const paintLive = (p = ipa!.pendingText()) => {
		const h = walked(p);
		paint(h, h > 0 && h === target().steps.length, p);
	};

	// --------------------------------------------------------- attract mode
	const demo = async () => {
		const token = ++run;
		for (;;) {
			input!.value = "";
			ipa?.reset();
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
			this.refresh(() => (ti = (ti + 1) % demos.length));
		}
	};
	const setTarget = (n: number) => {
		ti = ((n % demos.length) + demos.length) % demos.length;
		input!.value = "";
		ipa?.reset();
		run++;
		if (live) paint(0);
		else demo();
	};

	// ------------------------------------------------------------- live mode
	const onfocus = () => {
		if (live) return;
		run++; // freeze the demo where it is — the text stays as it is
		this.refresh(() => (live = true));
		paintLive();
	};
	const onblur = () => {
		if (!live) return;
		this.refresh(() => (live = false));
		demo();
	};

	if (IS_CLIENT && demos.length) {
		this.schedule(() => {
			// The one engine↔input binding, shared with /type. A `still` hero is a
			// pure animation: no binding, no focus takeover, just the attract loop.
			if (!still) ipa = bindIPAInput(input!, (p) => paintLive(p));

			// Keyboard carousel, only while the hero is on screen so arrows still
			// scroll the rest of the page. Arrows defer to the caret when the input
			// has text.
			const heroEl = document.getElementById("demo")!;
			const heroVisible = () => {
				const r = heroEl.getBoundingClientRect();
				return r.bottom > 0 && r.top < window.innerHeight;
			};
			const onkey = (e: KeyboardEvent) => {
				if (still) return;
				if (e.metaKey || e.ctrlKey || e.altKey || !heroVisible()) return;
				if (document.activeElement instanceof HTMLButtonElement) return; // buttons keep their own Enter
				const typing = document.activeElement === input && input!.value !== "";
				if (e.key === "Enter") { e.preventDefault(); setTarget(ti + 1); }
				else if (e.key === "ArrowRight" && !typing) { e.preventDefault(); setTarget(ti + 1); }
				else if (e.key === "ArrowLeft" && !typing) { e.preventDefault(); setTarget(ti - 1); }
			};
			window.addEventListener("keydown", onkey);
			// Keystroke labels follow the platform toggle; the attract loop repaints
			// on its own beat, so only a live (visitor-held) hero needs an explicit
			// repaint.
			const onmode = () => { if (live) paintLive(); else this.refresh(); };
			window.addEventListener(KEYMODE_EVENT, onmode);
			this.cleanup(() => {
				window.removeEventListener("keydown", onkey);
				window.removeEventListener(KEYMODE_EVENT, onmode);
			});
			demo();
		});
	}

	for ({demos} of this) {
		yield jsx`
			<div id="demo" class=${live ? "live" : undefined}>
				<div id="demokeys">${demos.length ? target().steps.map(([k]: [string, string, string], i: number) =>
					jsx`<kbd class=${i < hits ? "hit" : undefined}>${displayKeys(k)}</kbd>`) : null}</div>
				<div class="out">
					<input id="demoinput" class="ipa" ref=${(el: HTMLInputElement) => (input = el)}
						aria-label=${still ? "IPA typing demo" : "Type IPA — click and type it yourself"}
						readonly=${still} tabindex=${still ? -1 : undefined}
						spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"
						onfocus=${still ? undefined : onfocus} onblur=${still ? undefined : onblur} />
					<span id="demopend">${pend ? jsx`<span class="pend ipa">${pend}</span>` : null}</span>
				</div>
				<div id="demoword">${done && demos.length ? jsx`<span>${"“" + target().word + "”"}</span>` : null}</div>
			</div>
			${still ? null : jsx`<div id="demonav">
				<button id="demoprev" aria-label="Previous word" title="Previous word" onclick=${() => setTarget(ti - 1)}>◀</button>
				<span class="hint">click the box and type it yourself · ← → to browse</span>
				<button id="demonext" aria-label="Next word" title="Next word" onclick=${() => setTarget(ti + 1)}>▶</button>
			</div>`}`;
	}
}
