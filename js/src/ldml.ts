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
export interface Stroke { key: string; shift: boolean; option: boolean }
const keyOutput = (k: Stroke): string | null => {
  const p = positionOf(k.key);
  if (!p) return null;
  const layer = k.option ? (k.shift ? "altR shift" : "altR") : (k.shift ? "shift" : "none");
  const id = layers[layer]?.[p[0]]?.[p[1]];
  if (!id || id === "gap") return null;
  return keys[id] ?? null;
};

// ---- transforms, grouped, each rule end-anchored ----
const MARKER_RANGE = "-";
interface Rule { re: RegExp; to: string }
const groups: Rule[][] = [];
for (const g of each(/<transformGroup>([\s\S]*?)<\/transformGroup>/g)) {
  const rules: Rule[] = [];
  for (const m of [...g[1].matchAll(/<transform from="([^"]+)" to="([^"]*)"\/>/g)]) {
    // A dead-key's (.) matches the base it lands on — never a still-pending
    // marker, so ⌥a ⌥e … keeps both pending instead of one eating the other.
    const src = expandU(encodeMarkers(unesc(m[1]))).replace(/\(\.\)/g, `([^${MARKER_RANGE}])`);
    rules.push({ re: new RegExp(src, "u"), to: m[2] });
  }
  groups.push(rules);
}
const applyTo = (to: string, m: RegExpMatchArray) =>
  expandU(encodeMarkers(unesc(to))).replace(/\$(\d)/g, (_, d) => m[Number(d)] ?? "");

// ---- output resolution: leftover (unresolved) markers show their spacing
//      clone from <display> if they have one, else drop ----
const displays: Record<string, string> = {};
for (const m of each(/<display output="\\m\{([^}]+)\}" display="([^"]*)"\/>/g)) displays[m[1]] = unesc(m[2]);

// One sweep: each group fires its first matching rule (leftmost match) once,
// then the next group. UTS #35 re-normalizes and re-runs between insertions;
// we iterate the whole sweep to a fixpoint so a rewrite that exposes a new
// match (a freshly-composed base a pending mark can now land on) settles.
function sweep(buf: string): string {
  for (const g of groups) {
    for (const r of g) {
      const m = buf.match(r.re);
      if (m) { buf = buf.slice(0, m.index) + applyTo(r.to, m) + buf.slice(m.index + m[0].length); break; }
    }
  }
  return buf;
}
function runPasses(buf: string): string {
  for (let i = 0; i < 32; i++) {
    const next = sweep(buf);
    if (next === buf) break;
    buf = next;
  }
  return buf;
}
function render(buf: string): string {
  let out = "";
  for (const ch of buf) out += cpMarker.has(ch) ? (displays[cpMarker.get(ch)!] ?? "") : ch;
  return out.normalize("NFC");
}

/** Type a sequence of keystrokes over an initial string, returning the text.
 *  Pure composition only — no shell state (shift-chaining, modes, preview). */
export function type(strokes: Stroke[], initial = ""): string {
  let buf = initial;
  for (const k of strokes) {
    const o = keyOutput(k);
    if (o === null) continue; // not on the layout — the host would pass it through
    buf = runPasses(buf + o);
  }
  return render(buf);
}
