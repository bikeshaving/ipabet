// Seed the LDML source (spec/ipabet.xml) from ipabet.json ONE more time. After
// this the XML is the spec, hand-edited; this generator is provenance.
//
// Digraphs and overlays are one <transform> per pair — a self-contained,
// column-aligned row (base and result on one line), no hidden index coupling.
// Super/subscripts stay parallel <set>s (246/64 entries, mechanical, unedited).
// Dead keys emit base+combining and let NFC compose. Outputs are literal
// Unicode; only bare combining marks stay \u{}-escaped (spec + rendering).

import fs from 'node:fs';
const spec = JSON.parse(fs.readFileSync(new URL('../ipabet.json', import.meta.url), 'utf8'));
const X = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cmt = t => t.replace(/--+/g, '—');                 // '--' is illegal in an XML comment
const U = c => `\\u{${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}}`;
const hex = c => c.codePointAt(0).toString(16).padStart(4, '0');

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
  '0353': 'x-below', '031a': 'no-audible-release', '0362': 'double-arrow-below',
  '0319': 'right-tack-below', '0318': 'left-tack-below', '0307': 'dot-above', '0323': 'dot-below', '0309': 'hook-above',
  '032f': 'inverted-breve-below', '0311': 'inverted-breve',
  '1dc4': 'macron-acute', '1dc5': 'grave-macron', '1dc8': 'grave-acute-grave', '1dc6': 'macron-grave', '1dc7': 'acute-macron', '1dc9': 'acute-grave-acute',
};
// IPA function names for the spacing marks (they output a literal char, never a
// \m{} marker; the Unicode names — "MODIFIER LETTER VERTICAL LINE" — are useless here).
const IPA_NAME = {
  '02c8': 'primary-stress', '02cc': 'secondary-stress', '02d0': 'long', '02d1': 'half-long',
  '02e5': 'extra-high-tone', '02e6': 'high-tone', '02e7': 'mid-tone', '02e8': 'low-tone', '02e9': 'extra-low-tone',
  'a71b': 'upstep', 'a71c': 'downstep', '2197': 'global-rise', '2198': 'global-fall',
  '2191': 'egressive', '2193': 'ingressive', '0347': 'alveolar', '2016': 'major-group', '0322': 'retroflex-hook',
  '208d': 'pre-voicing', '208e': 'post-voicing', '02de': 'rhoticity', '02bb': 'okina', '02bc': 'ejective',
  '02b9': 'prime', '02ba': 'double-prime', '27e8': 'grapheme-open', '27e9': 'grapheme-close',
};
const mname = c => MARKER_NAME[hex(c)] || IPA_NAME[hex(c)] || 'm' + hex(c);
// key ids must be NMTOKENs — punctuation gets a name; letters/digits pass through
const PUNCT = { '-': 'hyphen', '=': 'equal', '[': 'lbracket', ']': 'rbracket', '\\': 'backslash', ';': 'semicolon', "'": 'apostrophe', ',': 'comma', '.': 'period', '/': 'slash', '`': 'backquote' };
const kid = c => /[a-z0-9]/i.test(c) ? c : (PUNCT[c] || 'k' + hex(c));
// hardware scan codes (PC set 1) for the four rows, so <layers formId> resolves
const SCAN = ['02 03 04 05 06 07 08 09 0A 0B 0C 0D', '10 11 12 13 14 15 16 17 18 19 1A 1B 2B', '1E 1F 20 21 22 23 24 25 26 27 28', '2C 2D 2E 2F 30 31 32 33 34 35'];
const opLabel = op => op === '%' ? '⇧5' : `⇧${op}`;

const glyphOf = {};
for (const e of spec.letters) if ([...e.key].length === 1) glyphOf[e.key] = e.glyph;

const sets = [];        // {id, value[], note?}  — super/subscripts only
const T = [];           // [from, to]
const comments = {};    // index in T -> [comment line, ...]
const addSet = (id, arr, note) => sets.push({ id, value: arr, note });
const push = (from, to, tail) => T.push([from, to, tail]);   // tail: an inline trailing comment
const section = txt => (comments[T.length] = (comments[T.length] || []).concat(txt));
const combo = (label, pairs, cap = 8) => `${label}:  ${pairs.slice(0, cap).map(([i, o]) => `${i}→${o}`).join('  ')}${pairs.length > cap ? '  …' : ''}`;

