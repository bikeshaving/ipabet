// The spec must describe itself accurately.
//
// spec/ipabet.xml is the source both engines and the website read. Its prose
// (`laws`, `classes`, each mark's `name`) is the only place the *reasoning* for
// a key assignment lives, and prose does not typecheck — nothing else catches a
// stale "⌥c cedilla" the moment that mark changes keys.
//
// So membership lives on the marks (`ipa`, `beyond`, `shiftSense`,
// `arbitraryKey`), and `laws`/`classes` only define terms. These tests hold
// that line: prose may not claim membership, every flag must be drawn from the
// declared vocabulary, and every declared term must be used.

import {describe, expect, test} from "bun:test";
import spec from "../src/spec.ts";

interface Mark {
	opt: string;
	mark: string;
	double?: string;
	type?: string;
	doubleSpacing?: boolean;
	exclusive?: boolean;
	ipa?: boolean;
	beyond?: string;
	shiftSense?: string;
	arbitraryKey?: boolean;
	name?: string;
	cp?: string;
}

const marks = spec.marks as Mark[];
const classes = spec.classes as Record<string, any>;
const byOpt = new Map(marks.map((m) => [m.opt, m]));

describe("spec · flag vocabulary", () => {
	test("every mark with a ⌥⇧ form declares what ⌥⇧ means for it", () => {
		for (const m of marks) {
			if (m.double !== undefined) expect(m.shiftSense).toBeTruthy();
			else expect(m.shiftSense).toBeUndefined();
		}
	});

	test("every shiftSense is one the classes block defines", () => {
		const defined = new Set(Object.keys(classes.shiftSense).filter((k) => k !== "about"));
		for (const m of marks) {
			if (m.shiftSense !== undefined) expect(defined).toContain(m.shiftSense);
		}
	});

	test("every defined shiftSense is actually used by some mark", () => {
		const used = new Set(marks.map((m) => m.shiftSense).filter(Boolean));
		for (const k of Object.keys(classes.shiftSense)) {
			if (k !== "about") expect(used).toContain(k);
		}
	});

	test("ipa:false and beyond imply each other, with a defined value", () => {
		const defined = new Set(Object.keys(classes.beyond));
		for (const m of marks) {
			expect(m.beyond !== undefined).toBe(m.ipa === false);
			if (m.beyond !== undefined) expect(defined).toContain(m.beyond);
		}
	});

	test("exclusive marks are values of one dimension, so never `twin`", () => {
		for (const m of marks) {
			if (m.exclusive) expect(m.shiftSense).not.toBe("twin");
		}
	});
});

