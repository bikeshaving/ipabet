// Glyph → keystroke label, generated from the canonical spec. Injected into the
// interactive chart island (window.__CHART_KEYS) the same way the audio map is,
// so the island carries no hardcoded keystrokes and cannot drift from ipabet.json.

import spec from "../../spec/ipabet.json";
import {keySpelled} from "./keystrokes.ts";

export const CHART_KEYS: Record<string, string> = Object.fromEntries(
	(spec.letters as {key: string; glyph: string}[]).map((l) => [l.glyph, keySpelled(l.key)]),
);
