import spec from "../../spec/ipabet.json";
// @ts-ignore — Shovel rewrites this to a hashed asset URL at build time.
import chartPdf from "./chart.pdf" with {assetBase: "/assets/"};
import {AUDIO} from "./audio-map.ts";
import {DIACRITICS, SUPRASEGMENTALS, TONES, type ChartEntry} from "./chart-data.ts";

// The IPAbet chart: the IPA chart (layout derived from the official 2015
// sheet, CC BY-SA) with the IPAbet keystrokes printed beside every symbol —
// a single printable page that is both the notation's manual and its proof
// of coverage. Keystroke annotations are reverse-looked-up from
// spec/ipabet.json so they can never drift from the notation.

const reverse = new Map<string, string>();
for (const e of spec.letters as {key: string; glyph: string}[]) {
	if (!reverse.has(e.glyph)) reverse.set(e.glyph, e.key);
}
reverse.set("ɡ", reverse.get("g") ?? "g"); // the chart's script ɡ is our g

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "sH" → "s H", "5" → "⇧5", "1W" → "⇧1 W" (digits are shifted; a trailing
 * capital is the shift-modifier letter, shown bare to stay compact). */
function keyText(key: string): string {
	return [...key].map((c) => (/[0-9]/.test(c) ? "⇧" + c : c)).join("");
}

/** A glyph with its keystrokes beneath. `fallback` annotates glyphs typed
 * outside the letters table (native keys, mark sequences). */
function G(glyph: string, fallback?: string): string {
	const key = reverse.get(glyph);
	const label = key !== undefined ? keyText(key) : fallback;
	const note = label === undefined ? "" : `<i>${esc(label)}</i>`;
	return `<b class="ipa">${esc(glyph)}</b>${note}`;
}

/** Click-to-hear: recording URL for a glyph, where one exists. */
function audioAttr(glyph: string): string {
	const url = AUDIO[glyph];
	return url === undefined ? "" : ` data-audio="${url}" role="button" tabindex="0" title="play ${esc(glyph)}"`;
}

// ------------------------------------------------- pulmonic consonants

// Cell spec: glyph pair, colspan, shading. The coronal region merges to one
// wide cell (dental–postalveolar) in rows that don't distinguish it, exactly
// like the official sheet. "sh" = judged impossible (gray); "shr" = only the
// voiced half shaded.
type Cell = {vl?: string; vd?: string; span?: number; sh?: boolean; shr?: boolean};

const PLACES = [
	"Bilabial", "Labiodental", "Dental", "Alveolar", "Postalveolar",
	"Retroflex", "Palatal", "Velar", "Uvular", "Pharyngeal", "Glottal",
];

const PULMONIC: [string, Cell[]][] = [
	["Plosive", [{vl: "p", vd: "b"}, {}, {vl: "t", vd: "d", span: 3}, {vl: "ʈ", vd: "ɖ"}, {vl: "c", vd: "ɟ"}, {vl: "k", vd: "ɡ"}, {vl: "q", vd: "ɢ"}, {shr: true}, {vl: "ʔ", shr: true}]],
	["Nasal", [{vd: "m"}, {vd: "ɱ"}, {vd: "n", span: 3}, {vd: "ɳ"}, {vd: "ɲ"}, {vd: "ŋ"}, {vd: "ɴ"}, {sh: true}, {sh: true}]],
	["Trill", [{vd: "ʙ"}, {}, {vd: "r", span: 3}, {}, {}, {sh: true}, {vd: "ʀ"}, {}, {sh: true}]],
	["Tap or Flap", [{}, {vd: "ⱱ"}, {vd: "ɾ", span: 3}, {vd: "ɽ"}, {}, {sh: true}, {}, {}, {sh: true}]],
	["Fricative", [{vl: "ɸ", vd: "β"}, {vl: "f", vd: "v"}, {vl: "θ", vd: "ð"}, {vl: "s", vd: "z"}, {vl: "ʃ", vd: "ʒ"}, {vl: "ʂ", vd: "ʐ"}, {vl: "ç", vd: "ʝ"}, {vl: "x", vd: "ɣ"}, {vl: "χ", vd: "ʁ"}, {vl: "ħ", vd: "ʕ"}, {vl: "h", vd: "ɦ"}]],
	["Lateral fricative", [{sh: true}, {sh: true}, {vl: "ɬ", vd: "ɮ", span: 3}, {}, {}, {}, {}, {sh: true}, {sh: true}]],
	["Approximant", [{}, {vd: "ʋ"}, {vd: "ɹ", span: 3}, {vd: "ɻ"}, {vd: "j"}, {vd: "ɰ"}, {}, {}, {sh: true}]],
	["Lateral approximant", [{sh: true}, {sh: true}, {vd: "l", span: 3}, {vd: "ɭ"}, {vd: "ʎ"}, {vd: "ʟ"}, {}, {sh: true}, {sh: true}]],
];

