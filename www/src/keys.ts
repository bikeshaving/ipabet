import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import spec from "../../spec/ipabet.json";
import schema from "../../spec/ipabet.schema.json";
import {Layout} from "./layout.ts";
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
	double?: string; cycle?: string[]; name?: string;
	doubleClone?: string; exclusive?: boolean;
	ipa?: boolean; beyond?: string; shiftSense?: string; arbitraryKey?: boolean;
}

const letters = spec.letters as Letter[];
const marks = spec.marks as MarkE[];
const modifiers = spec.modifiers as Record<string, string>;
const sups = (spec.superscripts as {table: {base: string; sup: string}[]}).table;
const classes = spec.classes as {beyond: Record<string, string>};
const doc = docs.keys;

// "sH" → "s ⇧H", "5" → "⇧5", "s" → "s".
function keystrokes(key: string): string {
	return [...key].map((c) => (/[0-9A-Z]/.test(c) ? "⇧" + c : c)).join(" ");
}

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
		const two = m.double
			? " · ⇧ → " + (m.type === "combining" ? "◌" : "") + m.double +
			  ` (${m.shiftSense}${m.exclusive ? ", replaces" : ""})`
			: "";
		return jsx`<tr><td class="k">⌥${m.opt}</td><td class="g">${shown}</td><td class="cp">${cp(m.mark)}</td><td>${(m.name ?? "").toLowerCase()}${two}</td></tr>`;
	});
}

function Table({children}: {children?: unknown}) {
	return jsx`<div class="tablewrap"><table>${children}</table></div>`;
}

const SEGS: Record<string, Letter[]> = {
	identity: letters.filter((l) => l.key.length === 1 && /[a-z]/.test(l.key)),
	shiftNum: letters.filter((l) => /^[0-9]$/.test(l.key)),
	digraphs: letters.filter((l) => l.key.length === 2),
};
const ipaMarks = marks.filter((m) => m.ipa !== false);
const beyondMarks = marks.filter((m) => m.ipa === false);

// Spec-generated tables, embeddable in the Markdown document by tag.
const keysComponents = {
	...components,
	SegTable: ({token}: any) => jsx`<${Table}>${segRows(SEGS[token.kind])}<//>`,
	MarkTable: ({token}: any) => jsx`<${Table}>${markRows(token.kind === "ipa" ? ipaMarks : marks)}<//>`,
	SupTable: () => jsx`<${Table}>${sups.map((s) => jsx`<tr><td class="k">${s.base} ⌥p</td><td class="g">${s.sup}</td><td class="cp">${cp(s.sup)}</td><td>superscript ${s.base}</td></tr>`)}<//>`,
	RulesTable: () => jsx`
		<${Table}>
			<tr><td class="k">vowel ⇧R</td><td class="g">V˞</td><td class="cp">U+02DE</td><td>rhoticity (⇧5 ⇧R → ɚ, ⇧5 ⇧H ⇧R → ɝ precomposed; every other vowel takes the hook)</td></tr>
			<tr><td class="k">obstruent ⇧X</td><td class="g">Cʼ</td><td class="cp">U+02BC</td><td>ejective (eXplosive) — appends ʼ to a voiceless obstruent (p t ʈ c k q ɸ f θ s ʃ ʂ ç x χ ɬ); open class</td></tr>
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
