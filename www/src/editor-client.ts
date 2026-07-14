// /type client — a freeform IPA scratchpad. Every keystroke runs through the
// real IPAbet engine (@b9g/ipabet) relative to the caret, so mid-text editing,
// selection-replace, and diacritic peeling all work like the macOS IME. This is
// the "use it without installing" surface — and the place to trial shift-chaining
// on real prose (hold shift to continue IPA), toggleable below.

import {jsx, renderer} from "@b9g/crank/standalone";
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
const chipMount = document.getElementById("pending-mount");
/** The dead-key preview: the accent(s) waiting for a base. */
function PendingChip({text}: {text: string}) {
	return text === "" ? null : jsx`<span id="pending-chip">${text}</span>`;
}
function renderPending(): void {
	if (chipMount) renderer.render(jsx`<${PendingChip} text=${previewString(pending)} />`, chipMount);
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

// Soft keyboards (iOS/Android) report no usable `e.code`, so keydown alone
// can't drive the engine on a phone — the character has to carry the keystroke.
// An uppercase letter means shift was used; a shifted-digit symbol means ⇧+digit.
// This makes the bare and ⇧ layers (the cognates, every digraph, the homeless
// glyphs) typeable on the stock phone keyboard. ⌥ has no soft-keyboard
// equivalent, so the diacritic layer stays desktop-only.
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

/** Run one keystroke through the engine at the caret. */
function sendKeystroke(k: Keystroke) {
	const before = ta.value.slice(0, ta.selectionStart);
	const step = handleKey(before, k, pending);
	pending = step.pending;
	renderPending();
	if (step.edit.type !== "noop") applyAtCaret(step.edit, nativeChar(k));
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

/** Backspace through the engine. Shared by the keydown and beforeinput paths. */
function engineBackspace(e: Event) {
	if (ta.selectionStart !== ta.selectionEnd) return; // native deletes the selection
	const before = ta.value.slice(0, ta.selectionStart);
	const step = handleBackspace(before, pending);
	pending = step.pending;
	renderPending();
	if (step.edit.type === "noop") { e.preventDefault(); return; } // peeled the accent
	if (step.edit.type === "pass") return; // bare glyph: native single-char delete
	e.preventDefault();
	applyAtCaret(step.edit, "");
}

// True when keydown already owned the event, so the beforeinput that follows
// must not handle it a second time (desktop). Left false when keydown couldn't
// resolve a key — either a native key (space, enter) or a soft keyboard.
let consumed = false;

ta.addEventListener("keydown", (e) => {
	consumed = false;
	if (e.metaKey || e.ctrlKey) return; // native shortcuts (copy, paste, undo…)
	// An OS input method is mediating this keystroke (e.g. IPAbet itself, or
	// any Korean/Japanese/pinyin IME) — let it own the text; running our engine
	// too would double-transform (s ⇧H → sʃh). isComposing covers marked-text
	// IMEs; keyCode 229 covers immediate-commit ones like IPAbet.
	if (e.isComposing || e.keyCode === 229) return;
	if (e.key === "Backspace") {
		consumed = true; // we own this key whatever we decide inside
		engineBackspace(e);
		return;
	}
	const k = keyFromEvent(e);
	if (k === null) return; // no usable e.code: native key, or a soft keyboard → beforeinput
	e.preventDefault();
	consumed = true;
	sendKeystroke(k);
});

// Soft-keyboard path: a phone gives us the character, not the physical key.
// Only runs when keydown didn't already own the event, so desktop space, enter,
// and paste still fall through to the host untouched.
ta.addEventListener("beforeinput", (e) => {
	if (consumed) { consumed = false; return; }
	const ie = e as InputEvent;
	if (ie.inputType === "deleteContentBackward") { engineBackspace(e); return; }
	if (ie.inputType.startsWith("insert") && ie.data) {
		const keys = [...ie.data].map(keyFromChar);
		if (keys.some((k) => k === null)) return; // space, emoji, pasted text — leave it native
		e.preventDefault();
		for (const k of keys) sendKeystroke(k!);
	}
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
