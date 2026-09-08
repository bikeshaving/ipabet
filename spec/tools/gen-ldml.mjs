// Seed the LDML source (spec/ipabet.xml) from ipabet.json ONE more time, in a
// legible form: human marker names (\m{acute}), operator-named sets (H_in), and
// section comments. After this the XML is the source and is hand-edited; this
// generator is provenance, not part of any build. Verify with replay-ldml.mjs.
//
// Escapes: outputs are literal Unicode. The only \u{...} left are bare combining
// marks in dead-key `to=` (the LDML spec escapes those; literal renders them
// hanging off the quote). & " < > use XML entities — mandatory in attributes.

import fs from 'node:fs';
const spec = JSON.parse(fs.readFileSync(new URL('../ipabet.json', import.meta.url), 'utf8'));
const X = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const U = c => `\\u{${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}}`;
const hex = c => c.codePointAt(0).toString(16).padStart(4, '0');

// human names for the combining marks + contour atoms (Unicode names, slugged)
const MARKER_NAME = {
  '0301': 'acute', '030b': 'double-acute', '0300': 'grave', '030f': 'double-grave', '0302': 'circumflex',
  '031b': 'horn', '030c': 'caron', '032c': 'caron-below', '0304': 'macron', '0331': 'macron-below',
  '0303': 'tilde', '0330': 'tilde-below', '0308': 'diaeresis', '0324': 'diaeresis-below', '0306': 'breve',
  '032e': 'breve-below', '030a': 'ring-above', '0325': 'ring-below', '0327': 'cedilla', '0321': 'palatal-hook-below',
  '0326': 'comma-below', '0313': 'comma-above', '0328': 'ogonek', '0310': 'candrabindu', '032a': 'bridge-below',
  '0346': 'bridge-above', '033a': 'inverted-bridge-below', '033b': 'square-below', '0320': 'minus-below', '031f': 'plus-below',
  '0335': 'stroke-overlay', '0334': 'tilde-overlay', '031e': 'down-tack-below', '031d': 'up-tack-below', '031c': 'left-half-ring-below',
  '0339': 'right-half-ring-below', '0329': 'vertical-line-below', '030d': 'vertical-line-above', '0349': 'left-angle-below',
  '0348': 'double-vertical-line-below', '033c': 'seagull-below', '0361': 'tie-above', '035c': 'tie-below', '033d': 'x-above',
  '0353': 'x-below', '0322': 'retroflex-hook-below', '0347': 'equals-below', '031a': 'left-angle-above', '0362': 'double-arrow-below',
  '0319': 'right-tack-below', '0318': 'left-tack-below', '0307': 'dot-above', '0323': 'dot-below', '0309': 'hook-above',
  '032f': 'inverted-breve-below', '0311': 'inverted-breve',
  '1dc4': 'macron-acute', '1dc5': 'grave-macron', '1dc8': 'grave-acute-grave', '1dc6': 'macron-grave', '1dc7': 'acute-macron', '1dc9': 'acute-grave-acute',
};
const mname = c => MARKER_NAME[hex(c)] || 'm' + hex(c);
const opId = op => /[A-Za-z]/.test(op) ? op : op === '%' ? 'center' : 'op' + hex(op);

const glyphOf = {};
for (const e of spec.letters) if ([...e.key].length === 1) glyphOf[e.key] = e.glyph;

const sets = [];        // {id, value[], note?}
const T = [];           // [from, to]  (a plain '' entry is a section comment carrier via C())
const comments = {};    // index in T -> comment above it
const addSet = (id, arr, note) => sets.push({ id, value: arr, note });
const push = (from, to) => T.push([from, to]);
const section = txt => (comments[T.length] = txt);

// 1) shift-operator digraphs, one set pair + rule per operator, mark-transparent
section('digraphs: previous glyph + a shift-operator (⇧H, ⇧R, …); \\p{M}* lets the operator reach a base under its dead-key marks');
const byOp = new Map();
for (const e of spec.letters) {
  const cps = [...e.key]; if (cps.length !== 2) continue;
  const [k0, k1] = cps;
  const prev = /[0-9]/.test(k0) ? k0 : glyphOf[k0];
  if (prev === undefined) continue;
  (byOp.get(k1) || byOp.set(k1, []).get(k1)).push([prev, e.glyph]);
}
for (const [op, pairs] of byOp) {
  const id = opId(op);
  addSet(`${id}_in`, pairs.map(p => p[0])); addSet(`${id}_out`, pairs.map(p => p[1]));
  push(`($[${id}_in])(\\p{M}*)${op}`, `$[1:${id}_out]$2`);
}

