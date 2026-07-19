// /type client — a freeform IPA scratchpad. Every keystroke runs through the
// real IPAbet engine (@b9g/ipabet) relative to the caret, so mid-text editing,
// selection-replace, and diacritic peeling all work like the macOS IME. This is
// the "use it without installing" surface.
//
// The engine↔input plumbing is NOT reimplemented here — it's the shared
// bindIPAInput, the same one the homepage hero uses. This file only owns what is
// actually specific to the scratchpad: persistence, the character count, copy,
// clear, and the dead-key preview chip.

import {jsx, renderer} from "@b9g/crank/standalone";
import {bindIPAInput} from "./ipa-input.ts";

const ta = document.getElementById("ed") as HTMLTextAreaElement;
const countEl = document.getElementById("count") as HTMLElement;
const copyBtn = document.getElementById("copy") as HTMLButtonElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const chipMount = document.getElementById("pending-mount");

const KEY = "ipabet-editor-v1";

// The dead-key accent is host state — never written into the textarea, so a
// user's own NBSP (common in pasted text) can never be mistaken for it. A
// <textarea> can't style a sub-range, so the preview is a chip, not marked text.
function PendingChip({text}: {text: string}) {
	return text === "" ? null : jsx`<span id="pending-chip">pending <span class="g">${"◌" + text}</span></span>`;
}

try {
	const s = JSON.parse(localStorage.getItem(KEY) || "null");
	if (s && typeof s.text === "string") ta.value = s.text;
} catch { /* no storage */ }

function save() {
	try { localStorage.setItem(KEY, JSON.stringify({text: ta.value})); } catch { /* ignore */ }
}

function afterChange(pendingText: string) {
	countEl.textContent = `${[...ta.value].length}`;
	if (chipMount) renderer.render(jsx`<${PendingChip} text=${pendingText} />`, chipMount);
	save();
}

const ipa = bindIPAInput(ta, afterChange);

copyBtn.addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText(ta.value);
		const t = copyBtn.textContent;
		copyBtn.textContent = "Copied";
		setTimeout(() => { copyBtn.textContent = t; }, 1200);
	} catch { /* clipboard blocked */ }
});
clearBtn.addEventListener("click", () => {
	ta.value = "";
	ipa.reset();          // drop any armed accent with the text
	afterChange("");
	ta.focus();
});

afterChange(ipa.pendingText());
ta.focus();

// The reference board follows the hands: holding ⌥ (or ⌥⇧) flips the visible
// layer, exactly like Keyboard Viewer; releasing restores the radio's choice.
const optRadio = document.getElementById("klayer-opt") as HTMLInputElement | null;
const shiftRadio = document.getElementById("klayer-optshift") as HTMLInputElement | null;
if (optRadio !== null && shiftRadio !== null) {
	const shiftOnlyRadio = document.getElementById("klayer-shift") as HTMLInputElement;
	let chosen: HTMLInputElement = optRadio;
	const sync = (e: KeyboardEvent) => {
		if (e.altKey) {
			(e.shiftKey ? shiftRadio : optRadio).checked = true;
		} else if (e.shiftKey && e.type === "keydown") {
			shiftOnlyRadio.checked = true;
		} else {
			chosen.checked = true;
		}
	};
	for (const r of [optRadio, shiftRadio, shiftOnlyRadio]) {
		r.addEventListener("change", () => { if (r.checked) chosen = r; });
	}
	window.addEventListener("keydown", sync);
	window.addEventListener("keyup", sync);
}

// The board is clickable: a mark key sends its chord for the visible layer
// through the engine; ⌫ deletes; the ⇧/⌥ caps switch layers. mousedown is
// prevented so the pad keeps focus and the caret never blinks away.
const board = document.getElementById("kbdref");
const pad = document.getElementById("ed") as HTMLTextAreaElement | null;
if (board !== null && pad !== null) {
	board.addEventListener("mousedown", (e) => e.preventDefault());
	board.addEventListener("click", (e) => {
		const cap = (e.target as Element).closest<HTMLElement>(".cap");
		if (cap === null) return;
		pad.focus();
		const chrome = cap.dataset.chrome;
		const optShift = (document.getElementById("klayer-optshift") as HTMLInputElement | null)?.checked === true;
		const shiftOnly = (document.getElementById("klayer-shift") as HTMLInputElement | null)?.checked === true;
		if (cap.dataset.key !== undefined) {
			// ⇧ view: the click is the transforming modifier (needs a glyph before
			// the caret); ⌥ views: the click is the mark chord.
			ipa.sendKey(shiftOnly
				? {key: cap.dataset.key, shift: true}
				: {key: cap.dataset.key, option: true, shift: optShift});
			return;
		}
		if (chrome === "backspace") { ipa.backspace(); return; }
		// The chord caps are the layer switch: ⌥ → marks, ⇧ → modifiers, and
		// clicking the second of the pair combines them (⌥ view + ⇧ → ⌥⇧).
		const radio = (id: string) => document.getElementById(id) as HTMLInputElement;
		if (chrome === "option") {
			radio(radio("klayer-shift").checked ? "klayer-optshift" : "klayer-opt").checked = true;
		}
		if (chrome === "shift") {
			radio(radio("klayer-opt").checked ? "klayer-optshift" : "klayer-shift").checked = true;
		}
	});
}
