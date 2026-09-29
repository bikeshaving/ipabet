// Bakes src/gen/latin.json: every Latin letter the engine types, and which
// alphabets that covers (src/latin-data.ts). Baked rather than computed per
// request because it types ~150,000 key sequences — too much for a worker's
// startup budget. Runs from `npm run bake`, before develop and build.

import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {latinLetters, coverage} from "../src/latin-data.ts";

const out = join(import.meta.dir, "..", "src", "gen", "latin.json");
const letters = latinLetters();
const next = JSON.stringify({letters, coverage: coverage(letters)}, null, "\t") + "\n";
if (!existsSync(out) || readFileSync(out, "utf8") !== next) writeFileSync(out, next);
console.log(`latin: ${letters.length} letters`);
