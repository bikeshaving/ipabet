import {jsx} from "@b9g/crank/jsx-tag";
import spec from "../../spec/ipabet.json";

// THE keyboard — the one board every surface renders. /type shows it as a
// reference (marks emphasized, names in tooltips); /learn renders the same
// caps interactively (bare char emphasized, hot/armed states). One markup,
// one stylesheet (kbd.css); modes are CSS emphasis, not separate keyboards.

interface MarkE {
	opt: string; mark: string; type: string; double?: string; name?: string;
}

const marks = new Map((spec.marks as MarkE[]).map((m) => [m.opt, m]));
const modifiers = spec.modifiers as Record<string, string>;
const quotes = (spec as {quotes: {default: string; locales: Record<string, string[]>}}).quotes;
const quad = quotes.locales[quotes.default];

export const KB_ROWS: [string, number][] = [
	["`1234567890-=", 0],
	["qwertyuiop[]\\", 1.5],
	["asdfghjkl;'", 1.85],
	["zxcvbnm,./", 2.4],
];

const shown = (glyph: string, type: string) => (type === "combining" ? "◌" + glyph : glyph);

const SPECIALS: Record<string, {main: string; second: string; title: string}> = {
	j: {main: "◌͡◌", second: "◌͜◌", title: "⌥j tie bar (joins the two segments around it) · ⌥⇧j tie below, for colliding descenders · again ⇄ ͢ sliding"},
	z: {main: "◌ᶻ", second: "◌₂", title: "⌥z superscript the previous glyph (t h ⌥z → tʰ) · ⌥⇧z subscript it"},
	"[": {main: quad[0], second: quad[1], title: `⌥[ opening primary quote · ⌥⇧[ closing (locale ${quotes.default}; set in the input menu)`},
	"]": {main: quad[2], second: quad[3], title: `⌥] opening secondary quote · ⌥⇧] closing`},
};

/** A key's tooltip: its ⌥ tenants plus, for a modifier letter, its ⇧ meaning. */
export function capTitle(ch: string): string {
	const mod = /[a-z]/.test(ch) ? modifiers[ch.toUpperCase()] : undefined;
	const modTitle = mod === undefined ? "" : ` — ⇧${ch.toUpperCase()} modifier: ${mod}`;
	const sp = SPECIALS[ch];
	if (sp !== undefined) return sp.title + modTitle;
	const m = marks.get(ch);
	if (m !== undefined) return `⌥${ch} ${(m.name ?? "").toLowerCase()}` + modTitle;
	return (ch === "-" ? "⌥- reserved — the host's dashes pass through" : `⌥${ch} passes to the host`) + modTitle;
}

/** The inside of a cap: bare char plus the Option-layer tenants. Same body in
 *  both modes; the mode class decides what is emphasized. */
export function capBody(ch: string) {
	const sp = SPECIALS[ch];
	const m = marks.get(ch);
	if (sp !== undefined) {
		return jsx`<span class="b">${ch}</span>
			<span class="h p ipa wide">${sp.main}</span><span class="h s ipa wide">${sp.second}</span>`;
	}
	if (m !== undefined) {
		if (m.double === undefined) {
			return jsx`<span class="b">${ch}</span><span class="h p ipa solo">${shown(m.mark, m.type)}</span>`;
		}
		return jsx`<span class="b">${ch}</span>
			<span class="h p ipa">${shown(m.mark, m.type)}</span>
			<span class="h s ipa">${shown(m.double, m.type)}</span>`;
	}
	return jsx`<span class="b solo">${ch}</span>`;
}

/** The reference board: static caps, tooltips, the legend. */
export function KeyboardRef() {
	return jsx`
		<div class="kbd kbd--ref">
			${KB_ROWS.map(([chars, indent]) => jsx`
				<div class="krow" style=${`padding-left:${indent}rem`}>
					${[...chars].map((ch) => jsx`<div class="cap" title=${capTitle(ch)}>${capBody(ch)}</div>`)}
				</div>`)}
			<p class="klegend">Each key: bare char, then <span class="p">⌥ mark</span> · <span class="s">⌥⇧ form</span> — hover for names. Combining marks (drawn on ◌) are dead keys: chord first, then the base. The <kbd>⇧</kbd>-capital modifiers live in the tooltips and on <a href="/keys">/keys</a>.</p>
		</div>`;
}
