import {typeKeys, type Keystroke} from "../../js/src/index.ts";

// The graded IPAbet course — a fixed, hand-designed touch-typing syllabus.
// Words are authored as KEYSTROKE sequences so the pronunciation is controlled
// exactly; the engine computes the broad transcription (guaranteeing every word
// is typeable and showing the real output for review). Order is deliberate: the
// plain keyboard, then the English vowels, the digraphs you already spell,
// diphthongs, and only then outward to the sounds English lacks. Each new sound
// is introduced by a word that contains it and uses only sounds taught earlier;
// review words COMBINE the new sound with recent ones rather than re-drilling an
// old one alone. Every word is tagged with its language. No generation, no
// random — that's a later practice mode.

// compact keys: "s" bare · "+h" ⇧ · "~n" ⌥ · "+5" ⇧5
function seq(...keys: string[]): Keystroke[] {
	return keys.map((k) => {
		let shift = false, option = false, key = k;
		while (key[0] === "+" || key[0] === "~") { if (key[0] === "+") shift = true; else option = true; key = key.slice(1); }
		return {key, shift, option};
	});
}
function label(k: string): string {
	let shift = false, option = false, key = k;
	while (key[0] === "+" || key[0] === "~") { if (key[0] === "+") shift = true; else option = true; key = key.slice(1); }
	return (option ? "⌥" : "") + (shift ? "⇧" : "") + (shift && /[a-z]/.test(key) ? key.toUpperCase() : key);
}
// w(display, language, gloss/note, ...keys) — gloss "" for none
function w(word: string, lang: string, gloss: string, ...keys: string[]) {
	return {word, lang, gloss, target: typeKeys(seq(...keys)), labels: keys.map(label)};
}
const en = (word: string, ...keys: string[]) => w(word, "English", "", ...keys); // English words are the default material

export interface Lesson {
	title: string;
	sound?: string;
	keys?: string[];
	intro: string;
	words: ReturnType<typeof w>[];
}

