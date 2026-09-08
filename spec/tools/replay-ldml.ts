// Replay the shared parity corpus through the GENERATED LDML transforms, to
// prove the sets+NFC collapse is faithful and not just smaller. This is a
// micro-interpreter for exactly the LDML subset gen-ldml.ts emits: hardware
// layers, <set> mapped substitution ($[n:set]), markers \m{...}, \u{...}, and
// NFC of the output. Vectors that exercise behavior we already identified as
// engine-only (chain-breaking, runtime settings, unconvert, backspace,
// multi-mark fusion) are skipped and counted, not failed.
//
//   bun spec/tools/replay-ldml.ts

import fs from 'node:fs';
const here = u => new URL(u, import.meta.url);
const xml = fs.readFileSync(here('../ipabet.xml'), 'utf8');
const spec = JSON.parse(fs.readFileSync(here('../ipabet.json'), 'utf8'));
const vectors = JSON.parse(fs.readFileSync(here('../parity-vectors.json'), 'utf8'));

const unesc = s => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- parse the generated XML -------------------------------------------
const sets = {};
for (const m of xml.matchAll(/<set id="([^"]+)" value="([^"]*)"\/>/g)) sets[m[1]] = unesc(m[2]).split(' ');
const keyOut = {};
for (const m of xml.matchAll(/<key id="([^"]+)" output="([^"]*)"\/>/g)) keyOut[m[1]] = unesc(m[2]);
const layers = {};
for (const L of xml.matchAll(/<layer modifiers="([^"]+)">([\s\S]*?)<\/layer>/g)) {
  layers[L[1]] = [...L[2].matchAll(/<row keys="([^"]+)"\/>/g)].map(r => r[1].split(' '));
}
const rawT = [...xml.matchAll(/<transform from="([^"]+)" to="([^"]*)"\/>/g)].map(m => [unesc(m[1]), unesc(m[2])]);

// ---- markers as private-use sentinels ----------------------------------
const sent = {};                       // marker name -> PUA char
let next = 0xE000;
const nameToSent = n => (sent[n] ??= String.fromCodePoint(next++));
for (const [f, t] of rawT) for (const s of [f, t]) for (const mm of s.matchAll(/\\m\{([^}]+)\}/g)) nameToSent(mm[1]);
for (const v of Object.values(keyOut)) for (const mm of v.matchAll(/\\m\{([^}]+)\}/g)) nameToSent(mm[1]);
const SENT = new Set(Object.values(sent));
const isSent = c => SENT.has(c);

// marker name -> what it flushes to on commit (dead key -> spacing clone;
// operators lift with no residue). Read from the spec, as the engine does.
const cloneByChar = {};                // combining char -> its spacing clone
for (const mk of spec.marks) {
  if (mk.type !== 'combining') continue;
  cloneByChar[mk.mark] = mk.clone ?? mk.mark;
  if (mk.double && !mk.doubleSpacing) cloneByChar[mk.double] = mk.doubleClone ?? mk.double;
}
const cloneOf = {};                    // sentinel char -> clone string | '' (drop)
const combining = new Set();           // sentinel chars that are dead-key marks
// learn each marker's combining char from its own dead-key rule: \m{NAME}(.) -> $1\u{XXXX}
for (const [from, to] of rawT) {
  const fm = from.match(/^\\m\{([^}]+)\}\(\.\)$/);
  const tm = to.match(/^\$1\\u\{([0-9A-Fa-f]+)\}$/);
  if (fm && tm && sent[fm[1]]) {
    const s = sent[fm[1]], ch = String.fromCodePoint(parseInt(tm[1], 16));
    combining.add(s); cloneOf[s] = cloneByChar[ch] ?? ch;
  }
}
for (const n of ['raise', 'lower', 'rhotic']) if (sent[n]) cloneOf[sent[n]] = '';

