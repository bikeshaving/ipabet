import {jsx} from "@b9g/crank/jsx-tag";
import raw from "./gen/latin.json";
import type {Coverage, DeadKey, LatinLetter} from "./latin-data.ts";
// @ts-ignore — shovel rewrites this to a hashed asset URL at build time.
import latinCss from "./styles/latin.css" with {assetBase: "/assets/"};

// The Latin letters beyond a–z, baked from the engine by scripts/bake-latin.ts.
// /type renders these under the IPA chart.

export const LATIN_STYLES = [latinCss];
const cover = raw.coverage as Coverage[];
const dead = raw.deadKeys as DeadKey[];
const special = raw.special as (LatinLetter & {capital?: string; usedIn: string[]})[];
const stacked = raw.stacked as {glyph: string; keys: string}[];

export function Alphabets() {
	return jsx`
		<div class="tablewrap"><table class="alphabets">
			<tr><th>Alphabet</th><th>Letters beyond a–z</th></tr>
			${cover.map((c) => jsx`<tr><td>${c.name}</td><td class="letters">${c.letters}</td></tr>`)}
		</table></div>`;
}

export function Diacritics() {
	return jsx`
		<div class="tablewrap"><table class="diacritics">
			<tr><th>Keys</th><th>Accent</th><th>Letters</th></tr>
			${dead.map((d) => jsx`
				<tr><td class="k">${d.keys}</td><td>${d.name}</td><td class="letters">${d.examples}</td></tr>`)}
		</table></div>`;
}

export function Stacking() {
	const s = stacked[0];
	return jsx`<p>For two marks, press both keys first: <code class="k">${s.keys}</code> for <span class="ipa">${s.glyph}</span>.</p>`;
}

export function Special() {
	return jsx`
		<div class="tablewrap"><table class="special">
			<tr><th>Letter</th><th>Keys</th><th>Used in</th></tr>
			${special.map((l) => jsx`
				<tr><td class="letters">${l.glyph}</td><td class="k">${l.keys}</td><td>${l.usedIn.join(", ")}</td></tr>`)}
		</table></div>`;
}

/** The special letters whose capitals need the Capital Digraphs option. */
export function CapitalNote() {
	const need = special.filter((l) => l.capitalDigraphs).map((l) => l.glyph).join(" ");
	return jsx`<p>The capitals of <span class="ipa">${need}</span> need Capital Digraphs on, in the input menu.</p>`;
}
