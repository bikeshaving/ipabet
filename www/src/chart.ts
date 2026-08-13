import {jsx} from "@b9g/crank/jsx-tag";
import spec from "../../spec/ipabet.json";
import {Layout} from "./layout.ts";
import {keySpelled, formatCompact as display} from "./keystrokes.ts";
// @ts-ignore — Shovel rewrites these to hashed asset URLs at build time.
import chartPdf from "./gen/chart.pdf" with {assetBase: "/assets/"};
// @ts-ignore
import chartCss from "./styles/chart.css" with {assetBase: "/assets/"};
// @ts-ignore
import chartAudio from "./clients/chart-audio-client.ts" with {assetBase: "/assets/"};
import {AUDIO} from "./gen/audio-map.ts";
import {DIACRITICS, SUPRASEGMENTALS, TONES, type ChartEntry} from "./chart-data.ts";

// The IPAbet chart: the IPA chart (2015 layout, CC BY-SA) with IPAbet keystrokes
// printed beside every symbol — one printable page.

const reverse = new Map<string, string>();
for (const e of spec.letters as {key: string; glyph: string}[]) {
	if (!reverse.has(e.glyph)) reverse.set(e.glyph, e.key);
}


/** A glyph with its keystrokes beneath. `fallback` annotates glyphs typed
 * outside the letters table (native keys, mark sequences). */
function G(glyph: string, fallback?: string) {
	const key = reverse.get(glyph);
	const label = key !== undefined ? keySpelled(key) : fallback;
	return jsx`<b class="ipa">${glyph}</b>${label === undefined ? null : jsx`<i>${label}</i>`}`;
}

/** Click-to-hear attributes for a glyph, where a recording exists. Undefined
 *  props are omitted by the renderer, so a glyph with no audio gets none. */
function audio(glyph: string) {
	const url = AUDIO[glyph];
	return {
		"data-audio": url,
		role: url === undefined ? undefined : "button",
		tabindex: url === undefined ? undefined : "0",
		title: url === undefined ? undefined : `play ${glyph}`,
	};
}

// ------------------------------------------------- pulmonic consonants

type Cell = {vl?: string; vd?: string; span?: number; sh?: boolean; shr?: boolean};

const PLACES = [
	"Bilabial", "Labiodental", "Dental", "Alveolar", "Postalveolar",
	"Retroflex", "Palatal", "Velar", "Uvular", "Pharyngeal", "Glottal",
];

const PULMONIC: [string, Cell[]][] = [
	["Plosive", [{vl: "p", vd: "b"}, {}, {vl: "t", vd: "d", span: 3}, {vl: "ʈ", vd: "ɖ"}, {vl: "c", vd: "ɟ"}, {vl: "k", vd: "g"}, {vl: "q", vd: "ɢ"}, {shr: true}, {vl: "ʔ", shr: true}]],
	["Nasal", [{vd: "m"}, {vd: "ɱ"}, {vd: "n", span: 3}, {vd: "ɳ"}, {vd: "ɲ"}, {vd: "ŋ"}, {vd: "ɴ"}, {sh: true}, {sh: true}]],
	["Trill", [{vd: "ʙ"}, {}, {vd: "r", span: 3}, {}, {}, {sh: true}, {vd: "ʀ"}, {}, {sh: true}]],
	["Tap or Flap", [{}, {vd: "ⱱ"}, {vd: "ɾ", span: 3}, {vd: "ɽ"}, {}, {sh: true}, {}, {}, {sh: true}]],
	["Fricative", [{vl: "ɸ", vd: "β"}, {vl: "f", vd: "v"}, {vl: "θ", vd: "ð"}, {vl: "s", vd: "z"}, {vl: "ʃ", vd: "ʒ"}, {vl: "ʂ", vd: "ʐ"}, {vl: "ç", vd: "ʝ"}, {vl: "x", vd: "ɣ"}, {vl: "χ", vd: "ʁ"}, {vl: "ħ", vd: "ʕ"}, {vl: "h", vd: "ɦ"}]],
	["Lateral fricative", [{sh: true}, {sh: true}, {vl: "ɬ", vd: "ɮ", span: 3}, {}, {}, {}, {}, {sh: true}, {sh: true}]],
	["Approximant", [{}, {vd: "ʋ"}, {vd: "ɹ", span: 3}, {vd: "ɻ"}, {vd: "j"}, {vd: "ɰ"}, {}, {}, {sh: true}]],
	["Lateral approximant", [{sh: true}, {sh: true}, {vd: "l", span: 3}, {vd: "ɭ"}, {vd: "ʎ"}, {vd: "ʟ"}, {}, {sh: true}, {sh: true}]],
];

