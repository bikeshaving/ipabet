import {typeKeys, type Keystroke} from "../../js/src/index.ts";

// The graded IPAbet course — a fixed, hand-designed touch-typing syllabus.
// Words are authored as KEYSTROKE sequences so the pronunciation is controlled
// exactly; the engine computes the IPA (guaranteeing every word is typeable and
// showing the real output for review). Order is deliberate: the plain keyboard,
// then the English vowels, the digraphs you already spell, diphthongs, and only
// then outward to the sounds English lacks. Each new sound is introduced by a
// word that contains it and uses only sounds taught earlier; old sounds keep
// coming back. No generation, no random — that's a later practice mode.

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
// w(display, gloss, ...keys)  — gloss "" for none
function w(word: string, gloss: string, ...keys: string[]) {
	return {word, gloss, target: typeKeys(seq(...keys)), labels: keys.map(label)};
}

export interface Lesson {
	title: string;
	sound?: string;        // the new sound this lesson introduces (glyph or a diphthong)
	keys?: string[];       // its keystroke labels (shown on the intro)
	intro: string;
	words: ReturnType<typeof w>[];   // words[0] is the demonstration (keys shown)
}

export const CURRICULUM: Lesson[] = [
	// ── Phase 0 · the plain keyboard ────────────────────────────────
	{title: "The plain keyboard", intro: "Every unshifted key types its plain sound. The vowels are pure and continental — a is “ah”, e is “eh”, i is “ee”, o is “oh”, u is “oo” — not their English names. You already know where these keys are.", words: [
		w("me", "", "m", "i"), w("we", "", "w", "i"), w("see", "", "s", "i"),
		w("do", "", "d", "u"), w("who", "", "h", "u"), w("too", "", "t", "u"),
		w("no", "Spanish", "n", "o"), w("luna", "Spanish · moon", "l", "u", "n", "a"),
		w("gato", "Spanish · cat", "g", "a", "t", "o"), w("sopa", "Spanish · soup", "s", "o", "p", "a"),
	]},

	// ── Phase 1 · the English vowels (⇧ relaxes the vowel before it) ──
	{title: "The vowel in “sit”", sound: "ɪ", keys: ["i", "⇧H"], intro: "⇧ on a vowel relaxes it. i → ɪ, the short vowel in “sit”.", words: [
		w("sit", "", "s", "i", "+h", "t"), w("it", "", "i", "+h", "t"), w("in", "", "i", "+h", "n"),
		w("pin", "", "p", "i", "+h", "n"), w("tip", "", "t", "i", "+h", "p"), w("kid", "", "k", "i", "+h", "d"),
		w("big", "", "b", "i", "+h", "g"), w("milk", "", "m", "i", "+h", "l", "k"), w("wind", "", "w", "i", "+h", "n", "d"),
	]},
	{title: "The vowel in “pen”", sound: "ɛ", keys: ["e", "⇧H"], intro: "e → ɛ, the vowel in “pen”.", words: [
		w("pen", "", "p", "e", "+h", "n"), w("ten", "", "t", "e", "+h", "n"), w("bed", "", "b", "e", "+h", "d"),
		w("get", "", "g", "e", "+h", "t"), w("let", "", "l", "e", "+h", "t"), w("men", "", "m", "e", "+h", "n"),
		w("best", "", "b", "e", "+h", "s", "t"), w("sit", "review", "s", "i", "+h", "t"), w("kept", "", "k", "e", "+h", "p", "t"),
	]},
	{title: "The vowel in “cat”", sound: "æ", keys: ["a", "⇧E"], intro: "⇧E: a → æ, the vowel in “cat”.", words: [
		w("cat", "", "k", "a", "+e", "t"), w("map", "", "m", "a", "+e", "p"), w("man", "", "m", "a", "+e", "n"),
		w("bad", "", "b", "a", "+e", "d"), w("tan", "", "t", "a", "+e", "n"), w("back", "", "b", "a", "+e", "k"),
		w("hand", "", "h", "a", "+e", "n", "d"), w("pen", "review", "p", "e", "+h", "n"), w("plan", "", "p", "l", "a", "+e", "n"),
	]},
	{title: "The vowel in “put”", sound: "ʊ", keys: ["u", "⇧H"], intro: "u → ʊ, the short vowel in “put”.", words: [
		w("put", "", "p", "u", "+h", "t"), w("full", "", "f", "u", "+h", "l"), w("book", "", "b", "u", "+h", "k"),
		w("good", "", "g", "u", "+h", "d"), w("pull", "", "p", "u", "+h", "l"), w("foot", "", "f", "u", "+h", "t"),
		w("cat", "review", "k", "a", "+e", "t"), w("look", "", "l", "u", "+h", "k"),
	]},
	{title: "The vowel in “dog”", sound: "ɔ", keys: ["o", "⇧H"], intro: "o → ɔ, the open vowel in “dog”.", words: [
		w("dog", "", "d", "o", "+h", "g"), w("off", "", "o", "+h", "f"), w("on", "", "o", "+h", "n"),
		w("lost", "", "l", "o", "+h", "s", "t"), w("soft", "", "s", "o", "+h", "f", "t"), w("boss", "", "b", "o", "+h", "s"),
		w("put", "review", "p", "u", "+h", "t"), w("cost", "", "k", "o", "+h", "s", "t"),
	]},
	{title: "The vowel in “cup”", sound: "ʌ", keys: ["a", "⇧U"], intro: "⇧U: a → ʌ, the vowel in “cup”.", words: [
		w("cup", "", "k", "a", "+u", "p"), w("but", "", "b", "a", "+u", "t"), w("sun", "", "s", "a", "+u", "n"),
		w("mud", "", "m", "a", "+u", "d"), w("up", "", "a", "+u", "p"), w("bus", "", "b", "a", "+u", "s"),
		w("dog", "review", "d", "o", "+h", "g"), w("luck", "", "l", "a", "+u", "k"),
	]},

	// ── Phase 2 · the digraphs you already spell (sh / th / ng) ──────
	{title: "“sh” — ʃ", sound: "ʃ", keys: ["s", "⇧H"], intro: "⇧ spirantizes s → ʃ, the “sh” sound.", words: [
		w("ship", "", "s", "+h", "i", "+h", "p"), w("she", "", "s", "+h", "i"), w("fish", "", "f", "i", "+h", "s", "+h"),
		w("cash", "", "k", "a", "+e", "s", "+h"), w("shop", "", "s", "+h", "o", "+h", "p"), w("wish", "", "w", "i", "+h", "s", "+h"),
		w("push", "", "p", "u", "+h", "s", "+h"), w("shut", "", "s", "+h", "a", "+u", "t"),
	]},
	{title: "“ng” — ŋ", sound: "ŋ", keys: ["n", "⇧G"], intro: "⇧G sends n to the back: ŋ, the “ng” in “sing”.", words: [
		w("sing", "", "s", "i", "+h", "n", "+g"), w("king", "", "k", "i", "+h", "n", "+g"), w("long", "", "l", "o", "+h", "n", "+g"),
		w("ring", "", "r", "+h", "i", "+h", "n", "+g"), w("song", "", "s", "o", "+h", "n", "+g"), w("bang", "", "b", "a", "+e", "n", "+g"),
		w("sung", "", "s", "a", "+u", "n", "+g"), w("fish", "review", "f", "i", "+h", "s", "+h"),
	]},
	{title: "“th” — θ", sound: "θ", keys: ["t", "⇧H"], intro: "⇧ spirantizes t → θ, the voiceless “th” in “thin”.", words: [
		w("thin", "", "t", "+h", "i", "+h", "n"), w("thick", "", "t", "+h", "i", "+h", "k"), w("bath", "", "b", "a", "+e", "t", "+h"),
		w("math", "", "m", "a", "+e", "t", "+h"), w("path", "", "p", "a", "+e", "t", "+h"), w("moth", "", "m", "o", "+h", "t", "+h"),
		w("thing", "", "t", "+h", "i", "+h", "n", "+g"), w("teeth", "", "t", "i", "t", "+h"),
	]},
	{title: "“th” — ð", sound: "ð", keys: ["d", "⇧H"], intro: "⇧ spirantizes d → ð, the voiced “th” in “this”.", words: [
		w("this", "", "d", "+h", "i", "+h", "s"), w("that", "", "d", "+h", "a", "+e", "t"), w("then", "", "d", "+h", "e", "+h", "n"),
		w("them", "", "d", "+h", "e", "+h", "m"), w("than", "", "d", "+h", "a", "+e", "n"), w("with", "", "w", "i", "+h", "d", "+h"),
		w("bath", "review", "b", "a", "+e", "t", "+h"),
	]},
	{title: "The English r — ɹ", sound: "ɹ", keys: ["r", "⇧H"], intro: "⇧ relaxes the trill r into ɹ, the English “r”. (Bare r stays a rolled trill.)", words: [
		w("red", "", "r", "+h", "e", "+h", "d"), w("run", "", "r", "+h", "a", "+u", "n"), w("rat", "", "r", "+h", "a", "+e", "t"),
		w("rock", "", "r", "+h", "o", "+h", "k"), w("rug", "", "r", "+h", "a", "+u", "g"), w("trip", "", "t", "r", "+h", "i", "+h", "p"),
		w("bring", "", "b", "r", "+h", "i", "+h", "n", "+g"), w("fresh", "", "f", "r", "+h", "e", "+h", "s", "+h"),
	]},
	{title: "The schwa — ə", sound: "ə", keys: ["⇧5"], intro: "⇧5 types ə, the schwa — English’s reduced, unstressed vowel, as in the “the”.", words: [
		w("the", "", "d", "+h", "+5"), w("a", "", "+5"), w("sudden", "", "s", "a", "+u", "d", "+5", "n"),
		w("seven", "", "s", "e", "+h", "v", "+5", "n"), w("under", "", "a", "+u", "n", "d", "+5", "r", "+h"),
		w("listen", "", "l", "i", "+h", "s", "+5", "n"),
	]},

	// ── Phase 3 · diphthongs (combinations of vowels you know) ───────
	{title: "The diphthong in “eye”", sound: "aɪ", keys: ["a", "i", "⇧H"], intro: "Glide two vowels: a → ɪ makes aɪ, as in “eye”.", words: [
		w("eye", "", "a", "i", "+h"), w("my", "", "m", "a", "i", "+h"), w("pie", "", "p", "a", "i", "+h"),
		w("high", "", "h", "a", "i", "+h"), w("time", "", "t", "a", "i", "+h", "m"), w("like", "", "l", "a", "i", "+h", "k"),
		w("five", "", "f", "a", "i", "+h", "v"), w("night", "", "n", "a", "i", "+h", "t"),
	]},
	{title: "The diphthong in “how”", sound: "aʊ", keys: ["a", "u", "⇧H"], intro: "a → ʊ makes aʊ, as in “how”.", words: [
		w("how", "", "h", "a", "u", "+h"), w("now", "", "n", "a", "u", "+h"), w("cow", "", "k", "a", "u", "+h"),
		w("out", "", "a", "u", "+h", "t"), w("house", "", "h", "a", "u", "+h", "s"), w("down", "", "d", "a", "u", "+h", "n"),
		w("loud", "", "l", "a", "u", "+h", "d"),
	]},
	{title: "The diphthong in “go”", sound: "oʊ", keys: ["o", "u", "⇧H"], intro: "o → ʊ makes oʊ, as in “go”.", words: [
		w("go", "", "g", "o", "u", "+h"), w("so", "", "s", "o", "u", "+h"), w("boat", "", "b", "o", "u", "+h", "t"),
		w("road", "", "r", "+h", "o", "u", "+h", "d"), w("home", "", "h", "o", "u", "+h", "m"), w("note", "", "n", "o", "u", "+h", "t"),
		w("cold", "", "k", "o", "u", "+h", "l", "d"),
	]},
	{title: "The diphthong in “day”", sound: "eɪ", keys: ["e", "i", "⇧H"], intro: "e → ɪ makes eɪ, as in “day”.", words: [
		w("day", "", "d", "e", "i", "+h"), w("say", "", "s", "e", "i", "+h"), w("may", "", "m", "e", "i", "+h"),
		w("name", "", "n", "e", "i", "+h", "m"), w("game", "", "g", "e", "i", "+h", "m"), w("face", "", "f", "e", "i", "+h", "s"),
		w("take", "", "t", "e", "i", "+h", "k"), w("rain", "", "r", "+h", "e", "i", "+h", "n"),
	]},
	{title: "The diphthong in “boy”", sound: "ɔɪ", keys: ["o", "⇧H", "i", "⇧H"], intro: "ɔ → ɪ makes ɔɪ, as in “boy”.", words: [
		w("boy", "", "b", "o", "+h", "i", "+h"), w("toy", "", "t", "o", "+h", "i", "+h"), w("coin", "", "k", "o", "+h", "i", "+h", "n"),
		w("oil", "", "o", "+h", "i", "+h", "l"), w("noise", "", "n", "o", "+h", "i", "+h", "z"),
	]},

	// ── Phase 4 · the sounds English lacks, via their own languages ──
	{title: "The rolled r — r", sound: "r", keys: ["r"], intro: "Bare r is a rolled trill (Spanish “rr”), not the English r you just learned.", words: [
		w("perro", "Spanish · dog", "p", "e", "r", "o"), w("rico", "Spanish · rich", "r", "i", "k", "o"),
		w("toro", "Spanish · bull", "t", "o", "r", "o"), w("caro", "Spanish · dear", "k", "a", "r", "o"),
		w("rosa", "Spanish · rose", "r", "o", "s", "a"),
	]},
	{title: "The tapped r — ɾ", sound: "ɾ", keys: ["⇧4"], intro: "⇧4 is the quick single tap ɾ — the trill’s one-flap cousin (Spanish “pero” vs. “perro”).", words: [
		w("pero", "Spanish · but", "p", "e", "+4", "o"), w("cara", "Spanish · face", "k", "a", "+4", "a"),
		w("para", "Spanish · for", "p", "a", "+4", "a"), w("hora", "Spanish · hour", "o", "+4", "a"),
	]},
	{title: "The ñ — ɲ", sound: "ɲ", keys: ["n", "⇧J"], intro: "⇧J palatalizes n → ɲ, the Spanish “ñ”.", words: [
		w("niño", "Spanish · child", "n", "i", "n", "+j", "o"), w("año", "Spanish · year", "a", "n", "+j", "o"),
		w("caña", "Spanish · cane", "k", "a", "n", "+j", "a"), w("piña", "Spanish · pineapple", "p", "i", "n", "+j", "a"),
	]},
	{title: "The Spanish j — x", sound: "x", keys: ["x"], intro: "Bare x is a raspy velar fricative — Spanish “j”, German “ch” in “Bach”.", words: [
		w("ajo", "Spanish · garlic", "a", "x", "o"), w("ojo", "Spanish · eye", "o", "x", "o"),
		w("caja", "Spanish · box", "k", "a", "x", "a"), w("rojo", "Spanish · red", "r", "o", "x", "o"),
	]},
	{title: "The front-rounded u — y", sound: "y", keys: ["y"], intro: "Bare y is a rounded front vowel — round your lips as if for “oo” but say “ee” (French “tu”).", words: [
		w("tu", "French · you", "t", "y"), w("vu", "French · seen", "v", "y"), w("su", "French · known", "s", "y"),
	]},
	{title: "The eu — ø", sound: "ø", keys: ["e", "⇧W"], intro: "⇧W rounds e → ø (French “peu”, German “schön”).", words: [
		w("peu", "French · little", "p", "e", "+w"), w("feu", "French · fire", "f", "e", "+w"),
		w("deux", "French · two", "d", "e", "+w"), w("bleu", "French · blue", "b", "l", "e", "+w"),
	]},
	{title: "The German ich — ç", sound: "ç", keys: ["c", "⇧H"], intro: "⇧ spirantizes the palatal c → ç, the soft German “ch” in “ich”.", words: [
		w("ich", "German · I", "i", "+h", "c", "+h"), w("nicht", "German · not", "n", "i", "+h", "c", "+h", "t"),
		w("Milch", "German · milk", "m", "i", "+h", "l", "c", "+h"),
	]},

	// ── Phase 5 · the throat (Arabic) ───────────────────────────────
	{title: "The glottal stop — ʔ", sound: "ʔ", keys: ["⇧2"], intro: "⇧2 is ʔ, the catch in the throat — the middle of “uh-oh”.", words: [
		w("uh-oh", "", "a", "+u", "+2", "o", "u", "+h"), w("ana", "Arabic · I", "+2", "a", "n", "a"),
	]},
	{title: "The pharyngeal ħ", sound: "ħ", keys: ["⇧7"], intro: "⇧7 is ħ, a hard whispered h from deep in the throat (Arabic ح).", words: [
		w("ħabīb", "Arabic · beloved", "+7", "a", "b", "i", "~;", "b"), w("ħaram", "Arabic · forbidden", "+7", "a", "r", "a", "m"),
	]},
	{title: "The ʕ (Arabic ع)", sound: "ʕ", keys: ["⇧3"], intro: "⇧3 is ʕ, ħ’s voiced twin — a tightened throat (Arabic ع).", words: [
		w("ʕarabī", "Arabic · Arabic", "+3", "a", "r", "a", "b", "i"),
	]},
	{title: "The uvular q", sound: "q", keys: ["q"], intro: "Bare q is a k made far back at the uvula (Arabic ق).", words: [
		w("qalb", "Arabic · heart", "q", "a", "l", "b"), w("qamar", "Arabic · moon", "q", "a", "m", "a", "r"),
	]},

	// ── Phase 6 · diacritics (the Option layer) ─────────────────────
	{title: "Nasal vowels — ◌̃", sound: "◌̃", keys: ["⌥n"], intro: "Type a vowel, then ⌥n to send the air through the nose — French nasal vowels.", words: [
		w("bon", "French · good", "b", "o", "+h", "~n"), w("vin", "French · wine", "v", "e", "+h", "~n"),
		w("blanc", "French · white", "b", "l", "a", "+o", "~n"),
	]},
	{title: "Length — ː", sound: "ː", keys: ["⌥;"], intro: "⌥; holds the previous sound long (ː).", words: [
		w("père", "French · father", "p", "e", "+h", "~;", "r", "+q"), w("Tee", "German · tea", "t", "e", "~;"),
	]},
];
