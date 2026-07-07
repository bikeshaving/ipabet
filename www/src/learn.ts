import spec from "../../spec/ipabet.json";
import {type Keystroke} from "../../js/src/index.ts";
import {CSS} from "./style.ts";
import {STAGES, WORDBANK} from "./wordbank.ts";
import {AUDIO} from "./audio-map.ts";
// Shovel's asset pipeline rewrites this import to a hashed URL string at build
// time; TypeScript sees the module itself, hence the ignore.
// @ts-ignore
import learnClient from "./learn-client.ts" with {assetBase: "/assets/"};

// /learn — a touch-typing tutor for IPA. No lectures, no quizzes: a single
// drill that walks the syllabus stage by stage (progressive disclosure), each
// stage introducing its new glyphs and then the words that just became
// typeable. Every target is computed by the real engine, so all are correct.

function keysFor(specKey: string): Keystroke[] {
	return [...specKey].map((c) => {
		if (/[A-Z]/.test(c)) return {key: c.toLowerCase(), shift: true, option: false};
		if (/[0-9]/.test(c)) return {key: c, shift: true, option: false}; // shifted-number row
		return {key: c, shift: false, option: false};
	});
}
function label(k: Keystroke): string {
	return (k.option ? "⌥" : "") + (k.shift ? "⇧" : "") +
		(k.shift && /[a-z]/.test(k.key) ? k.key.toUpperCase() : k.key);
}

const AUDIO_OF = AUDIO as Record<string, string>;
const AUDIO_ALIAS: Record<string, string> = {g: "ɡ"}; // bare g emits U+0067; the recording is keyed on ɡ U+0261
const audioFor = (g: string): string | undefined => AUDIO_OF[g] ?? AUDIO_OF[AUDIO_ALIAS[g] ?? ""];

// The vowels (nuclei for generated syllables); everything else is a consonant.
const VOWELS = new Set([..."aeiouyəɨʉɯɪʊɛœɜɞɐɘøɵɤʏæʌɔɑɒɶ"]);

const keyByGlyph = new Map<string, string>();
for (const e of spec.letters as {key: string; glyph: string}[])
	if (!keyByGlyph.has(e.glyph)) keyByGlyph.set(e.glyph, e.key);

// A bare single lowercase key you already touch-type — no drilling needed;
// these unlock from the start so word generation has raw material immediately.
function isObvious(ks: Keystroke[]): boolean {
	return ks.length === 1 && !ks[0].shift && !ks[0].option && /[a-z]/.test(ks[0].key);
}

interface GlyphInfo { g: string; kind: "V" | "C"; labels: string[]; audio?: string; obvious: boolean; note: string; }

// Every learnable segment, in syllabus order. Consonants + vowels feed the word
// generator; new (non-obvious) sounds are introduced one at a time.
const GLYPHS: GlyphInfo[] = [];
const seenG = new Set<string>();
for (const s of STAGES) {
	for (const g of s.glyphs) {
		if (seenG.has(g)) continue; seenG.add(g);
		const k = keyByGlyph.get(g); if (k === undefined) continue;
		const ks = keysFor(k);
		GLYPHS.push({g, kind: VOWELS.has(g) ? "V" : "C", labels: ks.map(label),
			audio: audioFor(g), obvious: isObvious(ks), note: s.note});
	}
}

const LANG: Record<string, string> = {es: "Spanish", it: "Italian", en: "English", fr: "French", de: "German", ar: "Arabic"};

function isCombining(cp: number): boolean {
	return (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1dc0 && cp <= 0x1dff) || (cp >= 0x02b0 && cp <= 0x02ff && cp !== 0x02bc);
}
const baseGlyphs = (ipa: string): string[] => [...new Set([...ipa].filter((ch) => !isCombining(ch.codePointAt(0)!)))];

// The real words, tagged by the base glyphs they need — a word becomes typeable
// once all its glyphs are unlocked. This is the drill's material: real words,
// served fresh (unseen) as your repertoire grows.
const WORDS = WORDBANK.map((w) => ({
	target: w.ipa, labels: w.keys, word: w.w, gloss: w.gloss, lang: LANG[w.lang] ?? w.lang, glyphs: baseGlyphs(w.ipa),
}));

// A real demonstration word for each new sound, shown once when it's introduced.
interface Demo { word: string; target: string; labels: string[]; gloss?: string; lang?: string; }
const DEMO: Record<string, Demo> = {};
for (const gl of GLYPHS) {
	if (gl.obvious || DEMO[gl.g]) continue;
	const w = WORDBANK.find((w) => [...w.ipa].includes(gl.g));
	if (w) DEMO[gl.g] = {word: w.w, target: w.ipa, labels: w.keys, gloss: w.gloss, lang: LANG[w.lang] ?? w.lang};
}

