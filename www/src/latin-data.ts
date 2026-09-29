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
	/** BCP 47 primary subtags, to preselect the reader's own language. */
	codes: string[];
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
 *  letter with or without one dead key. Fewest keystrokes win, and on a tie the
 *  dead key beats the IPA digraph: ä is ⌥u a, the diaeresis, not a⇧Y. */
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

	for (const b of bases) for (const d of DEAD) record(type([d, baseStep(b)]), [d, baseStep(b)], b.toLowerCase());
	for (const d of digraphs) record(type([d.step]), [d.step], d.base);
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
	{name: "Albanian", letters: "çë", codes: ["sq"]},
	{name: "Azerbaijani", letters: "çəğıöşüİ", codes: ["az"]},
	{name: "Catalan", letters: "àçèéíïòóúü", codes: ["ca"]},
	{name: "Croatian, Bosnian, Serbian (Latin)", letters: "čćđšž", codes: ["hr", "bs", "sr"]},
	{name: "Czech", letters: "áčďéěíňóřšťúůýž", codes: ["cs"]},
	{name: "Danish, Norwegian", letters: "æøå", codes: ["da", "nb", "nn", "no"]},
	{name: "Dutch", letters: "éèëïöü", codes: ["nl"]},
	{name: "Esperanto", letters: "ĉĝĥĵŝŭ", codes: ["eo"]},
	{name: "Estonian", letters: "äõöüšž", codes: ["et"]},
	{name: "Faroese", letters: "áðíóúýæø", codes: ["fo"]},
	{name: "Finnish", letters: "äöåšž", codes: ["fi"]},
	{name: "French", letters: "àâæçéèêëîïôœùûüÿ", codes: ["fr"]},
	{name: "German", letters: "äöüß", codes: ["de"]},
	{name: "Hausa", letters: "ɓɗƙƴ", codes: ["ha"]},
	{name: "Hungarian", letters: "áéíóöőúüű", codes: ["hu"]},
	{name: "Icelandic", letters: "áðéíóúýþæö", codes: ["is"]},
	{name: "Igbo", letters: "ịọụṅ", codes: ["ig"]},
	{name: "Irish", letters: "áéíóú", codes: ["ga"]},
	{name: "Italian", letters: "àèéìíîòóùú", codes: ["it"]},
	{name: "Kurdish (Kurmanji)", letters: "çêîşû", codes: ["ku", "kmr"]},
	{name: "Latvian", letters: "āčēģīķļņšūž", codes: ["lv"]},
	{name: "Lithuanian", letters: "ąčęėįšųūž", codes: ["lt"]},
	{name: "Maltese", letters: "ċġħż", codes: ["mt"]},
	{name: "Māori", letters: "āēīōū", codes: ["mi"]},
	{name: "Pinyin", letters: "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü", codes: ["zh"]},
	{name: "Polish", letters: "ąćęłńóśźż", codes: ["pl"]},
	{name: "Portuguese", letters: "áâãàçéêíóôõú", codes: ["pt"]},
	{name: "Romanian", letters: "ăâîșț", codes: ["ro"]},
	{name: "Scottish Gaelic", letters: "àèìòù", codes: ["gd"]},
	{name: "Slovak", letters: "áäčďéíĺľňóôŕšťúýž", codes: ["sk"]},
	{name: "Slovenian", letters: "čšž", codes: ["sl"]},
	{name: "Spanish", letters: "áéíñóúü", codes: ["es"]},
	{name: "Swedish", letters: "åäö", codes: ["sv"]},
	{name: "Turkish", letters: "çğıöşüİ", codes: ["tr"]},
	{name: "Vietnamese", letters: VIETNAMESE, codes: ["vi"]},
	{name: "Welsh", letters: "âêîôûŵŷ", codes: ["cy"]},
	{name: "Yoruba", letters: "ẹọṣ", codes: ["yo"]},
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

const MARK_NAMES: Record<string, string> = {
	"\u0301": "acute", "\u0300": "grave", "\u0302": "circumflex", "\u030C": "caron",
	"\u0304": "macron", "\u0303": "tilde", "\u0308": "diaeresis", "\u0306": "breve",
	"\u030A": "ring", "\u0327": "cedilla", "\u0326": "comma below", "\u0328": "ogonek",
	"\u0307": "dot above", "\u0323": "dot below", "\u0309": "hook above", "\u031B": "horn",
	"\u030B": "double acute",
};

export interface DeadKey {
	keys: string;
	name: string;
	examples: string;
}

/** The dead keys the alphabets use, each with the single-mark letters it makes
 *  there, in alphabet order: ⌥u → ä ë ï ö ü ÿ. */
export function deadKeys(): DeadKey[] {
	const byMark = new Map<string, Set<string>>();
	for (const a of ALPHABETS) {
		for (const g of a.letters) {
			const [base, ...marks] = [...g.normalize("NFD")];
			if (marks.length !== 1 || !/[a-zA-Z]/.test(base)) continue;
			byMark.set(marks[0], (byMark.get(marks[0]) ?? new Set()).add(g));
		}
	}
	const out: DeadKey[] = [];
	for (const d of DEAD) {
		const letters = byMark.get(d.mark);
		if (!letters || out.some((o) => o.keys === d.label)) continue;
		const sorted = [...letters].sort((x, y) => x.normalize("NFD").localeCompare(y.normalize("NFD")));
		out.push({keys: d.label, name: MARK_NAMES[d.mark] ?? "", examples: sorted.join(" ")});
	}
	return out;
}

/** The letters the alphabets need that are letters of their own, not a letter
 *  plus a mark: æ ø ß ł ə … each with its keys. */
export function specialLetters(letters: LatinLetter[]): LatinLetter[] {
	const byGlyph = new Map(letters.map((l) => [l.glyph, l]));
	const seen = new Set<string>();
	const out: LatinLetter[] = [];
	for (const a of ALPHABETS) {
		for (const g of a.letters) {
			if (seen.has(g) || [...g.normalize("NFD")].length !== 1 || /[a-zA-Z]/.test(g)) continue;
			seen.add(g);
			const l = byGlyph.get(g);
			if (l) out.push(l);
		}
	}
	return out;
}

export interface LanguageLetter {
	glyph: string;
	keys: string;
	capital?: string;
	capitalDigraphs?: boolean;
}

export interface Language {
	name: string;
	codes: string[];
	letters: LanguageLetter[];
}

/** Each alphabet's letters beyond a–z with their keys, lowercase with its
 *  capital beside it. The capital's keys are the same with Shift on the
 *  letter, so only the lowercase keys are kept. */
export function languages(letters: LatinLetter[]): Language[] {
	const byGlyph = new Map(letters.map((l) => [l.glyph, l]));
	return ALPHABETS.map((a) => {
		const out: LanguageLetter[] = [];
		for (const c of a.letters) {
			const keys = howToType(c, byGlyph);
			if (keys === null) continue;
			const up = c.toUpperCase();
			const hasCap = [...up].length === 1 && up !== c && !/[A-Z]/.test(up);
			out.push({
				glyph: c, keys,
				...(hasCap ? {capital: up} : {}),
				...(hasCap && byGlyph.get(up)?.capitalDigraphs ? {capitalDigraphs: true} : {}),
			});
		}
		return {name: a.name, codes: a.codes, letters: out};
	});
}