// 1) shift-operator digraphs — one transform per pair, grouped by operator
const byOp = new Map();
for (const e of spec.letters) {
  const cps = [...e.key]; if (cps.length !== 2) continue;
  const [k0, k1] = cps;
  const prev = /[0-9]/.test(k0) ? k0 : glyphOf[k0];
  if (prev === undefined) continue;
  (byOp.get(k1) || byOp.set(k1, []).get(k1)).push([prev, e.glyph]);
}
section('digraphs — a previous glyph, then a shift-operator; \\p{M}* reaches a base under its dead-key marks');
for (const [op, pairs] of byOp) {
  section(opLabel(op));
  for (const [base, glyph] of pairs) push(`${base}(\\p{M}*)${op}`, `${glyph}$1`);
}

// 2) overlays — one transform per pair; before the dead keys so they win the
//    tie on the shared overlay marker. No NFC composition exists for these.
const STROKE = { l: 'ł', L: 'Ł', d: 'đ', D: 'Đ', t: 'ŧ', T: 'Ŧ', g: 'ǥ', G: 'Ǥ', h: 'ħ', H: 'Ħ', b: 'ƀ', B: 'Ƀ', z: 'ƶ', Z: 'Ƶ', i: 'ɨ', I: 'Ɨ', u: 'ʉ', U: 'Ʉ', o: 'ɵ', O: 'Ɵ', j: 'ɟ', r: 'ɍ', R: 'Ɍ', y: 'ɏ', Y: 'Ɏ', c: 'ȼ', C: 'Ȼ', p: 'ᵽ', P: 'Ᵽ', k: 'ꝁ', K: 'Ꝁ', 2: 'ƻ' };
const TILDE = { l: 'ɫ', L: 'Ɫ', b: 'ᵬ', d: 'ᵭ', f: 'ᵮ', m: 'ᵯ', n: 'ᵰ', p: 'ᵱ', r: 'ᵲ', s: 'ᵴ', t: 'ᵵ', z: 'ᵶ' };
section('overlays — the marker, then a base → its precomposed letter');
for (const [label, tbl, cp] of [['⌥y', STROKE, '̵'], ['⌥⇧y', TILDE, '̴']]) {
  section(label);
  for (const [base, glyph] of Object.entries(tbl)) push(`\\m{${mname(cp)}}${base}`, glyph);
}

// 3) tone contours — level-tone markers fold to one contour mark
section('tone contours — a sequence of level-tone markers folds to one contour mark');
const CONTOURS = [['̏̋', '̌'], ['̋̏', '̂'], ['́̋', '᷄'], ['̏̀', '᷅'], ['̄́̄', '᷈'], ['̄̀', '᷆'], ['́̄', '᷇'], ['́̀́', '᷉']];
for (const [seq, atom] of CONTOURS) push([...seq].map(c => `\\m{${mname(c)}}`).join(''), `\\m{${mname(atom)}}`);

// 4) dead keys — an Option mark, then the next base absorbs it (NFC composes)
section('dead keys — ⌥<mark>, then the next base absorbs it (NFC composes)');
const deadkeyChars = new Set();
for (const m of spec.marks) { if (m.type !== 'combining') continue; deadkeyChars.add(m.mark); if (m.double && !m.doubleSpacing) deadkeyChars.add(m.double); }
for (const [, atom] of CONTOURS) deadkeyChars.add(atom);
for (const mk of deadkeyChars) push(`\\m{${mname(mk)}}(.)`, `$1${U(mk)}`, `◌${mk}`);   // ◌ = U+25CC, so the mark shows without hanging off the comment

// 5) super/subscripts — parallel <set>s (large, mechanical)
section('superscripts — ⌥z arms the raise, then a base');
const sup = spec.superscripts.table.filter(e => e.sup);
addSet('sup_in', sup.map(e => e.base), combo('⌥z', sup.map(e => [e.base, e.sup]))); addSet('sup_out', sup.map(e => e.sup));
push(`\\m{raise}($[sup_in])`, `$[1:sup_out]`);
section('subscripts — ⌥⇧z arms the lower, then a base');
const sub = spec.subscripts.table.filter(e => e.sub);
addSet('sub_in', sub.map(e => e.base), combo('⌥⇧z', sub.map(e => [e.base, e.sub]))); addSet('sub_out', sub.map(e => e.sub));
push(`\\m{lower}($[sub_in])`, `$[1:sub_out]`);

