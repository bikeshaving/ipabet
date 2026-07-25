// Shared machinery for the word-bank harvesters: IPA string → keystrokes →
// round-trip-verified bank entry. Used by harvest-words.ts (wikipron tenants)
// and harvest-en-cmu.ts (English from CMUdict).
import spec from "../../spec/ipabet.json";

export type K = {key: string; shift: boolean; option: boolean};

// A digit is a BARE base (5H → ə), typed unshifted; only letters shift.
export const keysFor = (k: string): K[] =>
	[...k].map((c) => /[A-Z]/.test(c) ? {key: c.toLowerCase(), shift: true, option: false} : {key: c, shift: false, option: false});

export const label = (k: K) =>
	(k.option ? "⌥" : "") + (k.shift ? "⇧" : "") + (k.shift && /[a-z]/.test(k.key) ? k.key.toUpperCase() : k.key);

const glyphKeys = new Map<string, K[]>();
for (const e of spec.letters as any[]) if (!glyphKeys.has(e.glyph)) glyphKeys.set(e.glyph, keysFor(e.key));

// Combining marks: primary on ⌥key, secondary (the `double`) on ⌥⇧key.
// Spacing marks (ː ˈ) are postfix and keyed the same way.
const markKeys = new Map<string, K[]>();
const spacingKeys = new Map<string, K[]>();
for (const m of spec.marks as any[]) {
	const into = m.type === "combining" ? markKeys : spacingKeys;
	if (!into.has(m.mark)) into.set(m.mark, [{key: m.opt, shift: false, option: true}]);
	if (m.double && !into.has(m.double)) into.set(m.double, [{key: m.opt, shift: true, option: true}]);
}

export function normalize(ipa: string) {
	return ipa.replace(/\s+/g, "").replace(/ɡ/g, "g").replace(/[ˈˌ]/g, "").replace(/[͜͡‿.|‖]/g, "").normalize("NFD");
}

// Combining diacritics are PREFIX (dead-key): ⌥mark comes before its base.
// Emitting them in string order would type the mark onto the *previous* glyph.
export function convert(ipa: string): K[] | null {
	const ks: K[] = [];
	const chars = [...ipa];
	let i = 0;
	while (i < chars.length) {
		const base = chars[i++];
		if (!glyphKeys.has(base)) return null;
		const pre: K[] = [];
		const post: K[] = [];
		while (i < chars.length && (markKeys.has(chars[i]) || spacingKeys.has(chars[i]))) {
			const ch = chars[i++];
			if (markKeys.has(ch)) pre.push(...markKeys.get(ch)!);
			else post.push(...spacingKeys.get(ch)!);
		}
		ks.push(...pre, ...glyphKeys.get(base)!, ...post);
	}
	return ks;
}

const isComb = (cp: number) =>
	(cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1dc0 && cp <= 0x1dff) || (cp >= 0x02b0 && cp <= 0x02ff && cp !== 0x02bc);
export const baseGlyphs = (s: string) =>
	[...new Set([...s.normalize("NFD")].filter((ch) => !isComb(ch.codePointAt(0)!)))];
