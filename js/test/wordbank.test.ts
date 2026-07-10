// The /learn word bank must type what it claims.
//
// www/src/harvest-words.json is a generated artifact that is committed, and its
// generator needs corpora that aren't in the repo — so it does not get re-run
// when the layout changes, and nothing re-checked it. By the time this test was
// written, 394 of its 3100 entries (12.7%) no longer typed their own target:
// the vowel-space shuffles retired the aU/aO digraphs, and cedilla landing on
// ⌥, silently repointed twenty German ç words at a key that had become ʿayn.
//
// /learn teaches these keystrokes to a human. A wrong label is worse than a
// missing one. This test types every entry and demands its target back.

import {describe, expect, test} from "bun:test";
import {typeKeys, type Keystroke} from "../src/index.ts";
import words from "../../www/src/harvest-words.json";

interface Entry {
	word: string;
	target: string;
	labels: string[];
	lang: string;
	glyphs: string[];
}

/** "⌥⇧N" / "⇧H" / "a" → a Keystroke. The inverse of the harvester's `label`. */
function parse(l: string): Keystroke {
	let s = l;
	const option = s.startsWith("⌥");
	if (option) s = s.slice(1);
	let shift = s.startsWith("⇧");
	if (shift) s = s.slice(1);
	if (/^[A-Z0-9]$/.test(s)) shift = true;
	return {key: s.toLowerCase(), shift, option};
}

const bank = words as Entry[];
const nfc = (s: string) => s.normalize("NFC");

describe("word bank", () => {
	test("is non-trivial", () => expect(bank.length).toBeGreaterThan(2000));

	test("every entry's labels type its target", () => {
		const broken = bank
			.filter((w) => nfc(typeKeys(w.labels.map(parse))) !== nfc(w.target))
			.map((w) => `${w.lang} ${w.word} /${w.target}/ ← ${w.labels.join(" ")}`);
		expect(broken).toEqual([]);
	});

	// `glyphs` is the progression-gating list: the *base* glyphs a word needs,
	// so ç contributes c and õ contributes o. They appear in the target only
	// once it is decomposed.
	test("every entry's glyphs appear in its decomposed target", () => {
		for (const w of bank) {
			const nfd = w.target.normalize("NFD");
			for (const g of w.glyphs) expect(nfd).toContain(g);
		}
	});

	test("no label names an unassigned ⌥ key", () => {
		const used = new Set(bank.flatMap((w) => w.labels).filter((l) => l.startsWith("⌥")));
		for (const l of used) {
			const k = parse(l);
			expect(nfc(typeKeys([k, {key: "a"}])), `${l} produced nothing`).not.toBe("a");
		}
	});
});
