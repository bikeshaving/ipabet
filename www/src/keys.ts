import spec from "../../spec/ipabet.json";

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

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "sH" → "s ⇧H", "5" → "⇧5", "1W" → "⇧1 ⇧W", "s" → "s".
function keystrokes(key: string): string {
	return [...key]
		.map((c) => (/[0-9A-Z]/.test(c) ? "⇧" + c : c))
		.join(" ");
}

function cp(glyph: string): string {
	return [...glyph].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

function row(keys: string, glyph: string, name: string): string {
	return `<tr><td class="k">${esc(keys)}</td><td class="g">${esc(glyph)}</td><td class="cp">${cp(glyph)}</td><td>${esc(name)}</td></tr>`;
}

// ---- Tier 1: segments -------------------------------------------------

const identity = letters.filter((l) => l.key.length === 1 && /[a-z]/.test(l.key));
const shiftNum = letters.filter((l) => /^[0-9]$/.test(l.key));
const digraphs = letters.filter((l) => l.key.length === 2);

function segTable(rows: Letter[]): string {
	return rows.map((l) => row(keystrokes(l.key), l.glyph, l.name ?? "")).join("\n");
}

// ---- Tier 2: diacritics ----------------------------------------------

// /chart shows only the IPA's own marks. The Option layer also carries marks
// the IPA chart has no cell for — this is the page where they live, so split
// them out and say which tradition each answers to. Both the split and the
// labels come from the spec's `ipa`/`beyond` flags, not from a list here.
const classes = spec.classes as {beyond: Record<string, string>};
const ipaMarks = marks.filter((m) => m.ipa !== false);
const beyondMarks = marks.filter((m) => m.ipa === false);

function markTable(rows: MarkE[] = marks): string {
	return rows.map((m) => {
		const shown = m.type === "combining" ? "◌" + m.mark : m.mark;
		// Say what ⌥⇧ *means* for this mark, not merely that it exists. The sense
		// is a per-mark fact (six of them); `exclusive` is the orthogonal one.
		const two = m.double
			? " · ⇧ → " + (m.type === "combining" ? "◌" : "") + m.double +
			  ` (${m.shiftSense}${m.exclusive ? ", replaces" : ""})`
			: "";
		return `<tr><td class="k">⌥${esc(m.opt)}</td><td class="g">${esc(shown)}</td><td class="cp">${cp(m.mark)}</td><td>${esc((m.name ?? "").toLowerCase())}${two}</td></tr>`;
	}).join("\n");
}

function supTable(): string {
	return sups.map((s) => `<tr><td class="k">${esc(s.base)} ⌥p</td><td class="g">${esc(s.sup)}</td><td class="cp">${cp(s.sup)}</td><td>superscript ${esc(s.base)}</td></tr>`).join("\n");
}

const CSS = `
:root { --bg:#fff; --fg:#111; --dim:#666; --line:#ddd; --k:#2555c4; }
@media (prefers-color-scheme: dark){:root{--bg:#101012;--fg:#e8e8e6;--dim:#909090;--line:#2a2a2e;--k:#7aa2ff;}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg);line-height:1.5}
main{max-width:52rem;margin:0 auto;padding:2rem 1.25rem 5rem}
h1{font-size:1.8rem}h2{font-size:1.2rem;margin:2rem 0 .5rem}
p{margin:.5rem 0;color:var(--dim);font-size:.95rem}
a{color:var(--k)}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.9rem;margin-top:.5rem}
td{padding:.3rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}
td.k{font-family:ui-monospace,Menlo,monospace;color:var(--k);white-space:nowrap}
td.g{font-family:"Charis SIL","Doulos SIL","Times New Roman",serif;font-size:1.15rem}
td.cp{font-family:ui-monospace,Menlo,monospace;color:var(--dim);font-size:.8rem;white-space:nowrap}
`;

export const KEYS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>IPAbet — keystroke reference (machine-readable)</title>
<meta name="description" content="The complete IPAbet keystroke-to-IPA mapping as plain-text tables: every base, digraph, diacritic, and rule with explicit keystrokes, glyph, and Unicode codepoint. Raw JSON at /ipabet.json.">
<style>${CSS}</style>
</head>
<body>
<main>
	<h1>IPAbet keystroke reference</h1>
	<p>The complete keystroke → IPA mapping, generated from the canonical
	<a href="/ipabet.json"><code>ipabet.json</code></a> (raw JSON, served verbatim).
	Notation: <code>⇧</code> = Shift, <code>⌥</code> = Option; a space separates
	keystrokes typed in sequence. <a href="/chart">Visual chart</a> · <a href="/">home</a>.</p>

	<h2>Tier 1 · base letters (identity)</h2>
	<p>Bare Latin keys that are their own IPA value.</p>
	<div class="tablewrap"><table>${segTable(identity)}</table></div>

	<h2>Tier 1 · shifted number row</h2>
	<p>IPA glyphs with no Latin letter.</p>
	<div class="tablewrap"><table>${segTable(shiftNum)}</table></div>

	<h2>Tier 1 · digraphs (base + ⇧modifier)</h2>
	<p>A capital letter after a glyph transforms it. Modifier meanings:
	${Object.entries(modifiers).map(([k, v]) => `<code>⇧${esc(k)}</code> ${esc(v)}`).join("; ")}.</p>
	<div class="tablewrap"><table>${segTable(digraphs)}</table></div>

	<h2>Tier 1 · rules (not table-driven)</h2>
	<div class="tablewrap"><table>
		<tr><td class="k">vowel ⇧R</td><td class="g">V˞</td><td class="cp">U+02DE</td><td>rhoticity (⇧5 ⇧R → ɚ, ⇧5 ⇧H ⇧R → ɝ precomposed; every other vowel takes the hook)</td></tr>
		<tr><td class="k">obstruent ⇧X</td><td class="g">Cʼ</td><td class="cp">U+02BC</td><td>ejective (eXplosive) — appends ʼ to a voiceless obstruent (p t ʈ c k q ɸ f θ s ʃ ʂ ç x χ ɬ); open class</td></tr>
	</table></div>

	<h2>Tier 2 · diacritics &amp; suprasegmentals (Option layer)</h2>
	<p>Combining diacritics are <em>prefix</em>, dead-key style like é/ñ on the US
	keyboard: press ⌥+key, then the base absorbs the mark (⌥n then n → ñ). They
	stack. Spacing marks (length, tone, stress) are <em>postfix</em> — type the
	base, then the mark. Where a mark has a second form, ⌥⇧+key gives it
	(⌥⇧n → creaky, ⌥⇧' → secondary stress); pressing the same form again on the
	pending mark toggles it off. Where the two forms are values of the
	<em>same dimension</em> — advanced/retracted, apical/laminal, syllabic/non-syllabic —
	the second <em>replaces</em> the first rather than stacking (nothing is both
	advanced and retracted). Forms on independent dimensions (tilde/creaky,
	diaeresis/breathy) stack.</p>
	<div class="tablewrap"><table>${markTable(ipaMarks)}</table></div>
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
	${Object.entries(classes.beyond).map(([k, desc]) => {
		const rows = beyondMarks.filter((m) => m.beyond === k);
		return `<h3><code>${esc(k)}</code></h3><p>${esc(desc)}</p>
		<div class="tablewrap"><table>${markTable(rows)}</table></div>`;
	}).join("\n")}

	<h2>Tier 2 · superscripts (base + ⌥p)</h2>
	<div class="tablewrap"><table>${supTable()}</table></div>

	<h2>Machine access</h2>
	<p><code>GET /chart.json</code> returns the IPA chart as structured data —
	every symbol with its codepoint, keystrokes, and place/manner or vowel
	coordinates. <code>GET /ipabet.json</code> returns the canonical mapping verbatim
	(the source of every row above). The <code>letters</code> array is the
	base/digraph list (<code>key</code> is the keystroke sequence, <code>glyph</code>
	the output); <code>marks</code> is the Option layer; <code>modifiers</code>
	documents each ⇧ modifier's meaning.</p>
</main>
</body>
</html>`;

export const SPEC_JSON = JSON.stringify(spec, null, "\t");
