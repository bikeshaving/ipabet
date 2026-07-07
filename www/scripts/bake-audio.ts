// bake-audio.ts — pre-bake the /learn word audio with Amazon Polly.
//
// Walks CURRICULUM, synthesizes each unique word from its *target IPA* via
// SSML <phoneme alphabet="ipa">, in a native neural voice per language, and
// writes:
//   src/word-audio/<hash>.mp3   — one clip per unique (voice, IPA)
//   src/word-audio-map.ts       — generated: target IPA -> hashed asset URL
//
// Auth: reads AWS_* from www/.env (Bun auto-loads it); shells to the installed
// `aws` CLI, so no SDK dependency. Cached by content hash — re-runs only
// synthesize new/changed words. Run from www/:   bun scripts/bake-audio.ts
//
// Why GB English (Amy): fed our IPA, a General American voice strips the
// rounding off the low-back vowels (ɒ/ɔ collapse toward ɑ). GB renders them
// faithfully. See the session notes on the voice A/B test.

import {CURRICULUM} from "../src/curriculum.ts";
import {createHash} from "node:crypto";
import {mkdirSync, existsSync, writeFileSync, readdirSync, unlinkSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(HERE, "../src/word-audio");
const MAP_FILE = join(HERE, "../src/word-audio-map.ts");

// language (as tagged in curriculum.ts) -> [voiceId, engine]
const VOICE: Record<string, [string, string]> = {
	English: ["Amy", "neural"],   // en-GB — keeps the rounded back vowels
	Spanish: ["Lucia", "neural"], // es-ES
	French: ["Lea", "neural"],    // fr-FR
	German: ["Vicki", "neural"],  // de-DE
	Arabic: ["Hala", "neural"],   // ar-AE (Gulf); falls back to Zeina/standard
};
const DEFAULT: [string, string] = VOICE.English;
const ARABIC_FALLBACK: [string, string] = ["Zeina", "standard"];

const xml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const hash = (voice: string, ph: string) =>
	createHash("sha256").update(voice + "|" + ph).digest("hex").slice(0, 16);

// How to *demonstrate* an isolated sound (the lesson's opening drill): vowels are
// held (lengthened) so you can sit in the quality; every consonant rides the
// two-part [Ca aCa] frame ("ra ara", "ʃa aʃa") — onset then intervocalic, which
// gives a short consonant enough room to be heard clearly. Diphthongs and diacritic
// demos play as-is. The manifest still keys on the bare sound — only the
// synthesized audio is dressed up.
const VOWELS = "iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ";
function demoPh(target: string): string {
	if ([...target].length !== 1) return target;         // diphthong / diacritic demo
	if (VOWELS.includes(target)) return target + "ː";    // hold the vowel
	return target + "a a" + target + "a";                // frame the consonant [Ca aCa] — "ra ara"
}

interface Clip { ipa: string; word: string; ph: string; voiceId: string; engine: string; file: string; }

// Collect one clip per unique target IPA. Isolated-sound drills (lang "") borrow
// the lesson's dominant language voice, so a trill drills in Spanish, ʕ in Arabic.
const clips = new Map<string, Clip>();
for (const les of CURRICULUM) {
	const counts: Record<string, number> = {};
	for (const wd of les.words) if (wd.lang) counts[wd.lang] = (counts[wd.lang] ?? 0) + 1;
	const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
	for (const wd of les.words) {
		if (clips.has(wd.target)) continue;
		const isDemo = !wd.lang; // the isolated-sound drill carries no language tag
		const lang = wd.lang || dominant || "English";
		const [voiceId, engine] = VOICE[lang] ?? DEFAULT;
		const ph = isDemo ? demoPh(wd.target) : wd.target;
		clips.set(wd.target, {ipa: wd.target, word: wd.word, ph, voiceId, engine, file: hash(voiceId, ph) + ".mp3"});
	}
}

mkdirSync(AUDIO_DIR, {recursive: true});

async function tryVoice(voiceId: string, engine: string, ssml: string, out: string): Promise<boolean> {
	const proc = Bun.spawn(
		["aws", "polly", "synthesize-speech", "--engine", engine, "--voice-id", voiceId,
			"--output-format", "mp3", "--text-type", "ssml", "--text", ssml, out],
		{stdout: "pipe", stderr: "pipe"},
	);
	return (await proc.exited) === 0;
}

async function synth(c: Clip): Promise<"baked" | "cached" | "fail"> {
	const out = join(AUDIO_DIR, c.file);
	if (existsSync(out)) return "cached";
	const ssml = `<speak><phoneme alphabet="ipa" ph="${xml(c.ph)}">${xml(c.word)}</phoneme></speak>`;
	let ok = await tryVoice(c.voiceId, c.engine, ssml, out);
	if (!ok && c.voiceId === "Hala") ok = await tryVoice(ARABIC_FALLBACK[0], ARABIC_FALLBACK[1], ssml, out);
	return ok ? "baked" : "fail";
}

const list = [...clips.values()];
let baked = 0, cached = 0; const failed: Clip[] = [];
const CONC = 8;
let idx = 0;
async function worker() {
	while (idx < list.length) {
		const c = list[idx++];
		const r = await synth(c);
		if (r === "baked") { baked++; process.stdout.write("."); }
		else if (r === "cached") cached++;
		else { failed.push(c); process.stdout.write("x"); }
	}
}
await Promise.all(Array.from({length: CONC}, worker));

console.log(`\n\nbaked ${baked}, cached ${cached}, failed ${failed.length}, total ${list.length}`);
for (const f of failed) console.error(`  FAILED: /${f.ipa}/  "${f.word}"  (${f.voiceId})`);

// Generate the manifest.
const entries = [...clips.values()];
const lines: string[] = [
	"// GENERATED by scripts/bake-audio.ts — do not edit.",
	"// Word target (broad IPA) -> hashed asset URL for the Polly-baked recording.",
	"// Regenerate:  bun scripts/bake-audio.ts",
	"",
];
entries.forEach((c, i) => lines.push(`// @ts-ignore`, `import w${i} from "./word-audio/${c.file}" with {assetBase: "/assets/"};`));
lines.push("", "export const WORD_AUDIO: Record<string, string> = {");
entries.forEach((c, i) => lines.push(`\t${JSON.stringify(c.ipa)}: w${i},`));
lines.push("};", "");
writeFileSync(MAP_FILE, lines.join("\n"));
console.log(`wrote ${MAP_FILE} (${entries.length} entries)`);

// Sweep orphans — clips whose audio changed (e.g. a demo re-dressed) leave the old file behind.
const keep = new Set(entries.map((c) => c.file));
let removed = 0;
for (const f of readdirSync(AUDIO_DIR)) if (f.endsWith(".mp3") && !keep.has(f)) { unlinkSync(join(AUDIO_DIR, f)); removed++; }
if (removed) console.log(`swept ${removed} orphaned mp3(s)`);