function pulmonicTable(): string {
	const head = PLACES.map((p) => `<th>${p}</th>`).join("");
	const rows = PULMONIC.map(([manner, cells]) => {
		const tds = cells
			.map((c) => {
				const cls = c.sh ? ' class="sh"' : c.shr ? ' class="shr"' : "";
				const span = c.span !== undefined ? ` colspan="${c.span}"` : "";
				const vl = c.vl !== undefined ? `<span class="u"${audioAttr(c.vl)}>${G(c.vl)}</span>` : "<span class=\"u\"></span>";
				const vd = c.vd !== undefined ? `<span class="u"${audioAttr(c.vd)}>${G(c.vd)}</span>` : "<span class=\"u\"></span>";
				const body = c.vl === undefined && c.vd === undefined ? "" : vl + vd;
				return `<td${cls}${span}>${body}</td>`;
			})
			.join("");
		return `<tr><th>${manner}</th>${tds}</tr>`;
	}).join("\n");
	return `<table class="grid"><tr><th></th>${head}</tr>${rows}</table>
	<p class="fine">Symbols to the right in a cell are voiced, to the left are voiceless. Shaded areas denote articulations judged impossible.</p>`;
}

// ---------------------------------------------- non-pulmonic consonants

const CLICKS: [string, string][] = [["ʘ", "Bilabial"], ["ǀ", "Dental"], ["ǃ", "(Post)alveolar"], ["ǂ", "Palatoalveolar"], ["ǁ", "Alveolar lateral"]];
const IMPLOSIVES: [string, string][] = [["ɓ", "Bilabial"], ["ɗ", "Dental/alveolar"], ["ʄ", "Palatal"], ["ɠ", "Velar"], ["ʛ", "Uvular"]];
// Ejectives are base + ⇧X (eXplosive; open class — any voiceless obstruent);
// the ʼ is U+02BC, not a curly quote. Keystrokes shown as fallbacks.
const EJECTIVES: [string, string, string][] = [["pʼ", "Bilabial", "p ⇧X"], ["tʼ", "Dental/alveolar", "t ⇧X"], ["kʼ", "Velar", "k ⇧X"], ["sʼ", "Alveolar fricative", "s ⇧X"]];

const OTHER: [string, string, string?][] = [
	["ʍ", "Voiceless labial-velar fricative"],
	["w", "Voiced labial-velar approximant"],
	["ɥ", "Voiced labial-palatal approximant"],
	["ʜ", "Voiceless epiglottal fricative"],
	["ʢ", "Voiced epiglottal fricative"],
	["ʡ", "Epiglottal plosive"],
	["ɕ", "Voiceless alveolo-palatal fricative"],
	["ʑ", "Voiced alveolo-palatal fricative"],
	["ɺ", "Voiced alveolar lateral flap"],
	["t͡s", "Affricate (tie bar)", "t ⇧1 s"],
	["ɧ", "Simultaneous ʃ and x"],
];

