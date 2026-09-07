// Differential fuzzing: seeded-random documents and keystroke sequences,
// with the JS engine as the oracle. The output is parity-vector format, so
// engine/tests/parity.rs replays it against the Rust engine unchanged.
//
// The recorded parity vectors prove the engines agree on what the tests
// type — which is IPA, and only IPA. The review that motivated this found
// the engines disagreeing on backspace over an emoji: an input no test had
// ever seen. So this SEEDS the document (the `initial` each sequence starts
// from) with the hostile things — emoji with skin tones, ZWJ families, flags,
// decomposed Hangul, astral superscripts, mark stacks, NBSP, Roman numerals,
// ß — then types random keystrokes over them. The keystrokes themselves are
// the ASCII plane the engine actually reads; the hostility is in the
// document they operate on, which is exactly where the emoji-backspace bug
// lived.
//
//   bun run js/scripts/fuzz-vectors.ts [seed] [count] [outfile]
//
// The default seed is fixed, so spec/fuzz-vectors.json is deterministic and
// committed; CI additionally runs a fresh seed every push and prints it, so
// any failure is reproducible by rerunning with that seed.

import fs from "node:fs";
import path from "node:path";
import {typeKeys, setQuoteLocale, setCapitalDigraphs, type Keystroke} from "../src/index.ts";

const seed = Number(process.argv[2] ?? 271828);
const count = Number(process.argv[3] ?? 400);
const outfile =
	process.argv[4] ?? path.join(import.meta.dir, "../../spec/fuzz-vectors.json");

// mulberry32: tiny, deterministic, good enough for input generation.
function prng(a: number): () => number {
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = prng(seed);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number): boolean => rand() < p;

const FRAGMENTS = [
	"", "abc", "the ", "PATH", "ʃɪp", "θɪŋ", "ə", "ɡ˞", "aː", "t͡s",
	"👍🏽", "👩‍👩‍👧", "🇺🇸", "한", "한", "ế", "é̂",
	"ã̃̃", "\u{107B2}", "\u{10780}", "Ⅰ", "ß", " ", "æ̃",
	"x̣̯́", "¿", "日本", "🍕",
];

const KEYS = [
	..."abcdefghijklmnopqrstuvwxyz", ..."0123456789",
	"-", "=", "[", "]", ";", "'", ",", ".", "/", "\\", "`", " ",
	"⌫", "⌫", "Escape",
];

const LOCALES = ["en", "en", "en", "fr", "de", "nosuchlocale"];

function stroke(): Keystroke {
	const key = pick(KEYS);
	const k: Keystroke = {key};
	if (chance(0.35)) k.shift = true;
	if (chance(0.25)) k.option = true;
	if (chance(0.08)) k.control = true;
	if (chance(0.06)) k.capsLock = true;
	if (chance(0.15)) k.shiftBroke = true;
	return k;
}

const vectors = [];
for (let i = 0; i < count; i++) {
	const locale = pick(LOCALES);
	const capitalDigraphs = chance(0.5);
	setQuoteLocale(locale);
	setCapitalDigraphs(capitalDigraphs);
	let initial = "";
	const pieces = Math.floor(rand() * 4);
	for (let p = 0; p < pieces; p++) initial += pick(FRAGMENTS);
	const keys = Array.from({length: 1 + Math.floor(rand() * 12)}, stroke);
	vectors.push({
		keys,
		initial,
		expected: typeKeys(keys, initial),
		locale,
		capital_digraphs: capitalDigraphs,
	});
}
setQuoteLocale("en");
setCapitalDigraphs(false);

fs.writeFileSync(outfile, JSON.stringify(vectors, null, 1) + "\n");
console.log(`seed ${seed}: ${vectors.length} fuzz vectors → ${outfile}`);
