// Platform-aware keystroke labels — the pure half, safe to import from any island.
// One vocabulary, two spellings: Mac symbols are canonical, Windows/Linux names
// are the alternate.

import {detectTarget} from "./platform.ts";

export type KeyMode = "mac" | "pc";

/** The cycle the pill walks. Windows and Linux share one spelling: the ⌥
 *  layer is Alt on both. On Windows it answers to the right Alt only, since
 *  the left one belongs to the menu bar; the chart's legend says so once
 *  rather than every label spelling it AltGr. */
export const KEY_MODES: KeyMode[] = ["mac", "pc"];

/** Fired on window whenever the mode changes; islands re-render on it. */
export const KEYMODE_EVENT = "ipabet:keymode";

const STORAGE = "ipabet:keymode";

export function detectKeyMode(): KeyMode {
	// The server renders the canonical mac spellings and the client patches them
	// at hydrate. Anything that isn't a Mac reads the PC names.
	if (typeof window === "undefined") return "mac";
	return detectTarget()?.platform === "macos" ? "mac" : "pc";
}

/** A stored or linked mode, including the names this used to store. */
function parseMode(v: string | null): KeyMode | null {
	if (v === "mac") return "mac";
	if (v === "pc" || v === "windows" || v === "linux") return "pc";
	return null;
}

let override: KeyMode | null =
	typeof location === "undefined" ? null : parseMode(new URLSearchParams(location.search).get("keys"));

export function keyMode(): KeyMode {
	if (override) return override;
	try {
		const v = parseMode(localStorage.getItem(STORAGE));
		if (v) return v;
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

/** What the ⌥ layer is called off the Mac. */
export function optLabel(): string {
	return "Alt";
}

/** "⌥⇧w" → "Alt+Shift+w", "s ⇧H" → "s Shift+H", bare "⇧" → "Shift".
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
 *  "Alt+⇧k", "s⇧H" unchanged. */
export function pcKeysCompact(label: string, opt: string = optLabel()): string {
	return label.replace(/⌥[^\s⌥]*/g, (tok: string, at: number) =>
		(at > 0 && !/[\s(\[]/.test(label[at - 1]) ? " " : "") +
		(tok.length === 1 ? opt : opt + "+" + tok.slice(1)),
	);
}

/** A label in the active (or given) mode — the one display entry point. */
export function displayKeys(label: string, mode: KeyMode = keyMode()): string {
	return mode === "mac" ? label : pcKeys(label);
}
