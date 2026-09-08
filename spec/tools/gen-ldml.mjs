// Spike: generate a CLDR keyboard (LDML, UTS #35 part 7, v45) from
// spec/ipabet.json, using the two features that kill the (mark x base)
// enumeration: <set> mapped substitution ($[1:set], the Keyman index()
// descendant) and implementation NFC of the output. A dead key becomes ONE
// transform that emits base + combining mark and lets NFC compose it, instead
// of one row per base. Run: node spec/tools/gen-ldml.mjs > /dev/null
//
// Faithful for pure key->text and context-rewrite mapping. The trailing
// comment lists what stays in the engine.

import fs from 'node:fs';
const spec = JSON.parse(fs.readFileSync(new URL('../ipabet.json', import.meta.url), 'utf8'));
const X = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const U = c => `\\u{${c.codePointAt(0).toString(16).toUpperCase()}}`;
const markerName = cp => 'm' + cp.codePointAt(0).toString(16).padStart(4, '0');
const safe = ch => 'k' + ch.codePointAt(0).toString(16); // set-id token for an operator char

const glyphOf = {};
for (const e of spec.letters) if ([...e.key].length === 1) glyphOf[e.key] = e.glyph;

const stats = {};
const bump = (k, n = 1) => (stats[k] = (stats[k] || 0) + n);

const sets = [];          // {id, value[]}
const transforms = [];    // [from, to]
const addSet = (id, arr) => sets.push({ id, value: arr });

// 1) shift-operator digraphs, FACTORED per operator: one <set> pair + one rule
const byOp = new Map();   // operator char -> [ [prevGlyph, out], ... ]
for (const e of spec.letters) {
  const cps = [...e.key];
  if (cps.length !== 2) continue;
  const [k0, k1] = cps;
  const prev = /[0-9]/.test(k0) ? k0 : glyphOf[k0];
  if (prev === undefined) continue;
  if (!byOp.has(k1)) byOp.set(k1, []);
  byOp.get(k1).push([prev, e.glyph]);
}
for (const [op, pairs] of byOp) {
  const inId = `in_${safe(op)}`, outId = `out_${safe(op)}`;
  addSet(inId, pairs.map(p => p[0]));
  addSet(outId, pairs.map(p => p[1]));
  // \p{M}* lets the operator reach the base THROUGH any dead-key marks already
  // on it (⌥n a ⇧H → ɑ̃): match in NFD, transform the base, carry the marks.
  transforms.push([`($[${inId}])(\\p{M}*)${op}`, `$[1:${outId}]$2`]);
  bump('digraph-rule');
}

// 2) overlays FIRST — more specific than the generic dead key that shares the
//    same overlay marker, so they win the tie. No NFC composition exists for
//    these, so the precomposed letter is listed. One <set> pair + one rule each.
const STROKE = { l: 'ł', L: 'Ł', d: 'đ', D: 'Đ', t: 'ŧ', T: 'Ŧ', g: 'ǥ', G: 'Ǥ', h: 'ħ', H: 'Ħ', b: 'ƀ', B: 'Ƀ', z: 'ƶ', Z: 'Ƶ', i: 'ɨ', I: 'Ɨ', u: 'ʉ', U: 'Ʉ', o: 'ɵ', O: 'Ɵ', j: 'ɟ', r: 'ɍ', R: 'Ɍ', y: 'ɏ', Y: 'Ɏ', c: 'ȼ', C: 'Ȼ', p: 'ᵽ', P: 'Ᵽ', k: 'ꝁ', K: 'Ꝁ', 2: 'ƻ' };
const TILDE = { l: 'ɫ', L: 'Ɫ', b: 'ᵬ', d: 'ᵭ', f: 'ᵮ', m: 'ᵯ', n: 'ᵰ', p: 'ᵱ', r: 'ᵲ', s: 'ᵴ', t: 'ᵵ', z: 'ᵶ' };
for (const [nm, tbl, cp] of [['stroke', STROKE, '̵'], ['tilde', TILDE, '̴']]) {
  addSet(`ov_${nm}_in`, Object.keys(tbl)); addSet(`ov_${nm}_out`, Object.values(tbl));
  transforms.push([`\\m{${markerName(cp)}}($[ov_${nm}_in])`, `$[1:ov_${nm}_out]`]); bump('overlay-rule');
}

// 3) contour tones: a pending sequence of level-tone markers folds to one atom.
const CONTOURS = [['̏̋', '̌'], ['̋̏', '̂'], ['́̋', '᷄'], ['̏̀', '᷅'], ['̄́̄', '᷈'], ['̄̀', '᷆'], ['́̄', '᷇'], ['́̀́', '᷉']];
for (const [seq, atom] of CONTOURS) {
  transforms.push([[...seq].map(c => `\\m{${markerName(c)}}`).join(''), `\\m{${markerName(atom)}}`]);
  bump('contour');
}

// 4) Option dead keys: ONE rule per combining mark form AND per contour atom
//    (the fold in (3) yields an atom marker a following base must absorb).
//    Emit base + combining and let NFC compose.
const deadkeyChars = new Set();
for (const m of spec.marks) { if (m.type !== 'combining') continue; deadkeyChars.add(m.mark); if (m.double && !m.doubleSpacing) deadkeyChars.add(m.double); }
for (const [, atom] of CONTOURS) deadkeyChars.add(atom);
for (const mk of deadkeyChars) { transforms.push([`\\m{${markerName(mk)}}(.)`, `$1${U(mk)}`]); bump('deadkey-rule'); }

