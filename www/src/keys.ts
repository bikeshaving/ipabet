import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import spec from "../../spec/ipabet.json";
import schema from "../../spec/ipabet.schema.json";
import {Layout} from "./layout.ts";
import {keySpelled as keystrokes} from "./keystrokes.ts";
import {components} from "./marked-components.ts";
import {docs} from "./content.gen.ts";
// @ts-ignore — shovel rewrites this to a hashed asset URL at build time.
import keysCss from "./styles/keys.css" with {assetBase: "/assets/"};

// /keys — the complete keystroke → glyph mapping as machine-readable tables,
// generated from spec/ipabet.json so it can never drift. Prose lives as a
// document (content/keys.md); the spec-generated tables are embedded in it as
// components (never markdown-ified — they are data, not prose).

interface Letter { key: string; glyph: string; cp?: string; name?: string }
interface MarkE {
	opt: string; mark: string; type: string;
	double?: string; cycle?: string[]; doubleCycle?: string[]; name?: string;
	doubleClone?: string; exclusive?: boolean;
	ipa?: boolean; beyond?: string; shiftSense?: string; arbitraryKey?: boolean;
}

const letters = spec.letters as Letter[];
const marks = spec.marks as MarkE[];
const modifiers = spec.modifiers as Record<string, string>;
const sups = (spec.superscripts as {table: {base: string; sup: string}[]}).table;
const subs = (spec.subscripts as {table: {base: string; sub: string}[]}).table;
const classes = spec.classes as {beyond: Record<string, string>};
const doc = docs.keys;


