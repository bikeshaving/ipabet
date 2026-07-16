// The spec must describe itself accurately.
//
// spec/ipabet.json is the source both engines and the website read. Its prose
// (`laws`, `classes`, each mark's `name`) is the only place the *reasoning* for
// a key assignment lives, and prose does not typecheck. When cedilla moved from
// ⌥c to ⌥, the laws still said "⌥c cedilla" and "⌥⇧x dot-below" — one naming an
// unassigned key, the other naming the wrong mark entirely. Nothing caught it.
//
// The structural fix was to move membership onto the marks (`ipa`, `beyond`,
// `shiftSense`, `arbitraryKey`) and leave `laws`/`classes` to define terms.
// These tests hold that line: prose may not claim membership, every flag must
// be drawn from the declared vocabulary, and every declared term must be used.

import {describe, expect, test} from "bun:test";
import spec from "../../spec/ipabet.json";
import schema from "../../spec/ipabet.schema.json";

interface Mark {
	opt: string;
	mark: string;
	double?: string;
	exclusive?: boolean;
	ipa?: boolean;
	beyond?: string;
	shiftSense?: string;
	arbitraryKey?: boolean;
	name?: string;
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

	// Every ⌥-key named in the classes prose must be a key that exists. This is the
	// check that "⌥c cedilla" would have failed the moment cedilla moved.
	test("every ⌥key named in classes is assigned", () => {
		const text = [...prose(classes)].join(" ");
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

describe("spec · the moved keys", () => {
	test("the comma key carries the comma-shaped mark — at last", () => {
		// The cedilla used to squat here on its comma shape, which left the actual
		// comma-below mark riding shotgun on ⌥⇧. The cedilla went home to ⌥c (ABC
		// Extended's key, and the letter it is named for), so shape identity holds.
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

	test("the tie bar is a postfix joiner on ⌥j, not a number-row glyph or a ⇧-letter", () => {
		expect((spec.letters as {key: string}[]).find((l) => l.key === "6")).toBeUndefined();
		const tie = byOpt.get("j")!;
		expect(tie.mark).toBe("\u{0361}"); // tie above on ⌥j
		expect(tie.double).toBe("\u{035C}"); // tie below on ⌥⇧j
		expect(byOpt.get("8")!.mark).toBe("↓"); // ⌥8 is airflow now (the nasal pair cycles behind ⌥n)
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

// spec/ipabet.schema.json documents the file for outside consumers. A schema
// nobody runs is just more prose, and adding a validator dependency to ship one
// assertion is not worth it — so enforce its structural claims about `marks`
// directly. Full Draft 2020-12 validation still passes; this keeps it true.
describe("spec · matches its published schema", () => {
	const markSchema = (schema as any).$defs.mark;
	const allowed = new Set(Object.keys(markSchema.properties));
	const required: string[] = markSchema.required;
	const dependents: Record<string, string[]> = markSchema.dependentRequired;

	test("no mark carries a field the schema doesn't declare", () => {
		for (const m of marks as unknown as Record<string, unknown>[]) {
			for (const k of Object.keys(m)) expect(allowed, `⌥${m.opt}.${k}`).toContain(k);
		}
	});

	test("every mark carries the schema's required fields", () => {
		for (const m of marks as unknown as Record<string, unknown>[]) {
			for (const k of required) expect(m[k], `⌥${m.opt}.${k}`).toBeDefined();
		}
	});

	test("dependentRequired holds: double↔shiftSense, ipa↔beyond, exclusive→double", () => {
		for (const m of marks as unknown as Record<string, unknown>[]) {
			for (const [field, needs] of Object.entries(dependents)) {
				if (m[field] === undefined) continue;
				for (const n of needs) expect(m[n], `⌥${m.opt}: ${field} requires ${n}`).toBeDefined();
			}
		}
	});

	test("enum-valued flags stay inside their enums", () => {
		for (const m of marks as unknown as Record<string, any>[]) {
			for (const f of ["type", "group", "shiftSense", "beyond"]) {
				if (m[f] === undefined) continue;
				expect(markSchema.properties[f].enum, `⌥${m.opt}.${f}`).toContain(m[f]);
			}
		}
	});
});
