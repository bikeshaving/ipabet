// The ONE place the browser↔engine plumbing lives.
//
// Every input surface (the /type scratchpad, the homepage hero) binds through
// bindIPAInput. Surfaces without a text field (/learn, which reads the whole
// window and has its own on-screen keyboard) import keyFromEvent/keyFromChar so
// the keystroke derivation is still shared. Nothing here gets reimplemented per
// surface — per-surface copies drift.

import {
	handleKey,
	handleBackspace,
	handleUnconvert,
	previewString,
	nativeChar,
	type Pending,
	type Keystroke,
	type Edit,
} from "../../js/src/index.ts";

// -------------------------------------------------------------- keystrokes

const CODE_KEYS: Record<string, string> = {
	Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
	Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
	// Space reaches the engine so a pending composition terminates exactly as
	// the IME's: the clone commits and the space is consumed (⌥e ␣ → ´).
	Space: " ",
};

/** Desktop: the physical key, from e.code. Gives us ⇧ and ⌥ exactly — and Caps
 *  Lock, which is a lock rather than a modifier (the engine types the capital
 *  literally and never treats it as ⇧). getModifierState is the only way to see
 *  it: e.shiftKey stays false under Caps Lock.
 *
 *  Windows/Linux: AltGr is the ⌥ layer, 1:1 — but the OS reports AltGr as
 *  Ctrl+Alt held together, so AltGraph must be resolved BEFORE the control
 *  check or every AltGr press reads as a ⌃ chord. Plain Alt also maps to ⌥
 *  (best-effort; the page's preventDefault suppresses most menu behavior). */
export function keyFromEvent(e: KeyboardEvent): Keystroke | null {
	let key: string | undefined;
	if (/^Key[A-Z]$/.test(e.code)) key = e.code[3].toLowerCase();
	else if (/^Digit[0-9]$/.test(e.code)) key = e.code[5];
	else key = CODE_KEYS[e.code];
	if (key === undefined) return null;
	const altgr =
		(typeof e.getModifierState === "function" && e.getModifierState("AltGraph")) ||
		(e.ctrlKey && e.altKey);
	return {
		key,
		shift: e.shiftKey,
		option: e.altKey || altgr,
		control: e.ctrlKey && !altgr,
		capsLock: typeof e.getModifierState === "function" && e.getModifierState("CapsLock"),
	};
}

const SHIFTED_DIGIT: Record<string, string> = {
	"!": "1", "@": "2", "#": "3", "$": "4", "%": "5",
	"^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
};

/** Soft keyboards report no usable e.code, so derive the keystroke from the
 *  character: uppercase means shift was used; a shifted-digit symbol means
 *  ⇧+digit. (⌥ has no soft-keyboard equivalent — desktop only.) */
export function keyFromChar(c: string): Keystroke | null {
	if (/^[a-z]$/.test(c)) return {key: c, shift: false};
	if (/^[A-Z]$/.test(c)) return {key: c.toLowerCase(), shift: true};
	if (/^[0-9]$/.test(c)) return {key: c, shift: false};
	if (SHIFTED_DIGIT[c] !== undefined) return {key: SHIFTED_DIGIT[c], shift: true};
	if ("`-=[]\\;',./".includes(c)) return {key: c, shift: false};
	return null;
}

/** Cede a keystroke only to a REAL input method, which commits via keyCode 229.
 *
 *  Do NOT test e.isComposing here. The plain macOS US layout sets it, because
 *  ⌥n ⌥e ⌥i ⌥u ⌥` are *its own* dead keys — no IME involved. Bailing on it let
 *  macOS insert its own ñ while our accent stayed armed and landed on the next
 *  vowel ("señõr"), which silently broke the whole ⌥ layer. Those keystrokes are
 *  ours: take them and preventDefault, and macOS never composes at all. */
export function mediatedByIME(e: KeyboardEvent): boolean {
	// eslint-disable-next-line deprecation/deprecation -- the only signal that
	// distinguishes a real IME from a layout dead key.
	return e.keyCode === 229;
}

// ------------------------------------------------------------------ binding

type Field = HTMLTextAreaElement | HTMLInputElement;

export interface IPAInput {
	/** The armed dead-key accent ("" when none). It is NOT in the field's text —
	 *  the host must render it. */
	pendingText(): string;
	/** Drop any armed accent (when the host resets the field). */
	reset(): void;
}

/** Wire a real text field to the engine. The field holds the text, so the caret,
 *  selection, editing and the mobile keyboard come from the browser. `onChange`
 *  fires after every engine edit, carrying the pending accent to display. */