function cp(glyph: string): string {
	return [...glyph].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

function Row(keys: string, glyph: string, name: unknown) {
	return jsx`<tr><td class="k">${keys}</td><td class="g">${glyph}</td><td class="cp">${cp(glyph)}</td><td>${name}</td></tr>`;
}

function segRows(rows: Letter[]) {
	return rows.map((l) => Row(keystrokes(l.key), l.glyph, l.name ?? ""));
}

function markRows(rows: MarkE[]) {
	return rows.map((m) => {
		const shown = m.type === "combining" ? "◌" + m.mark : m.mark;
		const cyc = m.cycle?.length
			? " · again → " + m.cycle.map((c) => "◌" + c).join(" → ")
			: "";
		const two = m.double
			? " · ⇧ → " + (m.type === "combining" ? "◌" : "") + m.double +
			  ` (${m.shiftSense}${m.exclusive ? ", replaces" : ""})` +
			  (m.doubleCycle?.length ? " · again → " + m.doubleCycle.map((c) => "◌" + c).join(" → ") : "")
			: "";
		return jsx`<tr><td class="k">⌥${m.opt}</td><td class="g">${shown}</td><td class="cp">${cp(m.mark)}</td><td>${(m.name ?? "").toLowerCase()}${cyc}${two}</td></tr>`;
	});
}

function Table({children}: {children?: unknown}) {
	return jsx`<div class="tablewrap"><table>${children}</table></div>`;
}

const SEGS: Record<string, Letter[]> = {
	identity: letters.filter((l) => l.key.length === 1 && /[a-z]/.test(l.key)),
	shiftNum: letters.filter((l) => /^[0-9]/.test(l.key)),
	digraphs: letters.filter((l) => l.key.length === 2 && /^[a-z]/.test(l.key)),
};
const ipaMarks = marks.filter((m) => m.ipa !== false);
const beyondMarks = marks.filter((m) => m.ipa === false);

// Spec-generated tables, embeddable in the Markdown document by tag.
const keysComponents = {
	...components,
	SegTable: ({token}: any) => jsx`<${Table}>${segRows(SEGS[token.kind])}<//>`,
	MarkTable: ({token}: any) => jsx`<${Table}>${markRows(token.kind === "ipa" ? ipaMarks : marks)}<//>`,
	SupTable: () => jsx`<${Table}>${sups.map((s) => jsx`<tr><td class="k">${s.base} ⌥z</td><td class="g">${s.sup}</td><td class="cp">${cp(s.sup)}</td><td>superscript ${s.base}</td></tr>`)}<//>`,
	SubTable: () => jsx`<${Table}>${subs.map((s) => jsx`<tr><td class="k">${s.base} ⌥⇧z</td><td class="g">${s.sub}</td><td class="cp">${cp(s.sub)}</td><td>subscript ${s.base}</td></tr>`)}<//>`,
	RulesTable: () => jsx`
		<${Table}>
			<tr><td class="k">vowel ⌥r</td><td class="g">V˞</td><td class="cp">U+02DE</td><td>rhoticity — emits the spacing hook, the font joins it (5 ⇧Y ⌥r → ɚ, 5 ⇧H ⌥r → ɝ precomposed)</td></tr>
			<tr><td class="k">X ⇧X</td><td class="g">ɡ þ ı ƙ ƴ ƒ ß</td><td class="cp"></td><td>the doubled-letter law: a letter doubled with its own shift is its orthographic cousin (g⇧G ɡ — the chart's exact script g, t⇧T þ, i⇧I ı, k⇧K ƙ, y⇧Y ƴ, f⇧F ƒ, s⇧S ß). Held capitals: ⇧T⇧T → Þ, ⇧G⇧G → Ɡ</td></tr>
			<tr><td class="k">⌥. ⌥.</td><td class="g">·</td><td class="cp">U+00B7</td><td>the interpunct — the dot key's free-floating form, committed by a double-press (Catalan punt volat: l ⌥. ⌥. l → l·l)</td></tr>
			<tr><td class="k">⌥j ⌥j</td><td class="g">◌͢</td><td class="cp">U+0362</td><td>sliding articulation (extIPA): the same joiner chord again toggles the emitted tie ⇄ sliding; the other chord flips placement in place</td></tr>
			<tr><td class="k">⇧X ⇧Y</td><td class="g">Æ Ŋ Ʃ Θ</td><td class="cp"></td><td>capital digraphs: capitalize the base, capitalize the result (⇧A⇧E → Æ, ⇧S⇧H → Ʃ, ⇧T⇧H → Θ, ⇧B⇧H → Β) — every real capital forms, Greek included; only plain-ASCII results stay literal. All-caps words are Caps Lock's job</td></tr>
			<tr><td class="k">held ⇧5⇧Y</td><td class="g">Ə</td><td class="cp">U+018F</td><td>the shifted digit is the digit's capital plane: a held chain uppercases the digraph (⇧5⇧Y → Ə, ⇧7⇧H → Ħ, ⇧2⇧H → Ɂ — the Dene capital glottal); a shift release escapes to the literal</td></tr>
		<//>`,
	BeyondTables: () =>
		Object.entries(classes.beyond).map(([k, desc]) => jsx`
			<h3><code>${k}</code></h3><p>${desc}</p>
			<${Table}>${markRows(beyondMarks.filter((m) => m.beyond === k))}<//>`),
	ModifierMeanings: () =>
		Object.entries(modifiers).map(([k, v], i) => jsx`${i ? "; " : ""}<code>⇧${k}</code> ${v}`),
};

export function Keys() {
	return jsx`
		<${Layout} title=${doc.attributes.title} desc=${doc.attributes.description ?? ""} styles=${[keysCss]}>
			<main>
				<h1>IPAbet keystroke reference <span style="font-size:.5em;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--k);border:1.5px solid var(--k);border-radius:999px;padding:.1em .55em;vertical-align:middle">beta</span></h1>
				<${Marked} markdown=${doc.body} components=${keysComponents} />
			</main>
		<//>`;
}

export const SPEC_JSON = JSON.stringify(spec, null, "\t");
export const SCHEMA_JSON = JSON.stringify(schema, null, "\t");
