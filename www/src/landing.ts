import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import spec from "../../spec/ipabet.json";
import {Layout} from "./layout.ts";
import {Combo} from "./components/ui.ts";
import {TypingDemo, DEMOS} from "./components/typing-demo.ts";
import {components} from "./marked-components.ts";
import {SerializeScript} from "./components/serialize-script.ts";
import {docs} from "./content.ts";
import {AUDIO} from "./gen/audio-map.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import chartVizCss from "./styles/chart-viz.css" with {assetBase: "/assets/"};
// @ts-ignore
import typingDemoClient from "./clients/typing-demo.ts" with {assetBase: "/assets/"};
// @ts-ignore
import chartsClient from "./clients/charts.ts" with {assetBase: "/assets/"};

// / — the landing page. Prose is content/index.md; this page is the chrome plus
// the landing-only components embedded in that Markdown.

const doc = docs.index;


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
			<tr><td><kbd>⇧</kbd> + letter</td><td class="desc">modify the previous segment — consonants <em>and</em> vowels</td>
				<td class="examples"><${Combo} keys="s ⇧H" out="ʃ"/> <${Combo} keys="t ⇧R" out="ʈ"/> <${Combo} keys="n ⇧G" out="ŋ"/> <${Combo} keys="i ⇧H" out="ɪ"/> <${Combo} keys="u ⇧H" out="ʊ"/> <${Combo} keys="e ⇧H" out="ɛ"/></td></tr>
			<tr><td><kbd>⌥</kbd></td><td class="desc">diacritics (prefix, dead-key style) &amp; suprasegmentals</td>
				<td class="examples"><${Combo} keys="⌥e a" out="á"/> <${Combo} keys="a ⌥;" out="aː"/> <${Combo} keys="⌥z h" out="ʰ"/></td></tr>
			<tr><td><kbd>⌃⇧</kbd> + letter</td><td class="desc">escape to the literal capital — so “GitHub” stays GitHub</td>
				<td class="examples"><${Combo} keys="⌃⇧H" out="H" plain/> <${Combo} keys="⌃⇧G ⌃⇧H" out="GH" plain/></td></tr>
			<tr><td><kbd>⌥⇧</kbd></td><td class="desc">a mark’s second form, plus a few deliberate spends</td>
				<td class="examples"><${Combo} keys="⌥⇧n a" out="a̰"/> <${Combo} keys="⌥⇧2" out="ʾ"/></td></tr>
			<tr><td><kbd>Caps Lock</kbd></td><td class="desc">a lock, not a modifier — letters type literal capitals, never transforms</td>
				<td class="examples"><${Combo} keys="⇪T ⇪H" out="TH" plain/></td></tr>
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
					<p class="trust">A real IPA keyboard · free · open source · fully offline · native on macOS · full engine in any browser</p>
				</header>

				<div id="typing-demo-root"><${TypingDemo} demos=${DEMOS} /></div>

				<${Marked} markdown=${doc.body} components=${landingComponents} />

				<footer>
					<span>MIT © 2026 Brian Kim</span>
					<a href="/chart">The IPA chart in keystrokes</a>
					<a href="/learn">Learn to type it</a>
					<a href="/type">Scratchpad</a>
					<a href="/design">Design</a>
					<a href="/blog">Blog</a>
					<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
				</footer>
			</main>
			<script type="module" src=${typingDemoClient}></script>
			<${SerializeScript} name="__CHART_AUDIO" value=${AUDIO} />
			<script type="module" src=${chartsClient}></script>
		<//>`;
}