export function bindIPAInput(el: Field, onChange: (pendingText: string) => void = () => {}): IPAInput {
	let pending: Pending = [];
	// The shift-chain: hold ⇧ across a run and each capital is a base for the next
	// modifier (s⇧H⇧I⇧H → ʃɪ); RELEASE ⇧ and the chain breaks, so the next capitals
	// are literal or a fresh digraph (⇧A⇧E → Æ). The engine owns the rule but not
	// the flag — the caller threads it, because only the caller can see the release.
	// The IME reads it from flagsChanged; in a browser that is keyup on Shift.
	// Without this the chain here was permanently live: a release did nothing, and
	// no capital digraph could ever fire after a special glyph.
	let chainBroken = false;
	// True when keydown already owned the event, so the beforeinput that follows
	// must not handle it twice. Left false for keys keydown couldn't resolve — a
	// native key (space, enter) or a soft keyboard.
	let consumed = false;

	const caret = () => el.selectionStart ?? el.value.length;
	const fire = () => onChange(previewString(pending));

	function applyAtCaret(edit: Edit, native: string) {
		const start = caret();
		const end = el.selectionEnd ?? start;
		const before = el.value.slice(0, start);
		const after = el.value.slice(end);
		let head: string;
		switch (edit.type) {
			case "insert": head = before + edit.text; break;
			case "replace": head = before.slice(0, before.length - edit.length) + edit.text; break;
			default: head = before + native; break; // "pass"
		}
		el.value = head + after;
		el.selectionStart = el.selectionEnd = head.length;
	}

	function sendKeystroke(k: Keystroke) {
		const step = handleKey(el.value.slice(0, caret()), k, pending, chainBroken);
		chainBroken = step.chainBroken ?? false;
		pending = step.pending;
		if (step.edit.type !== "noop") applyAtCaret(step.edit, nativeChar(k));
		fire();
	}

	function engineBackspace(e: Event) {
		if (el.selectionStart !== el.selectionEnd) return; // native deletes the selection
		const step = handleBackspace(el.value.slice(0, caret()), pending);
		pending = step.pending;
		if (step.edit.type === "noop") { e.preventDefault(); fire(); return; } // peeled the accent
		if (step.edit.type === "pass") { fire(); return; } // bare glyph: native single-char delete
		e.preventDefault();
		applyAtCaret(step.edit, "");
		fire();
	}

	/** ⌃⌫ — unconvert the committed transform before the caret (θ → "tH"). */
	function engineUnconvert(e: Event) {
		if (el.selectionStart !== el.selectionEnd) return;
		const step = handleUnconvert(el.value.slice(0, caret()), pending);
		pending = step.pending;
		if (step.edit.type === "pass") return; // nothing unconvertible: the host's chord
		e.preventDefault();
		if (step.edit.type !== "noop") applyAtCaret(step.edit, "");
		fire();
	}

	el.addEventListener("keydown", (ev) => {
		const e = ev as KeyboardEvent; // the union field type widens this to Event
		consumed = false;
		// ⌘ chords are the host's (copy, paste, undo). ⌃ chords are too — EXCEPT
		// ⌃⇧<letter>, the literal-capital escape, which is the only way to type a
		// capital that would otherwise be eaten by the ⇧-modifier ("GitHub" → Giθub).
		// The engine owns that rule; we just have to stop swallowing the keystroke.
		if (e.metaKey) return;
		// ⌃⌫ is the unconvert chord (the Japanese IMEs' Ctrl+Backspace) — the one
		// ⌃ chord besides ⌃⇧<letter> the engine claims.
		if (e.ctrlKey && e.key === "Backspace") { consumed = true; engineUnconvert(e); return; }
		if (e.ctrlKey && !(e.shiftKey && /^Key[A-Z]$/.test(e.code))) return;
		if (mediatedByIME(e)) return;
		// Escape terminates a pending composition (commits the clones, like the
		// US dead keys). With nothing pending it stays the page's key.
		if (e.key === "Escape") {
			if (pending.length > 0) { consumed = true; e.preventDefault(); sendKeystroke({key: "Escape"}); }
			return;
		}
		if (e.key === "Backspace") { consumed = true; engineBackspace(e); return; }
		const k = keyFromEvent(e);
		if (k === null) return; // native key, or a soft keyboard → beforeinput takes it
		e.preventDefault();
		consumed = true;
		sendKeystroke(k);
	});

	el.addEventListener("beforeinput", (e) => {
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

	el.addEventListener("keyup", (ev) => {
		if ((ev as KeyboardEvent).key === "Shift") chainBroken = true;
	});

	el.addEventListener("input", fire); // paste / dictation — keep the host honest

	return {
		pendingText: () => previewString(pending),
		reset: () => { pending = []; chainBroken = false; fire(); },
	};
}
