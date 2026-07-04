# IPAbet

A **normal US keyboard** with the IPA chart added on its shifted layers. Bare
keys type plain US — letters, digits, punctuation, untouched — so English, code,
and shortcuts pass straight through. Shift and Option add every IPA sound, one
or two keystrokes each.

```
sHip → ʃip      tRip → ʈip      nJa → ɲa
```

## The layers

IPAbet is US-first; the IPA is purely additive:

- **Bare** — plain US. IPA base letters that *are* Latin letters emit their IPA
  value directly (`s`→s, `t`→t, `x`→x). Digits and punctuation are native, so a
  bare `1` is a real `1` (tmux prefixes, vim counts, shortcuts all work).
- **Shift + letter** — a modifier on the previous segment (`sH`→ʃ, `tR`→ʈ,
  `nG`→ŋ), grounded in romanization conventions (pinyin / ITRANS / ALA-LC).
  `C` makes the base letter a click at that place (`tC`→ǀ, `qC`→ǃ, `lC`→ǁ) —
  see `spec/clicks.md`.
- **Shift + number** — the IPA glyphs with no Latin key (`⇧2`→ʔ, `⇧3`→ʕ,
  `⇧5`→ə, `⇧1`→ɨ, `⇧4`→ɾ, `⇧7`→ħ), grounded in Arabizi + X-SAMPA.
- **Option** — diacritics and suprasegmentals, postfix, on Apple's ABC Extended
  layout (`a`+`⌥e`→á, `n`+`⌥n`→ñ, `a`+`⌥;`→aː) plus IPA-only marks. `⌥⇧` is the
  raw-US escape for any symbol an IPA layer claims.

Every glyph has exactly one canonical keystroke sequence — the notation is a
bijection, so IPAbet↔IPA round-trips losslessly.

## Layout

- `spec/ipabet.json` — the canonical mapping. Source of truth for every implementation.
- `spec/diacritics.md` — the diacritic-layer design and rationale.
- `spec/clicks.md` — the click-consonant key assignments and rationale.
- `ime/` — **IPAbet**, the macOS input method (reference implementation).
- `web/` — interactive chart and visual keyboard.
- `lib/` — JS transcoder (planned).

## IPAbet (macOS)

```sh
cd ime && ./build.sh install
```

Log out and back in (first install only), then add **IPA** under System Settings
→ Keyboard → Input Sources. Stateless transformation: every key commits
instantly, modifiers rewrite the character before the cursor, and bare keys pass
through untouched — transparent to English, shell, and shortcuts.

## Status

Tier 1 (segments) covers 100% of the standard IPA chart. Tier 2 (diacritics and
suprasegmentals) lives on the Option layer, grounded in ABC Extended and
X-SAMPA/TIPA convention. Not yet covered: Chao tone letters, prosodic bars,
extIPA.

## License

MIT © 2026 Brian Kim