/** A half-cell in the pulmonic grid (voiceless left / voiced right). */
function U(glyph?: string) {
	if (glyph === undefined) return jsx`<span class="u"></span>`;
	return jsx`<span class="u" ...${audio(glyph)}>${G(glyph)}</span>`;
}

function PulmonicTable() {
	return jsx`
		<table class="grid">
			<tr><th></th>${PLACES.map((p) => jsx`<th>${p}</th>`)}</tr>
			${PULMONIC.map(([manner, cells]) => jsx`
				<tr><th>${manner}</th>${cells.map((c) => {
					const cls = c.sh ? "sh" : c.shr ? "shr" : undefined;
					const body = c.vl === undefined && c.vd === undefined ? null : jsx`${U(c.vl)}${U(c.vd)}`;
					return jsx`<td class=${cls} colspan=${c.span}>${body}</td>`;
				})}</tr>`)}
		</table>
		<p class="fine">Symbols to the right in a cell are voiced, to the left are voiceless. Shaded areas denote articulations judged impossible.</p>`;
}

// ---------------------------------------------- non-pulmonic consonants

const CLICKS: [string, string][] = [["ʘ", "Bilabial"], ["ǀ", "Dental"], ["ǃ", "(Post)alveolar"], ["ǂ", "Palatoalveolar"], ["ǁ", "Alveolar lateral"]];
const IMPLOSIVES: [string, string][] = [["ɓ", "Bilabial"], ["ɗ", "Dental/alveolar"], ["ʄ", "Palatal"], ["ɠ", "Velar"], ["ʛ", "Uvular"]];
// The bare ejective mark heads the column ("ʼ Examples:") as on the official sheet.
const EJECTIVES: [string, string, string][] = [["ʼ", "Examples:", "⌥⇧q"], ["pʼ", "Bilabial", "p ⌥⇧q"], ["tʼ", "Dental/alveolar", "t ⌥⇧q"], ["kʼ", "Velar", "k ⌥⇧q"], ["sʼ", "Alveolar fricative", "s ⌥⇧q"]];

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
	["ɧ", "Simultaneous ʃ and x"],
	["t͡s", "Affricate (tie bar)", "t ⌥j s"],
];

/** A labelled glyph row (.li): glyph + keystrokes + name. */
function Li(glyph: string, name: unknown, fallback?: string) {
	return jsx`<div class="li" ...${audio(glyph)}>${G(glyph, fallback)}<span class="nm">${name}</span></div>`;
}

function NonPulmonic() {
	const col = (title: string, entries: [string, string][]) =>
		jsx`<div><h4>${title}</h4>${entries.map(([g, name]) => Li(g, name))}</div>`;
	return jsx`
		<div class="cols3">
			${col("Clicks", CLICKS)}
			${col("Voiced implosives", IMPLOSIVES)}
			<div>
				<h4>Ejectives</h4>
				${EJECTIVES.map(([g, name, keys]) => Li(g, name, keys))}
			</div>
		</div>`;
}

