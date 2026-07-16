// The course's ordering promise, enforced: "each new sound is introduced by a
// word that ... uses only sounds taught earlier" (curriculum.ts header). Words
// are keystroke-authored, so the promise is checkable at the keystroke level:
// a bare letter is free (the plain keyboard); anything shifted, optioned, or a
// digit base must have been declared in some lesson's `keys` at or before the
// word that uses it.

import {describe, expect, test} from "bun:test";
import {CURRICULUM} from "../src/curriculum.ts";

describe("curriculum · ordering", () => {
	test("every word uses only keystrokes taught by its lesson", () => {
		const taught = new Set<string>();
		for (const les of CURRICULUM) {
			for (const k of les.keys ?? []) taught.add(k);
			for (const wd of les.words) {
				for (const lab of wd.labels) {
					if (/^[a-z]$/.test(lab)) continue;
					expect(taught.has(lab), `"${wd.word}" in "${les.title}" uses ${lab} before it's taught`).toBe(true);
				}
			}
		}
	});

	test("review lessons teach nothing new", () => {
		for (const les of CURRICULUM.filter((l) => l.review)) {
			expect(les.sound).toBeUndefined();
			expect(les.keys).toBeUndefined();
		}
	});

	test("a lesson's declared keys appear in its own words", () => {
		for (const les of CURRICULUM) {
			for (const k of les.keys ?? []) {
				if (/^[a-z0-9]$/.test(k)) continue; // bare bases appear implicitly
				const used = les.words.some((wd) => wd.labels.includes(k));
				expect(used, `"${les.title}" declares ${k} but no word uses it`).toBe(true);
			}
		}
	});
});
