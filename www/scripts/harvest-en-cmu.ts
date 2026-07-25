// Rebuild the ENGLISH slice of www/src/gen/harvest-words.json from CMUdict.
//
// Policy: the English bank is General American, one convention throughout —
// CMUdict is the reference (BSD-licensed, GA phonemic), so every drill word
// is dictionary-backed rather than Wiktionary-scraped (wikipron mixes
// dialects: non-rhotic variants, casual reductions, and homograph grabs all
// round-trip fine and teach the wrong thing). Non-English languages keep
// their wikipron entries untouched.
//
// Conventions (match the rest of the bank): ɹ not r, g U+0067, no stress
// marks, AH0 → ə, ER → əɹ, full diphthongs eɪ oʊ aɪ aʊ ɔɪ.
//
//   bun www/scripts/harvest-en-cmu.ts
import fs from "fs";
import {typeKeys} from "../../js/src/index.ts";
import {STAGES} from "../src/stages.ts";
import {convert, label, baseGlyphs} from "./harvest-lib.ts";

const CMU_URL = "https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict";
const FREQ_URL = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt";
const CACHE = "/tmp/ipabet-harvest-cache";
fs.mkdirSync(CACHE, {recursive: true});

async function cached(url: string, name: string): Promise<string> {
	const p = `${CACHE}/${name}`;
	if (!fs.existsSync(p)) fs.writeFileSync(p, await (await fetch(url)).text());
	return fs.readFileSync(p, "utf8");
}

const A2I: Record<string, string> = {
	AA: "ɑ", AE: "æ", AO: "ɔ", AW: "aʊ", AY: "aɪ", EH: "ɛ", ER: "əɹ",
	EY: "eɪ", IH: "ɪ", IY: "i", OW: "oʊ", OY: "ɔɪ", UH: "ʊ", UW: "u",
	B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "g", HH: "h", JH: "dʒ",
	K: "k", L: "l", M: "m", N: "n", NG: "ŋ", P: "p", R: "ɹ", S: "s", SH: "ʃ",
	T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};

const [cmuText, freqText] = await Promise.all([cached(CMU_URL, "cmudict.dict"), cached(FREQ_URL, "freq-en.txt")]);

// First (primary) pronunciation per word only.
const cmu = new Map<string, string>();
for (const line of cmuText.split("\n")) {
	if (!line.trim()) continue;
	const [head, ...phones] = line.trim().split(/\s+/);
	if (head.endsWith(")")) continue; // variant entries like word(2)
	const ipa = phones.map((p) => {
		const m = p.match(/^([A-Z]+)(\d)?$/);
		if (!m) return null;
		if (m[1] === "AH") return m[2] === "0" ? "ə" : "ʌ";
		return A2I[m[1]] ?? null;
	});
	if (ipa.some((s) => s === null)) continue;
	cmu.set(head.toLowerCase(), ipa.join(""));
}

const out: any[] = [];
const seen = new Set<string>();
for (const line of freqText.split("\n")) {
	const word = line.trim();
	if (!word || seen.has(word) || !/^\p{L}{2,9}$/u.test(word)) continue;
	const ipa = cmu.get(word);
	if (ipa === undefined) continue;
	const norm = ipa.normalize("NFD");
	const ks = convert(norm);
	if (!ks) continue;
	const got = typeKeys(ks).normalize("NFC");
	if (got !== norm.normalize("NFC")) continue;
	seen.add(word);
	out.push({target: got, labels: ks.map(label), word, lang: "en", glyphs: baseGlyphs(got)});
	if (out.length >= 1200) break;
}

const progression = new Set<string>();
for (const s of STAGES) for (const g of s.glyphs) progression.add(g);
const en = out.filter((w) => w.glyphs.every((g: string) => progression.has(g)));

const bankPath = new URL("../src/gen/harvest-words.json", import.meta.url).pathname;
const old = JSON.parse(fs.readFileSync(bankPath, "utf8"));
const others = old.filter((e: any) => e.lang !== "en");
fs.writeFileSync(bankPath, JSON.stringify([...en, ...others]));

console.log(`en: ${en.length} CMU-backed entries (${out.length - en.length} dropped off-progression); others kept: ${others.length}`);
console.log("spot:", ["think", "thing", "king", "thanks", "mother", "work", "north"].map((w) => {
	const e = en.find((x) => x.word === w);
	return e ? `${w}/${e.target}/` : `${w}=MISSING`;
}).join(" "));
