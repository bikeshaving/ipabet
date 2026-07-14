# Spending the freed ⌥⇧ letter layer: extIPA

Moving the literal-capital escape to ⌃⇧ freed the whole ⌥⇧+letter layer. It had
to hold the escape, so it could never be spent; now 13 letter slots are open.
This proposes what goes there. **Nothing here is implemented — it needs your
call**, because the assignments that aren't derivable are orthography, and that
is yours.

## What is actually missing

An audit of the spec against the 2020 chart says the official IPA is now
**complete** (ɧ and the below-tie landed in `cfbfdc4`). Every remaining gap is
**extIPA** — the Extensions to the IPA for disordered speech — and the gaps are
big enough that clinical transcription is simply not possible in IPAbet today.

Ranked by what it costs a working phonetician:

1. **Seven extIPA diacritics.** Their absence is the whole hole.
2. **`₍ ₎` (U+208D/U+208E).** Two characters that carry the entire extIPA
   (de)voicing system — `₍z`, `z̥₎`, `₍z̥₎`. Highest value per codepoint in the
   whole audit.
3. **`ʩ` (U+02A9)**, the velopharyngeal fricative — the workhorse extIPA
   consonant, routine in cleft-palate work. Then `ʪ ʫ` (lateral lisps), then
   `ʬ ʭ` (percussives, rare).

One sharp asymmetry: **`͈` U+0348 "strong articulation" already works** (⌥0) —
the spec ships it as the Korean fortis mark, `ipa: false`. Its partner `͉`
U+0349 "weak" does not exist. Same chart, same row, one of the two typeable.

## The free slots — and what they are not

`⌥⇧` + `a b h i j k l m t x y` (the ⌥ key has a mark, but no second form) plus
`c r` and the digit slots `⌥⇧8 ⌥⇧9 ⌥⇧0`. Twenty-two slots in all, counting
punctuation.

**None of them is empty.** I dumped the real US layout from the system to check,
and every one of these currently types something on macOS: `⌥⇧a` Å, `⌥⇧h` Ó,
`⌥⇧t` ˇ, `⌥⇧i` ˆ, `⌥⇧l` Ò, `⌥⇧m` Â, `⌥⇧8` °, `⌥⇧9` ·, `⌥⇧0` ‚. Even `⌥⇧k`, which
looks blank, is the Apple logo (U+F8FF). So "free" means *cheap*, not *free* —
spending a slot always destroys a character, and the Option layer has already
destroyed 27 of them (€ £ ¥ ¢ … © ™ µ π å ≈ ≠ ≤ ≥ ± and the math set).

That is the real budget question, and it is why this file exists rather than a
commit.

## An unrelated win, while we are here

`⌥⇧k` (the Apple logo, the cheapest character on the board) could hold COMBINING
RING ABOVE. That gives back **å and Å** — which the Option layer destroyed, and
which phonetics needs constantly for Scandinavian names and journals — plus
explicit control of ring placement, which the engine currently infers from
descenders. Nothing to do with extIPA; just the best trade available.

## Proposed assignments

Two of these the spec's own `keyClasses` law derives for you — shape identity
and cross-tier phonetics. The rest do not derive, and that is the decision.

**Derived — I'd ship these without asking:**

| Key | Char | Meaning | Why it earns the key |
| --- | --- | --- | --- |
| `⌥⇧t` | `͆` U+0346 | dentolabial | ⌥t is the bridge *below* (dental). Same mark, relocated above — the `below` shiftSense the spec already has, mirrored. |
| `⌥⇧9` | `₍` U+208D | pre-voicing bracket | Shape identity, the spec's own principle: the `(` key carries the subscript `(`. |
| `⌥⇧0` | `₎` U+208E | post-voicing bracket | Same, on `)`. The pair needs adjacent keys and these are the only adjacent pair left. |

**Not derived — pick a principle:**

The other five diacritics (`͇` alveolar, `͉` weak, `͊` denasal, `͋` nasal escape,
`͌` velopharyngeal friction, `͍` labial spreading) have no key with a shape or a
phonetic claim on them. The spec anticipates exactly this and flags such marks
`arbitraryKey`. Three ways to go:

1. **Mnemonic initial** — `⌥⇧a` alveolar, `⌥⇧l` labial spreading, `⌥⇧w` weak
   (taken — would have to displace "more rounded"), `⌥⇧d` denasal (taken). It
   breaks down fast, which is what makes it a fourth principle rather than a
   use of the three you have.
2. **Park them `arbitraryKey`** on the remaining free letters and let use sort
   them out — the spec's stated escape hatch, and honest.
3. **Don't take them.** `⌥⇧` letters currently decline, so Mac's own Option
   typography (Œ Ø Å Í) passes through. Every slot spent kills one of those.
   That is a real cost and clinical transcription is a real user, but they are
   not the same user.

`ʩ ʪ ʫ ʬ ʭ` are *letters*, not marks, so they belong on the ⇧-digraph layer, not
here. `ʩ` is a feng digraph (f+ŋ) and there are free cells on `f`.

## The question

Is extIPA in scope at all? The FAQ says "Not yet: extIPA" out loud. If it is,
the derived three go in as-is and the five arbitrary ones need one decision from
you. If it isn't, the freed layer stays empty and Mac's typography keeps it —
which is a defensible answer, and cheaper than a half-layer.
