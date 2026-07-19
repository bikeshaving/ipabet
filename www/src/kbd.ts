import {jsx} from "@b9g/crank/jsx-tag";
import spec from "../../spec/ipabet.json";

// THE keyboard — one component, real ANSI geometry, never improvised.
// Unit widths are the physical standard (quarter-key grid, 15u per row):
//   `1234567890-=  ⌫2u · tab1.5u qwertyuiop[]\\1.5u · caps1.75u …' ⏎2.25u ·
//   ⇧2.25u zxcvbnm,./ ⇧2.75u · fn ⌃ ⌥ ⌘1.25u ␣(fill) ⌘1.25u ⌥
// Surfaces: /type renders it as reference (.kbd--ref: ⌥/⌥⇧ layer toggle,
// tooltips, chrome inert); /learn renders the same board as the drill
// (.kbd--drill: bare chars, hot/armed states, functional ⇧ ⌥ ⌫ ␣; when ⌥ is
// armed the caps show the ⌥ layer — Keyboard Viewer's own convention).

interface MarkE {
	opt: string; mark: string; type: string; double?: string; name?: string;
}

const marks = new Map((spec.marks as MarkE[]).map((m) => [m.opt, m]));
const modifiers = spec.modifiers as Record<string, string>;
const quotes = (spec as {quotes: {default: string; locales: Record<string, string[]>}}).quotes;
const quad = quotes.locales[quotes.default];

/** A physical key: a typing key (`ch`) or chrome (`label`), `w` in key units. */
export interface PhysKey {
	ch?: string;
	label?: string;
	/** chrome id for drill wiring: shift/backspace/option/space/… */
	chrome?: string;
	w: number;
}

export const KB_ROWS: PhysKey[][] = [
	[
		...[..."`1234567890-="].map((ch) => ({ch, w: 1})),
		{label: "⌫", chrome: "backspace", w: 2},
	],
	[
		{label: "tab", chrome: "tab", w: 1.5},
		...[..."qwertyuiop[]"].map((ch) => ({ch, w: 1})),
		{ch: "\\", w: 1.5},
	],
	[
		{label: "caps", chrome: "caps", w: 1.75},
		...[..."asdfghjkl;'"].map((ch) => ({ch, w: 1})),
		{label: "⏎", chrome: "enter", w: 2.25},
	],
	[
		{label: "⇧", chrome: "shift", w: 2.25},
		...[..."zxcvbnm,./"].map((ch) => ({ch, w: 1})),
		{label: "⇧", chrome: "shift", w: 2.75},
	],
	[
		{label: "fn", chrome: "fn", w: 1},
		{label: "⌃", chrome: "control", w: 1},
		{label: "⌥", chrome: "option", w: 1},
		{label: "⌘", chrome: "command", w: 1.25},
		{label: "", chrome: "space", w: 6.5},
		{label: "⌘", chrome: "command", w: 1.25},
		{label: "⌥", chrome: "option", w: 1},
	],
];

const shown = (glyph: string, type: string) => (type === "combining" ? "◌" + glyph : glyph);

const SPECIALS: Record<string, {main: string; second: string; title: string}> = {
	j: {main: "◌͡◌", second: "◌͜◌", title: "⌥j tie bar (joins the two segments around it) · ⌥⇧j tie below, for colliding descenders · again ⇄ ͢ sliding"},
	z: {main: "◌ᶻ", second: "◌₂", title: "⌥z superscript the previous glyph (t h ⌥z → tʰ) · ⌥⇧z subscript it"},
	"[": {main: quad[0], second: quad[1], title: `⌥[ opening primary quote · ⌥⇧[ closing (locale ${quotes.default}; set in the input menu)`},
	"]": {main: quad[2], second: quad[3], title: `⌥] opening secondary quote · ⌥⇧] closing`},
};

export function capTitle(ch: string): string {
	const mod = /[a-z]/.test(ch) ? modifiers[ch.toUpperCase()] : undefined;
	const modTitle = mod === undefined ? "" : ` — ⇧${ch.toUpperCase()} modifier: ${mod}`;
	const sp = SPECIALS[ch];
	if (sp !== undefined) return sp.title + modTitle;
	const m = marks.get(ch);
	if (m !== undefined) return `⌥${ch} ${(m.name ?? "").toLowerCase()}` + modTitle;
	return (ch === "-" ? "⌥- reserved — the host's dashes pass through" : `⌥${ch} passes to the host`) + modTitle;
}

/** A typing cap's body: bare char in the corner, ⌥ and ⌥⇧ glyphs as layers.
 *  Which layer is visible is the board's concern (mode + layer classes). */
export function capBody(ch: string) {
	const sp = SPECIALS[ch];
	const m = marks.get(ch);
	const p = sp?.main ?? (m === undefined ? undefined : shown(m.mark, m.type));
	const s = sp?.second ?? (m?.double === undefined ? undefined : shown(m.double, m.type));
	const wide = sp !== undefined ? " wide" : "";
	return jsx`<span class="b">${ch}</span>${
		p === undefined ? null : jsx`<span class=${"h p ipa" + wide}>${p}</span>`
	}${
		s === undefined ? null : jsx`<span class=${"h s ipa" + wide}>${s}</span>`
	}`;
}

const capStyle = (k: PhysKey) => `grid-column: span ${Math.round(k.w * 4)}`;

/** The reference board on /type: only the keys that carry marks. The chrome
 *  is elided — it answers nothing here — but the stagger it causes is kept:
 *  each row is indented by its real leading chrome width, so the geometry
 *  stays physical, just unfurnished. (The drill draws the full board; its
 *  chrome works.) ⌥ layer by default, ⌥⇧ on the toggle. */
export function KeyboardRef() {
	const rows = KB_ROWS.map((row) => {
		let indent = 0;
		let i = 0;
		while (i < row.length && row[i].ch === undefined) indent += row[i++].w;
		const keys = row.slice(i).filter((k) => k.ch !== undefined);
		return {indent, keys};
	}).filter((r) => r.keys.length > 0);
	return jsx`
		<div class="kbd kbd--ref">
			<div class="layers" role="tablist" aria-label="Keyboard layer">
				<input type="radio" name="klayer" id="klayer-opt" checked />
				<label for="klayer-opt">⌥ marks</label>
				<input type="radio" name="klayer" id="klayer-optshift" />
				<label for="klayer-optshift">⌥⇧ forms</label>
			</div>
			${rows.map(({indent, keys}) => jsx`
				<div class="krow">
					${indent === 0 ? null : jsx`<div class="kgap" style=${`grid-column: span ${Math.round(indent * 4)}`}></div>`}
					${keys.map((k) => jsx`<div class="cap" style=${capStyle(k)} title=${capTitle(k.ch!)}>${capBody(k.ch!)}</div>`)}
				</div>`)}
			<p class="klegend">The Option layer, on the board it lives on — switch to the <span class="ipa">⌥⇧</span> forms above; hover any key for names. Combining marks (drawn on ◌) are dead keys: chord first, then the base. The <kbd>⇧</kbd>-capital modifiers live in the tooltips and on <a href="/keys">/keys</a>.</p>
		</div>`;
}