function nonPulmonic(): string {
	const [clicks, impl, ej] = [CLICKS, IMPLOSIVES, EJECTIVES];
	const col = (title: string, entries: [string, string][]) =>
		`<div><h4>${title}</h4>${entries
			.map(([g, name]) => `<div class="li"${audioAttr(g)}>${G(g)}<span class="nm">${name}</span></div>`)
			.join("")}</div>`;
	const ejCol = `<div><h4>Ejectives</h4>${ej
		.map(([g, name, keys]) => `<div class="li"${audioAttr(g)}>${G(g, keys)}<span class="nm">${name}</span></div>`)
		.join("")}<div class="fine">…any voiceless obstruent + ⇧X</div></div>`;
	return `<div class="cols3">
		${col("Clicks", clicks)}
		${col("Voiced implosives", impl)}
		${ejCol}
	</div>`;
}

// -------------------------------------------------------- other symbols

function otherSymbols(): string {
	return OTHER
		.map(([g, name, fb]) => `<div class="li"${audioAttr(g)}>${G(g, fb)}<span class="nm">${name}</span></div>`)
		.join("");
}

// --------------------------------------------------------------- vowels

const VOWELS: {g: string; row: number; col: number; round: boolean; dot?: boolean}[] = [
	{g: "i", row: 0, col: 0, round: false, dot: true},
	{g: "y", row: 0, col: 0, round: true, dot: true},
	{g: "ɨ", row: 0, col: 1, round: false, dot: true},
	{g: "ʉ", row: 0, col: 1, round: true, dot: true},
	{g: "ɯ", row: 0, col: 2, round: false, dot: true},
	{g: "u", row: 0, col: 2, round: true, dot: true},
	{g: "ɪ", row: 0.5, col: 0.35, round: false},
	{g: "ʏ", row: 0.5, col: 0.55, round: false},
	{g: "ʊ", row: 0.5, col: 1.75, round: false},
	{g: "e", row: 1, col: 0, round: false, dot: true},
	{g: "ø", row: 1, col: 0, round: true, dot: true},
	{g: "ɘ", row: 1, col: 1, round: false, dot: true},
	{g: "ɵ", row: 1, col: 1, round: true, dot: true},
	{g: "ɤ", row: 1, col: 2, round: false, dot: true},
	{g: "o", row: 1, col: 2, round: true, dot: true},
	{g: "ə", row: 1.5, col: 1, round: false, dot: true},
	{g: "ɛ", row: 2, col: 0, round: false, dot: true},
	{g: "œ", row: 2, col: 0, round: true, dot: true},
	{g: "ɜ", row: 2, col: 1, round: false, dot: true},
	{g: "ɞ", row: 2, col: 1, round: true, dot: true},
	{g: "ʌ", row: 2, col: 2, round: false, dot: true},
	{g: "ɔ", row: 2, col: 2, round: true, dot: true},
	{g: "æ", row: 2.5, col: 0.1, round: false},
	{g: "ɐ", row: 2.5, col: 1, round: false},
	{g: "a", row: 3, col: 0, round: false, dot: true},
	{g: "ɶ", row: 3, col: 0, round: true, dot: true},
	{g: "ɑ", row: 3, col: 2, round: false, dot: true},
	{g: "ɒ", row: 3, col: 2, round: true, dot: true},
];

const TOP = 26, BOTTOM = 300, LEFTX_TOP = 70, LEFTX_BOTTOM = 215, RIGHTX = 420;

function vowelXY(row: number, col: number): [number, number] {
	const t = row / 3;
	const y = TOP + t * (BOTTOM - TOP);
	const leftX = LEFTX_TOP + t * (LEFTX_BOTTOM - LEFTX_TOP);
	return [leftX + (col / 2) * (RIGHTX - leftX), y];
}