// ---- compile transforms -------------------------------------------------
const subMarker = s => s.replace(/\\m\{([^}]+)\}/g, (_, n) => nameToSent(n));
const subU = s => s.replace(/\\u\{([0-9A-Fa-f]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const compiled = rawT.map(([from, to]) => {
  const groups = [];                   // per capture group: {set} or {any:true}
  let src = '';
  for (let i = 0; i < from.length;) {
    if (from.startsWith('\\m{', i)) { const j = from.indexOf('}', i); src += reEsc(nameToSent(from.slice(i + 3, j))); i = j + 1; }
    else if (from.startsWith('($[', i)) { const j = from.indexOf('])', i); const id = from.slice(i + 3, j); const alt = sets[id].slice().sort((a, b) => b.length - a.length).map(reEsc).join('|'); src += `(${alt})`; groups.push({ set: id }); i = j + 2; }
    else if (from.startsWith('(\\p{M}*)', i)) { src += '(\\p{M}*)'; groups.push({ marks: true }); i += 8; }
    else if (from.startsWith('(.)', i)) { src += '([^\\uE000-\\uF8FF])'; groups.push({ any: true }); i += 3; }
    else { src += reEsc(from[i]); i++; }
  }
  const re = new RegExp(src + '$', 'u');
  // to -> function(match) => string
  const toS = subU(to);
  const parts = [];
  for (let i = 0; i < toS.length;) {
    if (toS.startsWith('\\m{', i)) { const j = toS.indexOf('}', i); const c = nameToSent(toS.slice(i + 3, j)); parts.push(() => c); i = j + 1; }
    else if (toS.startsWith('$[', i)) { const j = toS.indexOf(']', i); const [n, tgt] = toS.slice(i + 2, j).split(':'); const gi = +n; parts.push(mch => { const src = sets[groups[gi - 1].set]; return sets[tgt][src.indexOf(mch[gi])]; }); i = j + 1; }
    else if (toS[i] === '$' && /\d/.test(toS[i + 1])) { const gi = +toS[i + 1]; parts.push(mch => mch[gi]); i += 2; }
    else { const c = toS[i]; parts.push(() => c); i++; }
  }
  return { re, apply: mch => parts.map(p => p(mch)).join('') };
});

// ---- keystroke -> LDML key output --------------------------------------
const rows = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
const grid = {};
rows.forEach((r, ri) => [...r].forEach((c, ci) => (grid[c] = [ri, ci])));
const shiftOf = { '`': '~', 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')', '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?' };
const opChars = new Set();              // shifted chars that are IPA operators
for (const e of spec.letters) if ([...e.key].length === 2) opChars.add([...e.key][1]);

const outFor = (ch, shift, option) => {
  const mods = option && shift ? 'altR shift' : option ? 'altR' : shift ? 'shift' : 'none';
  const pos = grid[ch]; if (!pos) return null;
  const id = layers[mods][pos[0]][pos[1]];
  let o = keyOut[id] ?? '';
  const mm = o.match(/^\\m\{([^}]+)\}$/);
  return mm ? nameToSent(mm[1]) : subU(o);
};

// ---- run one transform fixpoint, NFC after each application -------------
const normalize = buf => buf.normalize('NFC');
// The engine stores NFC but decomposes each cluster (NFD) to match rules, so an
// operator can reach a base under its marks. Mirror that: match in NFD, compose
// to NFC only at commit (flush).
function settle(buf) {
  buf = buf.normalize('NFD');
  for (let n = 0; n < 64; n++) {
    let best = null, bi = -1;
    for (const t of compiled) { const m = t.re.exec(buf); if (m && m[0].length > (best ? best[0].length : 0)) { best = m; bi = compiled.indexOf(t); } }
    if (!best) break;
    buf = (buf.slice(0, best.index) + compiled[bi].apply(best)).normalize('NFD');
  }
  return buf;
}
const trailingCombining = buf => { let n = 0; for (let i = buf.length - 1; i >= 0 && combining.has(buf[i]); i--) n++; return n; };

// ---- replay -------------------------------------------------------------
let pass = 0, fail = 0; const skip = {}; const fails = [];
const bumpSkip = k => (skip[k] = (skip[k] || 0) + 1);

vectors: for (const v of vectors) {
  if (v.locale !== spec.quotes.default) { bumpSkip('locale (setting)'); continue; }
  if (v.capital_digraphs) { bumpSkip('capital-digraphs (setting)'); continue; }
  for (const k of v.keys) {
    if (k.control || k.capsLock || k.shiftBroke) { bumpSkip('modifier engine-only'); continue vectors; }
    if (k.key === '⌫') { bumpSkip('backspace'); continue vectors; }
    if (k.key === 'Escape') { bumpSkip('escape-commit'); continue vectors; }
  }
  let buf = v.initial;
  for (const k of v.keys) {
    if (k.key === ' ' && !k.option) {                     // space: commit pending, else insert space
      if (trailingCombining(buf) || (buf && isSent(buf[buf.length - 1]))) buf = flush(buf);
      else buf = normalize(buf + ' ');
      continue;
    }
    const o = outFor(k.key, !!k.shift, !!k.option);
    if (o === null) { bumpSkip('unmapped key'); continue vectors; }
    buf = settle(buf + o);
    if (trailingCombining(buf) >= 2) { bumpSkip('multi-mark fusion'); continue vectors; }
    // A bare ASCII capital left in the buffer means a shifted letter that no
    // operator consumed: chain-continuation or a literal capital — both are the
    // engine-only chain/capital-digraphs logic, not the transform data.
    if (/[A-Z]/.test([...buf].filter(c => !isSent(c)).join(''))) { bumpSkip('chain/capital (engine-only)'); continue vectors; }
  }
  buf = flush(buf);
  if (buf === v.expected) pass++;
  else { fail++; if (fails.length < 25) fails.push({ keys: v.keys.map(k => k.key + (k.shift ? '⇧' : '') + (k.option ? '⌥' : '')).join(' '), got: buf, want: v.expected }); }
}

function flush(buf) {                                     // commit trailing pending markers
  let out = buf;
  while (out.length && isSent(out[out.length - 1])) out = out.slice(0, -1) + (cloneOf[out[out.length - 1]] ?? '');
  return normalize(out);
}

const ran = pass + fail;
console.log(`LDML transforms: ${rawT.length} (${Object.keys(sets).length} sets)`);
console.log(`replayed ${ran} of ${vectors.length} vectors — ${pass} pass, ${fail} fail`);
console.log('skipped (engine-only, expected):');
for (const [k, n] of Object.entries(skip).sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(5)}  ${k}`);
if (fails.length) { console.log('\nfirst failures:'); for (const f of fails) console.log(`  [${f.keys}]  got ${JSON.stringify(f.got)} want ${JSON.stringify(f.want)}`); }
process.exit(fail ? 1 : 0);
