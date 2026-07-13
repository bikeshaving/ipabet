import {jsx} from "@b9g/crank/jsx-tag";
import {Combo, Glyph} from "./components/ui.ts";

// Components embeddable inline in Markdown. crankdown resolves PascalCase tags
// in a document against this map, passing the tag's attributes as `token` and
// its (markdown-processed) contents as `children`.
export const components: Record<string, unknown> = {
	Combo: ({token}: any) =>
		jsx`<${Combo} keys=${token.keys} out=${token.out} plain=${!!token.plain} />`,

	Glyph: ({children}: any) => jsx`<${Glyph}>${children}</${Glyph}>`,

	// A lead paragraph: <Lede>…</Lede> → <p class="lede">.
	Lede: ({children}: any) => jsx`<p class="lede">${children}</p>`,

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