function vowelChart(): string {
	const lines: string[] = [];
	for (let r = 0; r <= 3; r++) {
		const [x1, y] = vowelXY(r, 0);
		lines.push(`<line x1="${x1}" y1="${y}" x2="${RIGHTX}" y2="${y}"/>`);
	}
	lines.push(`<line x1="${LEFTX_TOP}" y1="${TOP}" x2="${LEFTX_BOTTOM}" y2="${BOTTOM}"/>`);
	const [cx1] = vowelXY(0, 1), [cx2] = vowelXY(3, 1);
	lines.push(`<line x1="${cx1}" y1="${TOP}" x2="${cx2}" y2="${BOTTOM}"/>`);
	lines.push(`<line x1="${RIGHTX}" y1="${TOP}" x2="${RIGHTX}" y2="${BOTTOM}"/>`);

	const labels: string[] = [];
	["Close", "Close-mid", "Open-mid", "Open"].forEach((name, r) => {
		const [x, y] = vowelXY(r, 0);
		labels.push(`<text class="axis" x="${x - 44}" y="${y + 4}" text-anchor="end">${name}</text>`);
	});
	labels.push(`<text class="axis" x="${LEFTX_TOP}" y="${TOP - 12}" text-anchor="middle">Front</text>`);
	labels.push(`<text class="axis" x="${cx1}" y="${TOP - 12}" text-anchor="middle">Central</text>`);
	labels.push(`<text class="axis" x="${RIGHTX}" y="${TOP - 12}" text-anchor="middle">Back</text>`);

	const glyphs: string[] = [];
	for (const v of VOWELS) {
		const [x, y] = vowelXY(v.row, v.col);
		if (v.dot) glyphs.push(`<circle cx="${x}" cy="${y}" r="2.2"/>`);
		const gx = v.dot ? (v.round ? x + 13 : x - 13) : x;
		const key = reverse.get(v.g);
		const au = AUDIO[v.g];
		const attr = au === undefined ? "" : ` data-audio="${au}" role="button" tabindex="0"`;
		glyphs.push(`<text class="v"${attr} x="${gx}" y="${y + 5}" text-anchor="middle">${esc(v.g)}</text>`);
		if (key !== undefined) {
			glyphs.push(`<text class="k" x="${gx}" y="${y + 18}" text-anchor="middle">${esc(keyText(key))}</text>`);
		}
	}
	return `<svg viewBox="0 0 470 330" role="img" aria-label="IPA vowel chart with IPAbet keystrokes">
		<g class="vgrid">${lines.join("")}</g>${labels.join("")}${glyphs.join("")}
	</svg>
	<p class="fine">Where symbols appear in pairs, the one to the right represents a rounded vowel.</p>`;
}

// ----------------------------------------------------------- diacritics

/** "COMBINING TILDE (nasalized; ⇧ → creaky)" → ["nasalized", "creaky"] */
// The three non-grid sections come from chart-data.ts: the official chart's
// own 31 diacritics, 9 suprasegmentals, and 16 tone marks, in its order and
// its wording. They are NOT generated from spec/ipabet.json's `marks`, which
// is a superset — it also carries the Latin tenants (cedilla, ogonek, horn,
// hỏi hook, dot-above, ß, the Semitic half-rings) and the Korean fortis mark.
// Those are typeable and are documented on /keys; they just aren't on the IPA
// chart, and printing them here made this sheet a chart of something else.
// js/test/chart.test.ts types every row below through the engine.

/** "~+w" → "⌥⇧w"; "g +H ~p" → "g ⇧H ⌥p". */
function display(keys: string): string {
	return keys
		.split(" ")
		.map((k) => k.replace(/~/g, "⌥").replace(/\+/g, "⇧"))
		.join(" ");
}

function cp(glyph: string): string {
	return [...glyph]
		.map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0"))
		.join(" ");
}

