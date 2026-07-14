// /type client — a freeform IPA scratchpad. Every keystroke runs through the
// real IPAbet engine (@b9g/ipabet) relative to the caret, so mid-text editing,
// selection-replace, and diacritic peeling all work like the macOS IME. This is
// the "use it without installing" surface.
//
// The engine↔input plumbing is NOT reimplemented here — it's the shared
// bindIpaInput, the same one the homepage hero uses. This file only owns what is
// actually specific to the scratchpad: persistence, the character count, copy,
// clear, and the dead-key preview chip.

import {jsx, renderer} from "@b9g/crank/standalone";
import {bindIpaInput} from "./ipa-input.ts";

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
	return text === "" ? null : jsx`<span id="pending-chip">${text}</span>`;
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

const ipa = bindIpaInput(ta, afterChange);

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
