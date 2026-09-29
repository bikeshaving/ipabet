// Bakes src/gen/latin.json: every Latin letter the engine types, and which
// alphabets that covers (src/latin-data.ts). Baked rather than computed per
// request because it types ~150,000 key sequences — too much for a worker's
// startup budget. Runs from `npm run bake`, before develop and build.

import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {latinLetters, coverage, deadKeys, specialLetters, ALPHABETS} from "../src/latin-data.ts";

const out = join(import.meta.dir, "..", "src", "gen", "latin.json");
const letters = latinLetters();
const byGlyph = new Map(letters.map((l) => [l.glyph, l]));
const stacked = ["ấ", "ǘ"].map((g) => ({glyph: g, keys: byGlyph.get(g)?.keys ?? ""}));
const special = specialLetters(letters).map((l) => {
	const up = l.glyph.toUpperCase();
	const cap = [...up].length === 1 && up !== l.glyph ? byGlyph.get(up) : undefined;
	const usedIn = ALPHABETS.filter((a) => a.letters.includes(l.glyph)).map((a) => a.name);
	return {...l, capital: cap?.glyph, capitalDigraphs: cap?.capitalDigraphs, usedIn};
});
const next = JSON.stringify({coverage: coverage(letters), deadKeys: deadKeys(), special, stacked}, null, "\t") + "\n";
if (!existsSync(out) || readFileSync(out, "utf8") !== next) writeFileSync(out, next);
console.log(`latin: ${letters.length} letters`);
