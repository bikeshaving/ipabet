import {CURRICULUM} from "./curriculum.ts";
import {CSS} from "./style.ts";
import {AUDIO} from "./audio-map.ts";
import {WORD_AUDIO} from "./word-audio-map.ts";
// Shovel's asset pipeline rewrites this import to a hashed URL string at build
// time; TypeScript sees the module itself, hence the ignore.
// @ts-ignore
import learnClient from "./learn-client.ts" with {assetBase: "/assets/"};

// /learn — the graded IPAbet course. A fixed, hand-designed touch-typing
// syllabus (curriculum.ts): plain keyboard → English vowels → digraphs →
// diphthongs → the sounds English lacks. Every word is engine-verified; each
// new sound plays its real Commons phoneme recording on introduction.

const AUDIO_OF = AUDIO as Record<string, string>;
const AUDIO_ALIAS: Record<string, string> = {g: "ɡ"}; // bare g emits U+0067; recording keyed on ɡ U+0261
const audioFor = (g?: string): string | undefined => (g ? (AUDIO_OF[g] ?? AUDIO_OF[AUDIO_ALIAS[g] ?? ""]) : undefined);

const LESSONS = CURRICULUM.map((l) => ({
	title: l.title, sound: l.sound, keys: l.keys, intro: l.intro,
	audio: audioFor(l.sound) ?? (l.sound ? WORD_AUDIO[l.sound] : undefined), // Commons recording (more oomph); Polly demo only where Wiki has none (diphthongs)
	words: l.words.map((wd) => ({...wd, audio: wd.lang ? WORD_AUDIO[wd.target] : (audioFor(wd.target) ?? WORD_AUDIO[wd.target])})),
}));

const LEARN_CSS = `
#drill { position: relative; background: var(--card); border: 1px solid var(--line);
	border-radius: 16px; padding: 2.4rem 1.5rem 2rem; margin: 2rem 0 1.25rem;
	text-align: center; overflow: hidden; }
#bar { position: absolute; inset: 0 0 auto 0; height: 3px; background: var(--line); }
#barfill { height: 100%; width: 0; background: var(--accent);
	transition: width .35s cubic-bezier(.4,0,.2,1); }

#stage { font-size: .72rem; letter-spacing: .14em; text-transform: uppercase;
	color: var(--dim); font-weight: 600; }
#stage .g { color: var(--accent); text-transform: none; letter-spacing: 0; font-size: 1rem; }
#stage kbd { text-transform: none; letter-spacing: 0; }
#note { color: var(--dim); font-size: .95rem; margin: .5rem auto 0; max-width: 32rem; min-height: 2.8rem; }
#prog { color: var(--dim); opacity: .7; font-size: .72rem; letter-spacing: .06em;
	text-transform: uppercase; margin-top: 1rem; }

#hero { display: inline-flex; align-items: center; gap: .65rem; margin-top: .35rem; }
#target { font-size: 3.6rem; line-height: 1.15; cursor: pointer; }
#say { appearance: none; flex: none; width: 2.15rem; height: 2.15rem; border-radius: 50%;
	border: 1px solid var(--line); background: var(--bg); color: var(--accent); cursor: pointer;
	display: grid; place-items: center; padding: 0;
	transition: transform .12s, background .15s, border-color .15s, color .15s; }
#say svg { width: .82rem; height: .82rem; }
#say:hover { border-color: var(--accent); background: var(--accent); color: #fff; }
#say:active { transform: scale(.88); }
#say.playing { animation: saypulse .45s ease; }
@keyframes saypulse { 50% { transform: scale(1.18); } }

#word { height: 1.7rem; font-size: .95rem; color: var(--dim); margin-top: .55rem; }
#word b { color: var(--fg); font-weight: 600; font-size: 1.05rem; }
#word .chip { display: inline-block; font-size: .66rem; letter-spacing: .05em; text-transform: uppercase;
	color: var(--dim); background: var(--kbd-bg); border: 1px solid var(--line); border-radius: 999px;
	padding: .12rem .5rem; margin-left: .45rem; vertical-align: .1em; }

#typedwrap { display: inline-flex; align-items: center; min-width: 11rem; margin-top: 1.25rem;
	padding: .35rem 1.1rem; border: 2px solid var(--line); border-radius: 12px;
	transition: border-color .2s, background .2s; }
#typed { font-size: 2.1rem; line-height: 2.8rem; min-height: 2.8rem;
	font-family: "Charis SIL","Doulos SIL","Times New Roman",serif; }
.caret { display: inline-block; width: 2px; height: 1.9rem; background: var(--accent);
	margin-left: 2px; animation: blink 1.1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
#typedwrap.good { border-color: #1a7f37; background: color-mix(in srgb, #1a7f37 9%, transparent); }
#typedwrap.bad { border-color: #c43a3a; background: color-mix(in srgb, #c43a3a 9%, transparent); }
#typedwrap.good .caret { opacity: 0; }

#hint { height: 2.4rem; margin-top: 1.1rem; display: flex; align-items: center; justify-content: center; gap: .25rem; }
#hint kbd { font-size: .95rem; }
#hint button { background: none; border: 1px solid var(--line); border-radius: 999px;
	color: var(--dim); padding: .3rem .9rem; cursor: pointer; font-size: .82rem;
	transition: color .15s, border-color .15s; }
#hint button:hover { color: var(--accent); border-color: var(--accent); }
#streak { color: var(--accent); height: 1.5rem; font-size: .85rem; font-weight: 600; margin-top: .4rem; }

.notice { color: var(--dim); font-size: .88rem; text-align: center; max-width: 34rem; margin: 0 auto; }

#kbd { max-width: 34rem; margin: 1.5rem auto .5rem; user-select: none; }
.kbrow { display: flex; gap: .3rem; justify-content: center; margin-top: .3rem; }
.kb { flex: 1 1 0; min-width: 0; padding: .55rem 0; border: 1px solid var(--kbd-line);
	background: var(--kbd-bg); color: var(--fg); border-radius: 7px; cursor: pointer;
	font-family: ui-monospace, Menlo, monospace; font-size: .85rem;
	transition: transform .08s, background .12s, border-color .12s, color .12s, box-shadow .12s; }
.kb:active { transform: translateY(1px); }
.kb.wide { flex: 1.5 1 0; } .kb.space { flex: 6 1 0; }
.kb.hot { background: var(--accent); border-color: var(--accent); color: #fff;
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
.kb.armed, .kb.need { border-color: var(--accent); color: var(--accent); }
@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation: none !important; transition: none !important; } }
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
		<p class="trust">Type what you see. A guided course — real words from the first lesson, one new sound at a time — drilled by the same engine as the macOS keyboard.</p>
	</header>

	<div id="drill">
		<div id="bar"><div id="barfill"></div></div>
		<div id="stage"></div>
		<div id="note"></div>
		<div id="prog"></div>
		<div id="hero">
			<div id="target" class="ipa"></div>
			<button id="say" aria-label="Play the sound"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.4 4.4 5.3H1.8v5.4h2.6L8 13.6z" fill="currentColor"/><path d="M10.4 5.3a3.4 3.4 0 0 1 0 5.4M12 3.5a5.8 5.8 0 0 1 0 9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>
		</div>
		<div id="word"></div>
		<div id="typedwrap"><span id="typed"></span><span class="caret"></span></div>
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
<script>window.__CURRICULUM = ${JSON.stringify(LESSONS)};</script>
<script type="module" src="${learnClient}"></script>
</body>
</html>`;
