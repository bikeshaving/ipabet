import {jsx} from "@b9g/crank/jsx-tag";
import spec from "../../spec/ipabet.json";
import schema from "../../spec/ipabet.schema.json";
import {Layout} from "./layout.ts";
// @ts-ignore — shovel rewrites this to a hashed asset URL at build time.
import keysCss from "./styles/keys.css" with {assetBase: "/assets/"};

// /keys — the complete keystroke → glyph mapping as machine-readable tables,
// generated from spec/ipabet.json so it can never drift. Built for scrapers
// and LLMs that can't parse the visual chart: every combo is plain text with
// explicit keystrokes, the output glyph, its codepoint, and its name.
// The raw canonical data is also served verbatim at /ipabet.json.

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
		// Say what ⌥⇧ *means* for this mark, not merely that it exists.
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

// Tier 1 segments and Tier 2 marks, split by the spec's own flags.
const identity = letters.filter((l) => l.key.length === 1 && /[a-z]/.test(l.key));
const shiftNum = letters.filter((l) => /^[0-9]$/.test(l.key));
const digraphs = letters.filter((l) => l.key.length === 2);
const classes = spec.classes as {beyond: Record<string, string>};
const ipaMarks = marks.filter((m) => m.ipa !== false);
const beyondMarks = marks.filter((m) => m.ipa === false);

export function Keys() {
	return jsx`
		<${Layout}
			title="IPAbet — keystroke reference (machine-readable)"
			desc="The complete IPAbet keystroke-to-IPA mapping as plain-text tables: every base, digraph, diacritic, and rule with explicit keystrokes, glyph, and Unicode codepoint. Raw JSON at /ipabet.json."
			styles=${[keysCss]}
		>
			<main>
				<h1>IPAbet keystroke reference <span style="font-size:.5em;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--k);border:1.5px solid var(--k);border-radius:999px;padding:.1em .55em;vertical-align:middle">beta</span></h1>
				<p style="color:var(--dim);font-style:italic;font-size:.9rem">Provisional: the layout is still being refined and these keystrokes may change between releases.</p>
				<p>The complete keystroke → IPA mapping, generated from the canonical
				<a href="/ipabet.json"><code>ipabet.json</code></a> (raw JSON, served verbatim).
				Notation: <code>⇧</code> = Shift, <code>⌥</code> = Option; a space separates
				keystrokes typed in sequence. <a href="/chart">Visual chart</a> · <a href="/">home</a>.</p>

				<h2>Tier 1 · base letters (identity)</h2>
				<p>Bare Latin keys that are their own IPA value.</p>
				<${Table}>${segRows(identity)}<//>

				<h2>Tier 1 · shifted number row</h2>
				<p>IPA glyphs with no Latin letter.</p>
				<${Table}>${segRows(shiftNum)}<//>

				<h2>Tier 1 · digraphs (base + ⇧modifier)</h2>
				<p>A capital letter after a glyph transforms it. Modifier meanings:
				${Object.entries(modifiers).map(([k, v], i) => jsx`${i ? "; " : ""}<code>⇧${k}</code> ${v}`)}.</p>
				<${Table}>${segRows(digraphs)}<//>

				<h2>Tier 1 · rules (not table-driven)</h2>
				<${Table}>
					<tr><td class="k">vowel ⇧R</td><td class="g">V˞</td><td class="cp">U+02DE</td><td>rhoticity (⇧5 ⇧R → ɚ, ⇧5 ⇧H ⇧R → ɝ precomposed; every other vowel takes the hook)</td></tr>
					<tr><td class="k">obstruent ⇧X</td><td class="g">Cʼ</td><td class="cp">U+02BC</td><td>ejective (eXplosive) — appends ʼ to a voiceless obstruent (p t ʈ c k q ɸ f θ s ʃ ʂ ç x χ ɬ); open class</td></tr>
				<//>

				<h2>Tier 2 · diacritics &amp; suprasegmentals (Option layer)</h2>
				<p>Combining diacritics are <em>prefix</em>, dead-key style like é/ñ on the US
				keyboard: press ⌥+key, then the base absorbs the mark (⌥n then n → ñ). They
				stack. Spacing marks (length, tone, stress) are <em>postfix</em> — type the
				base, then the mark. Where a mark has a second form, ⌥⇧+key gives it
				(⌥⇧n → creaky, ⌥⇧' → secondary stress). Pressing it a <em>second</em> time
				commits the raw capital instead — that is the escape, because ⇧ transforms
				the glyph before it and "GitHub" would otherwise come out "Giθub". Keys with
				no second form escape on the first press. Backspace cancels a pending mark.
				Where the two forms are values of the
				<em>same dimension</em> — advanced/retracted, apical/laminal, syllabic/non-syllabic —
				the second <em>replaces</em> the first rather than stacking (nothing is both
				advanced and retracted). Forms on independent dimensions (tilde/creaky,
				diaeresis/breathy) stack.</p>
				<${Table}>${markRows(ipaMarks)}<//>
				<p>Each ⌥⇧ form is annotated with what ⌥⇧ <em>means</em> for that mark —
				<code>greater</code> pole, more <code>extreme</code> value, <code>lesser</code>
				value, same glyph relocated <code>below</code>, an independent <code>twin</code>,
				or an <code>arbitrary</code> pick between two unpolarized duals. <code>replaces</code>
				marks the pairs that are values of one dimension, where ⌥⇧ replaces instead of
				stacking. These are per-mark fields in <a href="/ipabet.json"><code>ipabet.json</code></a>.</p>

				<h2>Tier 2 · beyond the IPA</h2>
				<p>Marks the IPA chart has no cell for, kept because the layout should be able
				to write real orthographies and not only transcribe them. They are fully
				typeable and stack like any other mark; they are simply absent from
				<a href="/chart">the chart</a>. Each carries <code>"ipa": false</code> and a
				<code>beyond</code> value in the spec.</p>
				${Object.entries(classes.beyond).map(([k, desc]) => jsx`
					<h3><code>${k}</code></h3><p>${desc}</p>
					<${Table}>${markRows(beyondMarks.filter((m) => m.beyond === k))}<//>`)}

				<h2>Tier 2 · superscripts (base + ⌥p)</h2>
				<${Table}>${sups.map((s) => jsx`<tr><td class="k">${s.base} ⌥p</td><td class="g">${s.sup}</td><td class="cp">${cp(s.sup)}</td><td>superscript ${s.base}</td></tr>`)}<//>

				<h2>Machine access</h2>
				<p><code>GET /ipabet.schema.json</code> is the JSON Schema (Draft 2020-12) for
				<code>ipabet.json</code>: every field, its meaning, and the invariants that hold
				between them (a mark has a <code>shiftSense</code> exactly when it has a
				<code>double</code>; <code>ipa: false</code> and <code>beyond</code> imply each
				other).</p>
				<p><code>GET /chart.json</code> returns the IPA chart as structured data —
				every symbol with its codepoint, keystrokes, and place/manner or vowel
				coordinates. <code>GET /ipabet.json</code> returns the canonical mapping verbatim
				(the source of every row above). The <code>letters</code> array is the
				base/digraph list (<code>key</code> is the keystroke sequence, <code>glyph</code>
				the output); <code>marks</code> is the Option layer; <code>modifiers</code>
				documents each ⇧ modifier's meaning.</p>
			</main>
		<//>`;
}

export const SPEC_JSON = JSON.stringify(spec, null, "\t");
export const SCHEMA_JSON = JSON.stringify(schema, null, "\t");