function otherSymbols() {
	return OTHER.map(([g, name, fb]) => Li(g, name, fb));
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

function VowelChart() {
	const [cx1] = vowelXY(0, 1);
	const [cx2] = vowelXY(3, 1);
	return jsx`
		<svg viewBox="0 0 470 330" role="img" aria-label="IPA vowel chart with IPAbet keystrokes">
			<g class="vgrid">
				${[0, 1, 2, 3].map((r) => {
					const [x1, y] = vowelXY(r, 0);
					return jsx`<line x1=${x1} y1=${y} x2=${RIGHTX} y2=${y} />`;
				})}
				<line x1=${LEFTX_TOP} y1=${TOP} x2=${LEFTX_BOTTOM} y2=${BOTTOM} />
				<line x1=${cx1} y1=${TOP} x2=${cx2} y2=${BOTTOM} />
				<line x1=${RIGHTX} y1=${TOP} x2=${RIGHTX} y2=${BOTTOM} />
			</g>
			${["Close", "Close-mid", "Open-mid", "Open"].map((name, r) => {
				const [x, y] = vowelXY(r, 0);
				return jsx`<text class="axis" x=${x - 44} y=${y + 4} text-anchor="end">${name}</text>`;
			})}
			<text class="axis" x=${LEFTX_TOP} y=${TOP - 12} text-anchor="middle">Front</text>
			<text class="axis" x=${cx1} y=${TOP - 12} text-anchor="middle">Central</text>
			<text class="axis" x=${RIGHTX} y=${TOP - 12} text-anchor="middle">Back</text>
			${VOWELS.map((v) => {
				const [x, y] = vowelXY(v.row, v.col);
				const gx = v.dot ? (v.round ? x + 13 : x - 13) : x;
				const key = reverse.get(v.g);
				const kt = key === undefined ? undefined : keySpelled(key);
				const kw = kt === undefined ? 0 : kt.length * 4.6 + 5;
				const url = AUDIO[v.g];
				return jsx`
					${v.dot ? jsx`<circle cx=${x} cy=${y} r="2.2" />` : null}
					<text class="v" data-audio=${url} role=${url === undefined ? undefined : "button"} tabindex=${url === undefined ? undefined : "0"} x=${gx} y=${y + 5} text-anchor="middle">${v.g}</text>
					${kt === undefined ? null : jsx`<g class="kk"><rect x=${gx - kw / 2} y=${y + 11.5} width=${kw} height="10" rx="2" /><text class="k" x=${gx} y=${y + 19} text-anchor="middle">${kt}</text></g>`}`;
			})}
		</svg>
		<p class="fine">Where symbols appear in pairs, the one to the right represents a rounded vowel.</p>`;
}

// ----------------------------------------------------------- diacritics


function cp(glyph: string): string {
	return [...glyph].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

/** One diacritic entry, carrying its own data on the element for scrapers. */
function DiaCell(e: ChartEntry, placeholder = false) {
	// Diacritics read against a dotted-circle placeholder (U+25CC): combining marks
	// sit on it (◌̥), spacing modifiers trail it (◌ʰ). Suprasegmentals and tone marks
	// instead show on a sample letter where the data carries one (e̋, ĕ) or bare
	// (ˈ, ˥) — the standalone marks the official sheet prints as-is.
	const shown = placeholder
		? (e.glyph.startsWith("◌") ? e.glyph : "◌" + e.glyph)
		: e.glyph.startsWith("◌") && e.on ? e.on + e.glyph.slice(1) : e.glyph;
	const bare = e.glyph.startsWith("◌") ? e.glyph.slice(1) : e.glyph;
	return jsx`<div class="li" data-glyph=${bare} data-cp=${cp(bare)} data-keys=${display(e.keys)} data-name=${e.name}><b class="ipa">${shown}</b><i>${display(e.keys)}</i><span class="nm">${e.name}</span></div>`;
}

function list(entries: ChartEntry[]) {
	return entries.map((e) => DiaCell(e));
}

/** The sheet's TONES AND WORD ACCENTS box: two columns, LEVEL and CONTOUR, each
 *  row pairing the diacritic with its tone-letter equivalent. A row the notation
 *  cannot type yet shows the symbol with no keystroke rather than being dropped. */
const byName = new Map(TONES.map((e) => [e.name, e]));
const LEVEL: [string, string, string][] = [
	["Extra high", "Extra high", "Extra high (tone letter)"],
	["High", "High", "High (tone letter)"],
	["Mid", "Mid", "Mid (tone letter)"],
	["Low", "Low", "Low (tone letter)"],
	["Extra low", "Extra low", "Extra low (tone letter)"],
	["Downstep", "Downstep", ""],
	["Upstep", "Upstep", ""],
];
const CONTOUR: [string, string, string][] = [
	["Rising", "Rising", "Rising (tone letter)"],
	["Falling", "Falling", "Falling (tone letter)"],
	["High rising", "High rising", "High rising (tone letter)"],
	["Low rising", "Low rising", "Low rising (tone letter)"],
	["Rising-falling", "Rising-falling", "Rising-falling (tone letter)"],
	["Global rise", "Global rise", ""],
	["Global fall", "Global fall", ""],
];

function ToneCell(label: string, mark: string, letter: string) {
	const m = byName.get(mark);
	const l = byName.get(letter);
	return jsx`<td>
		${m === undefined ? null : DiaCell({...m, name: label})}
		${l === undefined ? null : DiaCell(l)}
	</td>`;
}

function ToneTable() {
	const rows = Array.from({length: 7}, (_, r) => jsx`<tr>
		${ToneCell(...LEVEL[r])}
		${ToneCell(...CONTOUR[r])}
	</tr>`);
	return jsx`<table class="dia tone">
		<tr><th>LEVEL</th><th>CONTOUR</th></tr>
		${rows}
	</table>`;
}

/** The sheet's DIACRITICS box: a bordered 3-column table read COLUMN-major,
 *  12/12/7, exactly as the official chart sets it. */
function DiaTable(entries: ChartEntry[]) {
	const cols = [entries.slice(0, 12), entries.slice(12, 24), entries.slice(24)];
	// Column 3 runs out after 7 rows; for the rest, column 2 spans 2 & 3 so the
	// grid stays a full rectangle (as the official sheet does), no empty cells.
	const rows = Array.from({length: 12}, (_, r) => {
		const c3 = cols[2][r];
		return jsx`<tr>
			<td>${cols[0][r] === undefined ? null : DiaCell(cols[0][r], true)}</td>
			<td colspan=${c3 === undefined ? 2 : 1}>${cols[1][r] === undefined ? null : DiaCell(cols[1][r], true)}</td>
			${c3 === undefined ? null : jsx`<td>${DiaCell(c3, true)}</td>`}
		</tr>`;
	});
	return jsx`<table class="dia">${rows}</table>`;
}

function Diacritics() {
	return jsx`
		${DiaTable(DIACRITICS)}`;
}

// --------------------------------------------------------------- sheet

export function Chart() {
	return jsx`
		<${Layout}
			title="The IPA chart, with keystrokes and audio"
			desc="The IPA chart with IPAbet keystrokes beside every symbol: one printable sheet covering pulmonic and non-pulmonic consonants, vowels, diacritics, suprasegmentals, and tones."
			path="/chart"
			styles=${[chartCss]}
		>
			<p class="webnav"><a href="/">← IPAbet</a> · <a href=${chartPdf} download="ipabet-chart.pdf">Download printable PDF</a> (one page) · or ⌘P.</p>
			<div class="sheet">
				<h1>THE INTERNATIONAL PHONETIC ALPHABET <i>in IPAbet keystrokes</i></h1>

				<h3>CONSONANTS (PULMONIC)</h3>
				<${PulmonicTable} />

				<div class="row">
					<div class="lower-left">
						<h3>CONSONANTS (NON-PULMONIC)</h3>
						<${NonPulmonic} />
						<h3>OTHER SYMBOLS</h3>
						<div class="cols2">${otherSymbols()}</div>
						<h3>DIACRITICS</h3>
						<${Diacritics} />
					</div>
					<div class="lower-right">
						<h3>VOWELS</h3>
						<${VowelChart} />
						<h3>SUPRASEGMENTALS</h3>
						<div class="cols2">${list(SUPRASEGMENTALS)}</div>
						<h3>TONES AND WORD ACCENTS</h3>
						<${ToneTable} />
					</div>
				</div>

				<p class="attrib"><span class="screen-only">Click any symbol to hear it — as data: <a href="/chart.json">chart.json</a> · <a href="/keys">keys</a>; audio from Wikimedia Commons (Peter Isotalo, UCLA Phonetics Lab Archive 2003, et al.), free/copyleft licenses. </span>IPA chart © 2015 International Phonetic Association, CC BY-SA 3.0; this sheet likewise · ipabet.org</p>
			</div>
			<script type="module" src=${chartAudio}></script>
		<//>`;
}

// ------------------------------------------------------- machine-readable

// GET /chart.json — the same sheet as structured data, rendered from the same
// tables so a symbol cannot appear on one and not the other.

interface JsonSymbol {
	glyph: string;
	cp: string;
	keys: string | null;
	name?: string;
}

function sym(glyph: string, name?: string, fallback?: string): JsonSymbol {
	const key = reverse.get(glyph);
	const keys = key !== undefined ? keySpelled(key) : (fallback ?? null);
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
			"Notation: ⇧ Shift, ⌥ Option; a space separates keystrokes, but a " +
			"shift-modifier binds to the base it transforms (s⇧H). Combining " +
			"diacritics are typed before their base (dead-key style); spacing marks " +
			"after. The voiced velar plosive shows as plain g (U+0067), the bare " +
			"key; the single-story script ɡ (U+0261) is typed as g⇧G (the " +
			"doubled-letter law), and both stand for that plosive. " +
			"Canonical spec: /ipabet.json.",
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
			rule: "any base + ⌥⇧q",
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