// 2) overlays first (win the tie with the generic dead key on the same marker)
section('overlays: no NFC composition exists, so base→precomposed-letter is listed');
const STROKE = { l: 'ł', L: 'Ł', d: 'đ', D: 'Đ', t: 'ŧ', T: 'Ŧ', g: 'ǥ', G: 'Ǥ', h: 'ħ', H: 'Ħ', b: 'ƀ', B: 'Ƀ', z: 'ƶ', Z: 'Ƶ', i: 'ɨ', I: 'Ɨ', u: 'ʉ', U: 'Ʉ', o: 'ɵ', O: 'Ɵ', j: 'ɟ', r: 'ɍ', R: 'Ɍ', y: 'ɏ', Y: 'Ɏ', c: 'ȼ', C: 'Ȼ', p: 'ᵽ', P: 'Ᵽ', k: 'ꝁ', K: 'Ꝁ', 2: 'ƻ' };
const TILDE = { l: 'ɫ', L: 'Ɫ', b: 'ᵬ', d: 'ᵭ', f: 'ᵮ', m: 'ᵯ', n: 'ᵰ', p: 'ᵱ', r: 'ᵲ', s: 'ᵴ', t: 'ᵵ', z: 'ᵶ' };
for (const [nm, tbl, cp] of [['stroke', STROKE, '̵'], ['tilde', TILDE, '̴']]) {
  addSet(`${nm}_in`, Object.keys(tbl)); addSet(`${nm}_out`, Object.values(tbl));
  push(`\\m{${mname(cp)}}($[${nm}_in])`, `$[1:${nm}_out]`);
}

// 3) tone contours: level-tone markers fold to one atom
section('tone contours: a sequence of level-tone markers folds to one contour mark');
const CONTOURS = [['̏̋', '̌'], ['̋̏', '̂'], ['́̋', '᷄'], ['̏̀', '᷅'], ['̄́̄', '᷈'], ['̄̀', '᷆'], ['́̄', '᷇'], ['́̀́', '᷉']];
for (const [seq, atom] of CONTOURS) push([...seq].map(c => `\\m{${mname(c)}}`).join(''), `\\m{${mname(atom)}}`);

// 4) dead keys: Option marks. Emit base + combining; NFC composes the atom.
section('dead keys: an Option mark, then the next base absorbs it (NFC composes)');
const deadkeyChars = new Set();
for (const m of spec.marks) { if (m.type !== 'combining') continue; deadkeyChars.add(m.mark); if (m.double && !m.doubleSpacing) deadkeyChars.add(m.double); }
for (const [, atom] of CONTOURS) deadkeyChars.add(atom);
for (const mk of deadkeyChars) push(`\\m{${mname(mk)}}(.)`, `$1${U(mk)}`);

// 5) superscripts / subscripts
section('superscripts (⌥z arms raise) and subscripts (⌥⇧z arms lower)');
const sup = spec.superscripts.table.filter(e => e.sup);
addSet('sup_in', sup.map(e => e.base)); addSet('sup_out', sup.map(e => e.sup));
push(`\\m{raise}($[sup_in])`, `$[1:sup_out]`);
const sub = spec.subscripts.table.filter(e => e.sub);
addSet('sub_in', sub.map(e => e.base)); addSet('sub_out', sub.map(e => e.sub));
push(`\\m{lower}($[sub_in])`, `$[1:sub_out]`);

// 6) rhotic hook
section('rhotic hook (⌥r) fuses onto ə/ɜ');
push(`ə\\m{rhotic}`, 'ɚ'); push(`ɜ\\m{rhotic}`, 'ɝ');

