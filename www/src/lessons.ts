import {typeKeys, type Keystroke} from "../../lib/src/index.ts";

// The transcription curriculum (English speakers' track). Lessons are DATA:
// prose sections, multiple-choice checks, and transcription tests whose
// targets are computed by the real engine — a lesson can never demand an
// untypeable answer. Broad transcription, General American reference
// accent (stated in lesson 1).

function seq(...keys: string[]): Keystroke[] {
	return keys.map((k) => {
		let shift = false, option = false, key = k;
		while (key[0] === "+" || key[0] === "~") {
			if (key[0] === "+") shift = true;
			else option = true;
			key = key.slice(1);
		}
		return {key, shift, option};
	});
}

function label(k: string): string {
	let shift = false, option = false, key = k;
	while (key[0] === "+" || key[0] === "~") {
		if (key[0] === "+") shift = true;
		else option = true;
		key = key.slice(1);
	}
	return (option ? "⌥" : "") + (shift ? "⇧" : "") +
		(shift && /[a-z]/.test(key) ? key.toUpperCase() : key);
}

export interface Choice {
	text: string;
	correct?: boolean;
}

export interface Quiz {
	q: string;
	choices: Choice[];
	explain: string;
}

export interface Transcribe {
	word: string;       // what the learner hears (SpeechSynthesis) and sees after
	say?: string;       // override for the utterance if the word label differs
	target: string;     // computed IPA answer
	labels: string[];   // keystroke hint
	note?: string;
}

export interface Lesson {
	slug: string;
	title: string;
	summary: string;
	sections: {h: string; body: string}[]; // body is trusted HTML
	quiz: Quiz[];
	transcribe: Transcribe[];
}

function t(word: string, keys: string[], note?: string, say?: string): Transcribe {
	return {word, say, target: typeKeys(seq(...keys)), labels: keys.map(label), note};
}

