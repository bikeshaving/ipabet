// Homepage "layers" demo: a live input wired to the real IPAbet engine, so a
// visitor can type the layers themselves (s⇧H → ʃ, ⇧5 → ə, ⌥n n → ñ) right on
// the landing page. A trimmed sibling of editor-client.ts — same engine core,
// no persistence/count/copy.

import {
	handleKey,
	handleBackspace,
	previewString,
	type Pending,
	nativeChar,
	type Keystroke,
	type Edit,
} from "../../js/src/index.ts";

const ta = document.getElementById("layers-try") as HTMLTextAreaElement | null;

if (ta) {
	const wrap = ta.parentElement!;
	let pending: Pending = [];

	// Dead-key preview chip (⌥e shows the pending accent before its base lands).
	const chip = document.createElement("span");
	chip.id = "layers-pending";
	chip.hidden = true;
	wrap.appendChild(chip);
	const renderPending = () => {
		const s = previewString(pending);
		chip.textContent = s;
		chip.hidden = s === "";
	};

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

	function applyAtCaret(edit: Edit, native: string) {
		const start = ta!.selectionStart;
		const end = ta!.selectionEnd;
		const before = ta!.value.slice(0, start);
		const after = ta!.value.slice(end);
		let head: string;
		switch (edit.type) {
			case "insert": head = before + edit.text; break;
			case "replace": head = before.slice(0, before.length - edit.length) + edit.text; break;
			default: head = before + native; break; // "pass"
		}
		ta!.value = head + after;
		ta!.selectionStart = ta!.selectionEnd = head.length;
	}

	ta.addEventListener("keydown", (e) => {
		if (e.metaKey || e.ctrlKey) return;
		if (e.isComposing || e.keyCode === 229) return; // an OS IME owns this keystroke
		if (e.key === "Backspace") {
			if (ta.selectionStart !== ta.selectionEnd) return;
			const before = ta.value.slice(0, ta.selectionStart);
			const step = handleBackspace(before, pending);
			pending = step.pending;
			renderPending();
			if (step.edit.type === "noop") { e.preventDefault(); return; }
			if (step.edit.type === "pass") return;
			e.preventDefault();
			applyAtCaret(step.edit, "");
			return;
		}
		const k = keyFromEvent(e);
		if (k === null) return;
		e.preventDefault();
		const before = ta.value.slice(0, ta.selectionStart);
		const step = handleKey(before, k, pending);
		pending = step.pending;
		renderPending();
		if (step.edit.type !== "noop") applyAtCaret(step.edit, nativeChar(k));
	});
}