describe("spec · prose does not hardcode membership", () => {
	const prose = (obj: unknown): string[] =>
		typeof obj === "string"
			? [obj]
			: Array.isArray(obj)
				? obj.flatMap(prose)
				: obj && typeof obj === "object"
					? Object.values(obj).flatMap(prose)
					: [];

	// Every ⌥-key named anywhere in the spec's prose must be a key that exists —
	// the check a stale "⌥<key> <mark>" claim fails.
	test("every ⌥key named in the spec's prose is assigned", () => {
		const text = [...prose(spec)].join(" ");
		const named = [...text.matchAll(/⌥⇧?([a-z0-9=.,`';-])/g)].map((m) => m[1]);
		expect(named.length).toBeGreaterThan(0);
		for (const k of named) {
			// ⌥- is the dash law: reserved, deliberately unassigned.
			if (k === "-") continue;
			expect(byOpt.has(k)).toBe(true);
		}
	});

	// A mark's own `name` may describe itself; the shared prose may not enumerate
	// which marks belong to a class, because that duplicates the flags.
	test("classes.beyond and classes.arbitraryKey name no keys at all", () => {
		for (const text of [...prose(classes.beyond), classes.arbitraryKey]) {
			expect(text).not.toMatch(/⌥/);
		}
	});
});

describe("spec · placements the laws lean on", () => {
	test("the comma key carries the comma-shaped marks", () => {
		// The cedilla lives on ⌥c (ABC Extended's key, and the letter it is named
		// for), so the comma key is free to hold both comma-shaped marks: shape
		// identity, one key per hook family.
		expect(byOpt.get(",")!.mark).toBe("̦");        // comma below — ș ț
		expect(byOpt.get(",")!.double).toBe("̓");      // comma above — k̓ m̓ w̓, smooth breathing
		expect(byOpt.get("c")!.mark).toBe("̧");        // cedilla — ç ş ţ ģ ņ
	});

	test("period carries the dot-shaped marks, ⇧ relocating below", () => {
		expect(byOpt.get(".")!.mark).toBe("̇"); // dot above
		expect(byOpt.get(".")!.double).toBe("̣"); // dot below
		expect(byOpt.get(".")!.shiftSense).toBe("below");
	});

	test("lowered/raised is a greater-pole exclusive on ⌥g", () => {
		const g = byOpt.get("g")!;
		expect(g.mark).toBe("̞");
		expect(g.exclusive).toBe(true);
		expect(g.shiftSense).toBe("greater");
	});

	test("the tie bar is a postfix joiner on ⌥j, and nowhere else", () => {
		expect((spec.letters as {key: string}[]).find((l) => l.key === "6")).toBeUndefined();
		const tie = byOpt.get("j")!;
		expect(tie.mark).toBe("\u{0361}"); // tie above on ⌥j
		expect(tie.double).toBe("\u{035C}"); // tie below on ⌥⇧j
		expect(byOpt.get("8")!.mark).toBe("↓"); // ⌥8 is airflow (the nasal family cycles behind ⌥n)
		expect((spec.modifiers as Record<string, string>).T).toBeUndefined();
	});

	test("⌥⇧ digit slots are spent only where the escape is redundant", () => {
		const letters = new Set((spec.letters as {key: string}[]).map((l) => l.key));
		for (const d of Object.keys(spec.optShift as Record<string, string>)) {
			if (d === "about") continue;
			expect(letters.has(d), `⇧${d} is claimed; its escape is load-bearing`).toBe(false);
		}
	});
});

// Encoding lints: the spec is the source of every glyph both engines emit, so
// encoding rot starts here or not at all. Three invariants: every emitted
// string is NFC (a decomposed spec glyph would ship decomposed text through
// every engine); every cp field matches its glyph's actual codepoints (the
// documentation may not lie about the encoding); and no glyph has two
// spellings (the unconvert reverse map must stay unambiguous).
describe("spec · encoding lints", () => {
	const cpOf = (g: string) =>
		[...g].map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")).join(" ");
	const letters = spec.letters as {key: string; glyph: string; cp: string}[];

	test("every emitted string in the spec is NFC", () => {
		const check = (v: unknown, where: string) => {
			if (typeof v !== "string") return;
			expect(v.normalize("NFC"), where).toBe(v);
		};
		for (const l of letters) check(l.glyph, l.key);
		for (const m of marks as unknown as Record<string, unknown>[]) {
			for (const f of ["mark", "double", "clone", "doubleClone"]) check(m[f], `⌥${m.opt}.${f}`);
			for (const f of ["cycle", "doubleCycle"]) {
				for (const c of (m[f] as string[] | undefined) ?? []) check(c, `⌥${m.opt}.${f}`);
			}
		}
		for (const t of (spec.superscripts as {table: {base: string; sup: string}[]}).table) check(t.sup, t.base);
		for (const t of (spec.subscripts as {table: {base: string; sub: string}[]}).table) check(t.sub, t.base);
		for (const quad of Object.values((spec as any).quotes.locales as Record<string, string[]>)) {
			for (const q of quad) check(q, "quotes");
		}
	});

	test("every cp field states its glyph's true codepoints", () => {
		for (const l of letters) expect(l.cp, l.key).toBe(cpOf(l.glyph));
		for (const m of marks as unknown as Record<string, string>[]) {
			expect(m.cp, `⌥${m.opt}`).toBe(cpOf(m.mark));
			if (m.double !== undefined && m.doubleCp !== undefined) {
				expect(m.doubleCp, `⌥${m.opt} double`).toBe(cpOf(m.double));
			}
		}
	});

	test("no glyph has two keystroke spellings", () => {
		const seen = new Map<string, string>();
		for (const l of letters) {
			if (l.key.length !== 2) continue;
			expect(seen.get(l.glyph) ?? l.key, `${l.glyph} spelled ${seen.get(l.glyph)} and ${l.key}`).toBe(l.key);
			seen.set(l.glyph, l.key);
		}
	});
});

// The shape marks and letters may take, enforced directly. A schema nobody runs
// is just more prose, and a mark or letter with a stray field is a bug the
// engines won't catch — the ipa:false that once escaped onto a letters entry
// fails here. These are closed sets: a new field must be added below on purpose.
describe("spec · marks and letters keep their declared shape", () => {
	const MARK_FIELDS = new Set([
		"opt", "mark", "double", "doubleCp", "doubleSpacing", "type", "clone",
		"doubleClone", "group", "cp", "name", "exclusive", "shiftSense", "ipa",
		"beyond", "arbitraryKey", "cycle", "cycleCp", "doubleCycle", "doubleCycleCp",
	]);
	const MARK_REQUIRED = ["opt", "mark", "type", "group", "cp", "name"];
	const LETTER_FIELDS = new Set(["key", "glyph", "cp", "name", "ipa"]);
	// A present field on the left requires every field on the right.
	const DEPENDENTS: Record<string, string[]> = {
		double: ["shiftSense"], shiftSense: ["double"], doubleCp: ["double"],
		doubleClone: ["double"], doubleSpacing: ["double"], exclusive: ["double"],
		ipa: ["beyond"], beyond: ["ipa"], cycle: ["cycleCp"], cycleCp: ["cycle"],
		doubleCycle: ["doubleCycleCp", "double"], doubleCycleCp: ["doubleCycle"],
	};
	const ENUMS: Record<string, string[]> = {
		type: ["combining", "spacing"],
		group: ["Articulation", "Length", "Nasalization", "Phonation", "Prosody", "Syllabicity", "Tone", "Transliteration"],
		shiftSense: ["greater", "extreme", "lesser", "below", "placement", "twin", "arbitrary"],
		beyond: ["tenant", "tradition", "extIPA"],
	};

	test("no mark carries an undeclared field", () => {
		for (const m of marks as unknown as Record<string, unknown>[]) {
			for (const k of Object.keys(m)) expect(MARK_FIELDS, `⌥${m.opt}.${k}`).toContain(k);
		}
	});

	test("no letter carries an undeclared field", () => {
		for (const l of spec.letters as Record<string, unknown>[]) {
			for (const k of Object.keys(l)) expect(LETTER_FIELDS, `${l.glyph}.${k}`).toContain(k);
		}
	});

	test("every mark carries the required fields", () => {
		for (const m of marks as unknown as Record<string, unknown>[]) {
			for (const k of MARK_REQUIRED) expect(m[k], `⌥${m.opt}.${k}`).toBeDefined();
		}
	});

	test("dependent fields hold: double↔shiftSense, ipa↔beyond, exclusive→double", () => {
		for (const m of marks as unknown as Record<string, unknown>[]) {
			for (const [field, needs] of Object.entries(DEPENDENTS)) {
				if (m[field] === undefined) continue;
				for (const n of needs) expect(m[n], `⌥${m.opt}: ${field} requires ${n}`).toBeDefined();
			}
		}
	});

	test("enum-valued flags stay inside their enums", () => {
		for (const m of marks as unknown as Record<string, any>[]) {
			for (const [f, values] of Object.entries(ENUMS)) {
				if (m[f] === undefined) continue;
				expect(values, `⌥${m.opt}.${f}`).toContain(m[f]);
			}
		}
	});
});

// A mark's spacing flags decide dead-key behavior: combining forms PEND (the
// next base absorbs them), spacing forms INSERT immediately. The flags are
// redundant with the glyph's Unicode class — and when one drifts (ˌ missing
// doubleSpacing), a spacing mark acts like a dead key, trailing the next letter.
describe("spacing flags match Unicode", () => {
	const isSpacing = (g: string) => ![...g].some((c) => /\p{M}/u.test(c));
	test("every mark's type matches its glyph's class", () => {
		const bad = marks
			.filter((m) => (m.type === "spacing") !== isSpacing(m.mark))
			.map((m) => `⌥${m.opt} ${m.mark}: type=${m.type}, Unicode says ${isSpacing(m.mark) ? "spacing" : "combining"}`);
		expect(bad).toEqual([]);
	});
	// One deliberate exception: the sliding tie ͢ (⌥⇧0) is combining but flagged
	// spacing, because a tie lands POSTFIX on the previous segment (t ⌥⇧0 s →
	// t͢s), like the ⌥j joiner — pending it onto the NEXT base would tie the
	// wrong pair.
	const POSTFIX_COMBINING = new Set(["0"]);
	test("every double's doubleSpacing matches its glyph's class", () => {
		const bad = marks
			.filter((m) => m.double !== undefined && !POSTFIX_COMBINING.has(m.opt))
			.filter((m) => (m.doubleSpacing === true) !== isSpacing(m.double!))
			.map((m) => `⌥⇧${m.opt} ${m.double}: doubleSpacing=${m.doubleSpacing ?? false}, Unicode says ${isSpacing(m.double!) ? "spacing" : "combining"}`);
		expect(bad).toEqual([]);
	});
});

// The invariants both engine ports silently rely on. Where the Rust and JS
// construction would treat a spec differently — Rust truncates a multi-scalar
// mark field through first_char while JS keeps the whole string; Rust iterates
// the raw letters vector while JS dedups into a Map first — the two agree only
// because the spec never exercises the difference. These lock that in: a future
// spec that broke one would fail here instead of shipping as a silent
// per-platform divergence no parity vector would catch.
describe("spec · the invariants both engine ports assume", () => {
	const letters = spec.letters as {key: string; glyph: string}[];

	test("no letter entry has an empty key or glyph", () => {
		expect(letters.filter((e) => !e.key || !e.glyph)).toEqual([]);
	});

	test("letter keys are unique (Rust sees every row, JS dedups)", () => {
		const seen = new Set<string>();
		const dupes = letters.map((e) => e.key).filter((k) => seen.size === seen.add(k).size);
		expect(dupes).toEqual([]);
	});

	const scalars = (s: string) => [...s].length;
	test("every mark field is a single Unicode scalar (Rust keeps only the first)", () => {
		const bad: string[] = [];
		for (const m of marks as any[]) {
			for (const field of ["mark", "double", "clone", "doubleClone"]) {
				const v = m[field];
				if (typeof v === "string" && scalars(v) !== 1) bad.push(`⌥${m.opt} ${field}=${JSON.stringify(v)}`);
			}
			for (const field of ["cycle", "doubleCycle"]) {
				for (const v of (m[field] as string[] | undefined) ?? []) {
					if (scalars(v) !== 1) bad.push(`⌥${m.opt} ${field} entry ${JSON.stringify(v)}`);
				}
			}
		}
		expect(bad).toEqual([]);
	});

	for (const table of ["superscripts", "subscripts"] as const) {
		test(`${table} bases are unique (both ports build reverse maps from them)`, () => {
			const rows = ((spec as any)[table].table as {base: string}[]);
			const seen = new Set<string>();
			const dupes = rows.map((r) => r.base).filter((b) => seen.size === seen.add(b).size);
			expect(dupes).toEqual([]);
		});
	}
});
