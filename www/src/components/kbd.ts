import {jsx} from "@b9g/crank/jsx-tag";
import spec from "../../../spec/ipabet.json";
import {SHIFTED_DIGITS, SHIFTED_PUNCT} from "../../../js/src/index.ts";

// THE keyboard — one component, real ANSI geometry, never improvised.
// Unit widths are the ANSI standard (quarter-key grid, 15u per row):
//   `1234567890-=  ⌫2u · tab1.5u qwertyuiop[]\\1.5u · caps1.75u …' ⏎2.25u ·
//   ⇧2.25u zxcvbnm,./ ⇧2.75u · seven 1.25u modifiers around a 6.25u spacebar
// /type renders it as reference (.kbd--ref), /learn as the drill (.kbd--drill).

interface MarkE {
	opt: string; mark: string; type: string; double?: string; name?: string;
}

const marks = new Map((spec.marks as MarkE[]).map((m) => [m.opt, m]));
const modifiers = spec.modifiers as Record<string, string>;
// The ⌥⇧<digit> spends (¡ ʾ ʿ ˭) live in optShift, not marks.
const optShift = spec.optShift as Record<string, string>;


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
	// The ANSI bottom row: 1.25u×3 + 6.25u space + 1.25u×4 = 15u exactly.
	[
		{label: "⌃", chrome: "control", w: 1.25},
		{label: "", chrome: "meta", w: 1.25},
		{label: "⌥", chrome: "option", w: 1.25},
		{label: "", chrome: "space", w: 6.25},
		{label: "⌥", chrome: "option", w: 1.25},
		{label: "", chrome: "meta", w: 1.25},
		{label: "", chrome: "menu", w: 1.25},
		{label: "⌃", chrome: "control", w: 1.25},
	],
];

/** Render a mark: combining forms as two stacked layers — a faint carrier ring
 *  behind, the mark in full ink on an invisible base in front. */
const SHIFT_PLANE: Record<string, string> = {...SHIFTED_DIGITS, ...SHIFTED_PUNCT};

// A combining mark rides a faint dotted-circle carrier; a spacing mark or symbol
// stands on its own. Judged from the glyph itself (Unicode Mark), so a mark's ⌥⇧
// form is decided on its own nature — not the ⌥ form's, whose class can differ
// (⌥⇧4 ͇ is combining though ⌥4 ˦ is spacing; ⌥⇧l ‖ is a symbol though ⌥l ̼ is not).
function shown(glyph: string) {
	if (/\p{M}/u.test(glyph) || glyph === "˞") {
		return jsx`<span class="ring">◌</span><span class="ink">${"\u00A0" + glyph}</span>`;
	}
	return glyph;
}

const SPECIALS: Record<string, {main: unknown; second: unknown; title: string}> = {
	j: {main: "◌͡◌", second: "◌͜◌", title: "⌥j tie bar (joins the two segments around it) · ⌥⇧j tie below, for colliding descenders · pressed again on the tie it made → the spacing linker (⁀ over, ‿ under)"},
	z: {main: "◌ᶻ", second: "◌₂", title: "⌥z raise the next glyph (t ⌥z h → tʰ) · ⌥⇧z lower it"},
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
	return (ch === "-" ? "⌥- reserved — the host’s dashes pass through" : `⌥${ch} passes to the host`) + modTitle;
}

/** A typing cap's body: bare char in the corner, ⌥ and ⌥⇧ glyphs as layers.
 *  Which layer is visible is the board's concern (mode + layer classes). */
export function capBody(ch: string) {
	const sp = SPECIALS[ch];
	const m = marks.get(ch);
	const p = sp?.main ?? (m === undefined ? undefined : shown(m.mark));
	const s = sp?.second ?? (m?.double !== undefined ? shown(m.double)
		: optShift[ch] !== undefined ? shown(optShift[ch]) : undefined);
	// The ⇧ view is LIVE on /type; the island repaints each capital. Server-rendered
	// state is the empty-pad truth.
	const shifted = /[a-z]/.test(ch) ? ch.toUpperCase() : SHIFT_PLANE[ch];
	const wide = sp !== undefined ? " wide" : "";
	return jsx`<span class="b">${ch}</span>${
		p === undefined ? null : jsx`<span class=${"h p ipa" + wide}>${p}</span>`
	}${
		s === undefined ? null : jsx`<span class=${"h s ipa" + wide}>${s}</span>`
	}${
		shifted === undefined ? null : jsx`<span class="h t">${shifted}</span>`
	}`;
}

