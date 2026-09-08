// Extract the ONLY part of ipabet.json that isn't layout (-> LDML), UCD-derivable
// (cp/name), or prose (-> content/keys.md): the per-mark editorial tags the /keys
// page renders. Keyed by the ⌥ mark character. Run: node spec/tools/gen-annotations.mjs
import fs from 'node:fs';
const s = JSON.parse(fs.readFileSync(new URL('../ipabet.json', import.meta.url), 'utf8'));

const out = {};
for (const m of s.marks) {
  const tags = {};
  if (m.group) tags.group = m.group;
  if (m.shiftSense) tags.shiftSense = m.shiftSense;
  if (m.ipa === false) tags.ipa = false;
  if (m.beyond) tags.beyond = m.beyond;
  if (m.arbitraryKey) tags.arbitraryKey = true;
  if (Object.keys(tags).length) out[m.mark] = tags;
}
const json = JSON.stringify(out, null, 1);
fs.writeFileSync(new URL('../marks.annotations.json', import.meta.url), json + '\n');
process.stderr.write(`marks.annotations.json: ${Buffer.byteLength(json)} bytes, ${Object.keys(out).length} marks tagged\n`);
