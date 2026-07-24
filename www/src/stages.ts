// The /learn syllabus: each stage unlocks a set of glyphs. Order = teaching
// order. scripts/harvest-words.ts assigns every harvested word to the first
// stage whose glyph set covers it.
// (Judgment call on boundaries — tune freely; the machinery doesn't care.)
export interface Stage { id: string; title: string; note: string; glyphs: string; }
export const STAGES: Stage[] = [
	{id: "free", title: "The free alphabet", glyphs: "pbtdkgmnfvszlwhaeiouə",
		note: "Most keys already type their own IPA sound. Vowels are cardinal (ah eh ee oh oo, not English), and g is always hard. Plus the schwa ə on 5 ⇧H — English’s most common vowel."},
	{id: "false-friends", title: "False friends", glyphs: "cjqrxyɾ",
		note: "Same letters, different sounds: r is a trill, j is “y”, x is the loch sound, y is a rounded vowel, q is uvular, c is palatal. And 4 ⇧H is the quick tap ɾ — the trill’s single-flap cousin (Spanish pero vs. perro)."},
	{id: "digraphs", title: "English digraphs", glyphs: "ʃθðŋʒ",
		note: "The sh/th/ng you already spell: ⇧H spirantizes, ⇧G goes dorsal."},
	{id: "vowels", title: "The English vowels", glyphs: "ɪʊɛɔæʌ",
		note: "English’s lax vowels — where real English words open up."},
	{id: "place", title: "Place shifts", glyphs: "ʈɖɳɭʂʐɻɽɟʝʎɲɕʑɥʟʀɴɢʁ",
		note: "The productive operators: ⇧R retroflex, ⇧J palatal, ⇧Q/⇧G dorsal."},
	{id: "fricatives", title: "Fricatives & rounding", glyphs: "ɸβçχɣɦʋʍɹøœɤɯɰʉɐɑɒɜɞɘʏɶɵɬɮɺɱⱱ",
		note: "⇧H opens stops to fricatives; ⇧W rounds/flips vowels."},
	{id: "guttural", title: "The throat & no-Latin keys", glyphs: "ʔʕħɨʜʢʡ",
		note: "The shifted-number row: glottal, pharyngeal, uvular — mnemonic from Arabizi."},
	{id: "marks", title: "Diacritics", glyphs: "",  // combining marks handled specially
		note: "The Option layer: nasalization, length, stress, tone, rhoticity."},
	{id: "exotic", title: "The exotic corners", glyphs: "ʘǀǃǂǁɓɗɠʄʛʙʼ",
		note: "Non-pulmonic airstreams: clicks, implosives, ejectives."},
];