const capStyle = (k: PhysKey) => `grid-column: span ${Math.round(k.w * 4)}`;

/** The reference board: the full physical rectangle with the chrome GHOSTED,
 *  except ⌥ and ⇧, the keys the chords actually hold.
 *
 *  `layer` is the one it opens on. /type opens on the base plane and lets the
 *  reader hold a modifier; the Option-layer chart on /keys opens on ⌥, which is
 *  the whole point of it being there. Either way every layer stays reachable —
 *  it is the same board, not a picture of one. */
export function KeyboardRef({
	layer = "base",
	chart = false,
}: {
	layer?: "base" | "opt" | "optshift" | "shift";
	/** A chart rather than a control: the character caps type nothing on a page
	 *  with no pad, so they stop inviting a click. The modifier caps stay live,
	 *  since switching layer is the one thing this board still does. */
	chart?: boolean;
} = {}) {
	// Chrome with MEANING renders as real caps (with the meaning in the
	// tooltip); the rest is bare plate.
	const CHROME_TITLES: Record<string, string> = {
		shift: "⇧ — the transforming modifier (⇧letter transforms the glyph before it); with ⌥, the second-form chord",
		option: "⌥ — the mark chord: hold with a mark key, then type the base",
		caps: "Caps Lock — a lock, not a modifier: letters type literal capitals and never transform",
		backspace: "⌫ — peels a pending mark first, then native delete · ⌃⌫ unconverts the transform before the cursor",
		tab: "passes through untouched",
		enter: "passes through untouched",
	};
	const ghost = (k: PhysKey) => {
		const title = CHROME_TITLES[k.chrome ?? ""];
		if (title === undefined) return jsx`<div class="cap ghost" style=${capStyle(k)}></div>`;
		const chorded = k.chrome === "option" || k.chrome === "shift";
		return jsx`<div class=${"cap ck" + (chorded ? " chord" : "")} style=${capStyle(k)} title=${title} data-chrome=${k.chrome}>${k.label}</div>`;
	};
	// ⌥ has no row of its own: each ⌥ tucks beside its ⇧ inside the shift's slot —
	// ⇧1.25+⌥1 left, ⌥1.25+⇧1.5 right.
	const shiftRow = KB_ROWS[3].filter((k) => k.ch !== undefined);
	const rows = [
		...KB_ROWS.slice(0, 3),
		[
			{label: "⇧", chrome: "shift", w: 1.25},
			{label: "⌥", chrome: "option", w: 1},
			...shiftRow,
			{label: "⌥", chrome: "option", w: 1.25},
			{label: "⇧", chrome: "shift", w: 1.5},
		] as PhysKey[],
	];
	return jsx`
		<div class=${"kbd kbd--ref" + (chart ? " kbd--chart" : "")} id="kbdref">
			<div class="plate">
				${rows.map((row) => jsx`
					<div class="krow">
						${row.map((k) =>
							k.ch !== undefined
								? jsx`<div class="cap" style=${capStyle(k)} title=${capTitle(k.ch)} data-key=${k.ch}>${capBody(k.ch)}</div>`
								: ghost(k))}
					</div>`)}
			</div>
			<div class="layers" hidden>
				${["base", "opt", "optshift", "shift"].map(
					(l) => jsx`<input type="radio" name="klayer" id=${"klayer-" + l}
						checked=${l === layer ? true : undefined} />`,
				)}
			</div>
			<div class="kcaption">
				<span>hold — or click — <kbd>⌥</kbd> / <kbd>⌥⇧</kbd> / <kbd>⇧</kbd> to see each layer · hover for names · <a href="/chart">the chart</a> answers sound → keys</span>
			</div>
		</div>`;
}