// 5) superscripts / subscripts: one <set> pair + one rule each
const sup = spec.superscripts.table.filter(e => e.sup);
addSet('sup_in', sup.map(e => e.base)); addSet('sup_out', sup.map(e => e.sup));
transforms.push([`\\m{raise}($[sup_in])`, `$[1:sup_out]`]); bump('sup-rule');
const sub = spec.subscripts.table.filter(e => e.sub);
addSet('sub_in', sub.map(e => e.base)); addSet('sub_out', sub.map(e => e.sub));
transforms.push([`\\m{lower}($[sub_in])`, `$[1:sub_out]`]); bump('sub-rule');

// 6) rhotacization
transforms.push([`ə\\m{rhotic}`, 'ɚ'], [`ɜ\\m{rhotic}`, 'ɝ']); bump('rhotic', 2);

// ---- keys + option layers (needed so a replay can map keystrokes) --------
const keyEls = [];
const optLayer = {}, optShiftLayer = {};
const addKey = (id, output) => keyEls.push(`    <key id="${id}" output="${X(output)}"/>`);
for (const e of spec.letters) if ([...e.key].length === 1) addKey('b_' + e.key, e.glyph);
for (const m of spec.marks) {
  const c = m.opt;
  if (m.type === 'combining') {
    addKey('mk_' + markerName(m.mark), `\\m{${markerName(m.mark)}}`); optLayer[c] = 'mk_' + markerName(m.mark);
    if (m.double) { const id = 'mk_' + markerName(m.double); addKey(id, m.doubleSpacing ? m.double : `\\m{${markerName(m.double)}}`); optShiftLayer[c] = id; }
  } else {
    addKey('sp_' + markerName(m.mark), m.mark); optLayer[c] = 'sp_' + markerName(m.mark);
    if (m.double) { const id = 'sp_' + markerName(m.double); addKey(id, m.double); optShiftLayer[c] = id; }
  }
}
addKey('op_raise', '\\m{raise}'); optLayer['z'] = 'op_raise';
addKey('op_lower', '\\m{lower}'); optShiftLayer['z'] = 'op_lower';
addKey('op_rhotic', '\\m{rhotic}'); optLayer['r'] = 'op_rhotic';
const q = spec.quotes.locales[spec.quotes.default];
addKey('q_o1', q[0]); addKey('q_o2', q[2]); optLayer['['] = 'q_o1'; optLayer[']'] = 'q_o2';
addKey('q_c1', q[1]); addKey('q_c2', q[3]); optShiftLayer['['] = 'q_c1'; optShiftLayer[']'] = 'q_c2';
for (const [d, ch] of Object.entries(spec.optShift)) { if (d === 'about') continue; addKey('os_' + d, ch); optShiftLayer[d] = 'os_' + d; }

const rows = ['1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
const shiftOf = { '`': '~', 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')', '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?' };
for (const r of rows) for (const c of r) if (!keyEls.some(k => k.includes(`id="b_${c}"`))) addKey('b_' + c, c);
const shiftIds = rows.map(r => [...r].map(c => { const id = 'sh_' + c; addKey(id, shiftOf[c] || c.toUpperCase()); return id; }));
addKey('gap', '');
const rowKeys = (r, map) => [...r].map(c => map[c] || 'gap').join(' ');

// ---- assemble ------------------------------------------------------------
const out = ['<?xml version="1.0" encoding="UTF-8"?>',
  '<!-- GENERATED from spec/ipabet.json by spec/tools/gen-ldml.mjs. Do not edit by hand. -->',
  '<keyboard3 xmlns="https://schemas.unicode.org/cldr/45/keyboard3" locale="und" conformsTo="45">',
  '  <info name="IPAbet" indicator="IPA"/>',
  '  <settings normalization="NFC"/>',
  '  <variables>'];
for (const s of sets) out.push(`    <set id="${s.id}" value="${X(s.value.join(' '))}"/>`);
out.push('  </variables>', '  <keys>', keyEls.join('\n'), '  </keys>', '  <layers form="hardware">');
out.push('    <layer modifiers="none">'); for (const r of rows) out.push(`      <row keys="${[...r].map(c => 'b_' + c).join(' ')}"/>`); out.push('    </layer>');
out.push('    <layer modifiers="shift">'); rows.forEach((r, i) => out.push(`      <row keys="${shiftIds[i].join(' ')}"/>`)); out.push('    </layer>');
out.push('    <layer modifiers="altR">'); for (const r of rows) out.push(`      <row keys="${rowKeys(r, optLayer)}"/>`); out.push('    </layer>');
out.push('    <layer modifiers="altR shift">'); for (const r of rows) out.push(`      <row keys="${rowKeys(r, optShiftLayer)}"/>`); out.push('    </layer>');
out.push('  </layers>', '  <transforms type="simple">', '    <transformGroup>');
for (const [from, to] of transforms) out.push(`      <transform from="${X(from)}" to="${X(to)}"/>`);
out.push('    </transformGroup>', '  </transforms>');
out.push(`  <!--
  NOT EXPRESSIBLE as data — these stay in the engine:
    1. Shift-release chain-breaking (depends on a modifier RELEASE event).
    2. Runtime settings: quotes locale (baked: ${spec.quotes.default}) and capital-digraphs.
    3. Unconvert ⌃⌫ (the inverse of every transform, re-typing the spelling).
    4. Order-dependent multi-mark fusion beyond NFC (fuse_marks).
    5. Lookback rewrite of already-committed host text (macOS).
  -->`);
out.push('</keyboard3>', '');
fs.writeFileSync(new URL('../ipabet.xml', import.meta.url), out.join('\n'));
process.stderr.write(`transforms: ${transforms.length}  sets: ${sets.length}  keys: ${keyEls.length}\n`
  + Object.entries(stats).map(([k, v]) => `  ${k}: ${v}`).join('\n') + '\n');
