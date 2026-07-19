import {jsx} from "@b9g/crank/jsx-tag";
import spec from "../../spec/ipabet.json";

// The keyboard reference: the physical board with each key's Option-layer
// tenants drawn in place — bare char top-left, ⌥ mark center, ⌥⇧ form
// bottom-right, full names on hover. The chart answers "how do I type this
// sound?"; this answers "what does this key do?". Server-rendered from the
// spec, so it can never drift.

interface MarkE {
	opt: string; mark: string; type: string; double?: string; name?: string;
}

const marks = new Map(
	(spec.marks as MarkE[]).map((m) => [m.opt, m]),
);
const modifiers = spec.modifiers as Record<string, string>;
const quotes = (spec as {quotes: {default: string; locales: Record<string, string[]>}}).quotes;
const quad = quotes.locales[quotes.default];

const ROWS: [string, number][] = [
	["`1234567890-=", 0],
	["qwertyuiop[]\\", 1.5],
	["asdfghjkl;'", 1.85],
	["zxcvbnm,./", 2.4],
];

/** A combining mark rides the dotted circle for display; spacing marks stand alone. */
const shown = (glyph: string, type: string) => (type === "combining" ? "◌" + glyph : glyph);

/** The keys the marks table doesn't cover: the joiner, the operators, the quotes. */
const SPECIALS: Record<string, {main: string; second: string; title: string}> = {
	j: {main: "◌͡◌", second: "◌͜◌", title: "⌥j tie bar (joins the two segments around it) · ⌥⇧j tie below, for colliding descenders · again ⇄ ͢ sliding"},
	z: {main: "◌ᶻ", second: "◌₂", title: "⌥z superscript the previous glyph (t h ⌥z → tʰ) · ⌥⇧z subscript it"},
	"[": {main: quad[0], second: quad[1], title: `⌥[ opening primary quote · ⌥⇧[ closing (locale ${quotes.default}; set in the input menu)`},
	"]": {main: quad[2], second: quad[3], title: `⌥] opening secondary quote · ⌥⇧] closing`},
};

function cap(ch: string) {
	const sp = SPECIALS[ch];
	const m = marks.get(ch);
	const mod = /[a-z]/.test(ch) ? modifiers[ch.toUpperCase()] : undefined;
	const modTitle = mod === undefined ? "" : ` — ⇧${ch.toUpperCase()} modifier: ${mod}`;
	if (sp !== undefined) {
		return jsx`<div class="cap" title=${sp.title + modTitle}>
			<span class="b">${ch}</span>
			<span class="h p ipa wide">${sp.main}</span><span class="h s ipa wide">${sp.second}</span>
		</div>`;
	}
	if (m !== undefined) {
		const name = (m.name ?? "").toLowerCase();
		const title = `⌥${ch} ${name}` + modTitle;
		if (m.double === undefined) {
			return jsx`<div class="cap" title=${title}>
				<span class="b">${ch}</span>
				<span class="h p ipa solo">${shown(m.mark, m.type)}</span>
			</div>`;
		}
		return jsx`<div class="cap" title=${title}>
			<span class="b">${ch}</span>
			<span class="h p ipa">${shown(m.mark, m.type)}</span>
			<span class="h s ipa">${shown(m.double, m.type)}</span>
		</div>`;
	}
	return jsx`<div class="cap bare" title=${(ch === "-" ? "⌥- reserved — the host's dashes pass through" : `⌥${ch} passes to the host`) + modTitle}>
		<span class="b">${ch}</span>
	</div>`;
}

export function KeyboardRef() {
	return jsx`
		<div class="kbdref">
			${ROWS.map(([chars, indent]) => jsx`
				<div class="krow" style=${`padding-left:${indent}rem`}>
					${[...chars].map((ch) => cap(ch))}
				</div>`)}
			<p class="klegend">Each key: bare char, then <span class="p">⌥ mark</span> · <span class="s">⌥⇧ form</span> — hover for names. Combining marks (drawn on ◌) are dead keys: chord first, then the base. The <kbd>⇧</kbd>-capital modifiers live in the tooltips and on <a href="/keys">/keys</a>.</p>
		</div>`;
}
