import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import {CURRICULUM} from "./curriculum.ts";
import {AUDIO} from "./audio-map.ts";
import {WORD_AUDIO} from "./word-audio-map.ts";
import {Layout} from "./layout.ts";
import {components} from "./marked-components.ts";
import {SerializeScript} from "./components/serialize-script.ts";
import {docs} from "./content.gen.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import learnCss from "./styles/learn.css" with {assetBase: "/assets/"};
// @ts-ignore
import learnClient from "./learn-client.ts" with {assetBase: "/assets/"};

// /learn — the graded IPAbet course. Prose (tagline, notice, footer) lives as a
// document (content/learn.md); the drill scaffolding is an inline <Scaffold/>
// component embedded in it, and curriculum.ts stays engine-verified data
// serialized to the vanilla island (learn-client.ts) via __CURRICULUM.

const AUDIO_OF = AUDIO as Record<string, string>;
const AUDIO_ALIAS: Record<string, string> = {g: "ɡ"}; // bare g emits U+0067; recording keyed on ɡ U+0261
const audioFor = (g?: string): string | undefined => (g ? (AUDIO_OF[g] ?? AUDIO_OF[AUDIO_ALIAS[g] ?? ""]) : undefined);

const LESSONS = CURRICULUM.map((l) => ({
	title: l.title, sound: l.sound, keys: l.keys, intro: l.intro,
	audio: audioFor(l.sound) ?? (l.sound ? WORD_AUDIO[l.sound] : undefined),
	words: l.words.map((wd) => ({...wd, audio: wd.lang ? WORD_AUDIO[wd.target] : (audioFor(wd.target) ?? WORD_AUDIO[wd.target])})),
}));

const doc = docs.learn;

// The drill scaffolding — empty containers the island fills, plus the play
// button SVG. Kept inline (jsx, not markdown); the island binds to these ids
// and builds #kbd itself, so it must NOT be pre-populated here.
const Scaffold = () => jsx`
	<div id="controls">
		<div id="lessonnav">
			<button id="prevlesson" aria-label="Previous lesson" title="Previous lesson">◀</button>
			<select id="lessonpick" aria-label="Jump to lesson"></select>
			<button id="nextlesson" aria-label="Next lesson" title="Next lesson">▶</button>
		</div>
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
	<div id="kbd"></div>`;

export function Learn() {
	return jsx`
		<${Layout} title=${doc.attributes.title} desc=${doc.attributes.description ?? ""} styles=${[globalCss, learnCss]}>
			<main>
				<header>
					<h1><a href="/" style="text-decoration:none;color:inherit">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/learn</span></h1>
				</header>
				<${Marked} markdown=${doc.body} components=${{...components, Scaffold}} />
			</main>
			<${SerializeScript} name="__CURRICULUM" value=${LESSONS} />
			<script type="module" src=${learnClient}></script>
		<//>
	`;
}