const LEARN_CSS = `
#drill { background: var(--card); border: 1px solid var(--line); border-radius: 12px;
	padding: 2rem 1.5rem 2.25rem; margin: 2rem 0 1rem; text-align: center; }
#stage { color: var(--accent); font-size: 0.85rem; letter-spacing: 0.02em; }
#note { color: var(--dim); font-size: 0.95rem; margin-top: 0.35rem; min-height: 2.6rem; }
#prog { color: var(--dim); font-size: 0.8rem; margin-top: 0.75rem; }
#target { font-size: 3.2rem; height: 4.6rem; line-height: 4.6rem; }
#word { color: var(--dim); height: 1.5rem; font-size: 0.95rem; }
#word b { color: var(--fg); font-weight: 600; }
#typed { font-size: 2.2rem; height: 3.4rem; line-height: 3.4rem; margin-top: 0.5rem;
	border-bottom: 2px solid var(--line); display: inline-block; min-width: 12rem;
	font-family: "Charis SIL", "Doulos SIL", "Times New Roman", serif; }
#typed.good { border-color: #1a7f37; } #typed.bad { border-color: #c43a3a; }
#hint { height: 2.4rem; margin-top: 1rem; }
#hint kbd { font-size: 0.95rem; margin: 0 0.15rem; }
#hint button { background: none; border: 1px solid var(--line); border-radius: 6px;
	color: var(--dim); padding: 0.25rem 0.75rem; cursor: pointer; font-size: 0.85rem; }
#streak { color: var(--accent); height: 1.4rem; font-size: 0.9rem; margin-top: 0.5rem; }
#stagenav { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: center; margin-top: 0.5rem; }
#stagenav button { background: var(--card); border: 1px solid var(--line); border-radius: 999px;
	color: var(--dim); font-size: 0.8rem; padding: 0.2rem 0.7rem; cursor: pointer; }
#stagenav button.on { border-color: var(--accent); color: var(--accent); }
.notice { color: var(--dim); font-size: 0.9rem; text-align: center; }
#kbd { max-width: 33rem; margin: 1.25rem auto 0; user-select: none; }
.kbrow { display: flex; gap: 0.3rem; justify-content: center; margin-top: 0.3rem; }
.kb { flex: 1 1 0; min-width: 0; padding: 0.5rem 0; border: 1px solid var(--kbd-line);
	background: var(--kbd-bg); color: var(--fg); border-radius: 6px; cursor: pointer;
	font-family: ui-monospace, Menlo, monospace; font-size: 0.85rem; }
.kb.wide { flex: 1.5 1 0; } .kb.space { flex: 6 1 0; }
.kb.hot { background: var(--accent); border-color: var(--accent); color: #fff; }
.kb.armed, .kb.need { border-color: var(--accent); color: var(--accent); }
`;

export const LEARN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Learn IPAbet — the typing tutor</title>
<meta name="description" content="A touch-typing tutor for the IPA. Drill the glyphs and a growing bank of real words, stage by stage, in your browser — powered by the real IPAbet engine. No theory, no quizzes.">
<style>${CSS}${LEARN_CSS}</style>
</head>
<body>
<main>
	<header>
		<h1><a href="/" style="text-decoration:none;color:inherit">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/learn</span></h1>
		<p class="tagline">Learn it like touch typing.</p>
		<p class="trust">Type what you see. No theory, no quizzes — just the glyphs and a growing bank of real words, drilled by the same engine as the macOS keyboard.</p>
	</header>

	<div id="drill">
		<div id="stage"></div>
		<div id="note"></div>
		<div id="prog"></div>
		<div id="target" class="ipa"></div>
		<div id="word"></div>
		<div><span id="typed"></span></div>
		<div id="hint"></div>
		<div id="streak"></div>
	</div>
	<div id="kbd"></div>

	<p class="notice">Type on your keyboard or tap the keys — the next one lights up.
	<kbd>⇧</kbd> and <kbd>⌥</kbd> behave like the real keyboard, and backspace peels
	diacritics off one mark at a time. Click the symbol to hear it.</p>

	<footer>
		<a href="/">← IPAbet</a>
		<a href="/chart">The chart</a>
		<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
	</footer>
</main>
<script>window.__GLYPHS = ${JSON.stringify(GLYPHS)}; window.__DEMO = ${JSON.stringify(DEMO)}; window.__WORDS = ${JSON.stringify(WORDS)};</script>
<script type="module" src="${learnClient}"></script>
</body>
</html>`;
