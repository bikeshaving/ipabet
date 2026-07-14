import {jsx} from "@b9g/crank/jsx-tag";
import spec from "../../spec/ipabet.json";
import {Layout} from "./layout.ts";
import {keyText, formatCompact as display} from "./keystrokes.ts";
// @ts-ignore — Shovel rewrites these to hashed asset URLs at build time.
import chartPdf from "./chart.pdf" with {assetBase: "/assets/"};
// @ts-ignore
import chartCss from "./styles/chart.css" with {assetBase: "/assets/"};
// @ts-ignore
import chartAudio from "./chart-audio-client.ts" with {assetBase: "/assets/"};
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


/** A glyph with its keystrokes beneath. `fallback` annotates glyphs typed
 * outside the letters table (native keys, mark sequences). */
function G(glyph: string, fallback?: string) {
	const key = reverse.get(glyph);
	const label = key !== undefined ? keyText(key) : fallback;
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
	["Plosive", [{vl: "p", vd: "b"}, {}, {vl: "t", vd: "d", span: 3}, {vl: "ʈ", vd: "ɖ"}, {vl: "c", vd: "ɟ"}, {vl: "k", vd: "ɡ"}, {vl: "q", vd: "ɢ"}, {shr: true}, {vl: "ʔ", shr: true}]],
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
	["t͡s", "Affricate (tie bar)", "t ⇧6 s"],
	["ɧ", "Simultaneous ʃ and x"],
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
				<div class="fine">…any voiceless obstruent + ⇧X</div>
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
				const url = AUDIO[v.g];
				return jsx`
					${v.dot ? jsx`<circle cx=${x} cy=${y} r="2.2" />` : null}
					<text class="v" data-audio=${url} role=${url === undefined ? undefined : "button"} tabindex=${url === undefined ? undefined : "0"} x=${gx} y=${y + 5} text-anchor="middle">${v.g}</text>
					${key === undefined ? null : jsx`<text class="k" x=${gx} y=${y + 18} text-anchor="middle">${keyText(key)}</text>`}`;
			})}
		</svg>
		<p class="fine">Where symbols appear in pairs, the one to the right represents a rounded vowel.</p>`;
}

// ----------------------------------------------------------- diacritics


function cp(glyph: string): string {
	return [...glyph].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

/** One diacritic entry, carrying its own data on the element for scrapers. */
function DiaCell(e: ChartEntry) {
	const shown = e.glyph.startsWith("◌") && e.on ? e.on + e.glyph.slice(1) : e.glyph;
	const bare = e.glyph.startsWith("◌") ? e.glyph.slice(1) : e.glyph;
	return jsx`<div class="li" data-glyph=${bare} data-cp=${cp(bare)} data-keys=${display(e.keys)} data-name=${e.name}><b class="ipa">${shown}</b><i>${display(e.keys)}</i><span class="nm">${e.name}</span></div>`;
}

function list(entries: ChartEntry[]) {
	return entries.map((e) => DiaCell(e));
}

// The count and the tail of this list come from the spec's `ipa: false` flag.
const beyondCount = String((spec.marks as {ipa?: boolean}[]).filter((m) => m.ipa === false).length);

function Diacritics() {
	return jsx`
		<div class="cols2">${list(DIACRITICS)}</div>
		<p class="fine">Combining diacritics are prefix, dead-key style like é/ñ: type the ⌥ mark, then the base (<i>⌥e</i> <i>a</i> → <b class="ipa">á</b>); they stack. ⌥⇧ gives a mark's second form (<i>⌥⇧n</i> → creaky); where the two are values of one feature — advanced/retracted, apical/laminal — the second <em>replaces</em> the first rather than stacking. Spacing marks — length, tone, stress — are postfix: base then mark. <b class="ipa">ʰ</b> and all superscripts: glyph then <i>⌥p</i>. Rhoticity <b class="ipa">˞</b>: vowel then <i>⇧R</i>. The ${beyondCount} diacritics beyond the IPA — cedilla, ogonek, horn, ß and the rest — are on <a href="/keys">/keys</a>.</p>`;
}

// --------------------------------------------------------------- sheet

export function Chart() {
	return jsx`
		<${Layout}
			title="The IPAbet chart — the IPA in keystrokes"
			desc="The IPA chart with IPAbet keystrokes beside every symbol: one printable sheet covering pulmonic and non-pulmonic consonants, vowels, diacritics, suprasegmentals, and tones."
			styles=${[chartCss]}
		>
			<p class="webnav"><a href="/">← IPAbet</a> · <a href=${chartPdf} download="ipabet-chart.pdf">Download printable PDF</a> (one page) · or ⌘P.</p>
			<div class="sheet">
				<h1>THE INTERNATIONAL PHONETIC ALPHABET <i>in IPAbet keystrokes</i></h1>

				<h3>CONSONANTS (PULMONIC)</h3>
				<${PulmonicTable} />

				<div class="row">
					<div>
						<h3>CONSONANTS (NON-PULMONIC)</h3>
						<${NonPulmonic} />
						<h3>OTHER SYMBOLS</h3>
						<div class="cols2">${otherSymbols()}</div>
						<h3>SUPRASEGMENTALS</h3>
						<div class="cols2">${list(SUPRASEGMENTALS)}</div>
					</div>
					<div>
						<h3>VOWELS</h3>
						<${VowelChart} />
						<h3>TONES AND WORD ACCENTS</h3>
						<div class="cols2">${list(TONES)}</div>
					</div>
				</div>

				<h3>DIACRITICS</h3>
				<${Diacritics} />

				<p class="attrib">Click any symbol to hear it. Keystrokes: blue monospace beside each symbol; ⇧-digits and trailing capitals are shifted; combining ⌥ marks are typed before their base (dead-key style), spacing marks after.
				This chart as data: <a href="/chart.json">chart.json</a> · every keystroke: <a href="/keys">keys</a>. <b>Beta — provisional; keystrokes may change between releases.</b>
				Audio: Wikimedia Commons (Peter Isotalo, UCLA Phonetics Lab Archive 2003, et al.), free/copyleft licenses, re-hosted with attribution.
				Layout derived from <a href="https://www.internationalphoneticassociation.org/content/ipa-chart">The International Phonetic Alphabet (revised to 2015)</a>,
				© 2015 International Phonetic Association, CC BY-SA 3.0. This sheet is likewise CC BY-SA · <a href="https://ipabet.org">ipabet.org</a></p>
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