// 6) rhotic hook (⌥r) fuses onto ə/ɜ
section('rhotic hook — ⌥r fuses onto ə/ɜ');
push(`ə\\m{rhotic}`, 'ɚ'); push(`ɜ\\m{rhotic}`, 'ɝ');

// ---- keys + option layers ----------------------------------------------
const keyEls = [];
const optLayer = {}, optShiftLayer = {};
const addKey = (id, output) => keyEls.push(`    <key id="${id}" output="${X(output)}"/>`);
for (const e of spec.letters) if ([...e.key].length === 1) addKey('b_' + kid(e.key), e.glyph);
for (const m of spec.marks) {
  const c = m.opt;
  if (m.type === 'combining') {
    addKey('mk_' + mname(m.mark), `\\m{${mname(m.mark)}}`); optLayer[c] = 'mk_' + mname(m.mark);
    if (m.double) { const id = (m.doubleSpacing ? 'sp_' : 'mk_') + mname(m.double); addKey(id, m.doubleSpacing ? m.double : `\\m{${mname(m.double)}}`); optShiftLayer[c] = id; }
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
for (const r of rows) for (const c of r) if (!keyEls.some(k => k.includes(`id="b_${kid(c)}"`))) addKey('b_' + kid(c), c);
const shiftIds = rows.map(r => [...r].map(c => { const id = 'sh_' + kid(c); addKey(id, shiftOf[c] || c.toUpperCase()); return id; }));
addKey('gap', '');
const rowKeys = (r, map) => [...r].map(c => map[c] || 'gap').join(' ');

// ---- assemble ------------------------------------------------------------
const o = [];
o.push('<?xml version="1.0" encoding="UTF-8"?>');
o.push('<!-- IPAbet keyboard — CLDR LDML (UTS #35 part 7). The layout spec.');
o.push('     Seeded from spec/ipabet.json; hand-edited from here. -->');
o.push('<keyboard3 xmlns="https://schemas.unicode.org/cldr/45/keyboard3" locale="und" conformsTo="45">');
o.push('  <info name="IPAbet" indicator="IPA"/>');
o.push('  <!-- output is NFC by default; a <settings normalization="disabled"> would opt out -->');
o.push('');
o.push('  <keys>');
o.push(keyEls.join('\n'));
o.push('  </keys>');
o.push('');
o.push('  <forms>');
o.push('    <form id="us">');
for (const codes of SCAN) o.push(`      <scanCodes codes="${codes}"/>`);
o.push('    </form>');
o.push('  </forms>');
o.push('');
o.push('  <layers formId="us">');
o.push('    <layer modifiers="none">'); for (const r of rows) o.push(`      <row keys="${[...r].map(c => 'b_' + kid(c)).join(' ')}"/>`); o.push('    </layer>');
o.push('    <layer modifiers="shift">'); rows.forEach((r, i) => o.push(`      <row keys="${shiftIds[i].join(' ')}"/>`)); o.push('    </layer>');
o.push('    <layer modifiers="altR">'); for (const r of rows) o.push(`      <row keys="${rowKeys(r, optLayer)}"/>`); o.push('    </layer>');
o.push('    <layer modifiers="altR shift">'); for (const r of rows) o.push(`      <row keys="${rowKeys(r, optShiftLayer)}"/>`); o.push('    </layer>');
o.push('  </layers>');
o.push('');
o.push('  <variables>');
for (const s of sets) { if (s.note) o.push(`    <!-- ${cmt(s.note)} -->`); o.push(`    <set id="${s.id}" value="${X(s.value.join(' '))}"/>`); }
o.push('  </variables>');
o.push('');
o.push('  <transforms type="simple">');
o.push('    <transformGroup>');
T.forEach(([from, to, tail], i) => {
  if (comments[i]) for (const c of comments[i]) o.push(`      <!-- ${cmt(c)} -->`);
  o.push(`      <transform from="${X(from)}" to="${X(to)}"/>${tail ? `  <!-- ${cmt(tail)} -->` : ''}`);
});
o.push('    </transformGroup>');
o.push('  </transforms>');
o.push('</keyboard3>');
o.push('');
fs.writeFileSync(new URL('../ipabet.xml', import.meta.url), o.join('\n'));
process.stderr.write(`transforms: ${T.length}  sets: ${sets.length}  keys: ${keyEls.length}\n`);
