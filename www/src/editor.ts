import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import {Layout} from "./layout.ts";
import {components} from "./marked-components.ts";
import {docs} from "./content.gen.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import editorCss from "./styles/editor.css" with {assetBase: "/assets/"};
// @ts-ignore
import editorClient from "./editor-client.ts" with {assetBase: "/assets/"};

// /type — a freeform IPA scratchpad. Prose lives as a document (content/type.md);
// the interactive editor DOM is an inline <Pad/> component embedded in that
// document. editor-client.ts (vanilla island) attaches to #ed/#pad as before, so
// no framework ships to the client.

const doc = docs.type;

// The editor DOM, embedded in the Markdown via <Pad/>. Kept inline (jsx, not
// markdown) — the island binds to these exact ids.
const Pad = () => jsx`
	<div id="pad">
		<textarea id="ed" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"
			placeholder="Start typing… s⇧H → ʃ · 5⇧Y → ə · a⌥; → aː · ⌥n n → ñ"></textarea>
		<div id="bar2">
			<span id="count">0</span>
			<span class="grow"></span>
			<button id="clear">Clear</button>
			<button id="copy">Copy</button>
		</div>
		<span id="pending-mount"></span>
	</div>`;

export function Type() {
	return jsx`
		<${Layout} title=${doc.attributes.title} desc=${doc.attributes.description ?? ""} styles=${[globalCss, editorCss]}>
			<main>
				<header style="padding-bottom:1rem">
					<h1><a href="/" style="color:inherit;text-decoration:none">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/type</span></h1>
				</header>
				<${Marked} markdown=${doc.body} components=${{...components, Pad}} />
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
