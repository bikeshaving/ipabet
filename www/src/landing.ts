import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import spec from "../../spec/ipabet.json";
import {handleKey, applyEdit, nativeChar, previewString, type Pending} from "../../js/src/index.ts";
import {parseKey, formatKey as keyLabel} from "./keystrokes.ts";
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

// The hero demo. Authored as KEYSTROKES; the cumulative output after each one is
// computed by the real engine, exactly like curriculum.ts and the chart — so the
// demo cannot drift from the notation. It had: the old hand-written steps still
// typed "señor" with a POSTFIX ⌥n (s e n ⌥n o r), retroactively tilde-ing the n.
// Combining marks are prefix dead-keys — ⌥n comes BEFORE its base.
//
// Compact keystroke notation (as curriculum.ts): "s" bare · "+h" ⇧ · "~n" ⌥.
/** Run the keystrokes through the engine, capturing the output AND the pending
 *  dead-key after each one. A dead key yields a `noop` — the buffer doesn't move
 *  — so the pending accent is the only evidence the keystroke landed. Carrying it
 *  lets the hero both SHOW the armed accent and light that keystroke's bar
 *  (buffer-matching alone can't see a step that changed no text). */
function demo(word: string, ...keys: string[]) {
	let buffer = "";
	let pending: Pending = [];
	const steps: [string, string, string][] = []; // [key label, output, pending]
	for (const kk of keys) {
		const k = parseKey(kk);
		const step = handleKey(buffer, k, pending);
		pending = step.pending;
		buffer = applyEdit(buffer, step.edit, nativeChar(k));
		steps.push([keyLabel(kk), buffer, previewString(pending)]);
	}
	return {word, steps};
}

const DEMO = [
	demo("ship", "s", "+h", "i", "+h", "p"),
	demo("thing", "t", "+h", "i", "+h", "n", "+g"),
	demo("about", "+5", "b", "a", "u", "+h", "t"),
	demo("señor", "s", "e", "~n", "n", "o", "r"),
	demo("click", "q", "+c", "a"),
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
			<tr><td><kbd>⇧</kbd> + letter</td><td class="desc">modify the previous segment — consonants <em>and</em> vowels</td>
				<td class="examples"><${Combo} keys="s ⇧H" out="ʃ"/> <${Combo} keys="t ⇧R" out="ʈ"/> <${Combo} keys="n ⇧G" out="ŋ"/> <${Combo} keys="i ⇧H" out="ɪ"/> <${Combo} keys="u ⇧H" out="ʊ"/> <${Combo} keys="e ⇧H" out="ɛ"/></td></tr>
			<tr><td><kbd>⌥</kbd></td><td class="desc">diacritics (prefix, dead-key style) &amp; suprasegmentals</td>
				<td class="examples"><${Combo} keys="⌥e a" out="á"/> <${Combo} keys="a ⌥;" out="aː"/> <${Combo} keys="h ⌥q" out="ʰ"/></td></tr>
			<tr><td><kbd>⌃⇧</kbd> + letter</td><td class="desc">escape to the literal capital — so “GitHub” stays GitHub</td>
				<td class="examples"><${Combo} keys="⌃⇧H" out="H" plain/> <${Combo} keys="⌃⇧G ⌃⇧H" out="GH" plain/></td></tr>
			<tr><td><kbd>⌥⇧</kbd> + number</td><td class="desc">escape to the raw shifted symbol the IPA layer claims</td>
				<td class="examples"><${Combo} keys="⌥⇧2" out="@" plain/> <${Combo} keys="⌥⇧5" out="%" plain/></td></tr>
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
					<p class="trust">A native macOS IPA keyboard · free · open source · fully offline · works in every app</p>
					<p class="provisional">Provisional — the keyboard layout is still being refined, and keystrokes may change between releases.</p>
				</header>

				<div id="demo">
					<div id="demokeys"></div>
					<div class="out">
						<input id="demoinput" class="ipa" aria-label="Type IPA — click and type it yourself"
							spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" />
						<span id="demopend"></span>
					</div>
					<div id="demoword"></div>
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
