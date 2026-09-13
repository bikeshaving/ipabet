import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import spec from "../../js/src/spec.ts";
import {nameOf} from "./glyph-names.ts";
import {Layout} from "./layout.ts";
import {keySpelled as keystrokes} from "./keystrokes.ts";
import {components} from "./marked-components.ts";
import {docs} from "./content.ts";
// @ts-ignore — shovel rewrites this to a hashed asset URL at build time.
import keysCss from "./styles/keys.css" with {assetBase: "/assets/"};
// The Option-layer board is the same component /type renders, so it needs the
// same stylesheet.
// @ts-ignore
import kbdCss from "./styles/kbd.css" with {assetBase: "/assets/"};

// /keys — the complete mapping as machine-readable tables, read straight from
// spec/ipabet.xml (parsed by js/src/spec.ts). Prose is content/keys.md.

interface Letter { key: string; glyph: string; cp?: string }
interface MarkE {
	opt: string; mark: string; type: string;
	double?: string; cycle?: string[]; doubleCycle?: string[];
	doubleClone?: string; exclusive?: boolean;
}

const letters = spec.letters as Letter[];
const marks = spec.marks as MarkE[];
const sups = (spec.superscripts as {table: {base: string; sup: string}[]}).table;
const subs = (spec.subscripts as {table: {base: string; sub: string}[]}).table;
const doc = docs.keys;

// Presentation data for /keys, owned by this page (the engine needs none of
// it). Moved out of spec/ipabet.xml, which now carries only what the engine
// reads. Mark annotations are keyed by codepoint hex (as `cpHex` builds it).
const MARK_ANNOT: Record<string, {ipa?: false; beyond?: string; shiftSense?: string}> = {
  "0301": {shiftSense: "extreme"},
  "0300": {shiftSense: "extreme"},
  "0302": {shiftSense: "twin"},
  "030c": {shiftSense: "below"},
  "0304": {shiftSense: "below"},
  "0303": {shiftSense: "below"},
  "0308": {shiftSense: "below"},
  "0306": {shiftSense: "below"},
  "030a": {shiftSense: "placement"},
  "0327": {ipa: false, beyond: "tenant", shiftSense: "twin"},
  "0326": {ipa: false, beyond: "tenant", shiftSense: "twin"},
  "0328": {ipa: false, beyond: "tenant", shiftSense: "twin"},
  "032a": {shiftSense: "placement"},
  "033a": {shiftSense: "arbitrary"},
  "0320": {shiftSense: "greater"},
  "0335": {shiftSense: "twin"},
  "031e": {shiftSense: "greater"},
  "031c": {shiftSense: "greater"},
  "0329": {shiftSense: "placement"},
  "0349": {ipa: false, beyond: "extIPA", shiftSense: "greater"},
  "033c": {shiftSense: "twin"},
  "0361": {shiftSense: "placement"},
  "033d": {shiftSense: "placement"},
  "02c8": {shiftSense: "lesser"},
  "02d0": {shiftSense: "lesser"},
  "02bb": {shiftSense: "twin"},
  "02de": {shiftSense: "twin"},
  "2198": {shiftSense: "greater"},
  "2193": {ipa: false, beyond: "extIPA", shiftSense: "greater"},
  "a71c": {shiftSense: "greater"},
  "02e6": {shiftSense: "twin"},
  "031a": {shiftSense: "twin"},
  "0319": {shiftSense: "greater"},
  "0307": {ipa: false, beyond: "tenant", shiftSense: "below"},
  "0309": {ipa: false, beyond: "tenant"},
  "208d": {ipa: false, beyond: "extIPA", shiftSense: "twin"},
  "02b9": {ipa: false, beyond: "tenant", shiftSense: "greater"},
  "27e8": {ipa: false, beyond: "tenant", shiftSense: "twin"},
  "032f": {shiftSense: "twin"},
};
const NONIPA_LETTERS = new Set(["ß", "þ", "ı", "ƙ", "ƴ", "ƒ"]);
const BEYOND_DESC: Record<string, string> = {
  "tenant": "Not IPA. Carried so the layout can write real orthographies and romanizations.",
  "tradition": "Standard within a phonological tradition but absent from the IPA chart.",
  "extIPA": "Extensions to the IPA, for disordered speech (the 2015 chart).",
};
const MODIFIERS: Record<string, string> = {
  "5": "pull toward the center — the ə-neighborhood (e⇧5→ɜ, o⇧5→ɞ, a⇧5→ɐ); ə itself is the 5 base's default, 5⇧H",
  "H": "the h-digraph — plosives spirantize (tH→θ, pH→ɸ), sibilants hush (sH→ʃ), vowels lax (iH→ɪ, uH→ʊ); for a, back (aH→ɑ)",
  "R": "retroflex (coronals)",
  "J": "palatalize (consonants only)",
  "W": "labialize / round-flip",
  "L": "lateralize",
  "G": "dorsal deepening — velar/uvular place",
  "Q": "guttural — uvular-pharyngeal-epiglottal throat region",
  "V": "labiodental",
  "B": "bilabial place",
  "A": "drag toward a (vowels: oA→ɒ, uA→ʌ)",
  "Y": "central — the y-vowels (iY→ɨ, uY→ʉ, eY→ɘ, oY→ɵ, aY→ä); Welsh y, Russian ы",
  "E": "ligature with e",
  "C": "click — base letter is the anterior place (p bilabial, t dental, q alveolar, c palatal, l lateral)",
  "P": "implosive (voiced glottalic ingressive)",
};
const cpHex = (g: string) => g.codePointAt(0)!.toString(16).padStart(4, "0");
const annOf = (mark: string) => MARK_ANNOT[cpHex(mark)] ?? {};


