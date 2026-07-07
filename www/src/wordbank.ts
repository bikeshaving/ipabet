import {typeKeys, type Keystroke} from "../../js/src/index.ts";

// The /learn word bank. Words are authored as KEYSTROKE sequences; the engine
// computes the IPA (so every entry is guaranteed typeable and correct), and a
// word's STAGE is *derived* — it's the latest stage among the glyphs it needs,
// so a word unlocks exactly when its last glyph does. Progressive disclosure
// falls out of the data instead of being hand-tagged.

// Compact keystroke notation: "s" bare · "+h" ⇧ · "~n" ⌥ · "~+2" ⌥⇧.
function seq(...keys: string[]): Keystroke[] {
	return keys.map((k) => {
		let shift = false, option = false, key = k;
		while (key[0] === "+" || key[0] === "~") {
			if (key[0] === "+") shift = true; else option = true;
			key = key.slice(1);
		}
		return {key, shift, option};
	});
}
function label(k: string): string {
	let shift = false, option = false, key = k;
	while (key[0] === "+" || key[0] === "~") {
		if (key[0] === "+") shift = true; else option = true;
		key = key.slice(1);
	}
	return (option ? "⌥" : "") + (shift ? "⇧" : "") + (shift && /[a-z]/.test(key) ? key.toUpperCase() : key);
}

