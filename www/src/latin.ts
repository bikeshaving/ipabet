import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import {Layout} from "./layout.ts";
import {components} from "./marked-components.ts";
import {docs} from "./content.ts";
import raw from "./gen/latin.json";
import type {Coverage, LatinLetter} from "./latin-data.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import latinCss from "./styles/latin.css" with {assetBase: "/assets/"};

// /latin — the Latin letters beyond a–z, baked from the engine by
// scripts/bake-latin.ts. Prose is content/latin.md.

const doc = docs.latin;
const letters = raw.letters as LatinLetter[];
const cover = raw.coverage as Coverage[];
const byGlyph = new Map(letters.map((l) => [l.glyph, l]));

const alphabetLetters = new Set(cover.flatMap((c) => [...c.letters].flatMap((g) => [g, g.toUpperCase()])));

/** Phonetic-only blocks: on the chart, not in anyone's alphabet. */
function phonetic(g: string): boolean {
	const cp = g.codePointAt(0)!;
	return (cp >= 0x250 && cp <= 0x2af) || (cp >= 0x1d00 && cp <= 0x1dbf) ||
		(cp >= 0x2c60 && cp <= 0x2c7f) || (cp >= 0x1c0 && cp <= 0x1c3);
}

function Alphabets() {
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

function Letters() {
	const shown = letters.filter((l) => !phonetic(l.glyph) || alphabetLetters.has(l.glyph));
	const lower = shown.filter((l) => {
		const low = l.glyph.toLowerCase();
		return l.glyph === low || !byGlyph.has(low) || [...low].length !== 1;
	});
	const groups = new Map<string, LatinLetter[]>();
	for (const l of lower) groups.set(l.base, [...(groups.get(l.base) ?? []), l]);
	const order = [...groups.keys()].sort();
	return jsx`${order.map((b) => {
		const items = groups.get(b)!.sort((x, y) => x.keys.length - y.keys.length || x.glyph.localeCompare(y.glyph));
		return jsx`
			<section class="base">
				<h3>${b}</h3>
				<ul>${items.map((l) => {
					const up = l.glyph.toUpperCase();
					const cap = [...up].length === 1 && up !== l.glyph ? byGlyph.get(up) : undefined;
					const dagger = cap?.capitalDigraphs || l.capitalDigraphs ? "†" : "";
					return jsx`<li><span class="g">${l.glyph}${cap ? " " + cap.glyph : ""}${dagger}</span><span class="k">${l.keys}</span></li>`;
				})}</ul>
			</section>`;
	})}`;
}

export function Latin() {
	return jsx`
		<${Layout} title=${doc.attributes.title} desc=${doc.attributes.description ?? ""} path="/latin" styles=${[globalCss, latinCss]}>
			<main>
				<header style="padding-bottom:1rem">
					<h1><a href="/" style="color:inherit;text-decoration:none">IPA<span class="ipa">bet</span></a> <span style="font-weight:400">/latin</span></h1>
				</header>
				<${Marked} markdown=${doc.body} components=${{...components, Alphabets, Letters}} />
				<footer>
					<a href="/">← IPAbet</a>
					<a href="/chart">The chart</a>
					<a href="/keys">Keys</a>
					<a href="/type">Type</a>
				</footer>
			</main>
		<//>`;
}
