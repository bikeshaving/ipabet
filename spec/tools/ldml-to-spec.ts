// Reconstruct the engine's spec (the shape spec.rs reads) from the LDML, to
// prove the LDML is engine-complete: feed the result to the unchanged engine and
// run its parity suite. Run: bun spec/tools/ldml-to-spec.ts > /tmp/from-ldml.json
//
// This is the step-1 proof. Step 2 (a Rust LDML loader) re-implements this
// mapping once it's shown faithful.

import fs from 'node:fs';
const xml = fs.readFileSync(new URL('../ipabet.xml', import.meta.url), 'utf8');
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

// ---- parse the LDML ----
const keys: Record<string, string> = {};
for (const m of xml.matchAll(/<key id="([^"]+)" output="([^"]*)"\/>/g)) keys[m[1]] = unesc(m[2]);
const layers: Record<string, string[][]> = {};
for (const L of xml.matchAll(/<layer modifiers="([^"]+)">([\s\S]*?)<\/layer>/g)) layers[L[1]] = [...L[2].matchAll(/<row keys="([^"]+)"\/>/g)].map(r => r[1].split(' '));
const T = [...xml.matchAll(/<transform from="([^"]+)" to="([^"]*)"\/>/g)].map(m => [unesc(m[1]), unesc(m[2])]);
const sets: Record<string, string[]> = {};
for (const m of xml.matchAll(/<set id="([^"]+)" value="([^"]*)"\/>/g)) sets[m[1]] = unesc(m[2]).split(' ');
const disp: Record<string, string> = {};
for (const m of xml.matchAll(/<display output="\\m\{([^}]+)\}" display="([^"]*)"\/>/g)) disp[m[1]] = unesc(m[2]);

// marker name -> combining char, learned from each dead-key rule
const markerChar: Record<string, string> = {};
for (const [f, t] of T) {
  const fm = f.match(/^\\m\{([^}]+)\}\(\.\)$/), tm = t.match(/^\$1\\u\{([0-9A-Fa-f]+)\}$/);
  if (fm && tm) markerChar[fm[1]] = String.fromCodePoint(parseInt(tm[1], 16));
}

// ---- letters ----
const letters: { key: string; glyph: string }[] = [];
for (let c = 97; c <= 122; c++) { const id = 'b_' + String.fromCharCode(c); if (keys[id] !== undefined) letters.push({ key: String.fromCharCode(c), glyph: keys[id] }); }
for (const [from, to] of T) {
  if (!from.includes('(\\p{M}*)')) continue;              // digraphs only
  const base = from.slice(0, from.indexOf('('));
  if (!/^[a-z0-9]$/i.test(base)) continue;                // skip ə˞/ɜ˞ (rhotic fusion, not a digraph)
  const op = from.slice(from.indexOf(')') + 1);
  letters.push({ key: base + op, glyph: to.replace(/\$1$/, '') });
}

// ---- marks (from altR/altR-shift layers + dead keys + displays + special) ----
const rows = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
const gridMark = (layer: string) => {                     // physical char -> key id
  const out: Record<string, string> = {};
  (layers[layer] || []).forEach((ids, ri) => ids.forEach((id, ci) => (out[rows[ri][ci]] = id)));
  return out;
};
const altR = gridMark('altR'), altRS = gridMark('altR shift');
const charOf = (id: string) => id.startsWith('mk_') ? markerChar[id.slice(3)] : keys[id];
const nameOf = (id: string) => id.slice(3);

const cyc: Record<string, string[]> = {};                 // marker name -> family (incl primary)
for (const m of xml.matchAll(/<ipabet:cycle marker="([^"]+)" family="([^"]+)"\/>/g)) cyc[m[1]] = m[2].split(' ');
const excl = new Set<string>();                           // marker names that are the 'a' of an exclusive pair
for (const m of xml.matchAll(/<ipabet:pair a="([^"]+)" b="([^"]+)"\/>/g)) excl.add(m[1]);

const marks: any[] = [];
for (const [phys, id] of Object.entries(altR)) {
  if (!/^(mk|sp)_/.test(id)) continue;
  const name = nameOf(id), combining = id.startsWith('mk_');
  const e: any = { opt: phys, mark: charOf(id), type: combining ? 'combining' : 'spacing' };
  const did = altRS[phys];
  if (did && /^(mk|sp)_/.test(did)) {
    e.double = charOf(did);
    if (did.startsWith('sp_')) e.doubleSpacing = true;    // literal double = spacing form
    const dclone = disp[nameOf(did)];
    if (did.startsWith('mk_') && dclone) e.doubleClone = dclone;
  }
  if (combining && disp[name]) e.clone = disp[name];
  if (cyc[name]) e.cycle = cyc[name].slice(1).map(n => markerChar[n]);            // drop the primary
  if (e.double) { const dn = nameOf(did); if (cyc[dn]) e.doubleCycle = cyc[dn].slice(1).map(n => markerChar[n]); }
  if (excl.has(name)) e.exclusive = true;
  marks.push(e);
}

// ---- super/subscripts, optShift, quotes ----
const zip = (a: string[], b: string[], k: string) => a.map((base, i) => ({ base, [k]: b[i] }));
const superscripts = { table: zip(sets['sup_in'], sets['sup_out'], 'sup') };
const subscripts = { table: zip(sets['sub_in'], sets['sub_out'], 'sub') };
const optShift: Record<string, string> = {};
for (const [id, out] of Object.entries(keys)) { const m = id.match(/^os_(\d)$/); if (m) optShift[m[1]] = out; }
const qDefault = xml.match(/<ipabet:quotes default="([^"]+)"/)![1];
const locales: Record<string, string[]> = {};
for (const m of xml.matchAll(/<ipabet:locale id="([^"]+)" open1="([^"]*)" close1="([^"]*)" open2="([^"]*)" close2="([^"]*)"\/>/g))
  locales[m[1]] = [unesc(m[2]), unesc(m[3]), unesc(m[4]), unesc(m[5])];

process.stdout.write(JSON.stringify({ letters, marks, superscripts, subscripts, optShift, quotes: { default: qDefault, locales } }, null, 1) + '\n');
process.stderr.write(`letters ${letters.length}  marks ${marks.length}  sup ${superscripts.table.length}  sub ${subscripts.table.length}  optShift ${Object.keys(optShift).length}  locales ${Object.keys(locales).length}\n`);
