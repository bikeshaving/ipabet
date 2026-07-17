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
		// The unit of teaching is the PAIR: i⇧H teaches ɪ, not "⇧H after
		// anything" — shrimp's r⇧H is untaught at lesson 9 even though bare r
		// and i⇧H both are. ⌥ marks are taught singly (prefix, any base).
		const pairs = new Set<string>();
		const marks = new Set<string>();
		for (const les of CURRICULUM) {
			const ks = les.keys ?? [];
			for (let i = 0; i < ks.length; i++) {
				if (ks[i].startsWith("⌥")) marks.add(ks[i]);
				else if (i > 0 && ks[i].startsWith("⇧")) pairs.add(ks[i - 1] + " " + ks[i]);
			}
			for (const wd of les.words) {
				const L = wd.labels;
				for (let i = 0; i < L.length; i++) {
					if (L[i].startsWith("⌥")) {
						expect(marks.has(L[i]), `"${wd.word}" in "${les.title}" uses ${L[i]} before it's taught`).toBe(true);
					} else if (L[i].startsWith("⇧")) {
						const pair = (L[i - 1] ?? "") + " " + L[i];
						expect(pairs.has(pair), `"${wd.word}" in "${les.title}" uses ${pair} before it's taught`).toBe(true);
					}
				}
			}
		}
	});

	test("a prefix ⌥ mark never dangles at the end of a word", () => {
		// A pending mark with no base flushes as a SPACING clone — bɔ˜ instead
		// of bɔ̃ — a wrong transcription that still "types its own target".
		// A spacing-clone final char (˜ ´ ¨ ˙ ˇ …) is the flush's fingerprint;
		// legitimate postfix ⌥ marks end in real IPA (ː ˈ tone bars).
		const CLONES = /[˜´`¨ˆ˙˘ˇ¸˛]$/;
		for (const les of CURRICULUM) {
			for (const wd of les.words) {
				expect(CLONES.test(wd.target),
					`"${wd.word}" in "${les.title}" ends with a flushed prefix mark (${wd.target})`).toBe(false);
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
