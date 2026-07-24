import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import {CURRICULUM} from "./curriculum.ts";
import {AUDIO} from "./gen/audio-map.ts";
import {WORD_AUDIO} from "./gen/word-audio-map.ts";
import {Layout} from "./layout.ts";
import {components} from "./marked-components.ts";
import {SerializeScript} from "./components/serialize-script.ts";
import {docs} from "./content.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import learnCss from "./styles/learn.css" with {assetBase: "/assets/"};
// @ts-ignore
import kbdCss from "./styles/kbd.css" with {assetBase: "/assets/"};
// @ts-ignore
import learnClient from "./clients/learn-client.ts" with {assetBase: "/assets/"};

// /learn — the graded course. Prose is content/learn.md; the drill scaffolding is
// an inline <Scaffold/> embedded in it.

const AUDIO_OF = AUDIO as Record<string, string>;
const AUDIO_ALIAS: Record<string, string> = {g: "ɡ"}; // bare g emits U+0067; recording keyed on ɡ U+0261
const audioFor = (g?: string): string | undefined => (g ? (AUDIO_OF[g] ?? AUDIO_OF[AUDIO_ALIAS[g] ?? ""]) : undefined);

const LESSONS = CURRICULUM.map((l) => ({
	title: l.title, sound: l.sound, keys: l.keys, intro: l.intro,
	part: l.part, prose: l.prose, review: l.review,
	audio: audioFor(l.sound) ?? (l.sound ? WORD_AUDIO[l.sound] : undefined),
	words: l.words.map((wd) => ({...wd, audio: wd.lang ? WORD_AUDIO[wd.target] : (audioFor(wd.target) ?? WORD_AUDIO[wd.target])})),
}));

const doc = docs.learn;

// The drill scaffolding — empty containers the island fills. The island builds
// #kbd itself, so it must NOT be pre-populated here.
const Scaffold = () => jsx`
	<div id="controls">
		<div id="lessonnav">
			<button id="prevlesson" aria-label="Previous lesson" title="Previous lesson">◀</button>
			<button id="indextoggle" aria-expanded="false" title="All lessons">All lessons</button>
			<button id="nextlesson" aria-label="Next lesson" title="Next lesson">▶</button>
		</div>
		<button id="ear" aria-pressed="false" title="Hide the symbol and type from the sound alone">
			<span class="dot"></span>Ear training</button>
	</div>
	<div id="lessonindex"></div>
	<div id="drill"></div>
	<div id="kbd"></div>`;

export function Learn() {
	return jsx`
		<${Layout} title=${doc.attributes.title} desc=${doc.attributes.description ?? ""} styles=${[globalCss, learnCss, kbdCss]}>
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
