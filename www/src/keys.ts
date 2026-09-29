import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import spec from "../../spec/ipabet.json";
import {Layout} from "./layout.ts";
import {keySpelled as keystrokes, seq, formatCompact} from "./keystrokes.ts";
import {typeKeys} from "../../js/src/index.ts";
import {components} from "./marked-components.ts";
import {docs} from "./content.ts";
// @ts-ignore — shovel rewrites this to a hashed asset URL at build time.
import keysCss from "./styles/keys.css" with {assetBase: "/assets/"};
// The Option-layer board is the same component /type renders, so it needs the
// same stylesheet.
// @ts-ignore
import kbdCss from "./styles/kbd.css" with {assetBase: "/assets/"};

// /keys — the complete mapping as machine-readable tables, generated from
// the spec. Prose is content/keys.md.

interface Letter { key: string; glyph: string; cp?: string; name?: string; ipa?: boolean }
interface MarkE {
	opt: string; mark: string; type: string;
	double?: string; cycle?: string[]; doubleCycle?: string[]; name?: string;
	doubleClone?: string; exclusive?: boolean;
	ipa?: boolean; beyond?: string; shiftSense?: string; arbitraryKey?: boolean;
}

const letters = spec.letters as Letter[];
const marks = spec.marks as MarkE[];
const modifiers = spec.modifiers as Record<string, string>;
// The raise/lower tables, kept to the rows the keyboard can really type: each
// base is spelled as the keys that type it, the row is typed through the
// engine, and it stays only if the result is the raised or lowered glyph.
// Unicode raises letters (Georgian, Cyrillic, CJK) that have no key here.
const baseKeys = new Map<string, string>();
for (const l of spec.letters as {key: string; glyph: string}[]) if (!baseKeys.has(l.glyph)) baseKeys.set(l.glyph, l.key);
const PUNCT: Record<string, string> = {"=": "=", "+": "+=", "(": "+9", ")": "+0", "-": "-"};
function compactKeys(g: string): string | undefined {
	if (/^[a-z0-9]$/.test(g)) return g;
	if (/^[A-Z]$/.test(g)) return "+" + g.toLowerCase();
	if (PUNCT[g] !== undefined) return PUNCT[g];
	const k = baseKeys.get(g);
	return k === undefined ? undefined
		: [...k].map((c) => (c === "%" ? "+5" : /[A-Z]/.test(c) ? "+" + c.toLowerCase() : c)).join(" ");
}
function typeable(rows: {base: string; out: string}[], op: string) {
	return rows.flatMap(({base, out}) => {
		const k = compactKeys(base);
		if (k === undefined) return [];
		const compact = op + " " + k;
		const label = formatCompact(compact.replace(/(^| )\+([a-z])/g, (_, sp: string, c: string) => sp + "+" + c.toUpperCase()));
		return typeKeys(seq(...compact.split(" ")), "") === out ? [{base, out, keys: label}] : [];
	});
}
const sups = typeable((spec.superscripts as {table: {base: string; sup: string}[]}).table.map((r) => ({base: r.base, out: r.sup})), "~z");
const subs = typeable((spec.subscripts as {table: {base: string; sub: string}[]}).table.map((r) => ({base: r.base, out: r.sub})), "~+z");
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
			? (m.exclusive ? " · ⇧ replaces" : "") +
			  (m.doubleCycle?.length ? " · ⇧ again → " + m.doubleCycle.map(onCircle).join(" → ") : "")
			: "";
		const cps = cp(m.mark) + (m.double ? " · " + cp(m.double) : "");
		return jsx`<tr><td class="k">⌥${m.opt}</td><td class="g">${g}</td><td class="cp">${cps}</td><td>${(m.name ?? "").toLowerCase()}${cyc}${two}</td></tr>`;
	});
}

function Table({children}: {children?: unknown}) {
	return jsx`<div class="tablewrap"><table>${children}</table></div>`;
}

const SEGS: Record<string, Letter[]> = {
	identity: letters.filter((l) => l.key.length === 1 && /[a-z]/.test(l.key)),
	shiftNum: letters.filter((l) => /^[0-9]/.test(l.key)),
	digraphs: letters.filter((l) => l.key.length === 2 && /^[a-z]/.test(l.key) && l.ipa !== false),
	extra: letters.filter((l) => l.ipa === false),
};
const ipaMarks = marks.filter((m) => m.ipa !== false);
const beyondMarks = marks.filter((m) => m.ipa === false);

// Spec-generated tables, embeddable in the Markdown document by tag.
const keysComponents = {
	...components,
	SegTable: ({token}: any) => jsx`<${Table}>${segRows(SEGS[token.kind])}<//>`,
	MarkTable: ({token}: any) => jsx`<${Table}>${markRows(token.kind === "ipa" ? ipaMarks : marks)}<//>`,
	SupTable: () => jsx`<${Table}>${sups.map((s) => jsx`<tr><td class="k">${s.keys}</td><td class="g">${s.out}</td><td class="cp">${cp(s.out)}</td><td>superscript ${s.base}</td></tr>`)}<//>`,
	SubTable: () => jsx`<${Table}>${subs.map((s) => jsx`<tr><td class="k">${s.keys}</td><td class="g">${s.out}</td><td class="cp">${cp(s.out)}</td><td>subscript ${s.base}</td></tr>`)}<//>`,
	BeyondTables: () =>
		Object.entries(classes.beyond).map(([k, desc]) => jsx`
			<h3><code>${k}</code></h3><p>${desc}</p>
			<${Table}>${markRows(beyondMarks.filter((m) => m.beyond === k))}<//>`),
	ModifierMeanings: () =>
		Object.entries(modifiers).map(([k, v], i) => jsx`${i ? "; " : ""}<code>⇧${k}</code> ${v}`),
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

