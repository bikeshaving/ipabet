// /type client — a freeform IPA scratchpad. Every keystroke runs through the
// real IPAbet engine (@b9g/ipabet) relative to the caret, so mid-text editing,
// selection-replace, and diacritic peeling all work like the macOS IME. This is
// the "use it without installing" surface — and the place to trial shift-chaining
// on real prose (hold shift to continue IPA), toggleable below.

import {
	handleKey,
	handleBackspace,
	previewString,
	type Pending,
	nativeChar,
	type Keystroke,
	type Edit,
} from "../../js/src/index.ts";

const ta = document.getElementById("ed") as HTMLTextAreaElement;
const countEl = document.getElementById("count") as HTMLElement;
const copyBtn = document.getElementById("copy") as HTMLButtonElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;

const KEY = "ipabet-editor-v1";

// The dead-key composition. Host state — never written into the textarea, so a
// user's own NBSP (common in pasted text) can never be mistaken for it. A
// <textarea> can't style a sub-range, so the preview is a chip, not marked text.
let pending: Pending = [];
const chip = document.createElement("span");
chip.id = "pending-chip";
chip.hidden = true;
document.getElementById("pad")?.appendChild(chip);
function renderPending(): void {
	const s = previewString(pending);
	chip.textContent = s;
	chip.hidden = s === "";
}
try {
	const s = JSON.parse(localStorage.getItem(KEY) || "null");
	if (s && typeof s.text === "string") ta.value = s.text;
} catch { /* no storage */ }
function save() {
	try { localStorage.setItem(KEY, JSON.stringify({text: ta.value})); } catch { /* ignore */ }
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

// Apply an engine edit at the caret. `before` is the text up to selectionStart;
// any active selection (start…end) is dropped, exactly as typing over a
// selection does natively.
function applyAtCaret(edit: Edit, native: string) {
	const start = ta.selectionStart;
	const end = ta.selectionEnd;
	const before = ta.value.slice(0, start);
	const after = ta.value.slice(end);
	let head: string;
	switch (edit.type) {
		case "insert": head = before + edit.text; break;
		case "replace": head = before.slice(0, before.length - edit.length) + edit.text; break;
		case "pass": head = before + native; break;
	}
	ta.value = head + after;
	ta.selectionStart = ta.selectionEnd = head.length;
	afterChange();
}

function afterChange() {
	countEl.textContent = `${[...ta.value].length}`;
	save();
}

ta.addEventListener("keydown", (e) => {
	if (e.metaKey || e.ctrlKey) return; // native shortcuts (copy, paste, undo…)
	// An OS input method is mediating this keystroke (e.g. IPAbet itself, or
	// any Korean/Japanese/pinyin IME) — let it own the text; running our engine
	// too would double-transform (s ⇧H → sʃh). isComposing covers marked-text
	// IMEs; keyCode 229 covers immediate-commit ones like IPAbet.
	if (e.isComposing || e.keyCode === 229) return;
	if (e.key === "Backspace") {
		if (ta.selectionStart !== ta.selectionEnd) return; // native deletes the selection
		const before = ta.value.slice(0, ta.selectionStart);
		const step = handleBackspace(before, pending);
		pending = step.pending;
		renderPending();
		if (step.edit.type === "noop") { e.preventDefault(); return; } // peeled the accent
		if (step.edit.type === "pass") return; // bare glyph: native single-char delete
		e.preventDefault();
		applyAtCaret(step.edit, "");
		return;
	}
	const k = keyFromEvent(e);
	if (k === null) return; // space, enter, arrows, tab… all native
	e.preventDefault();
	const before = ta.value.slice(0, ta.selectionStart);
	const step = handleKey(before, k, pending);
	pending = step.pending;
	renderPending();
	if (step.edit.type !== "noop") applyAtCaret(step.edit, nativeChar(k));
});

// paste / native input (mobile, dictation) — keep the count and storage honest
ta.addEventListener("input", afterChange);

copyBtn.addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText(ta.value);
		const t = copyBtn.textContent;
		copyBtn.textContent = "Copied";
		setTimeout(() => { copyBtn.textContent = t; }, 1200);
	} catch { /* clipboard blocked */ }
});
clearBtn.addEventListener("click", () => { ta.value = ""; afterChange(); ta.focus(); });

afterChange();
ta.focus();
