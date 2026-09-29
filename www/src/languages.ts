import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import {Layout} from "./layout.ts";
import {components} from "./marked-components.ts";
import {docs} from "./content.ts";
import {Diacritics, Stacking, Special, CapitalNote, LATIN_STYLES} from "./latin.ts";
import {LanguagePicker} from "./components/language-picker.ts";
// @ts-ignore
import languagesClient from "./clients/languages.ts" with {assetBase: "/assets/"};
// @ts-ignore — shovel rewrites this to a hashed asset URL at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};

// /languages — the accent keys, the special letters and the alphabets they
// cover. Prose is content/languages.md; the tables come from latin.ts.

const doc = docs.languages;

const Picker = () => jsx`<div id="langs-root"><${LanguagePicker} /></div>`;

export function Languages() {
	return jsx`
		<${Layout} title=${doc.attributes.title} desc=${doc.attributes.description ?? ""} path="/languages" styles=${[globalCss, ...LATIN_STYLES]}>
			<main>
				<header style="padding-bottom:1rem">
					<h1><a href="/" style="color:inherit;text-decoration:none">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/languages</span></h1>
				</header>
				<${Marked} markdown=${doc.body} components=${{...components, Diacritics, Stacking, Special, CapitalNote, Picker}} />
			</main>
			<script type="module" src=${languagesClient}></script>
		<//>`;
}
