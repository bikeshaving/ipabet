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
const SPACING = Object.entries(keys)
  .filter(([id, o]) => /^(sp|os|q)_/.test(id) && [...o].length === 1)
  .map(([, o]) => o.replace(/[\\\]^-]/g, "\\$&"))
  .join("");
const unconvert: Record<string, string> = {};
const POSTFIX = new Set<string>();
const groups: Group[] = [];
for (const g of each(/(?:<!--\s*@optional\s+(\w+)[\s\S]*?-->\s*)?<transformGroup>([\s\S]*?)<\/transformGroup>/g)) {
  const rules: Rule[] = [];
  for (const m of [...g[2].matchAll(/<transform from="([^"]+)" to="([^"]*)"\/>/g)]) {
    // A dead-key's (.) matches the base it lands on — never a still-pending
    // marker, so ⌥a ⌥e … keeps both pending instead of one eating the other.
    const src = expandU(encodeMarkers(unesc(m[1]))).replace(/\(\.\)/g, `(?![${SPACING}])([\\p{L}\\p{N}]\\p{M}*)`);
    rules.push({ re: new RegExp("(?:" + src + ")$", "u"), to: m[2] });
    const pf = unesc(m[1]).match(/^\(\.\)\\m\{([^}]+)\}/);
    if (pf) POSTFIX.add(pf[1]);
    const d = unesc(m[1]).match(/^([^(\\])\(\\p\{M\}\*\)(.+)$/u), t = unesc(m[2]).match(/^(.)\$1$/u);
    if (d && t && keys["b_" + t[1]] !== t[1]) unconvert[t[1]] ??= d[1] + d[2];
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
const attachable = (prev: string | undefined) => prev !== undefined && /[\p{L}\p{N}]/u.test(prev);
function resolve(buf: string, before = ""): string {
  let out = "";
  let prev: string | undefined = [...before].pop();
  for (const ch of buf) {
    if (ch === PROTECT) continue;
    const name = cpMarker.get(ch);
    let piece: string;
    if (name === undefined) piece = ch;
    else if (OPERATORS.has(name)) piece = "";
    else if (POSTFIX.has(name) && attachable(prev)) piece = markerGlyph[name] ?? "";
    else piece = displays[name] ?? markerGlyph[name] ?? "";
    out += piece;
    if (piece !== "") prev = [...piece].pop();
  }
  return out;
}
function render(buf: string): string {
  return resolve(buf).normalize("NFC");
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
function compose(buf: string, k: Stroke, o: string, on: Settings, brokenIn: boolean): string {
  buf = buf.normalize("NFD");
  const pre = [...buf];
  let j = pre.length;
  while (j > 0 && isMarker(pre[j - 1])) j--;
  const typed = pre.slice(j).map((c) => markerGlyph[cpMarker.get(c)!]).filter((c) => c !== undefined);
  let next: string | null = null;
  if (k.shift && !k.option && !k.capsLock && /^[A-Za-z]$/.test(k.key) && !brokenIn) {
    const last = pre[pre.length - 1], prev = pre[pre.length - 2];
    if (last !== undefined && /^[A-Z]$/.test(last) && prev !== undefined && isIPA(prev)) {
      const lowered = pre.slice(0, -1).join("") + last.toLowerCase() + o;
      const tried = runPasses(lowered, on);
      if (tried !== lowered) next = tried;
    }
  }
  return fuseTail(next ?? runPasses(buf + o, on), typed);
}

// ---- the IME contract: one keystroke at a time over host-held text ----
export interface Keystroke {
  key: string; shift?: boolean; option?: boolean;
  shiftBroke?: boolean; capsLock?: boolean; control?: boolean;
}
export type Edit =
  | {type: "insert"; text: string}
  | {type: "replace"; length: number; text: string}
  | {type: "pass"}
  | {type: "noop"};
export type Pending = readonly string[];
export interface Step { edit: Edit; pending: Pending; chainBroken?: boolean }

export const SHIFTED_DIGITS: Record<string, string> = {
  "1": "!", "2": "@", "3": "#", "4": "$", "5": "%",
  "6": "^", "7": "&", "8": "*", "9": "(", "0": ")",
};
export const SHIFTED_PUNCT: Record<string, string> = {
  "`": "~", "-": "_", "=": "+", "[": "{", "]": "}", "\\": "|",
  ";": ":", "'": "\"", ",": "<", ".": ">", "/": "?",
};
export function nativeChar(k: Keystroke): string {
  if (k.key.length !== 1) return "";
  if (k.shift && /[a-z]/i.test(k.key)) return k.key.toUpperCase();
  if (k.shift && /[0-9]/.test(k.key)) return SHIFTED_DIGITS[k.key] ?? "";
  if (k.shift) return SHIFTED_PUNCT[k.key] ?? k.key;
  if (k.option) return "";
  return k.key;
}
export function applyEdit(text: string, edit: Edit, native = ""): string {
  switch (edit.type) {
    case "insert": return text + edit.text;
    case "replace": return text.slice(0, text.length - edit.length) + edit.text;
    case "pass": return text + native;
    case "noop": return text;
  }
}

const RAISE = "\u0001sup";
const LOWER = "\u0001sub";
let capitalDigraphs = false;
let quoteLocale = QUOTE_LOCALES.default;
export function setCapitalDigraphs(on: boolean): void { capitalDigraphs = on; }
export function setQuoteLocale(locale: string): void {
  quoteLocale = locale in QUOTE_LOCALES.locales ? locale : QUOTE_LOCALES.default;
}

const toMarkers = (p: Pending) =>
  p.map((sc) => sc === RAISE ? markerChar("raise") : sc === LOWER ? markerChar("lower") : (glyphMarker[sc] ?? "")).join("");
const fromMarkers = (s: string): string[] => [...s].flatMap((c) => {
  const n = cpMarker.get(c);
  if (n === undefined) return [];
  if (n === "raise") return [RAISE];
  if (n === "lower") return [LOWER];
  const g = markerGlyph[n];
  return g === undefined ? [] : [g];
});
const pendingText = (sc: string): string => {
  if (sc === RAISE) return displays.raise ?? "";
  if (sc === LOWER) return displays.lower ?? "";
  const m = glyphMarker[sc];
  const n = m === undefined ? undefined : cpMarker.get(m);
  return (n === undefined ? undefined : displays[n]) ?? sc;
};
export function previewString(pending: Pending): string { return pending.map(pendingText).join(""); }
function commitText(before: string, pending: Pending): string {
  return resolve(toMarkers(pending), before).normalize("NFC");
}
function commitString(pending: Pending): string { return commitText("", pending); }

const segmenter = new Intl.Segmenter(undefined, {granularity: "grapheme"});
function lastCluster(text: string): string | undefined {
  if (text.length === 0) return undefined;
  let last: string | undefined;
  for (const s of segmenter.segment(text.slice(-64))) last = s.segment;
  return last;
}
function lastClusters(text: string, n: number): string {
  const segs: string[] = [];
  for (const s of segmenter.segment(text.slice(-128))) segs.push(s.segment);
  return segs.slice(-n).join("");
}
const replaceCluster = (p: string, text: string): Edit => ({type: "replace", length: p.length, text});
const COMBINING_TIES = ["\u{0361}", "\u{035C}"];

export function handleBackspace(textBefore: string, pending: Pending = []): Step {
  if (pending.length > 0) return {edit: {type: "noop"}, pending: pending.slice(0, -1)};
  const p = lastCluster(textBefore);
  if (p === undefined) return {edit: {type: "pass"}, pending: []};
  const nfd = [...p.normalize("NFD")];
  const base = nfd.filter((c) => !/\p{M}/u.test(c)).join("");
  const marks = nfd.filter((c) => /\p{M}/u.test(c));
  if (marks.length === 0 || base.length === 0) return {edit: {type: "pass"}, pending: []};
  if (COMBINING_TIES.includes(marks[marks.length - 1]))
    return {edit: replaceCluster(p, (base + marks.slice(0, -1).join("")).normalize("NFC")), pending: []};
  return {edit: replaceCluster(p, ""), pending: marks};
}

export function handleUnconvert(textBefore: string, pending: Pending = []): Step {
  if (pending.length > 0) return handleBackspace(textBefore, pending);
  const p = lastCluster(textBefore);
  if (p !== undefined) {
    const whole = p.normalize("NFC");
    const low = whole.toLowerCase();
    const key = unconvert[low];
    if (key !== undefined) return {edit: replaceCluster(p, whole === low ? key : key.toUpperCase()), pending: []};
  }
  return {edit: {type: "pass"}, pending: []};
}

export function handleKey(textBefore: string, k: Keystroke, pending: Pending = [], chainBroken = false): Step {
  const brokenIn = chainBroken || (k.shiftBroke ?? false);
  const fin = (s: Step): Step => {
    const e = s.edit;
    const seg = e.type === "replace" || (e.type === "insert" && /[^\x00-\x7f]/.test(e.text));
    return {...s, chainBroken: seg ? false : brokenIn};
  };
  const flush = (): Step => {
    const text = commitText(textBefore, pending);
    return text === "" ? {edit: {type: "noop"}, pending: []} : {edit: {type: "insert", text}, pending: []};
  };
  const withFlush = (edit: Edit): Step => {
    if (pending.length === 0) return {edit, pending: []};
    const pre = commitText(textBefore, pending);
    if (pre === "") return {edit, pending: []};
    if (edit.type === "insert") return {edit: {type: "insert", text: pre + edit.text}, pending: []};
    if (edit.type === "pass") return {edit: {type: "insert", text: pre + nativeChar(k)}, pending: []};
    return {edit, pending: []};
  };
  const key = k.key, shift = k.shift ?? false, option = k.option ?? false;
  if (key === "Escape" && k.control !== true && !option) return fin(pending.length > 0 ? flush() : {edit: {type: "pass"}, pending});
  if ([...key].length !== 1) return fin({edit: {type: "pass"}, pending});
  if (k.control === true) {
    if (shift && /^[a-z]$/i.test(key)) return fin(withFlush({type: "insert", text: key.toUpperCase()}));
    return fin({edit: {type: "pass"}, pending});
  }
  if (key === " " && !option && pending.length > 0) {
    const f = flush();
    return fin(f.edit.type === "noop" ? {edit: {type: "pass"}, pending: []} : f);
  }
  const stroke: Stroke = {key, shift, option, shiftBroke: k.shiftBroke, capsLock: k.capsLock, control: k.control};
  let o = keyOutput(stroke, quoteLocale);
  const caps = k.capsLock === true && !option && /^[a-z]$/i.test(key);
  if (caps) o = key.toUpperCase();
  if (o === null) return fin(withFlush({type: "pass"}));
  const on: Settings = {
    capitalDigraphs: capitalDigraphs && !caps,
    capitalDigitDigraphs: capitalDigraphs && !caps && !brokenIn,
    quoteLocale,
  };
  const w = lastClusters(textBefore, 2);
  const buf = compose(w + toMarkers(pending), stroke, o, on, brokenIn || caps);
  const chars = [...buf];
  let j = chars.length;
  while (j > 0 && isMarker(chars[j - 1])) j--;
  const cd = [...resolve(chars.slice(0, j).join("")).normalize("NFD")];
  const next = fromMarkers(chars.slice(j).join(""));
  const wd = [...w.normalize("NFD")];
  let p = 0;
  while (p < wd.length && p < cd.length && wd[p] === cd[p]) p++;
  if (p === wd.length && p === cd.length) return fin({edit: {type: "noop"}, pending: next});
  const orig = [...w];
  let b = 0, pd = 0;
  for (const c of orig) {
    const n = [...c.normalize("NFD")].length;
    if (pd + n > p) break;
    pd += n;
    b++;
  }
  while (b > 0 && pd < cd.length && /\p{M}/u.test(cd[pd])) {
    b--;
    pd -= [...orig[b].normalize("NFD")].length;
    if (!/\p{M}/u.test(orig[b])) break;
  }
  const text = cd.slice(pd).join("").normalize("NFC");
  const length = orig.slice(b).join("").length;
  if (length === 0) {
    if (pending.length === 0 && text === nativeChar(k)) return fin({edit: {type: "pass"}, pending: next});
    return fin({edit: {type: "insert", text}, pending: next});
  }
  return fin({edit: {type: "replace", length, text}, pending: next});
}

export function typeKeys(keys: Keystroke[], initial = ""): string {
  let text = initial;
  let pending: Pending = [];
  let chainBroken = false;
  for (const k of keys) {
    const step: Step = k.key === "⌫"
      ? (k.control === true ? handleUnconvert(text, pending) : handleBackspace(text, pending))
      : handleKey(text, k, pending, chainBroken);
    pending = step.pending;
    chainBroken = step.chainBroken ?? false;
    if (k.key === "⌫" && step.edit.type === "pass") {
      if (k.control !== true) {
        const p = lastCluster(text);
        text = p === undefined ? text : text.slice(0, text.length - p.length);
      }
    } else {
      text = applyEdit(text, step.edit, nativeChar(k));
    }
  }
  if (pending.length > 0) text += commitText(text, pending);
  return text;
}