// ---- Syllabus: each stage unlocks a set of glyphs. Order = teaching order.
// (Judgment call on boundaries — tune freely; the machinery doesn't care.)
export interface Stage { id: string; title: string; note: string; glyphs: string; }
export const STAGES: Stage[] = [
	{id: "free", title: "The free alphabet", glyphs: "pbtdkgmnfvszlwhaeiouə",
		note: "Most keys already type their own IPA sound. Vowels are cardinal (ah eh ee oh oo, not English), and g is always hard. Plus the schwa ə on ⇧5 — English’s most common vowel."},
	{id: "false-friends", title: "False friends", glyphs: "cjqrxyɾ",
		note: "Same letters, different sounds: r is a trill, j is “y”, x is the loch sound, y is a rounded vowel, q is uvular, c is palatal. And ⇧4 is the quick tap ɾ — the trill’s single-flap cousin (Spanish pero vs. perro)."},
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

const STAGE_OF: Record<string, number> = {};
STAGES.forEach((s, i) => { for (const g of s.glyphs) STAGE_OF[g] = i; });
const MARKS_STAGE = STAGES.findIndex((s) => s.id === "marks");
const LAST = STAGES.length - 1;
function isCombining(cp: number): boolean {
	return (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1dc0 && cp <= 0x1dff) ||
		(cp >= 0x02b0 && cp <= 0x02ff && cp !== 0x02bc); // spacing modifiers as marks, except ejective
}

// ---- Words: {w, lang, gloss?, keys}. Everything else is derived.
interface Src { w: string; lang: string; gloss?: string; keys: string[]; }
const SRC: Src[] = [
	// free alphabet — Spanish/Italian, cardinal vowels + free consonants
	{w: "sí", lang: "es", gloss: "yes", keys: ["s", "i"]},
	{w: "no", lang: "es", gloss: "no", keys: ["n", "o"]},
	{w: "luna", lang: "es", gloss: "moon", keys: ["l", "u", "n", "a"]},
	{w: "dedo", lang: "es", gloss: "finger", keys: ["d", "e", "d", "o"]},
	{w: "mano", lang: "es", gloss: "hand", keys: ["m", "a", "n", "o"]},
	{w: "sopa", lang: "es", gloss: "soup", keys: ["s", "o", "p", "a"]},
	{w: "gato", lang: "es", gloss: "cat", keys: ["g", "a", "t", "o"]},
	{w: "pane", lang: "it", gloss: "bread", keys: ["p", "a", "n", "e"]},
	{w: "sole", lang: "it", gloss: "sun", keys: ["s", "o", "l", "e"]},
	// false friends — the letter lies; the foreign word tells the truth
	{w: "perro", lang: "es", gloss: "dog", keys: ["p", "e", "r", "o"]},
	{w: "pero", lang: "es", gloss: "but", keys: ["p", "e", "+4", "o"]},
	{w: "rojo", lang: "es", gloss: "red", keys: ["r", "o", "x", "o"]},
	{w: "niño", lang: "es", gloss: "child", keys: ["n", "i", "n", "+j", "o"]},
	{w: "ajo", lang: "es", gloss: "garlic", keys: ["a", "x", "o"]},
	{w: "tu", lang: "fr", gloss: "you", keys: ["t", "y"]},
	{w: "ja", lang: "de", gloss: "yes", keys: ["j", "a"]},
	{w: "qamar", lang: "ar", gloss: "moon", keys: ["q", "a", "m", "a", "r"]},
	// digraphs — sparse in real words (English th/sh need English vowels → next stage)
	{w: "she", lang: "en", keys: ["s", "+h", "i"]},
	{w: "sci", lang: "it", gloss: "ski", keys: ["s", "+h", "i"]},
	// English vowels — the floodgate
	{w: "ship", lang: "en", keys: ["s", "+h", "i", "+h", "p"]},
	{w: "thing", lang: "en", keys: ["t", "+h", "i", "+h", "n", "+g"]},
	{w: "this", lang: "en", keys: ["d", "+h", "i", "+h", "s"]},
	{w: "sing", lang: "en", keys: ["s", "i", "+h", "n", "+g"]},
	{w: "cat", lang: "en", keys: ["k", "a", "+e", "t"]},
	{w: "bed", lang: "en", keys: ["b", "e", "+h", "d"]},
	{w: "dog", lang: "en", keys: ["d", "o", "+h", "g"]},
	{w: "sun", lang: "en", keys: ["s", "a", "+u", "n"]},
	// diphthongs (English, rhotic-free)
	{w: "eye", lang: "en", keys: ["a", "i", "+h"]},
	{w: "how", lang: "en", keys: ["h", "a", "u", "+h"]},
	{w: "boy", lang: "en", keys: ["b", "o", "+h", "i", "+h"]},
	{w: "day", lang: "en", keys: ["d", "e", "i", "+h"]},
	// fricatives & rounding — French/German
	{w: "peu", lang: "fr", gloss: "little", keys: ["p", "e", "+w"]},
	{w: "feu", lang: "fr", gloss: "fire", keys: ["f", "e", "+w"]},
	{w: "ich", lang: "de", gloss: "I", keys: ["i", "+h", "c", "+h"]},
	{w: "rouge", lang: "fr", gloss: "red", keys: ["r", "+q", "u", "z", "+h"]},
	{w: "huit", lang: "fr", gloss: "eight", keys: ["w", "+j", "i", "t"]},
	// the throat — Arabic
	{w: "ʕarabī", lang: "ar", gloss: "Arabic", keys: ["+3", "a", "r", "a", "b", "i"]},
	{w: "ħabīb", lang: "ar", gloss: "beloved", keys: ["+7", "a", "b", "i", "~;", "b"]},
	// diacritics — French nasal vowels
	{w: "vin", lang: "fr", gloss: "wine", keys: ["v", "e", "+h", "~n"]},
	{w: "bon", lang: "fr", gloss: "good", keys: ["b", "o", "+h", "~n"]},
	{w: "blanc", lang: "fr", gloss: "white", keys: ["b", "l", "a", "+o", "~n"]},
];

export interface Word { w: string; lang: string; gloss?: string; ipa: string; keys: string[]; stage: number; }

export const WORDBANK: Word[] = SRC.map((s): Word => {
	const ipa = typeKeys(seq(...s.keys));
	let stage = 0;
	for (const ch of ipa) {
		const cp = ch.codePointAt(0)!;
		const st = isCombining(cp) ? MARKS_STAGE : (STAGE_OF[ch] ?? LAST);
		if (st > stage) stage = st;
	}
	return {w: s.w, lang: s.lang, gloss: s.gloss, ipa, keys: s.keys.map(label), stage};
});

// Words drillable by the time you've cleared stage `n` (0-indexed).
export function unlockedBy(n: number): Word[] {
	return WORDBANK.filter((w) => w.stage <= n);
}

// Self-check / preview: `bun src/wordbank.ts`
// @ts-ignore
if (import.meta.main) {
	STAGES.forEach((s, i) => {
		const ws = WORDBANK.filter((w) => w.stage === i);
		console.log(`\n[${i}] ${s.title}  (${s.glyphs || "marks"})`);
		for (const w of ws) console.log(`     ${w.lang}  ${w.w.padEnd(9)} → /${w.ipa}/   ${(w.gloss ? "(" + w.gloss + ")" : "").padEnd(12)} ${w.keys.join(" ")}`);
	});
}