// ---- keys + option layers ----------------------------------------------
const keyEls = [];
const optLayer = {}, optShiftLayer = {};
const addKey = (id, output) => keyEls.push(`    <key id="${id}" output="${X(output)}"/>`);
for (const e of spec.letters) if ([...e.key].length === 1) addKey('b_' + e.key, e.glyph);
for (const m of spec.marks) {
  const c = m.opt;
  if (m.type === 'combining') {
    addKey('mk_' + mname(m.mark), `\\m{${mname(m.mark)}}`); optLayer[c] = 'mk_' + mname(m.mark);
    if (m.double) { const id = 'mk_' + mname(m.double); addKey(id, m.doubleSpacing ? m.double : `\\m{${mname(m.double)}}`); optShiftLayer[c] = id; }
  } else {
    addKey('sp_' + mname(m.mark), m.mark); optLayer[c] = 'sp_' + mname(m.mark);
    if (m.double) { const id = 'sp_' + mname(m.double); addKey(id, m.double); optShiftLayer[c] = id; }
  }
}
addKey('op_raise', '\\m{raise}'); optLayer['z'] = 'op_raise';
addKey('op_lower', '\\m{lower}'); optShiftLayer['z'] = 'op_lower';
addKey('op_rhotic', '\\m{rhotic}'); optLayer['r'] = 'op_rhotic';
const q = spec.quotes.locales[spec.quotes.default];
addKey('q_open_primary', q[0]); addKey('q_open_secondary', q[2]); optLayer['['] = 'q_open_primary'; optLayer[']'] = 'q_open_secondary';
addKey('q_close_primary', q[1]); addKey('q_close_secondary', q[3]); optShiftLayer['['] = 'q_close_primary'; optShiftLayer[']'] = 'q_close_secondary';
for (const [d, ch] of Object.entries(spec.optShift)) { if (d === 'about') continue; addKey('os_' + d, ch); optShiftLayer[d] = 'os_' + d; }

const rows = ['1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
const shiftOf = { '`': '~', 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')', '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?' };
for (const r of rows) for (const c of r) if (!keyEls.some(k => k.includes(`id="b_${c}"`))) addKey('b_' + c, c);
const shiftIds = rows.map(r => [...r].map(c => { const id = 'sh_' + c; addKey(id, shiftOf[c] || c.toUpperCase()); return id; }));
addKey('gap', '');
const rowKeys = (r, map) => [...r].map(c => map[c] || 'gap').join(' ');

// ---- assemble ------------------------------------------------------------
const o = [];
o.push('<?xml version="1.0" encoding="UTF-8"?>');
o.push('<!-- IPAbet keyboard — CLDR LDML (UTS #35 part 7). Source of the layout.');
o.push('     Seeded from spec/ipabet.json; hand-edited from here. -->');
o.push('<keyboard3 xmlns="https://schemas.unicode.org/cldr/45/keyboard3" locale="und" conformsTo="45">');
o.push('  <info name="IPAbet" indicator="IPA"/>');
o.push('  <settings normalization="NFC"/>');
o.push('');
o.push('  <variables>');
for (const s of sets) o.push(`    <set id="${s.id}" value="${X(s.value.join(' '))}"/>`);
o.push('  </variables>');
o.push('');
o.push('  <keys>');
o.push(keyEls.join('\n'));
o.push('  </keys>');
o.push('');
o.push('  <layers form="hardware">');
o.push('    <layer modifiers="none">'); for (const r of rows) o.push(`      <row keys="${[...r].map(c => 'b_' + c).join(' ')}"/>`); o.push('    </layer>');
o.push('    <layer modifiers="shift">'); rows.forEach((r, i) => o.push(`      <row keys="${shiftIds[i].join(' ')}"/>`)); o.push('    </layer>');
o.push('    <layer modifiers="altR">'); for (const r of rows) o.push(`      <row keys="${rowKeys(r, optLayer)}"/>`); o.push('    </layer>');
o.push('    <layer modifiers="altR shift">'); for (const r of rows) o.push(`      <row keys="${rowKeys(r, optShiftLayer)}"/>`); o.push('    </layer>');
o.push('  </layers>');
o.push('');
o.push('  <transforms type="simple">');
o.push('    <transformGroup>');
T.forEach(([from, to], i) => {
  if (comments[i]) o.push(`      <!-- ${comments[i]} -->`);
  o.push(`      <transform from="${X(from)}" to="${X(to)}"/>`);
});
o.push('    </transformGroup>');
o.push('  </transforms>');
o.push('</keyboard3>');
o.push('');
fs.writeFileSync(new URL('../ipabet.xml', import.meta.url), o.join('\n'));
process.stderr.write(`transforms: ${T.length}  sets: ${sets.length}  keys: ${keyEls.length}\n`);
