import {describe, test, expect} from "bun:test";
import bank from "../src/gen/harvest-words.json";

// The English bank is General American, sourced from CMUdict by
// harvest-en-cmu.ts. These tests pin that: core words carry their exact GA
// transcription, and no entry may exhibit the wikipron-era failure modes
// (dialect mixing, narrow diacritics, length marks, tense-i before ŋ).

const en = (bank as any[]).filter((e) => e.lang === "en");
const byWord = new Map(en.map((e) => [e.word, e.target]));

describe("English bank is CMU-backed General American", () => {
	test("core words carry their GA transcription", () => {
		expect(byWord.get("the")).toBe("ðə");
		// CMU's primary entry for "and" is the weak form — the rule is
		// "primary pronunciation, no cherry-picking", so it stands.
		expect(byWord.get("and")).toBe("ənd");
		expect(byWord.get("this")).toBe("ðɪs");
		expect(byWord.get("with")).toBe("wɪð");
		expect(byWord.get("think")).toBe("θɪŋk");
		expect(byWord.get("thing")).toBe("θɪŋ");
		expect(byWord.get("king")).toBe("kɪŋ");
		expect(byWord.get("thanks")).toBe("θæŋks");
		expect(byWord.get("work")).toBe("wəɹk");
		expect(byWord.get("north")).toBe("nɔɹθ");
		expect(byWord.get("world")).toBe("wəɹld");
		expect(byWord.get("people")).toBe("pipəl");
	});

	test("the bank is full-size", () => {
		expect(en.length).toBe(1200);
	});

	// GA phonemic convention only: no length marks, no stress, no narrow
	// diacritics, ɹ not r, g U+0067 — the wikipron-era tells.
	test("every target stays inside the GA convention", () => {
		const bad = en.filter((e) =>
			[...e.target.normalize("NFD")].some((ch) => /\p{M}/u.test(ch)) ||
			/[ːˑˈˌrɡ]/.test(e.target));
		expect(bad.map((e) => `${e.word}:${e.target}`)).toEqual([]);
	});

	test("no tense i before ŋ — the θiŋ/kiŋ corruption stays dead", () => {
		const bad = en.filter((e) => e.target.includes("iŋ"));
		expect(bad.map((e) => `${e.word}:${e.target}`)).toEqual([]);
	});
});
