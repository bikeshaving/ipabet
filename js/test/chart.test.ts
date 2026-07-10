// Drift guard for /chart.
//
// Every keystroke label printed on the chart is typed through the engine here.
// The chart's tables are hand-authored (they mirror the official IPA chart's
// order and wording, which no generator knows), so this is the only thing
// stopping a label from describing a keystroke the engine stopped honoring.
// It has already caught two: secondary stress and half-long both still said
// "press it twice" after double-press cycling was replaced by ⌥⇧.

import {describe, expect, test} from "bun:test";
import {typeKeys, type Keystroke} from "../src/index.ts";
import {
	DIACRITICS,
	SUPRASEGMENTALS,
	TONES,
	type ChartEntry,
} from "../../www/src/chart-data.ts";

function seq(...keys: string[]): Keystroke[] {
	return keys.map((k) => {
		let shift = false;
		let option = false;
		let key = k;
		while (key[0] === "+" || key[0] === "~") {
			if (key[0] === "+") shift = true;
			else option = true;
			key = key.slice(1);
		}
		return {key, shift, option};
	});
}

// The engine emits precomposed forms wherever Unicode has one (⌥e e → "é",
// one codepoint), while the chart names the mark by its combining codepoint.
// Both spellings are the same text; compare canonically.
const nfc = (s: string) => s.normalize("NFC");

const baseKeys = (e: ChartEntry) => (e.onKeys ?? e.on!).split(" ");

/**
 * How an entry is typed, from its shape alone:
 *   ◌-prefixed glyph → a combining mark: dead-key first, then the base.
 *   spacing glyph with `on` → a postfix modifier: base first, then the keys.
 *   spacing glyph, no `on` → the keys stand alone.
 */
function trial(e: ChartEntry): {keys: string[]; expected: string} {
	const keys = e.keys.split(" ");
	if (e.glyph.startsWith("◌")) {
		return {keys: [...keys, ...baseKeys(e)], expected: e.on! + e.glyph.slice(1)};
	}
	if (e.on) return {keys: [...baseKeys(e), ...keys], expected: e.on + e.glyph};
	return {keys, expected: e.glyph};
}

const sections: [string, ChartEntry[]][] = [
	["diacritics", DIACRITICS],
	["suprasegmentals", SUPRASEGMENTALS],
	["tones", TONES],
];

for (const [section, entries] of sections) {
	describe(`chart · ${section}`, () => {
		for (const e of entries) {
			const {keys, expected} = trial(e);
			test(`${e.name}: ${e.keys} → ${e.glyph}`, () => {
				expect(nfc(typeKeys(seq(...keys)))).toBe(nfc(expected));
			});
		}
	});
}

describe("chart · shape", () => {
	test("the official chart has exactly 31 diacritics", () => {
		expect(DIACRITICS.length).toBe(31);
	});

	test("every combining entry names the base it is shown on", () => {
		for (const [, entries] of sections) {
			for (const e of entries) {
				if (e.glyph.startsWith("◌")) expect(e.on).toBeTruthy();
			}
		}
	});

	// The base column is printed on the chart too, so it can drift on its own.
	test("every base's keystrokes really produce that base", () => {
		for (const [, entries] of sections) {
			for (const e of entries) {
				if (!e.on) continue;
				expect(typeKeys(seq(...baseKeys(e)))).toBe(e.on);
			}
		}
	});

	// The chart is of the IPA chart. Latin tenants (cedilla, ogonek, horn, …)
	// and tradition marks (Korean fortis) are typeable and documented on /keys,
	// but they are not on it — spec/ipabet.json flags them `"ipa": false`.
	test("no non-IPA mark reaches the chart", async () => {
		const spec = (await import("../../spec/ipabet.json")).default as {
			marks: {mark: string; ipa?: boolean}[];
		};
		const nonIPA = new Set(
			spec.marks.filter((m) => m.ipa === false).map((m) => m.mark),
		);
		expect(nonIPA.size).toBeGreaterThan(0);
		for (const [, entries] of sections) {
			for (const e of entries) {
				const bare = e.glyph.startsWith("◌") ? e.glyph.slice(1) : e.glyph;
				expect(nonIPA.has(bare)).toBe(false);
			}
		}
	});
});