/** One entry, carrying its own data on the element for scrapers. */
function cell(e: ChartEntry, note = ""): string {
	const shown = e.glyph.startsWith("◌") && e.on ? e.on + e.glyph.slice(1) : e.glyph;
	const bare = e.glyph.startsWith("◌") ? e.glyph.slice(1) : e.glyph;
	const label = note ? `${e.name} — ${note}` : e.name;
	return `<div class="li" data-glyph="${esc(bare)}" data-cp="${cp(bare)}" data-keys="${esc(display(e.keys))}" data-name="${esc(e.name)}">` +
		`<b class="ipa">${esc(shown)}</b><i>${esc(display(e.keys))}</i>` +
		`<span class="nm">${esc(label)}</span></div>`;
}

function list(entries: ChartEntry[]): string {
	return entries.map((e) => cell(e)).join("");
}

// The count and the tail of this list come from the spec's `ipa: false` flag,
// so the chart's own fine print cannot claim a number the layer doesn't have.
const beyondMarks = (spec.marks as {ipa?: boolean; name?: string}[]).filter((m) => m.ipa === false);
const beyondCount = String(beyondMarks.length);

function diacritics(): string {
	return `<div class="cols2">${list(DIACRITICS)}</div>
	<p class="fine">Combining diacritics are prefix, dead-key style like é/ñ: type the ⌥ mark, then the base (<i>⌥e</i> <i>a</i> → <b class="ipa">á</b>); they stack. ⌥⇧ gives a mark's second form (<i>⌥⇧n</i> → creaky); where the two are values of one feature — advanced/retracted, apical/laminal — the second <em>replaces</em> the first rather than stacking. Spacing marks — length, tone, stress — are postfix: base then mark. <b class="ipa">ʰ</b> and all superscripts: glyph then <i>⌥p</i>. Rhoticity <b class="ipa">˞</b>: vowel then <i>⇧R</i>. The ${beyondCount} diacritics beyond the IPA — cedilla, ogonek, horn, ß and the rest — are on <a href="/keys">/keys</a>.</p>`;
}

function suprasegmentals(): string {
	return list(SUPRASEGMENTALS);
}

function tones(): string {
	return list(TONES);
}

// --------------------------------------------------------------- sheet

