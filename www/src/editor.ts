import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import {Layout} from "./layout.ts";
import {components} from "./marked-components.ts";
import {docs} from "./content.gen.ts";
import {KeyboardRef} from "./kbd.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import editorCss from "./styles/editor.css" with {assetBase: "/assets/"};
// @ts-ignore
import kbdCss from "./styles/kbd.css" with {assetBase: "/assets/"};
// @ts-ignore
import editorClient from "./editor-client.ts" with {assetBase: "/assets/"};

// /type — prose is content/type.md; the editor DOM is an inline <Pad/> embedded in
// it, and editor-client.ts attaches to #ed/#pad.

const doc = docs.type;

// The editor DOM, embedded in the Markdown via <Pad/>. Kept inline (jsx, not
// markdown) — the island binds to these exact ids.
const Pad = () => jsx`
	<div id="pad">
		<textarea id="ed" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"
			placeholder="Type IPA…"></textarea>
		<div id="bar2">
			<span id="count">0</span>
			<span id="pending-mount"></span>
			<span class="grow"></span>
			<button id="clear">Clear</button>
			<button id="copy">Copy</button>
		</div>
	</div>`;

export function Type() {
	return jsx`
		<${Layout} title=${doc.attributes.title} desc=${doc.attributes.description ?? ""} styles=${[globalCss, editorCss, kbdCss]}>
			<main>
				<header style="padding-bottom:1rem">
					<h1><a href="/" style="color:inherit;text-decoration:none">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/type</span></h1>
				</header>
				<${Marked} markdown=${doc.body} components=${{...components, Pad, Keyboard: KeyboardRef}} />
				<footer>
					<a href="/">← IPAbet</a>
					<a href="/chart">The chart</a>
					<a href="/learn">Learn</a>
					<a href="https://github.com/bikeshaving/ipabet">GitHub</a>
				</footer>
			</main>
			<script type="module" src=${editorClient}></script>
		<//>`;
}
