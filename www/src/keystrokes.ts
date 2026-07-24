// The compact keystroke notation — one definition, used everywhere keystrokes are
// authored as data and everywhere they are read back.

import {type Keystroke} from "../../js/src/index.ts";

/** Compact notation → a keystroke. "+h" → {key:"h", shift:true}. */
export function parseKey(k: string): Keystroke {
	let shift = false, option = false, key = k;
	while (key[0] === "+" || key[0] === "~") {
		if (key[0] === "+") shift = true;
		else option = true;
		key = key.slice(1);
	}
	return {key, shift, option};
}

/** A whole sequence: seq("s", "+h", "i") → the keystrokes for ʃi. */
export function seq(...keys: string[]): Keystroke[] {
	return keys.map(parseKey);
}

/** Compact notation → the label a reader sees. "+h" → "⇧H", "~n" → "⌥n". */
export function formatKey(k: string): string {
	const {key, shift, option} = parseKey(k);
	return (option ? "⌥" : "") + (shift ? "⇧" : "") + (shift && /[a-z]/.test(key) ? key.toUpperCase() : key);
}

/** The inverse of formatKey: a displayed label back to a keystroke.
 *  "⇧H" → {key:"h", shift:true}. Used by the drill to walk a taught path. */
export function keystrokeFromLabel(lab: string): Keystroke {
	const option = lab.includes("⌥");
	const shift = lab.includes("⇧");
	let key = lab.replace(/[⌥⇧]/g, "");
	if (key.length === 1 && /[A-Z]/.test(key)) key = key.toLowerCase();
	return {key, shift, option};
}

// Rendering key strings with every modifier spelled out, used by the chart and
// the /keys reference.

/** Join formatted keystroke tokens. A shift-capital binds to the base it
 *  transforms (s⇧H — the digraph unit); every other keystroke keeps its space,
 *  so a bare key or a repeated ⌥ press stays legible (⌥⇧j ⌥⇧j). */
function joinKeys(tokens: string[]): string {
	return tokens.reduce((out, t, i) => (i === 0 ? t : out + (/^⇧[A-Za-z0-9]$/.test(t) ? "" : " ") + t), "");
}

/** The SPEC's key strings: "sH" → "s⇧H", "5H" → "5⇧H", "e%" → "e⇧5". A bare
 *  digit is a base; "%" is the shifted-5 centralize modifier. */
export function keySpelled(key: string): string {
	const digitBare = key.length > 1;
	const tokens = [...key].map((c) =>
		c === "%" ? "⇧5" : /[0-9]/.test(c) ? (digitBare ? c : "⇧" + c) : /[A-Z]/.test(c) ? "⇧" + c : c);
	return joinKeys(tokens);
}

/** chart-data's compact marks → display: "~+w" → "⌥⇧w", "g +H ~q" → "g⇧H ⌥q". */
export function formatCompact(keys: string): string {
	return joinKeys(keys.split(" ").map((k) => k.replace(/~/g, "⌥").replace(/\+/g, "⇧")));
}
