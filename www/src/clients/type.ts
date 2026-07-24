// /type client — hydrates the Pad component and enhances the reference board.
// The pad's behavior lives in components/pad.ts; this entry attaches it and
// wires the board (a server-rendered KeyboardRef) to the pad's engine binding.

import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {handleKey} from "../../../js/src/index.ts";
import {Pad, type PadAPI} from "../components/pad.ts";

// The ⇧ view is LIVE: each capital shows the transform it would perform on the
// glyph before the caret, or its plain uppercase where it would just emit.
function paintShiftPreview(pad: HTMLTextAreaElement, board: HTMLElement) {
	const before = pad.value.slice(0, pad.selectionStart ?? pad.value.length);
	for (const cap of board.querySelectorAll<HTMLElement>(".cap[data-key]")) {
		const k = cap.dataset.key!;
		if (!/^[a-z]$/.test(k)) continue;
		const t = cap.querySelector<HTMLElement>(".h.t");
		if (t === null) continue;
		const step = handleKey(before, {key: k, shift: true}, [], false);
		if (step.edit.type === "replace") {
			t.textContent = step.edit.text;
			t.classList.add("mod", "ipa");
		} else {
			t.textContent = k.toUpperCase();
			t.classList.remove("mod", "ipa");
		}
	}
}

// The reference board follows the hands: holding ⌥ (or ⌥⇧) flips the visible
// layer, exactly like Keyboard Viewer; releasing restores the radio's choice.
function bindLayerFlip() {
	const optRadio = document.getElementById("klayer-opt") as HTMLInputElement | null;
	const shiftRadio = document.getElementById("klayer-optshift") as HTMLInputElement | null;
	if (optRadio === null || shiftRadio === null) return;
	const shiftOnlyRadio = document.getElementById("klayer-shift") as HTMLInputElement;
	const baseRadio = document.getElementById("klayer-base") as HTMLInputElement;
	let chosen: HTMLInputElement = baseRadio;
	const sync = (e: KeyboardEvent) => {
		if (e.altKey) {
			(e.shiftKey ? shiftRadio : optRadio).checked = true;
		} else if (e.shiftKey) {
			shiftOnlyRadio.checked = true;
		} else {
			chosen.checked = true;
		}
	};
	for (const r of [baseRadio, optRadio, shiftRadio, shiftOnlyRadio]) {
		r.addEventListener("change", () => { if (r.checked) chosen = r; });
	}
	window.addEventListener("keydown", sync);
	window.addEventListener("keyup", sync);
}

// The board is clickable. mousedown is prevented so the pad keeps focus and the
// caret never blinks away.
function bindBoard({ipa, textarea: pad}: PadAPI) {
	const board = document.getElementById("kbdref");
	if (board === null) return;
	paintShiftPreview(pad, board);
	document.addEventListener("selectionchange", () => {
		if (document.activeElement === pad) paintShiftPreview(pad, board);
	});
	board.addEventListener("mousedown", (e) => e.preventDefault());
	board.addEventListener("click", (e) => {
		const cap = (e.target as Element).closest<HTMLElement>(".cap");
		if (cap === null) return;
		pad.focus();
		const chrome = cap.dataset.chrome;
		const radioOf = (id: string) => document.getElementById(id) as HTMLInputElement;
		if (cap.dataset.key !== undefined) {
			// A click types the visible layer.
			const k = cap.dataset.key;
			ipa.sendKey(
				radioOf("klayer-base").checked ? {key: k} :
				radioOf("klayer-shift").checked ? {key: k, shift: true} :
				{key: k, option: true, shift: radioOf("klayer-optshift").checked});
			return;
		}
		if (chrome === "backspace") { ipa.backspace(); return; }
		// The chord caps toggle their layer lock; clicking a lit chord returns to base.
		if (chrome === "option") {
			radioOf(
				radioOf("klayer-opt").checked || radioOf("klayer-optshift").checked ? "klayer-base" :
				radioOf("klayer-shift").checked ? "klayer-optshift" : "klayer-opt").checked = true;
		}
		if (chrome === "shift") {
			radioOf(
				radioOf("klayer-shift").checked || radioOf("klayer-optshift").checked ? "klayer-base" :
				radioOf("klayer-opt").checked ? "klayer-optshift" : "klayer-shift").checked = true;
		}
	});
}

let board: HTMLElement | null;
renderer.hydrate(
	jsx`<${Pad}
		onchange=${() => queueMicrotask(() => {
			const pad = document.getElementById("ed") as HTMLTextAreaElement | null;
			if (pad !== null && board != null) paintShiftPreview(pad, board);
		})}
		onready=${(api: PadAPI) => { board = document.getElementById("kbdref"); bindLayerFlip(); bindBoard(api); }}
	/>`,
	document.getElementById("pad-root")!,
);
