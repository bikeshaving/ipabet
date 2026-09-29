// Platform-aware keystroke labels — the pure half, safe to import from any island.
// One vocabulary, two spellings: Mac symbols are canonical, Windows/Linux names
// are the alternate.

import {detectTarget} from "./platform.ts";

export type KeyMode = "mac" | "windows" | "linux";

/** The cycle the pill walks. Three, not two: the ⌥ layer is AltGr on Windows
 *  and a plain Alt on Linux, which are different keys to a reader. */
export const KEY_MODES: KeyMode[] = ["mac", "windows", "linux"];

/** Fired on window whenever the mode changes; islands re-render on it. */
export const KEYMODE_EVENT = "ipabet:keymode";

const STORAGE = "ipabet:keymode";

export function detectKeyMode(): KeyMode {
	// The server renders the canonical mac spellings and the client patches them
	// at hydrate. Anything unrecognised reads the Windows names, which is what an
	// unrecognised machine most often is.
	if (typeof window === "undefined") return "mac";
	const platform = detectTarget()?.platform;
	if (platform === "macos") return "mac";
	return platform === "linux" ? "linux" : "windows";
}

let override: KeyMode | null = null;
if (typeof location !== "undefined") {
	const q = new URLSearchParams(location.search).get("keys");
	if (q === "mac" || q === "windows" || q === "linux") override = q;
}

export function keyMode(): KeyMode {
	if (override) return override;
	try {
		const v = localStorage.getItem(STORAGE);
		if (v === "mac" || v === "windows" || v === "linux") return v;
		// "pc" is what this used to store, when Windows and Linux shared a name.
		if (v === "pc") return "windows";
	} catch {}
	return detectKeyMode();
}

export function setKeyMode(m: KeyMode): void {
	override = null;
	try {
		localStorage.setItem(STORAGE, m);
	} catch {}
	window.dispatchEvent(new CustomEvent(KEYMODE_EVENT));
}

/** What the ⌥ layer is called in a given mode.
 *
 *  AltGr on Windows: the layer answers to Ctrl+Alt and to the right Alt key,
 *  and AltGr is the name Windows users already have for exactly that. Plain
 *  "Alt" reads as the left one, which opens the menu bar and reaches no text
 *  service. The Linux shells receive an ordinary Alt and decline AltGr, so
 *  there the plain name is the true one. */
export function optLabel(mode: KeyMode = keyMode()): string {
	return mode === "linux" ? "Alt" : "AltGr";
}

/** "⌥⇧w" → "AltGr+Shift+w", "s ⇧H" → "s Shift+H", bare "⇧" → "Shift".
 *  Only modifier-led runs are touched, so prose around them survives. A run
 *  glued to the key before it ("s⇧H") gets a space, or it would read "sShift+H". */
export function pcKeys(label: string, opt: string = optLabel()): string {
	return label.replace(/[⌥⇧⌃⌘]+[^\s⌥⇧⌃⌘]*/g, (tok: string, at: number) =>
		(at > 0 && !/[\s(\[]/.test(label[at - 1]) ? " " : "") +
		tok
			.replace(/⌥/g, opt + "+")
			.replace(/⇧/g, "Shift+")
			.replace(/[⌃⌘]/g, "Ctrl+")
			.replace(/\+$/, ""),
	);
}

/** The chart's tight spelling: only the ⌥ key is renamed, because it is the
 *  one key whose name differs by platform; ⇧ is printed on Shift keys
 *  everywhere, and spelled out it overruns the chart's cells. "⌥⇧k" →
 *  "AltGr+⇧k", "s⇧H" unchanged. */
export function pcKeysCompact(label: string, opt: string = optLabel()): string {
	return label.replace(/⌥[^\s⌥]*/g, (tok: string, at: number) =>
		(at > 0 && !/[\s(\[]/.test(label[at - 1]) ? " " : "") +
		(tok.length === 1 ? opt : opt + "+" + tok.slice(1)),
	);
}

/** A label in the active (or given) mode — the one display entry point. */
export function displayKeys(label: string, mode: KeyMode = keyMode()): string {
	return mode === "mac" ? label : pcKeys(label, optLabel(mode));
}
