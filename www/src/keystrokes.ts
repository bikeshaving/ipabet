// The compact keystroke notation — one definition, used everywhere keystrokes
// are authored as data (the curriculum, the lessons, the wordbank, the hero
// demo) and everywhere they're read back (the /learn drill).
//
//   "s"    bare s
//   "+h"   ⇧h
//   "~n"   ⌥n
//   "~+2"  ⌥⇧2
//
// This was reimplemented five times — seq/label in curriculum.ts, lessons.ts and
// wordbank.ts, parseKey/keyLabel in landing.ts, keystrokeFromLabel in
// learn-client.ts — which is how notations quietly drift apart.

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

// ---------------------------------------------------------------------------
// Rendering the SPEC's key strings ("sH", "5") — a different notation from the
// compact one above. Two formats, deliberately, for two surfaces; both live here
// so the notation can't fork again.

/** The chart's compact form: "sH" → "sH", "2H" → "2H", "6" → "⇧6". A digit is a
 *  BARE base when a modifier follows (2H → 2 then ⇧H); a lone digit is a shifted
 *  glyph (the tie, ⇧6). A trailing capital is the shift-modifier, shown bare. */
export function keyText(key: string): string {
	const digitBare = key.length > 1;
	return [...key].map((c) => (/[0-9]/.test(c) && !digitBare ? "⇧" + c : c)).join("");
}

/** The /keys reference form: "sH" → "s ⇧H", "5Y" → "5 ⇧Y", "6" → "⇧6". Explicit —
 *  every shift is spelled out, space-separated. A digit leading a longer key is a
 *  bare base; a lone digit (the tie) is ⇧-shifted; uppercase letters are ⇧. */
export function keySpelled(key: string): string {
	const digitBare = key.length > 1;
	return [...key]
		.map((c) => (/[0-9]/.test(c) ? (digitBare ? c : "⇧" + c) : /[A-Z]/.test(c) ? "⇧" + c : c))
		.join(" ");
}

/** chart-data's compact marks → display: "~+w" → "⌥⇧w", "g +H ~p" → "g ⇧H ⌥p". */
export function formatCompact(keys: string): string {
	return keys.split(" ").map((k) => k.replace(/~/g, "⌥").replace(/\+/g, "⇧")).join(" ");
}
