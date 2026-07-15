// The IPA chart's non-grid sections, as data.
//
// /chart is the official IPA chart (2015, CC BY-SA) with IPAbet keystrokes
// printed beside every symbol. It therefore contains IPA symbols and nothing
// else: no Latin tenants (cedilla, ogonek, dot-above, horn, hỏi hook) and no
// extra-IPA tradition marks (Korean fortis). Those are real and typeable —
// they're on /keys and in ipabet.json with `"ipa": false` — but not on the
// chart the chart is of. (ß is the s⇧S ligature digraph, a segment not a mark.)
//
// These live in data, not markup, for two reasons: `/chart.json` serves them
// verbatim to machines, and js/test/chart.test.ts types every `keys` string
// through the engine to prove the label produces the glyph. Hardcoded labels
// silently drifted twice before this existed (secondary stress and half-long
// still described the double-press cycling we retired in 2024).

export interface ChartEntry {
	/** the IPA symbol, with ◌ where it's a combining mark */
	glyph: string;
	/** the keystrokes, space-separated. "~x"=⌥x, "~+x"=⌥⇧x, "+x"=⇧x, "x"=x */
	keys: string;
	/** what it means, as the IPA chart names it */
	name: string;
	/** the base glyph the mark is demonstrated on, as the chart prints it */
	on?: string;
	/** keystrokes producing `on`. Defaults to `on` itself when it's its own key. */
	onKeys?: string;
}

/** The 31 diacritics of the official chart, in its order. */
export const DIACRITICS: ChartEntry[] = [
	{glyph: "◌̊", keys: "~k", name: "Voiceless", on: "n"},
	{glyph: "◌̬", keys: "~+v", name: "Voiced", on: "d"},
	{glyph: "ʰ", keys: "h ~q", name: "Aspirated", on: "t"},
	{glyph: "◌̹", keys: "~+w", name: "More rounded", on: "ɔ", onKeys: "o +H"},
	{glyph: "◌̜", keys: "~w", name: "Less rounded", on: "ɔ", onKeys: "o +H"},
	{glyph: "◌̟", keys: "~+=", name: "Advanced", on: "u"},
	{glyph: "◌̠", keys: "~=", name: "Retracted", on: "e"},
	{glyph: "◌̈", keys: "~u", name: "Centralized", on: "e"},
	{glyph: "◌̽", keys: "~x", name: "Mid-centralized", on: "e"},
	{glyph: "◌̩", keys: "~s", name: "Syllabic", on: "n"},
	{glyph: "◌̯", keys: "~+b", name: "Non-syllabic", on: "e"},
	// ⌥r emits the spacing hook and the font joins it to the vowel (Unicode has
	// no combining rhotic hook). ə ⌥r and ɜ ⌥r fuse to the precomposed ɚ/ɝ;
	// every other vowel takes the bare hook, so `a` is the honest demo base.
	{glyph: "˞", keys: "~r", name: "Rhoticity", on: "a"},
	{glyph: "◌̤", keys: "~+u", name: "Breathy voiced", on: "b"},
	{glyph: "◌̰", keys: "~+n", name: "Creaky voiced", on: "b"},
	{glyph: "◌̼", keys: "~9", name: "Linguolabial", on: "t"},
	{glyph: "ʷ", keys: "w ~q", name: "Labialized", on: "t"},
	{glyph: "ʲ", keys: "j ~q", name: "Palatalized", on: "t"},
	{glyph: "ˠ", keys: "g +H ~q", name: "Velarized", on: "t"},
	{glyph: "ˤ", keys: "3 +h ~q", name: "Pharyngealized", on: "t"},
	{glyph: "◌̴", keys: "~+l", name: "Velarized or pharyngealized", on: "t"},
	{glyph: "◌̝", keys: "~+g", name: "Raised", on: "e"},
	{glyph: "◌̞", keys: "~g", name: "Lowered", on: "e"},
	{glyph: "◌̘", keys: "~+h", name: "Advanced tongue root", on: "e"},
	{glyph: "◌̙", keys: "~h", name: "Retracted tongue root", on: "e"},
	{glyph: "◌̪", keys: "~t", name: "Dental", on: "t"},
	{glyph: "◌̺", keys: "~d", name: "Apical", on: "t"},
	{glyph: "◌̻", keys: "~+d", name: "Laminal", on: "t"},
	{glyph: "◌̃", keys: "~n", name: "Nasalized", on: "e"},
	{glyph: "ⁿ", keys: "n ~q", name: "Nasal release", on: "d"},
	{glyph: "ˡ", keys: "l ~q", name: "Lateral release", on: "d"},
	{glyph: "◌̚", keys: "~f", name: "No audible release", on: "d"},
];

export const SUPRASEGMENTALS: ChartEntry[] = [
	{glyph: "ˈ", keys: "~'", name: "Primary stress"},
	{glyph: "ˌ", keys: "~+'", name: "Secondary stress"},
	{glyph: "ː", keys: "~;", name: "Long"},
	{glyph: "ˑ", keys: "~+;", name: "Half-long"},
	{glyph: "◌̆", keys: "~b", name: "Extra-short", on: "e"},
	{glyph: "|", keys: "|", name: "Minor (foot) group"},
	{glyph: "‖", keys: "~+z", name: "Major (intonation) group"},
	{glyph: ".", keys: ".", name: "Syllable break"},
	{glyph: "‿", keys: "~z", name: "Linking (absence of a break)"},
];

export const TONES: ChartEntry[] = [
	{glyph: "◌̋", keys: "~+e", name: "Extra high", on: "e"},
	{glyph: "◌́", keys: "~e", name: "High", on: "e"},
	{glyph: "◌̄", keys: "~a", name: "Mid", on: "e"},
	{glyph: "◌̀", keys: "~`", name: "Low", on: "e"},
	{glyph: "◌̏", keys: "~+`", name: "Extra low", on: "e"},
	{glyph: "◌̌", keys: "~v", name: "Rising", on: "e"},
	{glyph: "◌̂", keys: "~i", name: "Falling", on: "e"},
	{glyph: "˥", keys: "~5", name: "Extra high (tone letter)"},
	{glyph: "˦", keys: "~4", name: "High (tone letter)"},
	{glyph: "˧", keys: "~3", name: "Mid (tone letter)"},
	{glyph: "˨", keys: "~2", name: "Low (tone letter)"},
	{glyph: "˩", keys: "~1", name: "Extra low (tone letter)"},
	{glyph: "ꜜ", keys: "~o", name: "Downstep"},
	{glyph: "ꜛ", keys: "~+o", name: "Upstep"},
	{glyph: "↗", keys: "~+y", name: "Global rise"},
	{glyph: "↘", keys: "~y", name: "Global fall"},
];
