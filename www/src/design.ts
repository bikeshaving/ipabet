import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import {Layout} from "./layout.ts";
import {components} from "./marked-components.ts";
import {SerializeScript} from "./components/serialize-script.ts";
import {docs} from "./content.gen.ts";
import {AUDIO} from "./audio-map.ts";
import {CHART_KEYS} from "./chart-keys.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import designCss from "./styles/design.css" with {assetBase: "/assets/"};
// @ts-ignore
import chartVizCss from "./styles/chart-viz.css" with {assetBase: "/assets/"};
// @ts-ignore
import chartViz from "./chart-viz.ts" with {assetBase: "/assets/"};

// /design — the reference explanation. Prose is content/design.md; this page is
// chrome plus the interactive-chart islands.

const doc = docs.design;

export function Design() {
	return jsx`
		<${Layout}
			title=${doc.attributes.title}
			desc=${doc.attributes.description ?? ""}
			styles=${[globalCss, designCss, chartVizCss]}
		>
			<main>
				<header style="padding-bottom:1rem">
					<h1><a href="/" style="color:inherit;text-decoration:none">IPA<span class="ipa">bet</span></a></h1>
					<p class="tagline" style="font-size:1.1rem">The design</p>
				</header>
				<${Marked} markdown=${doc.body} components=${components} />
			</main>
			<${SerializeScript} name="__CHART_AUDIO" value=${AUDIO} />
			<${SerializeScript} name="__CHART_KEYS" value=${CHART_KEYS} />
			<script type="module" src=${chartViz}></script>
		<//>`;
}
