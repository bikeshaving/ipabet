// Every Latin letter IPAbet types, found by asking the engine rather than by
// listing: each dead key (and each pair of them) is typed onto each base, and
// whatever comes out as a single Latin letter is recorded with its keystrokes.
// The alphabets below are then checked against that set, so the page can only
// claim what the keyboard actually does. Run at bake time (scripts/bake-latin.ts).

import {typeKeys, setCapitalDigraphs, type Keystroke} from "../../js/src/index.ts";
import spec from "../../spec/ipabet.json";

export interface LatinLetter {
	glyph: string;
	keys: string;
	base: string;
	capitalDigraphs?: boolean;
}

export interface Alphabet {
	name: string;
	letters: string;
}

interface Step {
	strokes: Keystroke[];
	label: string;
}

const isLatinLetter = (c: string) => [...c].length === 1 && /\p{Script=Latin}/u.test(c) && /\p{L}/u.test(c);

const marks = (spec.marks as {opt: string; type: string; mark?: string; double?: string; doubleSpacing?: boolean}[])
	.filter((m) => m.type === "combining");

const DEAD: (Step & {mark: string})[] = [];
for (const m of marks) {
	if (m.mark) DEAD.push({strokes: [{key: m.opt, option: true}], label: "⌥" + m.opt, mark: m.mark});
	if (m.double && !m.doubleSpacing) {
		DEAD.push({strokes: [{key: m.opt, option: true, shift: true}], label: "⌥⇧" + m.opt, mark: m.double});
	}
}

const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");

function baseStep(b: string): Step {
	const upper = b !== b.toLowerCase();
	return {strokes: [{key: b.toLowerCase(), shift: upper}], label: upper ? "⇧" + b : b};
}

function digraphSteps(): {step: Step; base: string}[] {
	const out: {step: Step; base: string}[] = [];
	for (const l of spec.letters as {key: string; glyph: string}[]) {
		if (!isLatinLetter(l.glyph) || /^[\x00-\x7f]$/.test(l.glyph)) continue;
		const strokes: Keystroke[] = [];
		let label = "";
		for (const [i, c] of [...l.key].entries()) {
			const upper = /[A-Z]/.test(c);
			strokes.push({key: c.toLowerCase(), shift: upper});
			label += upper ? "⇧" + c : (i ? " " : "") + c;
		}
		out.push({step: {strokes, label}, base: l.key[0].toLowerCase()});
	}
	return out;
}

const STEPS = new Map<string, Step[]>();

const type = (steps: Step[]) => typeKeys(steps.flatMap((s) => s.strokes), "").normalize("NFC");
const join = (steps: Step[]) => steps.map((s) => s.label).join(" ");

/** Every single Latin letter reachable in one or two dead keys, or as a digraph
 *  letter with or without one dead key. Shortest keystrokes win. */
export function latinLetters(): LatinLetter[] {
	setCapitalDigraphs(false);
	const found = new Map<string, LatinLetter>();
	const record = (glyph: string, steps: Step[], base: string, capitalDigraphs = false) => {
		if (!isLatinLetter(glyph) || /^[\x00-\x7f]$/.test(glyph) || found.has(glyph)) return;
		found.set(glyph, {glyph, keys: join(steps), base, ...(capitalDigraphs ? {capitalDigraphs} : {})});
		STEPS.set(glyph, steps);
	};
	const bases = [...LOWER, ...LOWER.map((b) => b.toUpperCase())];
	const digraphs = digraphSteps();

	for (const d of digraphs) record(type([d.step]), [d.step], d.base);
	for (const b of bases) for (const d of DEAD) record(type([d, baseStep(b)]), [d, baseStep(b)], b.toLowerCase());
	for (const g of digraphs) for (const d of DEAD) record(type([d, g.step]), [d, g.step], g.base);
	for (const b of bases) {
		for (const d1 of DEAD) for (const d2 of DEAD) {
			const steps = [d1, d2, baseStep(b)];
			record(type(steps), steps, b.toLowerCase());
		}
	}

	setCapitalDigraphs(true);
	for (const d of digraphs) {
		const up: Step = {
			strokes: d.step.strokes.map((s) => ({...s, shift: true})),
			label: d.step.strokes.map((s) => "⇧" + s.key.toUpperCase()).join(""),
		};
		record(type([up]), [up], d.base, true);
	}
	setCapitalDigraphs(false);
	return [...found.values()];
}

/** How to type one grapheme: a letter from the list, or a letter the list
 *  has plus combining marks that each have a dead key. The combined form is
 *  typed through the engine before it is claimed. */
