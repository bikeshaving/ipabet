// Every test file replays keystrokes through this wrapped typeKeys instead of
// importing the engine's directly. With IPABET_DUMP_VECTORS=1, each call that
// reaches a passing assertion is recorded — a call only ever gets here with a
// text/pending state a real test exercised, so the recorded "expected" is the
// engine's own verified output, not a hand-duplicated copy of it. The shared
// fixture both the Linux and Windows engine ports replay to verify against,
// so neither port's test vectors can drift from what js/test actually checks.
//
// Appended, one line per call, rather than rewritten: bun fires no end-of-run
// hook this can trust. A module-scoped afterAll runs for only a subset of files
// in a multi-file run, and neither process "exit" nor "beforeExit" fires at all
// (all three verified directly). Anything that batches therefore loses whatever
// is in the last batch, silently, and the vectors that go missing are whichever
// file happened to finish last.
//
// Appending a single line costs nothing and cannot lose the tail. `bun run
// vectors` clears the log, runs the suite, and assembles spec/parity-vectors.json
// from it.

import {
	typeKeys as realTypeKeys,
	setQuoteLocale as realSetQuoteLocale,
	setCapitalDigraphs as realSetCapitalDigraphs,
	type Keystroke,
} from "../src/index.ts";
import spec from "../../spec/ipabet.json";

const DUMP = process.env.IPABET_DUMP_VECTORS === "1";
const LOG_PATH = (() => {
	const path = require("node:path");
	return path.join(import.meta.dir, "../../spec/parity-vectors.ndjson");
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
	// Capital digraphs are OFF by default in the real engine; one describe
	// block in engine.test.ts (the "yelling doesn't eat words" suite)
	// deliberately toggles them off again for its own tests before restoring
	// them. Recorded per-vector for the same reason as locale: whether ⇧S⇧H
	// becomes Ʃ or stays "SH" depends on this setting at type-time.
	capital_digraphs: boolean;
}

const QUOTE_LOCALES = spec.quotes as {default: string; locales: Record<string, unknown>};

let activeLocale = QUOTE_LOCALES.default;
let capitalDigraphsOn = false; // matches index.ts's own default

export function typeKeys(keys: Keystroke[], initial = ""): string {
	const result = realTypeKeys(keys, initial);
	if (DUMP) {
		const vector: Vector = {
			keys,
			initial,
			expected: result,
			locale: activeLocale,
			capital_digraphs: capitalDigraphsOn,
		};
		require("node:fs").appendFileSync(LOG_PATH, JSON.stringify(vector) + "\n");
	}
	return result;
}

export function setCapitalDigraphs(on: boolean): void {
	capitalDigraphsOn = on;
	realSetCapitalDigraphs(on);
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
