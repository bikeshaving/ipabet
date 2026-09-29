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
const special = raw.special as (LatinLetter & {capital?: string})[];
const stacked = raw.stacked as {glyph: string; keys: string}[];

export function Alphabets() {
	return jsx`
		<div class="tablewrap"><table class="alphabets">
			<tr><th>Alphabet</th><th>Letters beyond a–z</th><th></th></tr>
			${cover.map((c) => jsx`
				<tr>
					<td>${c.name}</td>
					<td class="letters">${c.letters}</td>
					<td class="ok">${c.missing.length ? `missing ${c.missing.join(" ")}` : c.capitalDigraphs.length ? `all · ${c.capitalDigraphs.join(" ")} †` : "all"}</td>
				</tr>`)}
		</table></div>`;
}

export function Diacritics() {
	return jsx`
		<div class="tablewrap"><table class="diacritics">
			<tr><th>Keys</th><th>Mark</th><th>In the alphabets above</th></tr>
			${dead.map((d) => jsx`
				<tr><td class="k">${d.keys}</td><td>${d.name}</td><td class="letters">${d.examples}</td></tr>`)}
		</table></div>`;
}

export function Stacking() {
	return jsx`<p>Two marks on one letter: press both dead keys, then the letter. ${stacked.map((s, i) => jsx`${i ? " and " : ""}<code class="k">${s.keys}</code> for <span class="ipa">${s.glyph}</span>`)}.</p>`;
}

export function Special() {
	return jsx`
		<ul class="special">${special.map((l) => jsx`
			<li><span class="g">${l.glyph}${l.capital ? " " + l.capital : ""}${l.capitalDigraphs ? "†" : ""}</span><span class="k">${l.keys}</span></li>`)}
		</ul>`;
}