export const LESSONS: Lesson[] = [
	{
		slug: "sounds-not-letters",
		title: "1 · Sounds, not letters",
		summary: "What IPA is for, the symbols you already know, and your first transcriptions.",
		sections: [
			{
				h: "Why transcribe?",
				body: `English spelling records history, not sound: <i>though, tough,
through, thought</i> share four letters and no pronunciation. The IPA writes
<b>one symbol per sound, one sound per symbol</b> — so what you write is what
anyone, in any language, will say. We'll use <b>broad transcription</b>
(slashes, /ʃɪp/): just enough detail to tell the sounds of the language
apart, with General American as our reference accent.`,
			},
			{
				h: "The freebies",
				body: `Most English consonant letters already are their IPA symbols:
<span class="ipa">p b t d k m n f v s z h w l</span>. Two traps: the English
"r" is <b class="ipa">ɹ</b> (the symbol <span class="ipa">r</span> belongs to
a trilled r, as in Spanish <i>perro</i>), and the "y" sound of <i>yes</i> is
<b class="ipa">j</b> (as in German <i>ja</i>). And <b>g</b> is always the hard
g of <i>go</i> — the g of <i>gem</i> is a different sound entirely (lesson 3).`,
			},
			{
				h: "Three vowels to start",
				body: `We start with the three corner vowels, stable in almost every
accent: <b class="ipa">i</b> as in <i>see</i> /si/, <b class="ipa">u</b> as in
<i>sue</i> /su/, <b class="ipa">ɑ</b> as in <i>spa</i> /spɑ/. Notice /si/ is
the word <i>see</i>, not "si" — and that <i>sea</i> is also /si/. Different
spellings, same sounds, same transcription. That's the whole point.`,
			},
		],
		quiz: [
			{
				q: "Why do linguists transcribe /si/ for both “see” and “sea”?",
				choices: [
					{text: "They're pronounced identically — IPA records sound, not spelling", correct: true},
					{text: "The IPA has no symbol for “ea”"},
					{text: "It's an abbreviation convention"},
				],
				explain: "Homophones get identical transcriptions: the IPA is deaf to spelling.",
			},
			{
				q: "The English “r” in “red” is written…",
				choices: [
					{text: "r"},
					{text: "ɹ", correct: true},
					{text: "ʁ"},
				],
				explain: "/r/ is a trill (Spanish perro); English red is the approximant /ɹɛd/. ʁ is the French r.",
			},
			{
				q: "The first sound of “yes” is…",
				choices: [
					{text: "y"},
					{text: "j", correct: true},
					{text: "ʒ"},
				],
				explain: "IPA /j/ = the y-glide. The symbol /y/ is a rounded French/German vowel (tu, über).",
			},
			{
				q: "Slashes around a transcription (/ʃɪp/) signal…",
				choices: [
					{text: "Broad, phonemic transcription", correct: true},
					{text: "The word is foreign"},
					{text: "Uncertainty about the pronunciation"},
				],
				explain: "Slashes = broad/phonemic; square brackets [ʃɪp] = narrow/phonetic detail.",
			},
		],
		transcribe: [
			t("see", ["s", "i"]),
			t("sue", ["s", "u"]),
			t("spa", ["s", "p", "a", "+o"]),
			t("keep", ["k", "i", "p"]),
			t("moon", ["m", "u", "n"]),
			t("leap", ["l", "i", "p"]),
			t("read", ["r", "+h", "i", "d"], "Remember: ɹ, not r."),
		],
	},
	{
		slug: "vowels-lax-and-central",
		title: "2 · The vowels English hides",
		summary: "Lax vowels, schwa, and why “sit” and “seat” are different words.",
		sections: [
			{
				h: "Tense vs lax",
				body: `<i>Seat</i> /sit/ and <i>sit</i> /sɪt/ differ by one vowel:
tense <b class="ipa">i</b> vs lax <b class="ipa">ɪ</b>. English is full of
these near-pairs the spelling hides: <b class="ipa">ʊ</b> in <i>book</i>
/bʊk/ vs <b class="ipa">u</b> in <i>boot</i> /but/; <b class="ipa">ɛ</b> in
<i>bed</i> /bɛd/; <b class="ipa">æ</b> in <i>cat</i> /kæt/;
<b class="ipa">ʌ</b> in <i>cup</i> /kʌp/. On the keyboard the lax vowels are
one H away from their tense neighbors: <kbd>i</kbd><kbd>⇧H</kbd> → ɪ,
<kbd>u</kbd><kbd>⇧H</kbd> → ʊ, <kbd>e</kbd><kbd>⇧H</kbd> → ɛ.`,
			},
			{
				h: "The most common vowel in English",
				body: `…is one no English letter writes: <b class="ipa">ə</b>, schwa,
the unstressed vowel of <i>a</i>bout, sof<i>a</i>, supp<i>o</i>rt. Nearly
every unstressed syllable in English reduces toward it. It lives on
<kbd>⇧5</kbd>, the center of the number row — fitting for the center of the
vowel space. Its stressed sibling <b class="ipa">ʌ</b> (<i>cup</i>) is a
little lower and further back.`,
			},
		],
		quiz: [
			{
				q: "“Sit” is transcribed…",
				choices: [
					{text: "/sit/"},
					{text: "/sɪt/", correct: true},
					{text: "/sət/"},
				],
				explain: "Lax ɪ. /sit/ is “seat”.",
			},
			{
				q: "The second vowel of “sofa” is…",
				choices: [
					{text: "ɑ"},
					{text: "æ"},
					{text: "ə", correct: true},
				],
				explain: "Unstressed final syllables reduce to schwa: /ˈsoʊfə/.",
			},
			{
				q: "Which pair differs only in tense/lax?",
				choices: [
					{text: "bed / bad"},
					{text: "boot / book", correct: true},
					{text: "cup / cop"},
				],
				explain: "/but/ vs /bʊk/ — u vs ʊ. (bed/bad is ɛ/æ; cup/cop is ʌ/ɑ.)",
			},
		],
		transcribe: [
			t("sit", ["s", "i", "+h", "t"]),
			t("seat", ["s", "i", "t"]),
			t("book", ["b", "u", "+h", "k"]),
			t("bed", ["b", "e", "+h", "d"]),
			t("cat", ["k", "a", "+e", "t"]),
			t("cup", ["k", "a", "+h", "p"]),
			t("sofa", ["s", "o", "u", "+h", "f", "+5"], "Final unstressed vowel: schwa. (We'll add the stress mark in lesson 4.)"),
		],
	},
	{
		slug: "consonants-english-spells-badly",
		title: "3 · The consonants English spells badly",
		summary: "ʃ ʒ tʃ dʒ θ ð ŋ — seven everyday sounds with no letter of their own.",
		sections: [
			{
				h: "The hushers",
				body: `<b class="ipa">ʃ</b> is the sh of <i>ship</i> /ʃɪp/ —
<kbd>s</kbd><kbd>⇧H</kbd>, "s moved back and hushed." Its voiced twin
<b class="ipa">ʒ</b> (vi<i>si</i>on /ˈvɪʒən/, gara<i>g</i>e) is
<kbd>z</kbd><kbd>⇧H</kbd>. English writes the affricates with them:
<i>ch</i>urch = <b class="ipa">tʃ</b> /tʃɝtʃ/ and <i>j</i>udge =
<b class="ipa">dʒ</b> /dʒʌdʒ/ — literally t+ʃ and d+ʒ, which is how you type
them.`,
			},
			{
				h: "The th's — there are two",
				body: `<i>Thigh</i> and <i>thy</i> begin differently: voiceless
<b class="ipa">θ</b> (<i>think, bath</i>) and voiced <b class="ipa">ð</b>
(<i>this, bathe</i>). Type them as <kbd>t</kbd><kbd>⇧H</kbd> and
<kbd>d</kbd><kbd>⇧H</kbd> — the same lenition H you used for ʃ/ʒ, applied to
t/d. English spells both "th" and native speakers rarely notice they alternate.`,
			},
			{
				h: "The hidden nasal",
				body: `Si<i>ng</i> ends in one sound, not two: <b class="ipa">ŋ</b>
(<kbd>n</kbd><kbd>⇧G</kbd>). There's no /g/ at the end of /sɪŋ/ — but there
IS one in the middle of fi<i>ng</i>er /ˈfɪŋɡɚ/. Spelling writes both "ng";
your ears, and your transcription, must not.`,
			},
		],
		quiz: [
			{
				q: "“Judge” is transcribed…",
				choices: [
					{text: "/dʒʌdʒ/", correct: true},
					{text: "/ʒʌʒ/"},
					{text: "/dʌd/"},
				],
				explain: "Both edges are the affricate dʒ: d+ʒ as one gesture.",
			},
			{
				q: "The middle consonant of “vision” is…",
				choices: [
					{text: "ʃ"},
					{text: "ʒ", correct: true},
					{text: "z"},
				],
				explain: "Voiced ʒ — ʃ's twin. /ˈvɪʒən/.",
			},
			{
				q: "Which word contains θ (voiceless th)?",
				choices: [
					{text: "this"},
					{text: "bathe"},
					{text: "bath", correct: true},
				],
				explain: "bath /bæθ/ is voiceless; this /ðɪs/ and bathe /beɪð/ are voiced ð.",
			},
			{
				q: "“Sing” ends with…",
				choices: [
					{text: "n + g"},
					{text: "ŋ alone", correct: true},
					{text: "ŋ + g"},
				],
				explain: "/sɪŋ/ — the g is spelling fiction. (But finger really has ŋɡ.)",
			},
		],
		transcribe: [
			t("ship", ["s", "+h", "i", "+h", "p"]),
			t("this", ["d", "+h", "i", "+h", "s"]),
			t("think", ["t", "+h", "i", "+h", "n", "+g", "k"], "The n before k is really ŋ — listen."),
			t("church", ["t", "s", "+h", "+5", "+h", "+r", "t", "s", "+h"], "tʃ + rhotic vowel ɝ + tʃ."),
			t("judge", ["d", "z", "+h", "a", "+h", "d", "z", "+h"]),
			t("sing", ["s", "i", "+h", "n", "+g"]),
			t("vision", ["v", "i", "+h", "z", "+h", "+5", "n"], "Unstressed second syllable: schwa."),
		],
	},
];

export const COMING = [
	"4 · Diphthongs, rhotics, and stress (eɪ aɪ ɔɪ aʊ oʊ, ɚ ɝ, ˈ and ˌ)",
	"5 · Narrow transcription: aspiration, flapping, and the [brackets]",
	"6 · Beyond English: new sounds for new languages",
];
