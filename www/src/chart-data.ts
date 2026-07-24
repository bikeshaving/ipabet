// The IPA chart's non-grid sections, as data. /chart is the official IPA chart
// (2015, CC BY-SA) with IPAbet keystrokes beside every symbol, so it contains
// IPA symbols and nothing else.

export interface ChartEntry {
	/** the IPA symbol, with ◌ where it's a combining mark */
	glyph: string;
	/** the keystrokes, space-separated. "~x"=⌥x, "~+x"=⌥⇧x, "+x"=⇧x, "x"=x */
	keys: string;
	/** what it means, as the IPA chart names it */
	name: string;
	/** the base glyph the mark is demonstrated on, as the chart prints it */
	on?: string;
	/** the ATOM the demo base+mark fuses to (overlay fusion), for the typing test */
	fuses?: string;
	/** keystrokes producing `on`. Defaults to `on` itself when it's its own key. */
	onKeys?: string;
}

/** The 31 diacritics of the official chart, in its order. */
export const DIACRITICS: ChartEntry[] = [
	{glyph: "◌̥", keys: "~+k", name: "Voiceless", on: "n"},
	{glyph: "◌̬", keys: "~+v", name: "Voiced", on: "s"},
	{glyph: "ʰ", keys: "~z h", name: "Aspirated", on: "t"},
	{glyph: "◌̹", keys: "~+w", name: "More rounded", on: "ɔ", onKeys: "o +H"},
	{glyph: "◌̜", keys: "~w", name: "Less rounded", on: "ɔ", onKeys: "o +H"},
	{glyph: "◌̟", keys: "~+=", name: "Advanced", on: "u"},
	{glyph: "◌̠", keys: "~=", name: "Retracted", on: "e"},
	{glyph: "◌̈", keys: "~u", name: "Centralized", on: "e"},
	{glyph: "◌̽", keys: "~x", name: "Mid-centralized", on: "e"},
	{glyph: "◌̩", keys: "~s", name: "Syllabic", on: "n"},
	{glyph: "◌̯", keys: "~o", name: "Non-syllabic", on: "e"},
// ⌥r emits the spacing hook and the font joins it (Unicode has no combining
// rhotic hook). ə and ɜ fuse to precomposed ɚ/ɝ; every other vowel takes the bare hook.
	{glyph: "˞", keys: "~r", name: "Rhoticity", on: "ə", onKeys: "5 +H", fuses: "ɚ"},
	{glyph: "◌̤", keys: "~+u", name: "Breathy voiced", on: "b"},
	{glyph: "◌̰", keys: "~+n", name: "Creaky voiced", on: "b"},
	{glyph: "◌̼", keys: "~l", name: "Linguolabial", on: "t"},
	{glyph: "ʷ", keys: "~z w", name: "Labialized", on: "t"},
	{glyph: "ʲ", keys: "~z j", name: "Palatalized", on: "t"},
	{glyph: "ˠ", keys: "~z g +H", name: "Velarized", on: "t"},
	{glyph: "ˤ", keys: "~z 3 +H", name: "Pharyngealized", on: "t"},
	{glyph: "◌̴", keys: "~+y", name: "Velarized or pharyngealized", on: "l", fuses: "ɫ"},
	{glyph: "◌̝", keys: "~+g", name: "Raised", on: "e"},
	{glyph: "◌̞", keys: "~g", name: "Lowered", on: "e"},
	{glyph: "◌̘", keys: "~+h", name: "Advanced tongue root", on: "e"},
	{glyph: "◌̙", keys: "~h", name: "Retracted tongue root", on: "e"},
	{glyph: "◌̪", keys: "~t", name: "Dental", on: "t"},
	{glyph: "◌̺", keys: "~d", name: "Apical", on: "t"},
	{glyph: "◌̻", keys: "~+d", name: "Laminal", on: "t"},
	{glyph: "◌̃", keys: "~n", name: "Nasalized", on: "e"},
	{glyph: "ⁿ", keys: "~z n", name: "Nasal release", on: "d"},
	{glyph: "ˡ", keys: "~z l", name: "Lateral release", on: "d"},
	{glyph: "◌̚", keys: "~0", name: "No audible release", on: "d"},
];

export const SUPRASEGMENTALS: ChartEntry[] = [
	{glyph: "ˈ", keys: "~'", name: "Primary stress"},
	{glyph: "ˌ", keys: "~+'", name: "Secondary stress"},
	{glyph: "ː", keys: "~;", name: "Long"},
	{glyph: "ˑ", keys: "~+;", name: "Half-long"},
	{glyph: "◌̆", keys: "~b", name: "Extra-short", on: "e"},
	{glyph: "|", keys: "|", name: "Minor (foot) group"},
	{glyph: "‖", keys: "~+l", name: "Major (intonation) group"},
	{glyph: ".", keys: ".", name: "Syllable break"},
	{glyph: "‿", keys: "~+j ~+j", name: "Linking (absence of a break)"},
];

export const TONES: ChartEntry[] = [
	{glyph: "◌̋", keys: "~+e", name: "Extra high", on: "e"},
	{glyph: "◌́", keys: "~e", name: "High", on: "e"},
	{glyph: "◌̄", keys: "~a", name: "Mid", on: "e"},
	{glyph: "◌̀", keys: "~`", name: "Low", on: "e"},
	{glyph: "◌̏", keys: "~+`", name: "Extra low", on: "e"},
	{glyph: "◌̌", keys: "~v", name: "Rising", on: "e"},
	{glyph: "◌̂", keys: "~i", name: "Falling", on: "e"},
	{glyph: "◌᷄", keys: "~e ~+e", name: "High rising", on: "e"},
	{glyph: "◌᷅", keys: "~+` ~`", name: "Low rising", on: "e"},
	{glyph: "◌᷈", keys: "~a ~e ~a", name: "Rising-falling", on: "e"},
	{glyph: "˥", keys: "~5", name: "Extra high (tone letter)"},
	{glyph: "˦", keys: "~4", name: "High (tone letter)"},
	{glyph: "˧", keys: "~3", name: "Mid (tone letter)"},
	{glyph: "˨", keys: "~2", name: "Low (tone letter)"},
	{glyph: "˩", keys: "~1", name: "Extra low (tone letter)"},
	// Contour tone letters are the level bars typed in order (⌥1–⌥5); a tone-contour
	// font joins the run into one rising/falling trace.
	{glyph: "˩˥", keys: "~1 ~5", name: "Rising (tone letter)"},
	{glyph: "˥˩", keys: "~5 ~1", name: "Falling (tone letter)"},
	{glyph: "˦˥", keys: "~4 ~5", name: "High rising (tone letter)"},
	{glyph: "˩˨", keys: "~1 ~2", name: "Low rising (tone letter)"},
	{glyph: "˧˦˧", keys: "~3 ~4 ~3", name: "Rising-falling (tone letter)"},
	// The tone row in increasing scope: ⌥1–5 the level bars, ⌥6 relative step,
	// ⌥7 global contour. Shift is the upward member of both arrow pairs.
	{glyph: "ꜜ", keys: "~6", name: "Downstep"},
	{glyph: "ꜛ", keys: "~+6", name: "Upstep"},
	{glyph: "↗", keys: "~+7", name: "Global rise"},
	{glyph: "↘", keys: "~7", name: "Global fall"},
];