export const CURRICULUM: Lesson[] = [
	// ── Phase 0 · the plain keyboard ────────────────────────────────
	{title: "The plain keyboard", intro: "Every unshifted key types its plain sound. The vowels are pure and continental — a is “ah”, e is “eh”, i is “ee”, o is “oh”, u is “oo” — not their English names. You already know where these keys are.", words: [
		en("me", "m", "i"), en("we", "w", "i"), en("see", "s", "i"), en("do", "d", "u"), en("who", "h", "u"), en("too", "t", "u"),
		w("no", "Spanish", "no", "n", "o"), w("luna", "Spanish", "moon", "l", "u", "n", "a"),
		w("gato", "Spanish", "cat", "g", "a", "t", "o"), w("sopa", "Spanish", "soup", "s", "o", "p", "a"),
	]},

	// ── Phase 1 · the English vowels (⇧ relaxes the vowel before it) ──
	{title: "The vowel in “sit”", sound: "ɪ", keys: ["i", "⇧H"], intro: "The short, relaxed vowel in “sit”.", words: [
		en("sit", "s", "i", "+h", "t"), en("it", "i", "+h", "t"), en("in", "i", "+h", "n"), en("pin", "p", "i", "+h", "n"),
		en("tip", "t", "i", "+h", "p"), en("kid", "k", "i", "+h", "d"), en("big", "b", "i", "+h", "g"),
		en("milk", "m", "i", "+h", "l", "k"), en("wind", "w", "i", "+h", "n", "d"),
	]},
	{title: "The vowel in “pen”", sound: "ɛ", keys: ["e", "⇧H"], intro: "The vowel in “pen”.", words: [
		en("pen", "p", "e", "+h", "n"), en("ten", "t", "e", "+h", "n"), en("bed", "b", "e", "+h", "d"), en("get", "g", "e", "+h", "t"),
		en("men", "m", "e", "+h", "n"), en("best", "b", "e", "+h", "s", "t"),
		en("dentist", "d", "e", "+h", "n", "t", "i", "+h", "s", "t"), en("invest", "i", "+h", "n", "v", "e", "+h", "s", "t"),
	]},
	{title: "The vowel in “cat”", sound: "æ", keys: ["a", "⇧E"], intro: "The vowel in “cat”.", words: [
		en("cat", "k", "a", "+e", "t"), en("map", "m", "a", "+e", "p"), en("man", "m", "a", "+e", "n"), en("bad", "b", "a", "+e", "d"),
		en("back", "b", "a", "+e", "k"), en("hand", "h", "a", "+e", "n", "d"),
		en("napkin", "n", "a", "+e", "p", "k", "i", "+h", "n"), en("basket", "b", "a", "+e", "s", "k", "i", "+h", "t"),
	]},
	{title: "The vowel in “put”", sound: "ʊ", keys: ["u", "⇧H"], intro: "The short vowel in “put”.", words: [
		en("put", "p", "u", "+h", "t"), en("full", "f", "u", "+h", "l"), en("book", "b", "u", "+h", "k"), en("good", "g", "u", "+h", "d"),
		en("pull", "p", "u", "+h", "l"), en("foot", "f", "u", "+h", "t"), en("bullet", "b", "u", "+h", "l", "i", "+h", "t"),
	]},
	{title: "The vowel in “dog”", sound: "ɔ", keys: ["o", "⇧H"], intro: "The open vowel in “dog”.", words: [
		en("dog", "d", "o", "+h", "g"), en("off", "o", "+h", "f"), en("on", "o", "+h", "n"), en("lost", "l", "o", "+h", "s", "t"),
		en("soft", "s", "o", "+h", "f", "t"), en("boss", "b", "o", "+h", "s"), en("pocket", "p", "o", "+h", "k", "i", "+h", "t"),
	]},
	{title: "The vowel in “cup”", sound: "ʌ", keys: ["u", "⇧A"], intro: "The vowel in “cup”.", words: [
		en("cup", "k", "u", "+a", "p"), en("but", "b", "u", "+a", "t"), en("sun", "s", "u", "+a", "n"), en("mud", "m", "u", "+a", "d"),
		en("bus", "b", "u", "+a", "s"), en("sunset", "s", "u", "+a", "n", "s", "e", "+h", "t"), en("public", "p", "u", "+a", "b", "l", "i", "+h", "k"),
	]},

	// ── Phase 2 · the digraphs you already spell (sh / th / ng) ──────
	{title: "“sh” — ʃ", sound: "ʃ", keys: ["s", "⇧H"], intro: "The “sh” sound.", words: [
		en("ship", "s", "+h", "i", "+h", "p"), en("she", "s", "+h", "i"), en("fish", "f", "i", "+h", "s", "+h"),
		en("cash", "k", "a", "+e", "s", "+h"), en("shop", "s", "+h", "o", "+h", "p"), en("wish", "w", "i", "+h", "s", "+h"),
		en("push", "p", "u", "+h", "s", "+h"), en("shut", "s", "+h", "u", "+a", "t"),
	]},
	{title: "“ng” — ŋ", sound: "ŋ", keys: ["n", "⇧G"], intro: "The “ng” at the back of “sing”.", words: [
		en("sing", "s", "i", "+h", "n", "+g"), en("king", "k", "i", "+h", "n", "+g"), en("long", "l", "o", "+h", "n", "+g"),
		en("song", "s", "o", "+h", "n", "+g"), en("bang", "b", "a", "+e", "n", "+g"), en("sung", "s", "u", "+a", "n", "+g"),
		en("shrimp", "s", "+h", "r", "+h", "i", "+h", "m", "p"), en("bring", "b", "r", "+h", "i", "+h", "n", "+g"),
	]},
	{title: "“th” — θ", sound: "θ", keys: ["t", "⇧H"], intro: "The voiceless “th” in “thin”.", words: [
		en("thin", "t", "+h", "i", "+h", "n"), en("thick", "t", "+h", "i", "+h", "k"), en("bath", "b", "a", "+e", "t", "+h"),
		en("math", "m", "a", "+e", "t", "+h"), en("path", "p", "a", "+e", "t", "+h"), en("moth", "m", "o", "+h", "t", "+h"),
		en("thing", "t", "+h", "i", "+h", "n", "+g"), en("thank", "t", "+h", "a", "+e", "n", "+g", "k"),
	]},
	{title: "“th” — ð", sound: "ð", keys: ["d", "⇧H"], intro: "The voiced “th” in “this”.", words: [
		en("this", "d", "+h", "i", "+h", "s"), en("that", "d", "+h", "a", "+e", "t"), en("then", "d", "+h", "e", "+h", "n"),
		en("them", "d", "+h", "e", "+h", "m"), en("than", "d", "+h", "a", "+e", "n"), en("with", "w", "i", "+h", "d", "+h"),
	]},
	{title: "The English r — ɹ", sound: "ɹ", keys: ["r", "⇧H"], intro: "The English “r”. (Bare r is a rolled trill.)", words: [
		en("red", "r", "+h", "e", "+h", "d"), en("run", "r", "+h", "u", "+a", "n"), en("rat", "r", "+h", "a", "+e", "t"),
		en("rock", "r", "+h", "o", "+h", "k"), en("rug", "r", "+h", "u", "+a", "g"), en("trip", "t", "r", "+h", "i", "+h", "p"),
		en("fresh", "f", "r", "+h", "e", "+h", "s", "+h"), en("thrash", "t", "+h", "r", "+h", "a", "+e", "s", "+h"),
	]},
	{title: "The schwa — ə", sound: "ə", keys: ["⇧5"], intro: "The schwa — English’s reduced, unstressed vowel, as in the “the”.", words: [
		en("the", "d", "+h", "+5"), en("a", "+5"), en("sudden", "s", "u", "+a", "d", "+5", "n"),
		en("seven", "s", "e", "+h", "v", "+5", "n"), en("under", "u", "+a", "n", "d", "+5", "r", "+h"),
		en("rabbit", "r", "+h", "a", "+e", "b", "+5", "t"), en("listen", "l", "i", "+h", "s", "+5", "n"),
	]},

	// ── Phase 3 · diphthongs (combinations of vowels you know) ───────
	{title: "The diphthong in “eye”", sound: "aɪ", keys: ["a", "i", "⇧H"], intro: "The diphthong in “eye” — a gliding into ɪ.", words: [
		en("eye", "a", "i", "+h"), en("my", "m", "a", "i", "+h"), en("pie", "p", "a", "i", "+h"), en("high", "h", "a", "i", "+h"),
		en("time", "t", "a", "i", "+h", "m"), en("like", "l", "a", "i", "+h", "k"), en("five", "f", "a", "i", "+h", "v"), en("night", "n", "a", "i", "+h", "t"),
	]},
	{title: "The diphthong in “how”", sound: "aʊ", keys: ["a", "u", "⇧H"], intro: "The diphthong in “how” — a gliding into ʊ.", words: [
		en("how", "h", "a", "u", "+h"), en("now", "n", "a", "u", "+h"), en("cow", "k", "a", "u", "+h"), en("out", "a", "u", "+h", "t"),
		en("house", "h", "a", "u", "+h", "s"), en("down", "d", "a", "u", "+h", "n"), en("loud", "l", "a", "u", "+h", "d"),
	]},
	{title: "The diphthong in “go”", sound: "oʊ", keys: ["o", "u", "⇧H"], intro: "The diphthong in “go” — o gliding into ʊ.", words: [
		en("go", "g", "o", "u", "+h"), en("so", "s", "o", "u", "+h"), en("boat", "b", "o", "u", "+h", "t"), en("road", "r", "+h", "o", "u", "+h", "d"),
		en("home", "h", "o", "u", "+h", "m"), en("note", "n", "o", "u", "+h", "t"), en("cold", "k", "o", "u", "+h", "l", "d"),
	]},
	{title: "The diphthong in “day”", sound: "eɪ", keys: ["e", "i", "⇧H"], intro: "The diphthong in “day” — e gliding into ɪ.", words: [
		en("day", "d", "e", "i", "+h"), en("say", "s", "e", "i", "+h"), en("may", "m", "e", "i", "+h"), en("name", "n", "e", "i", "+h", "m"),
		en("game", "g", "e", "i", "+h", "m"), en("face", "f", "e", "i", "+h", "s"), en("take", "t", "e", "i", "+h", "k"), en("rain", "r", "+h", "e", "i", "+h", "n"),
	]},
	{title: "The diphthong in “boy”", sound: "ɔɪ", keys: ["o", "⇧H", "i", "⇧H"], intro: "The diphthong in “boy” — ɔ gliding into ɪ.", words: [
		en("boy", "b", "o", "+h", "i", "+h"), en("toy", "t", "o", "+h", "i", "+h"), en("coin", "k", "o", "+h", "i", "+h", "n"),
		en("oil", "o", "+h", "i", "+h", "l"), en("noise", "n", "o", "+h", "i", "+h", "z"),
	]},

	// ── Phase 4 · the sounds English lacks, via their own languages ──
	{title: "The rolled r — r", sound: "r", keys: ["r"], intro: "The rolled trill of Spanish “rr” — not the English ɹ you just learned.", words: [
		w("perro", "Spanish", "dog", "p", "e", "r", "o"), w("rico", "Spanish", "rich", "r", "i", "k", "o"),
		w("toro", "Spanish", "bull", "t", "o", "r", "o"), w("caro", "Spanish", "dear", "k", "a", "r", "o"), w("rosa", "Spanish", "rose", "r", "o", "s", "a"),
	]},
	{title: "The tapped r — ɾ", sound: "ɾ", keys: ["⇧4"], intro: "A single quick tap — the trill’s one-flap cousin (Spanish “pero” vs. “perro”).", words: [
		w("pero", "Spanish", "but", "p", "e", "+4", "o"), w("cara", "Spanish", "face", "k", "a", "+4", "a"),
		w("para", "Spanish", "for", "p", "a", "+4", "a"), w("hora", "Spanish", "hour", "o", "+4", "a"),
	]},
	{title: "The ñ — ɲ", sound: "ɲ", keys: ["n", "⇧J"], intro: "The Spanish “ñ” — a palatal n.", words: [
		w("niño", "Spanish", "child", "n", "i", "n", "+j", "o"), w("año", "Spanish", "year", "a", "n", "+j", "o"),
		w("caña", "Spanish", "cane", "k", "a", "n", "+j", "a"), w("piña", "Spanish", "pineapple", "p", "i", "n", "+j", "a"),
	]},
	{title: "The Spanish j — x", sound: "x", keys: ["x"], intro: "A raspy velar fricative — Spanish “j”, German “ch” in “Bach”.", words: [
		w("ajo", "Spanish", "garlic", "a", "x", "o"), w("ojo", "Spanish", "eye", "o", "x", "o"),
		w("caja", "Spanish", "box", "k", "a", "x", "a"), w("rojo", "Spanish", "red", "r", "o", "x", "o"),
	]},
	{title: "The front-rounded u — y", sound: "y", keys: ["y"], intro: "A rounded front vowel — round your lips for “oo” but say “ee” (French “tu”).", words: [
		w("tu", "French", "you", "t", "y"), w("vu", "French", "seen", "v", "y"), w("su", "French", "known", "s", "y"),
	]},
	{title: "The eu — ø", sound: "ø", keys: ["e", "⇧W"], intro: "A rounded “eh” (French “peu”, German “schön”).", words: [
		w("peu", "French", "little", "p", "e", "+w"), w("feu", "French", "fire", "f", "e", "+w"),
		w("deux", "French", "two", "d", "e", "+w"), w("bleu", "French", "blue", "b", "l", "e", "+w"),
	]},
	{title: "The German ich — ç", sound: "ç", keys: ["c", "⇧H"], intro: "The soft German “ch” in “ich”.", words: [
		w("ich", "German", "I", "i", "+h", "c", "+h"), w("nicht", "German", "not", "n", "i", "+h", "c", "+h", "t"),
		w("Milch", "German", "milk", "m", "i", "+h", "l", "c", "+h"),
	]},

	// ── Phase 5 · the throat (Arabic) ───────────────────────────────
	{title: "The glottal stop — ʔ", sound: "ʔ", keys: ["⇧2"], intro: "The glottal stop — the catch in the middle of “uh-oh”.", words: [
		en("uh-oh", "u", "+a", "+2", "o", "u", "+h"), w("ana", "Arabic", "I", "+2", "a", "n", "a"),
	]},
	{title: "The pharyngeal ħ", sound: "ħ", keys: ["⇧7"], intro: "A hard, whispered h from deep in the throat (Arabic ح).", words: [
		w("ħabīb", "Arabic", "beloved", "+7", "a", "b", "i", "~;", "b"), w("ħaram", "Arabic", "forbidden", "+7", "a", "r", "a", "m"),
	]},
	{title: "The ʕ (Arabic ع)", sound: "ʕ", keys: ["⇧3"], intro: "ħ’s voiced twin — a tightened throat (Arabic ع).", words: [
		w("ʕarabī", "Arabic", "Arabic", "+3", "a", "r", "a", "b", "i"),
	]},
	{title: "The uvular q", sound: "q", keys: ["q"], intro: "A k made far back at the uvula (Arabic ق).", words: [
		w("qalb", "Arabic", "heart", "q", "a", "l", "b"), w("qamar", "Arabic", "moon", "q", "a", "m", "a", "r"),
	]},

	// ── Phase 6 · diacritics (the Option layer) ─────────────────────
	{title: "Nasal vowels — ◌̃", sound: "◌̃", keys: ["⌥n"], intro: "Nasal vowels — the air escapes through the nose (French).", words: [
		w("bon", "French", "good", "b", "o", "+h", "~n"), w("vin", "French", "wine", "v", "e", "+h", "~n"),
		w("blanc", "French", "white", "b", "l", "a", "+h", "~n"),
	]},
	{title: "Length — ː", sound: "ː", keys: ["⌥;"], intro: "Length — hold the previous sound long.", words: [
		w("père", "French", "father", "p", "e", "+h", "~;", "r", "+q"), w("Tee", "German", "tea", "t", "e", "~;"),
	]},
];

// Introduce each new sound ON ITS OWN first — the singleton glyph before any
// word, so the phoneme you hear (and the keys you press) match exactly what's on
// screen. Skipped for diacritics/length, which can't stand alone.
function kFromLabel(lab: string): Keystroke {
	const option = lab.includes("⌥"), shift = lab.includes("⇧");
	let key = lab.replace(/[⌥⇧]/g, "");
	if (key.length === 1 && /[A-Z]/.test(key)) key = key.toLowerCase();
	return {key, shift, option};
}
for (const les of CURRICULUM) {
	if (!les.sound || !les.keys) continue;
	const target = typeKeys(les.keys.map(kFromLabel));
	if (target === les.sound)
		les.words.unshift({word: les.sound, lang: "", gloss: "the new sound on its own", target, labels: les.keys});
}
