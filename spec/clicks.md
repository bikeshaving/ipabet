# IPAbet click input — design

Status: **Active Specification**

## The keys

Clicks are ordinary Shift-letter transforms: type the base letter, then `⇧C`.
The base letter names the click's **anterior place** — the dimension modern
phonetics (Ladefoged & Traill 1984; Miller 2011) treats as *the* classifying
one for clicks.

| keys | glyph | click | anterior place |
|---|---|---|---|
| `pC` | ʘ | bilabial | lips |
| `tC` | ǀ | dental | laminal denti-alveolar |
| `qC` | ǃ | (post)alveolar | apical, large back cavity |
| `cC` | ǂ | palatal | laminal palatal |
| `lC` | ǁ | lateral | apical with lateral release |

Accompaniments compose as usual — the click letter carries only the influx,
per current phonological practice. The Khoisanist standard notation for
voiced and nasal clicks is a **superscript accompaniment prefix**: type the
accompaniment, superscriptize it with `⌥4`, then the click —
`g` `⌥4` `qC` → ᶢǃ, `ŋ` (`nG`) `⌥4` `qC` → ᵑǃ. Aspiration follows as usual
(`qC` `h` `⌥4` → ǃʰ), glottalization via `X`, or spell the cluster out
(ǃq, ǃk) per your tradition's convention.

## Why these letters

The obvious alternative was the Nguni orthographic convention — Zulu/Xhosa
`c`/`q`/`x` for ǀ/ǃ/ǁ — which has ~20M daily writers. The history settles it:

- **The Nguni letters were arbitrary.** John Bennie's Xhosa orthography (1823)
  assigned `c q x` because Nguni phonology didn't otherwise need those
  letters. No missionary-era source records a phonetic rationale; it was
  leftover-letter recycling, and Zulu/Xhosa writers type *orthography*, not
  IPA — they are not this layer's users.
- **Place-iconic letters are the older IPA standard, not an invention.** From
  1921 to 1989 the IPA's official click letters *were* iconized Latin letters:
  ʇ (turned t, dental), ʗ (stretched c, alveolar), ʖ (lateral), ʞ (velar) —
  designed by Daniel Jones, used by Doke for Zulu. Kirshenbaum, the 30-year
  ASCII convention, writes clicks as letter + `!`: `p!` bilabial, `t!` dental,
  `c!` palatal, `l!` lateral. SIL's Keyman IPA keyboard likewise hangs ʘ off
  `p`. Base-letter-plus-click-modifier has two independent pedigrees.
- **The traditions converge.** Each chosen letter has at least one established
  witness *plus* the phonetics: `p` (Kirshenbaum, SIL, bilabial), `t`
  (Kirshenbaum, IPA ʇ, laminal-coronal), `c` (Kirshenbaum, Naro `tc` = ǂ),
  `l` (Kirshenbaum, IPA ʖ, lateral release). `q` is the one Nguni letter that
  survives on merit: q is the *back* letter (Arabic qāf is uvular), and ǃ is
  the click with the large back cavity and the deep hollow pop — the
  missionary accident happened to land somewhere phonosemantically right.

So the click row is the same kind of hybrid as the rest of IPAbet: a
derivable rule (letter = anterior place) that is *also* the established
convention (Kirshenbaum / pre-1989 IPA), with the one defensible heirloom
(`q`) kept.

## Confusables note

ǃ (U+01C3) and ǀ (U+01C0) are not `!` and `|`. IPAbet emits the true click
codepoints; the ASCII keys stay fully native — `!` is `⇧1`'s raw form via
`⌥⇧1`, and `|` is just the bare pipe key. (Unicode's names for U+01C2
"ALVEOLAR CLICK" and U+01C3 "RETROFLEX CLICK" predate current IPA usage —
in IPA terms they are the palatal and (post)alveolar clicks respectively.)
