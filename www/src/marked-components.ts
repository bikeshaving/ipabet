import {jsx} from "@b9g/crank/jsx-tag";
import {Combo, Glyph} from "./components/ui.ts";
import {VowelApp, ConsonantApp} from "./components/chart-viz.ts";

// Components embeddable inline in Markdown. crankdown resolves PascalCase tags
// against this map, passing attributes as `token` and contents as `children`.
export const components: Record<string, unknown> = {
	Combo: ({token}: any) =>
		jsx`<${Combo} keys=${token.keys} out=${token.out} plain=${!!token.plain} />`,

	Glyph: ({children}: any) => jsx`<${Glyph}>${children}</${Glyph}>`,

	// The interactive charts: real components, server-rendered where the markdown
	// places them and hydrated by clients/charts.ts (which supplies the audio map).
	VowelChart: () => jsx`<div id="vowel-chart"><${VowelApp} /></div>`,
	ConsonantChart: () => jsx`<div id="consonant-chart"><${ConsonantApp} /></div>`,

	// A lead paragraph: <Lede>…</Lede> → <p class="lede">.
	Lede: ({children}: any) => jsx`<p class="lede">${children}</p>`,

	// A centered call-to-action line under the title; `sub` is the smaller second line.
	Cta: ({token, children}: any) => jsx`<p class=${"cta" + (token.sub ? " sub" : "")}>${children}</p>`,

	// An aside card: <Note>…</Note> → the accent-barred .note box.
	Note: ({children}: any) => jsx`<div class="note">${children}</div>`,

	// A compact heading over an embedded interactive chart.
	ChartTitle: ({children}: any) => jsx`<h3 class="chart-title">${children}</h3>`,

	// Plain headings (crankdown's default adds a slug id + anchor link we don't want).
	heading: ({token, children}: any) => {
		const tag = `h${token.depth}`;
		return jsx`<${tag}>${children}<//>`;
	},

	// The /design five-constraints list, modeled instead of hand-built.
	Constraints: ({children}: any) => jsx`<ol class="constraints">${children}</ol>`,
	Constraint: ({token, children}: any) =>
		jsx`
			<li>
				<span class="name">${token.name}</span>${
					token.tag
						? jsx`<span class=${token.tag === "hard" ? "tag hard" : "tag"}>${token.tag}</span>`
						: null
				}
				<div class="body">${children}</div>
			</li>`,
};