const SHEET_CSS = `
:root { --fg: #111; --dim: #555; --line: #222; --shade: #c8c8c8; --key: #4455aa; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html { background: #e8e8e6; }
body { font-family: "Doulos SIL", "Charis SIL", "Times New Roman", serif; color: var(--fg); }
.sheet {
	background: #fff; width: 8.5in; min-height: 11in; margin: 1rem auto;
	padding: 0.45in 0.5in; box-shadow: 0 2px 14px rgba(0,0,0,0.18);
	font-size: 9.5pt; line-height: 1.25;
}
h1 { font-size: 14pt; text-align: center; font-weight: 600; letter-spacing: 0.02em; margin-bottom: 0.15in; }
h1 i { font-style: normal; color: var(--key); }
h3 { font-size: 9.5pt; font-weight: 700; letter-spacing: 0.04em; margin: 0.16in 0 0.06in; }
h4 { font-size: 8.5pt; font-weight: 700; margin-bottom: 0.04in; }
.ipa { font-family: "Doulos SIL", "Charis SIL", "Times New Roman", serif; font-weight: 400; }
i { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-style: normal; font-size: 6.4pt; color: var(--key); }

table.grid { border-collapse: collapse; width: 100%; table-layout: fixed; }
table.grid th, table.grid td { border: 0.75pt solid var(--line); padding: 1.5pt 2pt; text-align: center; }
table.grid tr:first-child th { font-size: 7pt; font-weight: 400; }
table.grid tr th:first-child { text-align: left; font-size: 7pt; font-weight: 400; width: 0.72in; border: none; padding-right: 3pt; }
table.grid tr:first-child th:first-child { border: none; }
table.grid td { height: 0.34in; }
table.grid td .u { display: inline-flex; flex-direction: column; align-items: center; width: 50%; }
table.grid td .u .ipa { font-size: 12pt; }
table.grid td.sh { background: var(--shade); }
table.grid td.shr { background: linear-gradient(to right, transparent 50%, var(--shade) 50%); }

.row { display: flex; gap: 0.3in; align-items: flex-start; }
.row > div { flex: 1; }
.cols3 { display: flex; gap: 0.18in; }
.cols3 > div { flex: 1; }
.cols2 { columns: 2; column-gap: 0.2in; }
.li { display: flex; align-items: baseline; gap: 4pt; break-inside: avoid; padding: 0.6pt 0; }
.li .ipa { font-size: 11pt; min-width: 14pt; text-align: center; }
.li .nm { font-size: 7.5pt; }
.fine { font-size: 7pt; color: var(--dim); margin-top: 3pt; }

svg { width: 100%; height: auto; }
svg .vgrid line { stroke: var(--line); stroke-width: 1; }
svg circle { fill: var(--fg); }
/* White halo lifts the glyph/keystroke off the trapezoid lines so the rules
   don't read as strike-throughs. paint-order draws the stroke behind the fill. */
svg text.v { font-family: "Doulos SIL", "Charis SIL", "Times New Roman", serif; font-size: 17px; fill: var(--fg); paint-order: stroke; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }
svg text.k { font-family: ui-monospace, Menlo, monospace; font-size: 8px; fill: var(--key); paint-order: stroke; stroke: #fff; stroke-width: 2.5px; stroke-linejoin: round; }
svg text.axis { paint-order: stroke; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }
svg text.axis { font-size: 9px; fill: var(--dim); }

.attrib { font-size: 6.5pt; color: var(--dim); margin-top: 0.14in; text-align: center; }
.attrib a { color: var(--dim); }
[data-audio] { cursor: pointer; }
[data-audio]:hover .g, svg text.v[data-audio]:hover { fill: var(--key); color: var(--key); }
.webnav { text-align: center; font-family: -apple-system, sans-serif; font-size: 0.85rem; padding: 0.75rem; }
@media print {
	html { background: #fff; }
	.sheet { box-shadow: none; margin: 0; width: auto; min-height: auto; padding: 0; zoom: 0.78; }
	.webnav { display: none; }
	@page { size: letter portrait; margin: 0.35in; }
}
`;

export const CHART_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The IPAbet chart — the IPA in keystrokes</title>
<meta name="description" content="The IPA chart with IPAbet keystrokes beside every symbol: one printable sheet covering pulmonic and non-pulmonic consonants, vowels, diacritics, suprasegmentals, and tones.">
<style>${SHEET_CSS}</style>
</head>
<body>
<p class="webnav"><a href="/">← IPAbet</a> · <a href="${chartPdf}" download="ipabet-chart.pdf">Download printable PDF</a> (one page) · or ⌘P.</p>
<div class="sheet">
	<h1>THE INTERNATIONAL PHONETIC ALPHABET <i>in IPAbet keystrokes</i></h1>

	<h3>CONSONANTS (PULMONIC)</h3>
	${pulmonicTable()}

	<div class="row">
		<div>
			<h3>CONSONANTS (NON-PULMONIC)</h3>
			${nonPulmonic()}
			<h3>OTHER SYMBOLS</h3>
			<div class="cols2">${otherSymbols()}</div>
			<h3>SUPRASEGMENTALS</h3>
			<div class="cols2">${suprasegmentals()}</div>
		</div>
		<div>
			<h3>VOWELS</h3>
			${vowelChart()}
			<h3>TONES AND WORD ACCENTS</h3>
			<div class="cols2">${tones()}</div>
		</div>
	</div>

	<h3>DIACRITICS</h3>
	${diacritics()}

	<p class="attrib">Click any symbol to hear it. Keystrokes: blue monospace beside each symbol; ⇧-digits and trailing capitals are shifted; combining ⌥ marks are typed before their base (dead-key style), spacing marks after.
	This chart as data: <a href="/chart.json">chart.json</a> · every keystroke: <a href="/keys">keys</a>.
	Audio: Wikimedia Commons (Peter Isotalo, UCLA Phonetics Lab Archive 2003, et al.), free/copyleft licenses, re-hosted with attribution.
	Layout derived from <a href="https://www.internationalphoneticassociation.org/content/ipa-chart">The International Phonetic Alphabet (revised to 2015)</a>,
	© 2015 International Phonetic Association, CC BY-SA 3.0. This sheet is likewise CC BY-SA · <a href="https://ipabet.org">ipabet.org</a></p>
