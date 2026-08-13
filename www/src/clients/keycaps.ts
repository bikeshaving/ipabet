// Platform-aware keystroke labels — the pure half, safe to import from any island.
// One vocabulary, two spellings: Mac symbols are canonical, Windows/Linux names
// are the alternate.

import {detectTarget} from "./platform.ts";

export type KeyMode = "mac" | "pc";

/** Fired on window whenever the mode changes; islands re-render on it. */
export const KEYMODE_EVENT = "ipabet:keymode";

const STORAGE = "ipabet:keymode";

export function detectKeyMode(): KeyMode {
	// Server renders the canonical mac spellings; a pc client patches at hydrate.
	// Two spellings out of three platforms: anything that is not a Mac — and
	// anything unrecognised, which is mostly PCs — reads the pc names.
	if (typeof window === "undefined") return "mac";
	return detectTarget()?.platform === "macos" ? "mac" : "pc";
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

/** "⌥⇧w" → "Alt+Shift+w", "s ⇧H" → "s Shift+H", bare "⇧" → "Shift".
 *
 *  Alt, never AltGr. Both PC ports read plain Alt for the diacritic layer and
 *  deliberately decline AltGr, which is how a layout that has one keeps @ and €
 *  on it while IPAbet is active — so naming AltGr here would send exactly those
 *  users to the one key that cannot work.
 *  Only modifier-led runs are touched, so prose around them survives. */
export function pcKeys(label: string): string {
	return label.replace(/[⌥⇧⌃]+[^\s⌥⇧⌃]*/g, (tok) =>
		tok
			.replace(/⌥/g, "Alt+")
			.replace(/⇧/g, "Shift+")
			.replace(/⌃/g, "Ctrl+")
			.replace(/\+$/, ""),
	);
}

/** A label in the active (or given) mode — the one display entry point. */
export function displayKeys(label: string, mode: KeyMode = keyMode()): string {
	return mode === "pc" ? pcKeys(label) : label;
}
