import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import spec from "../../spec/ipabet.json";
import {Layout} from "./layout.ts";
import {Combo} from "./components/ui.ts";
import {components} from "./marked-components.ts";
import {SerializeScript} from "./components/serialize-script.ts";
import {docs} from "./content.gen.ts";
import {AUDIO} from "./audio-map.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import chartVizCss from "./styles/chart-viz.css" with {assetBase: "/assets/"};
// @ts-ignore
import landingClient from "./landing-client.ts" with {assetBase: "/assets/"};
// @ts-ignore
import chartViz from "./chart-viz.ts" with {assetBase: "/assets/"};

// / — the landing page. Prose lives as a document (content/index.md); this page
// is the chrome (header, the animated hero demo) plus the landing-only content
// components embedded in the Markdown: the layers table and feature cards.

const doc = docs.index;

// The hero demo: real keystroke sequences from the notation, animated by the
// landing-client island. Every sequence here is verified against ipabet.json.
const DEMO = [
	{word: "ship", steps: [["s", "s"], ["⇧H", "ʃ"], ["i", "ʃi"], ["⇧H", "ʃɪ"], ["p", "ʃɪp"]]},
	{word: "thing", steps: [["t", "t"], ["⇧H", "θ"], ["i", "θi"], ["⇧H", "θɪ"], ["n", "θɪn"], ["⇧G", "θɪŋ"]]},
	{word: "about", steps: [["⇧5", "ə"], ["b", "əb"], ["a", "əba"], ["u", "əbau"], ["⇧H", "əbaʊ"], ["t", "əbaʊt"]]},
	{word: "señor", steps: [["s", "s"], ["e", "se"], ["n", "sen"], ["⌥n", "señ"], ["o", "seño"], ["r", "señor"]]},
	{word: "click", steps: [["q", "q"], ["⇧C", "ǃ"], ["a", "ǃa"]]},
];

// ⇧ + number row: the IPA glyphs with no Latin home, from the spec.
const shiftNumbers = (spec.letters as {key: string; glyph: string}[]).filter((l) => /^[0-9]$/.test(l.key));

// Landing-only components embeddable in the Markdown document.
const landingComponents = {
	...components,
	Cards: ({children}: any) => jsx`<div class="cards">${children}</div>`,
	Card: ({token, children}: any) => jsx`<div class="card"><h3>${token.title}</h3>${children}</div>`,
	LayersTable: () => jsx`
		<div class="tablewrap"><table>
			<tr><th>Layer</th><th>Meaning</th><th>Examples</th></tr>
			<tr><td><kbd>bare</kbd></td><td class="desc">plain US — IPA letters that are Latin letters type directly</td>
				<td class="examples"><${Combo} keys="s" out="s"/> <${Combo} keys="1" out="1" plain/></td></tr>
			<tr><td><kbd>⇧</kbd> + number</td><td class="desc">the IPA glyphs with no Latin home</td>
				<td class="examples">${shiftNumbers.map((l) => jsx`<${Combo} keys=${"⇧" + l.key} out=${l.glyph}/>`)}</td></tr>
			<tr><td><kbd>⇧</kbd> + letter</td><td class="desc">modify the previous segment</td>
				<td class="examples"><${Combo} keys="s ⇧H" out="ʃ"/> <${Combo} keys="t ⇧R" out="ʈ"/> <${Combo} keys="n ⇧G" out="ŋ"/></td></tr>
			<tr><td><kbd>⌥</kbd></td><td class="desc">diacritics (prefix, dead-key style) &amp; suprasegmentals</td>
				<td class="examples"><${Combo} keys="⌥e a" out="á"/> <${Combo} keys="a ⌥;" out="aː"/> <${Combo} keys="h ⌥p" out="ʰ"/></td></tr>
			<tr><td><kbd>⌥⇧</kbd></td><td class="desc">raw US escape — the plain character an IPA layer claims</td>
				<td class="examples"><${Combo} keys="⌥⇧2" out="@" plain/> <${Combo} keys="⌥⇧H" out="H" plain/></td></tr>
		</table></div>`,
};

export function Landing() {
	return jsx`
		<${Layout}
			title=${doc.attributes.title}
			desc=${doc.attributes.description ?? ""}
			styles=${[globalCss, chartVizCss]}
		>
			<main>
				<header>
					<h1>IPA<span class="ipa">bet</span> <span class="beta">beta</span></h1>
					<p class="tagline">IPA at typing speed.</p>
					<p class="trust">A native macOS IPA keyboard · free · open source · fully offline · works in every app</p>
					<p class="provisional">Provisional — the keyboard layout is still being refined, and keystrokes may change between releases.</p>
				</header>

				<div id="demo">
					<textarea id="demoinput" aria-label="Type IPA — tap and type it yourself"
						spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>
					<div id="demoview"></div>
				</div>
				<div id="demonav">
					<button id="demoprev" aria-label="Previous word" title="Previous word">◀</button>
					<span class="hint">click the box and type it yourself</span>
					<button id="demonext" aria-label="Next word" title="Next word">▶</button>
				</div>

				<${Marked} markdown=${doc.body} components=${landingComponents} />

				<footer>
					<span>MIT © 2026 Brian Kim</span>
					<a href="/chart">The IPA chart in keystrokes</a>
					<a href="/learn">Learn to type it</a>
					<a href="/type">Scratchpad</a>
					<a href="/design">Design</a>
					<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
				</footer>
			</main>
			<${SerializeScript} name="__DEMO" value=${DEMO} />
			<script type="module" src=${landingClient}></script>
			<${SerializeScript} name="__CHART_AUDIO" value=${AUDIO} />
			<script type="module" src=${chartViz}></script>
		<//>`;
}
