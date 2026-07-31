// Every test file replays keystrokes through this wrapped typeKeys instead of
// importing the engine's directly. With IPABET_DUMP_VECTORS=1, each call that
// reaches a passing assertion is recorded — a call only ever gets here with a
// text/pending state a real test exercised, so the recorded "expected" is the
// engine's own verified output, not a hand-duplicated copy of it. The shared
// fixture both the Linux and Windows engine ports replay to verify against,
// so neither port's test vectors can drift from what js/test actually checks.
//
// Flushed periodically, not once at the end: bun's test runner does not
// reliably fire a module-scoped afterAll after every test FILE in a
// multi-file run (empirically, only a subset of files' pushes survived to
// the final file when flushing once at the end via afterAll), and
// process.on("exit") never fires at all under bun test (verified directly).
// A write on every single push is correct but too slow for a tight loop
// (the word-bank test times out) — writing every FLUSH_EVERY pushes bounds
// the worst case to losing only the last few entries, not the whole run.

import {afterAll} from "bun:test";
import {typeKeys as realTypeKeys, setQuoteLocale as realSetQuoteLocale, type Keystroke} from "../src/index.ts";
import spec from "../../spec/ipabet.json";

const DUMP = process.env.IPABET_DUMP_VECTORS === "1";
const OUT_PATH = (() => {
	const path = require("node:path");
	return path.join(import.meta.dir, "../../spec/parity-vectors.json");
})();

interface Vector {
	keys: Keystroke[];
	initial: string;
	expected: string;
	// The quote locale active when this was typed (spec/ipabet.json's
	// quotes.default, "en", unless a test called setQuoteLocale). Recorded
	// because the ⌥[/⌥]/⌥⇧[/⌥⇧] outputs depend on it — without this a replay
	// can't tell a German-locale vector from an English one.
	locale: string;
}

const QUOTE_LOCALES = spec.quotes as {default: string; locales: Record<string, unknown>};

const vectors: Vector[] = [];
const FLUSH_EVERY = 25;
let activeLocale = QUOTE_LOCALES.default;

function writeOut() {
	require("node:fs").writeFileSync(OUT_PATH, JSON.stringify(vectors, null, 1) + "\n");
}

export function typeKeys(keys: Keystroke[], initial = ""): string {
	const result = realTypeKeys(keys, initial);
	if (DUMP) {
		vectors.push({keys, initial, expected: result, locale: activeLocale});
		if (vectors.length % FLUSH_EVERY === 0) writeOut();
	}
	return result;
}

export function setQuoteLocale(locale: string): void {
	// Mirrors the real engine's own fallback exactly (index.ts: `quoteLocale =
	// locale in QUOTE_LOCALES.locales ? locale : QUOTE_LOCALES.default`) — an
	// unknown locale falls back immediately, not just at use-time, so a
	// stray setQuoteLocale("zz") in one test can't mislabel every vector
	// recorded afterward as locale "zz".
	activeLocale = locale in QUOTE_LOCALES.locales ? locale : QUOTE_LOCALES.default;
	realSetQuoteLocale(locale);
}

if (DUMP) {
	// Best-effort final flush — not load-bearing (the periodic writes above
	// already bound the loss), but catches the tail when this DOES fire.
	afterAll(writeOut);
}
