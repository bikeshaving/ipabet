// The spec, parsed from the LDML source (spec/ipabet.xml) at import time — the
// TS counterpart to the engine's Rust `from_ldml`. No build step, no generated
// JSON: the XML is bundled as text and reconstructed here. Both the engine
// (index.ts) and the website read the `spec` object this exports.

// @ts-ignore — bundlers inline this file's text; the XML is the source of truth.
import xml from "../../spec/ipabet.xml";

const unesc = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const cps = (g: string) => [...g].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ");
const each = (re: RegExp) => [...xml.matchAll(re)];

// ---- raw XML ----
const keys: Record<string, string> = {};
for (const m of each(/<key id="([^"]+)" output="([^"]*)"\/>/g)) keys[m[1]] = unesc(m[2]);
const layers: Record<string, string[][]> = {};
for (const L of each(/<layer modifiers="([^"]+)">([\s\S]*?)<\/layer>/g))
  layers[L[1]] = [...L[2].matchAll(/<row keys="([^"]+)"\/>/g)].map((r) => r[1].split(/\s+/));
const transforms = each(/<transform from="([^"]+)" to="([^"]*)"\/>/g).map((m) => [unesc(m[1]), unesc(m[2])]);
const disp: Record<string, string> = {};
for (const m of each(/<display output="\\m\{([^}]+)\}" display="([^"]*)"\/>/g)) disp[m[1]] = unesc(m[2]);
// Cycles come from chain transforms \m{P}\m{key} -> \m{R} (R != key): repeated
// presses of `key` walk a family. Follow each key's chain from the key itself.
const cyc: Record<string, string[]> = {};
{
  const edge = new Map<string, string>();
  const keys2 = new Set<string>();
  for (const [f, t] of transforms) {
    const fm = f.match(/^\\m\{([^}]+)\}\\m\{([^}]+)\}$/), tm = t.match(/^\\m\{([^}]+)\}$/);
    if (fm && tm && tm[1] !== fm[2]) { edge.set(fm[1] + "|" + fm[2], tm[1]); keys2.add(fm[2]); }
  }
  for (const key of keys2) {
    const family = [key];
    for (let cur = key; ;) { const r = edge.get(cur + "|" + key); if (r === undefined || r === key) break; family.push(r); cur = r; }
    cyc[key] = family;
  }
}
// Exclusive pairs come from marker-collapse transforms: \m{A}\m{B} -> \m{B}
// means primary A and its double B are one dimension, so B replaces A.
const exclEdges = new Set<string>();
for (const [f, t] of transforms) {
  const fm = f.match(/^\\m\{([^}]+)\}\\m\{([^}]+)\}$/), tm = t.match(/^\\m\{([^}]+)\}$/);
  if (fm && tm && tm[1] === fm[2]) exclEdges.add(fm[1] + "|" + fm[2]);
}

const markerChar: Record<string, string> = {};
for (const [f, t] of transforms) {
  const fm = f.match(/^\\m\{([^}]+)\}\(\.\)$/), tm = t.match(/^\$1\\u\{([0-9A-Fa-f]+)\}$/);
  if (fm && tm) markerChar[fm[1]] = String.fromCodePoint(parseInt(tm[1], 16));
}

// ---- letters ----
interface Letter { key: string; glyph: string; cp: string }
const letters: Letter[] = [];
for (let c = 97; c <= 122; c++) {
  const id = "b_" + String.fromCharCode(c), g = keys[id];
  if (g !== undefined) letters.push({ key: String.fromCharCode(c), glyph: g, cp: cps(g) });
}
for (const [f, t] of transforms) {
  if (!f.includes("(\\p{M}*)")) continue;
  const base = f.slice(0, f.indexOf("("));
  if (!/^[a-z0-9]$/i.test(base)) continue;
  const g = t.replace(/\$1$/, "");
  letters.push({ key: base + f.slice(f.indexOf(")") + 1), glyph: g, cp: cps(g) });
}

// ---- marks ----
const ROWS = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"];
const grid = (layer: string): Record<string, string> => {
  const out: Record<string, string> = {};
  (layers[layer] ?? []).forEach((ids, ri) => ids.forEach((id, ci) => { if (ci < ROWS[ri].length) out[ROWS[ri][ci]] = id; }));
  return out;
};
const altR = grid("altR"), altRS = grid("altR shift");
const charOf = (id: string) => id.startsWith("mk_") ? markerChar[id.slice(3)] : id.startsWith("sp_") ? keys[id] : undefined;
const fam = (nm: string) => (cyc[nm] ?? []).slice(1).map((n) => markerChar[n]).filter(Boolean);

const marks: any[] = [];
for (const [phys, id] of Object.entries(altR)) {
  if (!/^(mk|sp)_/.test(id)) continue;
  const nm = id.slice(3), combining = id.startsWith("mk_"), ch = charOf(id);
  if (ch === undefined) continue;
  const e: any = { opt: phys, mark: ch, type: combining ? "combining" : "spacing", cp: cps(ch) };
  const did = altRS[phys];
  if (did && /^(mk|sp)_/.test(did)) {
    e.double = charOf(did); e.doubleCp = cps(e.double);
    if (did.startsWith("sp_")) e.doubleSpacing = true;
    if (did.startsWith("mk_") && disp[did.slice(3)]) e.doubleClone = disp[did.slice(3)];
    if (fam(did.slice(3)).length) { e.doubleCycle = fam(did.slice(3)); e.doubleCycleCp = e.doubleCycle.map(cps); }
  }
  if (combining && disp[nm]) e.clone = disp[nm];
  if (fam(nm).length) { e.cycle = fam(nm); e.cycleCp = e.cycle.map(cps); }
  if (did && did.startsWith("mk_") && exclEdges.has(nm + "|" + did.slice(3))) e.exclusive = true;
  marks.push(e);
}

// ---- sup/sub, optShift ----
// Each \m{raise}<base> → <sup> (and \m{lower}<base> → <sub>) transform is one
// table row; the base carries a regex escape (\( \+) that we strip back off.
const pairs = (marker: string, k: string) => transforms
  .filter(([f]) => f.startsWith(`\\m{${marker}}`))
  .map(([f, t]) => ({ base: f.slice(`\\m{${marker}}`.length).replace(/^\\/, ""), [k]: t }));
const superscripts = { table: pairs("raise", "sup") };
const subscripts = { table: pairs("lower", "sub") };
const optShift: Record<string, string> = {};
for (const [id, out] of Object.entries(keys)) { const m = id.match(/^os_(\d)$/); if (m) optShift[m[1]] = out; }

export const spec = { letters, marks, superscripts, subscripts, optShift };
export default spec;
