import spec from "../../spec/ipabet.json";
import {typeKeys, type Keystroke} from "../../js/src/index.ts";
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

interface Drill { target: string; labels: string[]; word?: string; gloss?: string; lang?: string; note?: string; audio?: string; }

const AUDIO_OF = AUDIO as Record<string, string>;

// glyph → its canonical spec key (first occurrence wins)
const keyByGlyph = new Map<string, string>();
for (const e of spec.letters as {key: string; glyph: string}[]) {
	if (!keyByGlyph.has(e.glyph)) keyByGlyph.set(e.glyph, e.key);
}
function glyphDrill(glyph: string): Drill | null {
	const k = keyByGlyph.get(glyph);
	if (k === undefined) return null;
	const ks = keysFor(k);
	return {target: typeKeys(ks), labels: ks.map(label), audio: AUDIO_OF[glyph]};
}
// marks need a carrier: drill them on a bare "a".
function markDrill(m: {opt: string; mark: string; name?: string}): Drill {
	const ks: Keystroke[] = [{key: "a", shift: false, option: false}, {key: m.opt, shift: false, option: true}];
	return {target: typeKeys(ks), labels: ks.map(label), note: (m.name ?? "").toLowerCase()};
}

const LANG: Record<string, string> = {es: "Spanish", it: "Italian", en: "English", fr: "French", de: "German", ar: "Arabic"};

const STAGE_DATA = STAGES.map((s, i) => ({
	title: s.title,
	note: s.note,
	glyphs: s.id === "marks"
		? (spec.marks as {opt: string; mark: string; name?: string}[]).map(markDrill)
		: [...s.glyphs].map(glyphDrill).filter((d): d is Drill => d !== null),
	words: WORDBANK.filter((w) => w.stage === i).map((w): Drill => ({
		target: w.ipa, labels: w.keys, word: w.w, gloss: w.gloss, lang: LANG[w.lang] ?? w.lang,
	})),
}));

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
	<div id="stagenav"></div>

	<p class="notice">Type on your keyboard or tap the keys — the next one lights up.
	<kbd>⇧</kbd> and <kbd>⌥</kbd> behave like the real keyboard, and backspace peels
	diacritics off one mark at a time. Click the symbol to hear it.</p>

	<footer>
		<a href="/">← IPAbet</a>
		<a href="/chart">The chart</a>
		<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
	</footer>
</main>
<script>window.__STAGES = ${JSON.stringify(STAGE_DATA)};</script>
<script type="module" src="${learnClient}"></script>
</body>
</html>`;