export function howToType(g: string, letters: Map<string, LatinLetter>): string | null {
	const nfc = g.normalize("NFC");
	if (/^[a-zA-Z]$/.test(nfc)) return nfc;
	const hit = letters.get(nfc);
	if (hit) return hit.keys;
	const [base, ...rest] = [...nfc.normalize("NFD")];
	if (!rest.length) return null;
	const baseSteps = /^[a-zA-Z]$/.test(base) ? [baseStep(base)] : STEPS.get(base.normalize("NFC"));
	if (!baseSteps) return null;
	const dead = rest.map((m) => DEAD.find((d) => d.mark === m));
	if (dead.some((d) => d === undefined)) return null;
	const steps = [...(dead as Step[]), ...baseSteps];
	return type(steps) === nfc ? join(steps) : null;
}

const VIETNAMESE = (() => {
	const vowels = ["a", "ă", "â", "e", "ê", "i", "o", "ô", "ơ", "u", "ư", "y"];
	const tones = ["̀", "́", "̉", "̃", "̣"];
	return "ăâđêôơư" + vowels.flatMap((v) => tones.map((t) => (v + t).normalize("NFC"))).join("");
})();

/** Letters beyond a–z each alphabet needs, lowercase; capitals are checked too. */
export const ALPHABETS: Alphabet[] = [
	{name: "Albanian", letters: "çë"},
	{name: "Azerbaijani", letters: "çəğıöşüİ"},
	{name: "Catalan", letters: "àçèéíïòóúü"},
	{name: "Croatian, Bosnian, Serbian (Latin)", letters: "čćđšž"},
	{name: "Czech", letters: "áčďéěíňóřšťúůýž"},
	{name: "Danish, Norwegian", letters: "æøå"},
	{name: "Dutch", letters: "éèëïöü"},
	{name: "Esperanto", letters: "ĉĝĥĵŝŭ"},
	{name: "Estonian", letters: "äõöüšž"},
	{name: "Faroese", letters: "áðíóúýæø"},
	{name: "Finnish", letters: "äöåšž"},
	{name: "French", letters: "àâæçéèêëîïôœùûüÿ"},
	{name: "German", letters: "äöüß"},
	{name: "Hanyu Pinyin", letters: "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü"},
	{name: "Hausa", letters: "ɓɗƙƴ"},
	{name: "Hungarian", letters: "áéíóöőúüű"},
	{name: "Icelandic", letters: "áðéíóúýþæö"},
	{name: "Igbo", letters: "ịọụṅ"},
	{name: "Irish", letters: "áéíóú"},
	{name: "Italian", letters: "àèéìíîòóùú"},
	{name: "Kurdish (Kurmanji)", letters: "çêîşû"},
	{name: "Latvian", letters: "āčēģīķļņšūž"},
	{name: "Lithuanian", letters: "ąčęėįšųūž"},
	{name: "Maltese", letters: "ċġħż"},
	{name: "Māori", letters: "āēīōū"},
	{name: "Polish", letters: "ąćęłńóśźż"},
	{name: "Portuguese", letters: "áâãàçéêíóôõú"},
	{name: "Romanian", letters: "ăâîșț"},
	{name: "Scottish Gaelic", letters: "àèìòù"},
	{name: "Slovak", letters: "áäčďéíĺľňóôŕšťúýž"},
	{name: "Slovenian", letters: "čšž"},
	{name: "Spanish", letters: "áéíñóúü"},
	{name: "Swedish", letters: "åäö"},
	{name: "Turkish", letters: "çğıöşüİ"},
	{name: "Vietnamese", letters: VIETNAMESE},
	{name: "Welsh", letters: "âêîôûŵŷ"},
	{name: "Yoruba", letters: "ẹọṣ"},
];

export interface Coverage {
	name: string;
	letters: string;
	count: number;
	missing: string[];
	capitalDigraphs: string[];
}

/** Which letters of each alphabet, lowercase and capital, can't be typed; and
 *  which capitals need the capital-digraphs option. */
export function coverage(letters: LatinLetter[]): Coverage[] {
	const byGlyph = new Map(letters.map((l) => [l.glyph, l]));
	return ALPHABETS.map((a) => {
		const need = new Set<string>();
		for (const c of a.letters) {
			need.add(c);
			const up = c.toUpperCase();
			if ([...up].length === 1 && up !== c) need.add(up);
		}
		const missing = [...need].filter((c) => howToType(c, byGlyph) === null);
		const capitalDigraphs = [...need].filter((c) => byGlyph.get(c)?.capitalDigraphs);
		return {name: a.name, letters: a.letters, count: need.size, missing, capitalDigraphs};
	});
}
