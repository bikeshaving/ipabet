// Platform-aware keystroke labels — the pure half (no DOM side effects, safe to
// import from any island). One vocabulary, two spellings: the site's canonical
// notation is Mac symbols (⌥ ⇧ ⌃, straight from the spec), and on Windows/Linux
// the same keystrokes read AltGr+ / Shift+ / Ctrl+ — the web engine already
// maps AltGr to the ⌥ layer 1:1, so only the *labels* differ per platform.
//
// Data never translates: labels stored in curricula, specs, and datasets stay
// symbolic (keystrokeFromLabel keeps parsing them); translation happens at the
// last display moment, here.

export type KeyMode = "mac" | "pc";

/** Fired on window whenever the mode changes; islands re-render on it. */
export const KEYMODE_EVENT = "ipabet:keymode";

const STORAGE = "ipabet:keymode";

export function detectKeyMode(): KeyMode {
	return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "mac" : "pc";
}

export function keyMode(): KeyMode {
	try {
		const v = localStorage.getItem(STORAGE);
		if (v === "mac" || v === "pc") return v;
	} catch {}
	return detectKeyMode();
}

export function setKeyMode(m: KeyMode): void {
	try {
		localStorage.setItem(STORAGE, m);
	} catch {}
	window.dispatchEvent(new CustomEvent(KEYMODE_EVENT));
}

/** "⌥⇧w" → "AltGr+Shift+w", "s ⇧H" → "s Shift+H", bare "⇧" → "Shift".
 *  Only modifier-led runs are touched, so prose around them survives. */
export function pcKeys(label: string): string {
	return label.replace(/[⌥⇧⌃]+[^\s⌥⇧⌃]*/g, (tok) =>
		tok
			.replace(/⌥/g, "AltGr+")
			.replace(/⇧/g, "Shift+")
			.replace(/⌃/g, "Ctrl+")
			.replace(/\+$/, ""),
	);
}

/** A label in the active (or given) mode — the one display entry point. */
export function displayKeys(label: string, mode: KeyMode = keyMode()): string {
	return mode === "pc" ? pcKeys(label) : label;
}
