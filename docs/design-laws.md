# The IPAbet design laws

The layout is finished (2026-07-16). These are the laws that decided every key,
recorded so future changes argue against principles instead of relitigating
placements. The canonical mapping is `spec/ipabet.json`, rendered at
[ipabet.org/keys](https://ipabet.org/keys); the commit history holds the
archaeology of every decision.

**The tier law.** ⇧ transforms the previous glyph into an atomic segment
(s⇧H → ʃ). Anything that *appends a mark* lives on ⌥ — that is why rhoticity
is ⌥r and the ejective is ⌥⇧q. Segments never sit on the Option layer (the
extIPA percussive letters stay unplaced).

**The pairing law.** Defer to ABC Extended's dead-key positions unless a pair
earns the key: above/below (dot, macron, comma, breve, inverted breve),
one dimension greater/lesser (=, g, h, f), a placement pair (ring, syllabic,
tie), or a reunited family. Verify against the real layout with
`macos/tools/dump-us-layer.swift`.

**The polarity law.** Shift is the greater / upward member: raised, advanced,
ATR, fortis, upstep, rise, egressive, the double prime.

**The quote law.** Opening forms are unshifted, everywhere: “ ‘ « ₍ ⟨ ʻ.

**The cycle law.** A repeat press on a pending mark advances through a family
and wraps (`cycle` / `doubleCycle` in the spec) — one dimension only, so
cross-dimension marks keep separate keys and can stack (t̪̻ is why apical
stayed off the t cycle). The composition preview shows every step; ⌫ cancels.
The joiners walk by lookback instead (⌥j ⌥j ⇄ sliding), since they emit.

**The doubled-letter law.** X⇧X is X's orthographic cousin: ß þ ı ƙ ƴ ƒ.
Capitals ride the capital-digraph rule; the shifted digit is the digit's
capital plane (⇧5⇧Y → Ə).

**Escapes are ⌃⇧.** ⌃⇧letter is the literal capital; ⌃⇧Space is the Raw-US
Lock. Caps Lock is a lock, never the ⇧ modifier.

**Quotes are a locale.** The bracket keys carry open/close-primary/secondary
semantics; the `quotes` table in the spec (en de fr ch pl ru sv) decides the
characters, via the `quoteLocale` default. Configuration, not composition state.

**Coverage commitments.** The full IPA chart and the complete extIPA 2015
diacritic set type; every major romanization tradition (IAST/ISO 15919, DIN
31635, ALA-LC Cyrillic primes ʹ ʺ, McCune–Reischauer, pinyin, Wade–Giles,
Vedic, Egyptological-by-substitution) is writable; rhoticity is handled (ɚ ɝ
fuse on ⌥r). Deliberately unplaced: the extIPA segment letters, √ and † (the
scholars' parking lot), saltillo.
