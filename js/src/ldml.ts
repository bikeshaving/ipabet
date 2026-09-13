// A generic LDML keyboard3 transform executor. Unlike spec.ts (which decodes
// the transforms back into a data model for the hand-written engine in
// index.ts), this *runs* the transforms the way UTS #35 part 7 describes: a
// keystroke maps to a key's output via the layers, that output is appended to a
// buffer, and the transformGroups run as ordered passes — within a group the
// first matching rule fires, then processing moves to the next group. Markers
// (\m{name}) are atomic tokens carried through the passes and resolved at
// output. It knows no IPAbet-specific composition rules; the transforms do.
//
// This is the engine the LDML file is meant to feed directly. What it does NOT
// model is the IME *shell* — shift-chaining (keystroke timing), mode toggles
// (capital digraphs, quote locale), preview, and host pass-through — which are
// runtime state with no transform representation and stay in the caller.

// @ts-ignore — bundlers inline this file's text.
import xml from "../../spec/ipabet.xml";
import {QUOTE_LOCALES} from "./quotes.ts";

const unesc = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const each = (re: RegExp) => [...xml.matchAll(re)];

// ---- markers become atomic Private-Use codepoints, so a regex `.` or \p{M}
//      treats a whole \m{name} as one unit and never splits it ----
let puaNext = 0xE000;
const markerCp = new Map<string, string>();
const cpMarker = new Map<string, string>();
const markerChar = (name: string) => {
  let c = markerCp.get(name);
  if (!c) { c = String.fromCodePoint(puaNext++); markerCp.set(name, c); cpMarker.set(c, name); }
  return c;
};
const encodeMarkers = (s: string) => s.replace(/\\m\{([^}]+)\}/g, (_, n) => markerChar(n));
const expandU = (s: string) => s.replace(/\\u\{([0-9A-Fa-f]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));

// ---- keys ----
const keys: Record<string, string> = {};
for (const m of each(/<key id="([^"]+)" output="([^"]*)"\/>/g)) keys[m[1]] = encodeMarkers(unesc(m[2]));

// ---- layers: (modifiers) -> grid of key ids, indexed by US-layout position ----
const layers: Record<string, string[][]> = {};
for (const L of each(/<layer modifiers="([^"]+)">([\s\S]*?)<\/layer>/g))
  layers[L[1]] = [...L[2].matchAll(/<row keys="([^"]+)"\/>/g)].map((r) => r[1].split(/\s+/));

const ROWS = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"];
// a keystroke's label is the US glyph; shifted labels arrive already shifted
// (H, %, ?), so map them back to the physical key to find the position.
const SHIFTED: Record<string, string> = {
  "~": "`", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
  "_": "-", "+": "=", "{": "[", "}": "]", "|": "\\", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/",
};
const positionOf = (label: string): [number, number] | null => {
  const phys = /^[A-Za-z]$/.test(label) ? label.toLowerCase() : (SHIFTED[label] ?? label);
  for (let r = 0; r < ROWS.length; r++) { const c = ROWS[r].indexOf(phys); if (c >= 0) return [r, c]; }
  return null;
};
export interface Stroke {
  key: string; shift: boolean; option: boolean;
  /** Shift was physically released since the previous keystroke. */
  shiftBroke?: boolean;
  control?: boolean;
  capsLock?: boolean;
}
const QUOTE_SLOT: Record<string, number> = { q_open_primary: 0, q_close_primary: 1, q_open_secondary: 2, q_close_secondary: 3 };
const keyOutput = (k: Stroke, locale?: string): string | null => {
  if (!k.shift && !k.option && k.key in SHIFTED) return k.key;
  const p = positionOf(k.key);
  if (!p) return null;
  const layer = k.option ? (k.shift ? "altR shift" : "altR") : (k.shift ? "shift" : "none");
  const id = layers[layer]?.[p[0]]?.[p[1]];
  if (!id || id === "gap") return null;
  if (id in QUOTE_SLOT) {
    const quad = QUOTE_LOCALES.locales[locale ?? ""] ?? QUOTE_LOCALES.locales[QUOTE_LOCALES.default];
    return quad[QUOTE_SLOT[id]];
  }
  return keys[id] ?? null;
};

// ---- transforms, grouped, each rule end-anchored ----
const PROTECT = "\uF8FE";
interface Rule { re: RegExp; to: string }
// A group may carry `when`: a setting id from a `<!-- @optional NAME -->`
// sentinel just before it. Such a group runs only when the caller enables
// NAME — how a mode like capital-digraphs becomes a toggleable transform
// layer rather than case logic in the shell.
interface Group { when: string | null; rules: Rule[] }
const unconvert: Record<string, string> = {};
const groups: Group[] = [];
for (const g of each(/(?:<!--\s*@optional\s+(\w+)[\s\S]*?-->\s*)?<transformGroup>([\s\S]*?)<\/transformGroup>/g)) {
  const rules: Rule[] = [];
  for (const m of [...g[2].matchAll(/<transform from="([^"]+)" to="([^"]*)"\/>/g)]) {
    // A dead-key's (.) matches the base it lands on — never a still-pending
    // marker, so ⌥a ⌥e … keeps both pending instead of one eating the other.
    const src = expandU(encodeMarkers(unesc(m[1]))).replace(/\(\.\)/g, "([\\p{L}\\p{N}]\\p{M}*)");
    rules.push({ re: new RegExp(src, "u"), to: m[2] });
    const d = unesc(m[1]).match(/^([^(\\])\(\\p\{M\}\*\)(.+)$/u), t = unesc(m[2]).match(/^(.)\$1$/u);
    if (d && t) unconvert[t[1]] = d[1] + d[2];
  }
  groups.push({ when: g[1] ?? null, rules });
}
const applyTo = (to: string, m: RegExpMatchArray) =>
  expandU(encodeMarkers(unesc(to))).replace(/\$(\d)/g, (_, d) => m[Number(d)] ?? "");

// ---- output resolution: leftover (unresolved) markers show their spacing
//      clone from <display> if they have one, else drop ----
const OPERATORS = new Set(["raise", "lower"]);
const markerGlyph: Record<string, string> = {};
for (const m of each(/<transform from="(?:\(\.\))?\\m\{([^}]+)\}\(\.\)" to="\$1\\u\{([0-9A-Fa-f]+)\}(?:\$2)?"\/>/g))
  markerGlyph[m[1]] = String.fromCodePoint(parseInt(m[2], 16));
const glyphMarker: Record<string, string> = {};
for (const [n, c] of Object.entries(markerGlyph)) glyphMarker[c] = markerChar(n);
const displays: Record<string, string> = {};
for (const m of each(/<display output="\\m\{([^}]+)\}" display="([^"]*)"\/>/g)) displays[m[1]] = unesc(m[2]);

// One sweep: each group fires its first matching rule (leftmost match) once,
// then the next group. UTS #35 re-normalizes and re-runs between insertions;
// we iterate the whole sweep to a fixpoint so a rewrite that exposes a new
// match (a freshly-composed base a pending mark can now land on) settles.
export interface Settings { capitalDigraphs?: boolean; capitalDigitDigraphs?: boolean; quoteLocale?: string }
function sweep(buf: string, on: Settings): string {
  for (const g of groups) {
    if (g.when && !(on as Record<string, boolean>)[g.when]) continue;
    for (const r of g.rules) {
      const m = buf.match(r.re);
      if (m) { buf = buf.slice(0, m.index) + applyTo(r.to, m) + buf.slice(m.index + m[0].length); break; }
    }
  }
  return buf;
}
function runPasses(buf: string, on: Settings): string {
  for (let i = 0; i < 32; i++) {
    const next = sweep(buf, on);
    if (next === buf) break;
    buf = next;
  }
  return buf;
}
function render(buf: string): string {
  let out = "";
  for (const ch of buf) {
    if (ch === PROTECT) continue;
    const name = cpMarker.get(ch);
    out += name === undefined ? ch : OPERATORS.has(name) ? "" : (displays[name] ?? markerGlyph[name] ?? "");
  }
  return out.normalize("NFC");
}

// An IPA segment: a non-ASCII letter or combining mark (what a transcription
// is made of), as opposed to a plain ASCII capital that may still be yelling.
const isIPA = (c: string) => c.codePointAt(0)! > 0x7f && /[\p{L}\p{M}]/u.test(c);

const isMarker = (c: string) => cpMarker.has(c);
function fuseMarks(built: string, rest: string[]): string {
  let best = (built + rest.join("")).normalize("NFC");
  for (let i = 0; i < rest.length; i++) {
    const candidate = (built + rest[i]).normalize("NFC");
    if ([...candidate].length !== [...built].length) continue;
    const s = fuseMarks(candidate, [...rest.slice(0, i), ...rest.slice(i + 1)]);
    if ([...s].length < [...best].length) best = s;
  }
  return best;
}
function fuseTail(buf: string, typed: string[]): string {
  const chars = [...buf];
  const i = lastBase(chars);
  const nfd = [...chars.slice(i).join("").normalize("NFD")];
  if (nfd.length < 3 || isMarker(nfd[0])) return buf;
  const marks = nfd.slice(1);
  const same = typed.length === marks.length && [...typed].sort().join("") === [...marks].sort().join("");
  return chars.slice(0, i).join("") + fuseMarks(nfd[0], same ? typed : marks);
}
const lastBase = (chars: string[]) => {
  let i = chars.length;
  while (i > 0 && /\p{M}/u.test(chars[i - 1])) i--;
  return Math.max(0, i - 1);
};

/** Type a sequence of keystrokes over an initial string, returning the text.
 *  `on` enables optional transform layers (e.g. {capitalDigraphs: true}).
 *  The composition is the transforms; the shell around them is shift-chaining
 *  (keystroke timing), the editing keys, and the chords the host claims. */
export function type(strokes: Stroke[], initial = "", on: Settings = {}): string {
  let buf = initial;
  let chainBroken = false;
  for (const k of strokes) {
    const brokenIn = chainBroken || (k.shiftBroke ?? false);
    if (k.key === "⌫") {
      const chars = [...buf];
      if (chars.length && isMarker(chars[chars.length - 1])) { chars.pop(); buf = chars.join(""); continue; }
      const i = lastBase(chars);
      if (k.control) {
        const keysFor = unconvert[chars[i]];
        if (keysFor !== undefined) { chars.splice(i, 1, ...keysFor); buf = chars.join(""); }
        continue;
      }
      const marks = [...chars.slice(i).join("").normalize("NFD")].slice(1);
      buf = chars.slice(0, i).join("") + marks.map((c) => glyphMarker[c] ?? "").join("");
      continue;
    }
    if (k.key === " ") {
      const chars = [...buf];
      while (chars.length && isMarker(chars[chars.length - 1]) && OPERATORS.has(cpMarker.get(chars[chars.length - 1])!)) chars.pop();
      buf = chars.join("");
      if (!(chars.length && isMarker(chars[chars.length - 1]))) buf += " ";
      continue;
    }
    const pre = [...buf];
    let j = pre.length;
    while (j > 0 && isMarker(pre[j - 1])) j--;
    const typed = pre.slice(j).map((c) => markerGlyph[cpMarker.get(c)!]).filter((c) => c !== undefined);
    let o = keyOutput(k, on.quoteLocale);
    if (k.control) o = k.shift && /^[A-Za-z]$/.test(k.key) ? PROTECT + k.key.toUpperCase() : null;
    else if (k.capsLock && /^[A-Za-z]$/.test(k.key)) o = PROTECT + k.key.toUpperCase();
    if (o === null) continue;
    const settings: Settings = {...on, capitalDigitDigraphs: !!on.capitalDigraphs && !brokenIn};
    let next: string | null = null;
    if (k.shift && !k.option && /^[A-Za-z]$/.test(k.key) && !brokenIn) {
      const chars = [...buf];
      const last = chars[chars.length - 1], prev = chars[chars.length - 2];
      if (last !== undefined && /^[A-Z]$/.test(last) && prev !== undefined && isIPA(prev)) {
        const lowered = chars.slice(0, -1).join("") + last.toLowerCase() + o;
        const tried = runPasses(lowered, settings);
        if (tried !== lowered) next = tried;
      }
    }
    buf = fuseTail(next ?? runPasses(buf + o, settings), typed);
    const tail = [...buf].pop();
    chainBroken = tail !== undefined && isIPA(tail) ? false : brokenIn;
  }
  return render(buf);
}
