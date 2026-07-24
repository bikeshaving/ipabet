// The ONE place the browser↔engine plumbing lives. Every input surface binds
// through bindIPAInput; surfaces without a text field bind the keystroke
// derivation only.

import {
	handleKey,
	handleBackspace,
	handleUnconvert,
	previewString,
	nativeChar,
	type Pending,
	type Keystroke,
	type Edit,
	SHIFTED_DIGITS,
} from "../../../js/src/index.ts";

// -------------------------------------------------------------- keystrokes

const CODE_KEYS: Record<string, string> = {
	Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
	Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
	// Space reaches the engine so a pending composition terminates exactly as
	// the IME's: the clone commits and the space is consumed (⌥e ␣ → ´).
	Space: " ",
};

/** Desktop: the physical key, from e.code. Gives ⇧ and ⌥ exactly, and Caps Lock,
 *  which is a lock rather than a modifier. */
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

// symbol → digit, derived from the engine's shift plane so it can't drift.
const SHIFTED_DIGIT: Record<string, string> = Object.fromEntries(
	Object.entries(SHIFTED_DIGITS).map(([d, sym]) => [sym, d]),
);

/** Soft keyboards report no usable e.code, so derive the keystroke from the
 *  character. ⌥ has no soft-keyboard equivalent. */
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
 *  Do NOT test e.isComposing here: the plain macOS US layout sets it for its own
 *  dead keys (⌥n ⌥e ⌥i ⌥u ⌥`), no IME involved. Bailing on it let macOS insert
 *  its own ñ while our accent stayed armed and landed on the next vowel
 *  ("señõr"). Those keystrokes are ours. */
export function mediatedByIME(e: KeyboardEvent): boolean {
	// Option chords are OURS. macOS reports 229 for its own layout dead keys
	// (⌥e ⌥u ⌥i ⌥n ⌥`) exactly as a real IME does, and no IME composes through
	// an Option chord — which is the whole range IPAbet claims.
	if (e.altKey) return false;
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

/** Wire a real text field to the engine. The field holds the text, so caret,
 *  selection, editing and the mobile keyboard come from the browser. */
export type IPABinding = ReturnType<typeof bindIPAInput>;

export function bindIPAInput(
	el: Field,
	onChange: (pendingText: string) => void = () => {},
	onStanddown: () => void = () => {},
): IPAInput {
	let pending: Pending = [];
	// NATIVE-IME STANDDOWN — two engines over one field is a race the user always
	// loses. At the first signature of a system IME here, stop consuming keys for
	// good and let it have the field.
	let stood = false;
	/** Option was held for the keystroke behind the current beforeinput. */
	let optionHeld = false;
	const standDown = () => {
		if (stood) return;
		stood = true;
		pending = [];
		onChange("");
		onStanddown();
	};
	// The US layout composes its OWN dead keys (⌥e ⌥u ⌥i ⌥n ⌥`), and it finishes
	// before the letter's keydown is dispatched — probe-verified in Chrome:
	//
	//   keydown Alt · compositionstart · insertCompositionText "´" · keydown Dead
	//
	// so nothing done at keydown can stop it, and insertCompositionText is not
	// cancelable. The composition is therefore allowed to land and the field is
	// taken back afterwards. Only under Option: a real input method composes
	// without it, and that text is its own.
	let composedAway: {value: string; start: number} | null = null;
	const takeFieldBack = () => {
		if (composedAway === null) return;
		el.value = composedAway.value;
		el.selectionStart = el.selectionEnd = composedAway.start;
	};
	el.addEventListener("compositionstart", () => {
		if (!stood && optionHeld) {
			composedAway = {value: el.value, start: el.selectionStart ?? el.value.length};
		}
	});
	el.addEventListener("compositionend", () => {
		takeFieldBack();
		composedAway = null;
	});
	// The shift-chain: hold ⇧ across a run and each capital is a base for the next
	// modifier; release ⇧ and the chain breaks. The engine owns the rule, not the
	// flag — only the caller sees a release.
	let chainBroken = false;
	// True when keydown already owned the event, so the beforeinput that follows must
	// not handle it twice. False for keys keydown couldn't resolve.
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
		optionHeld = e.altKey;
		if (stood) return;
	// ⌘ and ⌃ chords are the host's — EXCEPT ⌃⇧<letter>, the literal-capital escape.
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

	el.addEventListener("input", (e) => {
		// Undo each step of a layout dead key's composition as it lands, so the
		// engine's own pending accent is the only preview on screen.
		if (composedAway !== null && (e as InputEvent).inputType.includes("omposition")) {
			takeFieldBack();
		}
	});

	el.addEventListener("beforeinput", (e) => {
		const ie = e as InputEvent;
		// A replacement insertion is the macOS replace-style IME's signature —
		// the native IPAbet transforming the field. Stand down. NOT
		// insertCompositionText: the US layout emits that for its own dead keys.
		if (ie.inputType === "insertReplacementText") {
			standDown();
			return;
		}
		if (stood) return;
		// keydown already produced this key's output, and the field owns its input.
		// A duplicate INSERT riding the same event is a foreign copy — the macOS
		// IPAbet IME re-inserting the same ː / ˩ it also transformed (a fresh insert,
		// so it never tripped the insertReplacementText standdown above) — so cancel
		// it; two engines must not both land. But a DELETE here is the native
		// backspace the engine deliberately delegated for a bare glyph — let it land.
		if (consumed) {
			consumed = false;
			if (ie.inputType.startsWith("insert")) e.preventDefault();
			return;
		}
		if (ie.inputType === "deleteContentBackward") { engineBackspace(e); return; }
		if (ie.inputType.startsWith("insert") && ie.data) {
			// Unconsumed non-ASCII arriving means something else is composing
			// text into the field — an IME. Stand down and let it through.
			if (ie.inputType === "insertText" && !optionHeld
				&& [...ie.data].some((c) => c.codePointAt(0)! > 127)) {
				standDown();
				return;
			}
			// An Option chord the engine did not claim: the layout's own character
			// (⌥6 §, ⌥8 •). Native, and NOT evidence of an IME.
			if (optionHeld) return;
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
		/** Inject a keystroke as if typed — the clickable board's path in. */
		sendKey: (k: Keystroke) => sendKeystroke(k),
		/** Injected backspace: peel a pending mark, else delete before the caret. */
		backspace: () => {
			const step = handleBackspace(el.value.slice(0, caret()), pending);
			pending = step.pending;
			if (step.edit.type === "noop") { fire(); return; }
			if (step.edit.type === "pass") {
				const at = caret();
				if (at > 0) {
					const before = el.value.slice(0, at);
					const cluster = [...new Intl.Segmenter().segment(before)].pop()?.segment ?? "";
					el.value = before.slice(0, before.length - cluster.length) + el.value.slice(at);
					const pos = at - cluster.length;
					el.setSelectionRange(pos, pos);
				}
				fire(); return;
			}
			applyAtCaret(step.edit, "");
			fire();
		},
	};
}
