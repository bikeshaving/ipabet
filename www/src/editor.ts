import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import {Layout, SITE} from "./layout.ts";
import {components} from "./marked-components.ts";
import {docs} from "./content.ts";
import {KeyboardRef} from "./components/kbd.ts";
import {Pad} from "./components/pad.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import editorCss from "./styles/editor.css" with {assetBase: "/assets/"};
// @ts-ignore
import kbdCss from "./styles/kbd.css" with {assetBase: "/assets/"};
// @ts-ignore
import typeClient from "./clients/type.ts" with {assetBase: "/assets/"};

// /type — prose is content/type.md; the pad is the shared component
// (components/pad.ts), server-rendered here and hydrated by clients/type.ts.

const doc = docs.type;

// The hydration root: the markdown embeds <Pad/>, the entry hydrates the same
// component onto this container.
const PadRoot = () => jsx`<div id="pad-root"><${Pad} /></div>`;

// The browser scratchpad is its own thing to a search engine: a tool that runs
// where you already are, not the download.
const schema = {
	"@context": "https://schema.org",
	"@type": "WebApplication",
	name: "IPAbet online IPA keyboard",
	description: doc.attributes.description ?? "",
	url: SITE + "/type",
	applicationCategory: "UtilitiesApplication",
	browserRequirements: "Requires JavaScript. Works in any modern browser.",
	operatingSystem: "Any",
	isAccessibleForFree: true,
	offers: {"@type": "Offer", price: "0", priceCurrency: "USD"},
	author: {"@type": "Person", name: "Brian Kim"},
};

export function Type() {
	return jsx`
		<${Layout} title=${doc.attributes.title} desc=${doc.attributes.description ?? ""} path="/type" schema=${schema} styles=${[globalCss, editorCss, kbdCss]}>
			<main>
				<header style="padding-bottom:1rem">
					<h1><a href="/" style="color:inherit;text-decoration:none">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/type</span></h1>
				</header>
				<${Marked} markdown=${doc.body} components=${{...components, Pad: PadRoot, Keyboard: KeyboardRef}} />
				<footer>
					<a href="/">← IPAbet</a>
					<a href="/chart">The chart</a>
					<a href="/learn">Learn</a>
					<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
				</footer>
			</main>
			<script type="module" src=${typeClient}></script>
		<//>`;
}
