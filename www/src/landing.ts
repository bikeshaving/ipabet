import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import {Layout} from "./layout.ts";
import {TypingDemo, DEMOS} from "./components/typing-demo.ts";
import {components} from "./marked-components.ts";
import {docs} from "./content.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import typingDemoClient from "./clients/typing-demo.ts" with {assetBase: "/assets/"};
// @ts-ignore

// / — the landing page. Prose is content/index.md; this page is the chrome plus
// the landing-only components embedded in that Markdown.

const doc = docs.index;


// Landing-only components embeddable in the Markdown document.
const landingComponents = {
	...components,
	Cards: ({children}: any) => jsx`<div class="cards">${children}</div>`,
	Card: ({token, children}: any) => jsx`<div class="card"><h3>${token.title}</h3>${children}</div>`,
};

export function Landing() {
	return jsx`
		<${Layout}
			title=${doc.attributes.title}
			desc=${doc.attributes.description ?? ""}
			styles=${[globalCss]}
		>
			<main>
				<header>
					<h1>IPA<span class="ipa">bet</span> <span class="beta">beta</span></h1>
					<p class="tagline">A fast and memorable keyboard for the International Phonetic Alphabet.</p>
					<p class="trust">free · open source · offline</p>
				</header>

				<div id="typing-demo-root"><${TypingDemo} demos=${DEMOS} /></div>

				<${Marked} markdown=${doc.body} components=${landingComponents} />

				<footer>
					<span>MIT © 2026 Brian Kim</span>
					<a href="/chart">Chart</a>
					<a href="/learn">Learn</a>
					<a href="/type">Type</a>
					<a href="/design">Design</a>
					<a href="/blog">Blog</a>
					<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
				</footer>
			</main>
			<script type="module" src=${typingDemoClient}></script>
		<//>`;
}
