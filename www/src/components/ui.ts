import {jsx} from "@b9g/crank/jsx-tag";

// The IPAbet domain vocabulary — the keystroke/glyph units every page is built
// from. Usable both in data-driven page components and, via
// marked-components.ts, inline in Markdown documents.

/** A styled key cap: <Kbd>⇧H</Kbd>. */
export function Kbd({children}: {children?: unknown}) {
	return jsx`<kbd>${children}</kbd>`;
}

/** An IPA glyph in the serif face: <Glyph>ʃ</Glyph>. */
export function Glyph({children}: {children?: unknown}) {
	return jsx`<b class="ipa">${children}</b>`;
}

export interface ComboProps {
	/** Space-separated key caps: "s ⇧H". */
	keys?: string;
	/** The resulting glyph shown after the arrow. Omit for a keys-only combo. */
	out?: string;
	/** Render the output as a plain char (an escape's output: @, GH) rather than IPA. */
	plain?: boolean;
}

/** keystroke → glyph, e.g. <Combo keys="s ⇧H" out="ʃ"/>. The unit that was
 *  hand-copied 37 times as <span class="combo">…</span>. */
export function Combo({keys = "", out, plain}: ComboProps) {
	const caps = keys.split(/\s+/).filter(Boolean);
	return jsx`
		<span class="combo">${caps.map((k) => jsx`<kbd>${k}</kbd>`)}${
			out === undefined
				? null
				: jsx`<span class="arrow">→</span>${plain ? jsx`<b>${out}</b>` : jsx`<b class="ipa">${out}</b>`}`
		}</span>`;
}

/** Footer nav. Links are [href, text] pairs; a bare string renders as text. */
export function Footer({links = [], lead}: {links?: Array<[string, string]>; lead?: string}) {
	return jsx`
		<footer>
			${lead ? jsx`<span>${lead}</span>` : null}
			${links.map(([href, text]) => jsx`<a href=${href}>${text}</a>`)}
		</footer>`;
}