</div>
<script>
let cur = null;
document.addEventListener("click", (e) => {
	const el = e.target.closest("[data-audio]");
	if (!el) return;
	if (cur) cur.pause();
	cur = new Audio(el.dataset.audio);
	cur.play();
});
</script>
</body>
</html>`;

// ------------------------------------------------------- machine-readable

// GET /chart.json — the same sheet as structured data. The HTML above and this
// object are rendered from the same tables, so a symbol cannot appear on one
// and not the other. Keystrokes resolve exactly as `G()` resolves them for the
// page: reverse-looked-up from spec/ipabet.json, with an explicit fallback for
// the few glyphs typed as sequences rather than table entries (ejectives, the
// tie-bar affricate). `keys: null` means the glyph has no IPAbet keystroke.
//
// Complements the two other machine surfaces: /ipabet.json is the canonical
// notation spec, /keys is every keystroke. This one is the IPA chart itself.

interface JsonSymbol {
	glyph: string;
	cp: string;
	keys: string | null;
	name?: string;
}

function sym(glyph: string, name?: string, fallback?: string): JsonSymbol {
	const key = reverse.get(glyph);
	const keys = key !== undefined ? keyText(key) : (fallback ?? null);
	return name === undefined ? {glyph, cp: cp(glyph), keys} : {glyph, cp: cp(glyph), keys, name};
}

function jsonEntry(e: ChartEntry) {
	return {
		glyph: e.glyph,
		cp: cp(e.glyph.startsWith("◌") ? e.glyph.slice(1) : e.glyph),
		keys: display(e.keys),
		name: e.name,
		combining: e.glyph.startsWith("◌"),
		...(e.on === undefined ? {} : {shownOn: e.on}),
	};
}

export const CHART_JSON = JSON.stringify(
	{
		about:
			"The IPA chart (2015, CC BY-SA) with IPAbet keystrokes. " +
			"Notation: ⇧ Shift, ⌥ Option; a space separates keystrokes typed in " +
			"sequence. Combining diacritics are typed before their base (dead-key " +
			"style); spacing marks after. Canonical spec: /ipabet.json.",
		pulmonic: {
			places: PLACES,
			manners: PULMONIC.map(([manner, cells]) => ({
				manner,
				cells: cells.map((c) => ({
					span: c.span ?? 1,
					impossible: c.sh === true,
					voiceless: c.vl === undefined ? null : sym(c.vl),
					voiced: c.vd === undefined ? null : sym(c.vd),
				})),
			})),
		},
		clicks: CLICKS.map(([g, n]) => sym(g, n)),
		implosives: IMPLOSIVES.map(([g, n]) => sym(g, n)),
		ejectives: {
			rule: "any voiceless obstruent + ⇧X",
			examples: EJECTIVES.map(([g, n, k]) => sym(g, n, k)),
		},
		other: OTHER.map(([g, n, fb]) => sym(g, n, fb)),
		vowels: VOWELS.map((v) => ({
			...sym(v.g),
			height: v.row,
			backness: v.col,
			rounded: v.round,
		})),
		diacritics: DIACRITICS.map(jsonEntry),
		suprasegmentals: SUPRASEGMENTALS.map(jsonEntry),
		tones: TONES.map(jsonEntry),
	},
	null,
	"\t",
);
