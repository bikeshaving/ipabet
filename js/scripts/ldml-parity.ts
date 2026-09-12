// Replays the parity corpus through the generic LDML executor (js/src/ldml.ts)
// and buckets the misses. The executor is pure composition, so the runtime-mode
// vectors (capital digraphs, non-en quote locale) are expected to miss — they
// live in the shell, not the transforms. The "core" bucket (cd=false, en) is
// what the transforms themselves must cover; the goal is to drive it to zero.
//
//   bun run js/scripts/ldml-parity.ts [--show N]

import {readFileSync} from "node:fs";
import {type} from "../src/ldml.ts";

const vectors = JSON.parse(
  readFileSync(new URL("../../spec/parity-vectors.json", import.meta.url), "utf8"),
);
const show = Number(process.argv[process.argv.indexOf("--show") + 1]) || 40;

let pass = 0;
const buckets = {
  "cd=true (capital-digraphs mode)": 0,
  "locale!=en (quote mode)": 0,
  "core (cd=false, en)": 0,
};
const core: string[] = [];
for (const v of vectors) {
  if (type(v.keys, v.initial ?? "", {capitalDigraphs: v.capital_digraphs}) === v.expected) { pass++; continue; }
  if (v.capital_digraphs) buckets["cd=true (capital-digraphs mode)"]++;
  else if (v.locale !== "en") buckets["locale!=en (quote mode)"]++;
  else {
    buckets["core (cd=false, en)"]++;
    if (core.length < show) {
      const ks = v.keys.map((k: any) => (k.option ? "⌥" : "") + (k.shift ? "⇧" : "") + k.key).join(" ");
      core.push(`  [${ks}]  exp ${JSON.stringify(v.expected)}  got ${JSON.stringify(type(v.keys, v.initial ?? "", {capitalDigraphs: v.capital_digraphs}))}`);
    }
  }
}
console.log(`\nparity: ${pass}/${vectors.length} (${(100 * pass / vectors.length).toFixed(1)}%)`);
for (const [k, n] of Object.entries(buckets)) console.log(`  ${String(n).padStart(4)}  ${k}`);
if (core.length) console.log("\ncore gaps (what the transforms must still cover):\n" + core.join("\n"));
