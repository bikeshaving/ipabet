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
  `C` makes the base letter a click at that place (`tC`→ǀ, `qC`→ǃ, `lC`→ǁ).
- **Shift + number** — the IPA glyphs with no Latin key (`⇧2`→ʔ, `⇧3`→ʕ,
  `⇧5`→ə, `⇧1`→ɨ, `⇧4`→ɾ, `⇧7`→ħ), grounded in Arabizi + X-SAMPA.
- **Option** — diacritics and suprasegmentals, postfix, on Apple's ABC Extended
  layout (`a`+`⌥e`→á, `n`+`⌥n`→ñ, `a`+`⌥;`→aː) plus IPA-only marks. `⌥⇧` is the
  raw-US escape for any symbol an IPA layer claims.

Every glyph has exactly one canonical keystroke sequence — the notation is a
bijection, so IPAbet↔IPA round-trips losslessly.

## Layout

This is a monorepo: one notation (`spec/`), one implementation per platform.

- `spec/ipabet.json` — the canonical mapping. Source of truth for every
  implementation.
- `macos/` — the macOS input method (Swift / InputMethodKit). The reference
  implementation.
- `js/` — `@b9g/ipabet`, the engine in TypeScript. Runs the notation anywhere
  JavaScript does; its parity test suite doubles as the notation's executable
  spec. Powers the web.
- `www/` — [ipabet.org](https://ipabet.org): landing, the printable/audible IPA
  chart, and the transcription drills and lessons.

Planned platforms (each a sibling of `macos/`, all driven by `spec/ipabet.json`
and pinned to the `js/` parity suite): `linux/` (IBus/fcitx), `windows/` (TSF),
`ios/` and `android/` (keyboard extensions).

## IPAbet (macOS)

```sh
cd macos && ./build.sh install
```

Log out and back in (first install only), then add **IPA** under System Settings
→ Keyboard → Input Sources. Stateless transformation: every key commits
instantly, modifiers rewrite the character before the cursor, and bare keys pass
through untouched — transparent to English, shell, and shortcuts.

## Status

Tier 1 (segments) covers every symbol on the standard IPA chart — pulmonic
and non-pulmonic (clicks, implosives, ejectives) — save one deliberate
omission: ɧ, which has no stable articulation (Ladefoged & Maddieson), so its
variants are transcribed directly. Tier 2 (diacritics and suprasegmentals)
lives on the Option layer, grounded in ABC Extended and X-SAMPA/TIPA
convention. Not yet covered: Chao tone letters, prosodic bars, extIPA.

## License

MIT © 2026 Brian Kim