function cp(glyph: string): string {
	return [...glyph].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

function Row(keys: string, glyph: string, name: unknown) {
	return jsx`<tr><td class="k">${keys}</td><td class="g">${glyph}</td><td class="cp">${cp(glyph)}</td><td>${name}</td></tr>`;
}

function segRows(rows: Letter[]) {
	return rows.map((l) => Row(keystrokes(l.key), l.glyph, nameOf(l.glyph)));
}

// A mark rides a dotted-circle carrier iff it is itself a combining mark, judged
// per glyph — so a ⌥⇧ form is decided on its own class, not the ⌥ form's.
const onCircle = (g: string) => (/\p{M}/u.test(g) ? "◌" + g : g);

function markRows(rows: MarkE[]) {
	return rows.map((m) => {
		// The g column carries both planes: the ⌥ glyph, then ⇧ + the ⌥⇧ glyph.
		const g = onCircle(m.mark) + (m.double ? ` ⇧${onCircle(m.double)}` : "");
		const cyc = m.cycle?.length
			? " · again → " + m.cycle.map(onCircle).join(" → ")
			: "";
		const two = m.double
			? ` · ⇧ ${annOf(m.mark).shiftSense}${m.exclusive ? ", replaces" : ""}` +
			  (m.doubleCycle?.length ? " · again → " + m.doubleCycle.map(onCircle).join(" → ") : "")
			: "";
		const cps = cp(m.mark) + (m.double ? " · " + cp(m.double) : "");
		return jsx`<tr><td class="k">⌥${m.opt}</td><td class="g">${g}</td><td class="cp">${cps}</td><td>${nameOf(m.mark).toLowerCase()}${cyc}${two}</td></tr>`;
	});
}

function Table({children}: {children?: unknown}) {
	return jsx`<div class="tablewrap"><table>${children}</table></div>`;
}

const SEGS: Record<string, Letter[]> = {
	identity: letters.filter((l) => l.key.length === 1 && /[a-z]/.test(l.key)),
	shiftNum: letters.filter((l) => /^[0-9]/.test(l.key)),
	digraphs: letters.filter((l) => l.key.length === 2 && /^[a-z]/.test(l.key) && !NONIPA_LETTERS.has(l.glyph)),
	extra: letters.filter((l) => NONIPA_LETTERS.has(l.glyph)),
};
const ipaMarks = marks.filter((m) => annOf(m.mark).ipa !== false);
const beyondMarks = marks.filter((m) => annOf(m.mark).ipa === false);

// Spec-generated tables, embeddable in the Markdown document by tag.
const keysComponents = {
	...components,
	SegTable: ({token}: any) => jsx`<${Table}>${segRows(SEGS[token.kind])}<//>`,
	MarkTable: ({token}: any) => jsx`<${Table}>${markRows(token.kind === "ipa" ? ipaMarks : marks)}<//>`,
	SupTable: () => jsx`<${Table}>${sups.map((s) => jsx`<tr><td class="k">⌥z ${s.base}</td><td class="g">${s.sup}</td><td class="cp">${cp(s.sup)}</td><td>superscript ${s.base}</td></tr>`)}<//>`,
	SubTable: () => jsx`<${Table}>${subs.map((s) => jsx`<tr><td class="k">⌥⇧z ${s.base}</td><td class="g">${s.sub}</td><td class="cp">${cp(s.sub)}</td><td>subscript ${s.base}</td></tr>`)}<//>`,
	BeyondTables: () =>
		Object.entries(BEYOND_DESC).map(([k, desc]) => jsx`
			<h3><code>${k}</code></h3><p>${desc}</p>
			<${Table}>${markRows(beyondMarks.filter((m) => annOf(m.mark).beyond === k))}<//>`),
	ModifierMeanings: () =>
		Object.entries(MODIFIERS).map(([k, v], i) => jsx`${i ? "; " : ""}<code>⇧${k}</code> ${v}`),
};

export function Keys() {
	return jsx`
		<${Layout} title=${doc.attributes.title} desc=${doc.attributes.description ?? ""} path="/keys" styles=${[keysCss, kbdCss]}>
			<main>
				<h1>IPAbet keystroke reference <span style="font-size:.5em;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--k);border:1.5px solid var(--k);border-radius:999px;padding:.1em .55em;vertical-align:middle">beta</span></h1>
				<${Marked} markdown=${doc.body} components=${keysComponents} />
			</main>
		<//>`;
}
