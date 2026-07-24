// The /learn drill types every word by simulating its stored keystrokes through
// the engine, and derives the on-screen target from that. A key reassignment
// (e.g. the schwa moving 5⇧Y→5⇧H) can silently repoint a label at a freed slot,
// leaving a literal like "5Y" in the target — "not even IPA" on the drill card.
// This types every lesson word and headline and demands real IPA back.
import {describe, expect, test} from "bun:test";
import {typeKeys} from "../src/index.ts";
import {CURRICULUM} from "../../www/src/curriculum.ts";
import {keystrokeFromLabel} from "../../www/src/keystrokes.ts";

// A digit or ASCII capital in an IPA string is the signature of a digraph or
// digit-base label that failed to transform — the freed keystroke fell through
// as its literal spelling (5⇧Y with schwa gone → "5Y").
const junk = /[0-9A-Z]/;

describe("/learn curriculum types real IPA", () => {
	test("is non-trivial", () =>
		expect(CURRICULUM.reduce((n, l) => n + l.words.length, 0)).toBeGreaterThan(200));

	test("every drill word's target is real IPA", () => {
		const broken = CURRICULUM.flatMap((l) =>
			l.words
				.filter((w) => junk.test(w.target))
				.map((w) => `${l.title} · ${w.word}: ${w.labels.join(" ")} → ${w.target}`));
		expect(broken).toEqual([]);
	});

	test("every lesson headline types real IPA", () => {
		const broken = CURRICULUM.filter((l) => l.keys?.length)
			.map((l) => ({l, out: typeKeys(l.keys!.map(keystrokeFromLabel))}))
			.filter(({out}) => junk.test(out))
			.map(({l, out}) => `${l.title}: ${l.keys!.join(" ")} → ${out}`);
		expect(broken).toEqual([]);
	});
});
