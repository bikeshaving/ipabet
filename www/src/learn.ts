import {jsx} from "@b9g/crank/jsx-tag";
import {CURRICULUM} from "./curriculum.ts";
import {AUDIO} from "./audio-map.ts";
import {WORD_AUDIO} from "./word-audio-map.ts";
import {Layout} from "./layout.ts";
import {SerializeScript} from "./components/serialize-script.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import learnCss from "./styles/learn.css" with {assetBase: "/assets/"};
// @ts-ignore
import learnClient from "./learn-client.ts" with {assetBase: "/assets/"};

// /learn — the graded IPAbet course. A fixed, hand-designed touch-typing
// syllabus (curriculum.ts): plain keyboard → English vowels → digraphs →
// diphthongs → the sounds English lacks. Every word is engine-verified; each
// new sound plays its real Commons phoneme recording on introduction. The drill
// is a vanilla island (learn-client.ts) that fills the empty nodes below.

const AUDIO_OF = AUDIO as Record<string, string>;
const AUDIO_ALIAS: Record<string, string> = {g: "ɡ"}; // bare g emits U+0067; recording keyed on ɡ U+0261
const audioFor = (g?: string): string | undefined => (g ? (AUDIO_OF[g] ?? AUDIO_OF[AUDIO_ALIAS[g] ?? ""]) : undefined);

const LESSONS = CURRICULUM.map((l) => ({
	title: l.title, sound: l.sound, keys: l.keys, intro: l.intro,
	audio: audioFor(l.sound) ?? (l.sound ? WORD_AUDIO[l.sound] : undefined),
	words: l.words.map((wd) => ({...wd, audio: wd.lang ? WORD_AUDIO[wd.target] : (audioFor(wd.target) ?? WORD_AUDIO[wd.target])})),
}));

const DESC =
	"A touch-typing tutor for the IPA. Drill the glyphs and a growing bank of real words, stage by stage, in your browser — powered by the real IPAbet engine. No theory, no quizzes.";

export function Learn() {
	return jsx`
		<${Layout} title="Learn IPAbet — the typing tutor" desc=${DESC} styles=${[globalCss, learnCss]}>
			<main>
				<header>
					<h1><a href="/" style="text-decoration:none;color:inherit">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/learn</span></h1>
					<p class="tagline">Learn it like touch typing.</p>
					<p class="trust">Type what you see. A guided course — real words from the first lesson, one new sound at a time — drilled by the same engine as the macOS keyboard.</p>
				</header>

				<div id="controls">
					<button id="ear" aria-pressed="false" title="Hide the symbol and type from the sound alone">
						<span class="dot"></span>Ear training</button>
				</div>
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
				diacritics off one mark at a time. Click the symbol to hear it. Flip on
				<b>Ear training</b> to hide the symbol and transcribe from sound alone.</p>

				<footer>
					<a href="/">← IPAbet</a>
					<a href="/chart">The chart</a>
					<a href="/type">Scratchpad</a>
					<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
				</footer>
			</main>
			<${SerializeScript} name="__CURRICULUM" value=${LESSONS} />
			<script type="module" src=${learnClient}></script>
		<//>`;
}
