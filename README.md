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
  `⇧4`→ɾ, `⇧5`→ə, `⇧7`→ħ), grounded in Arabizi + X-SAMPA. `⇧6` is the tie bar
  (`t ⇧6 s`→t͡s); press it again and the tie flips below (t͜ɕ), where descenders
  would collide.
- **Option** — diacritics and suprasegmentals. Combining marks are **prefix**,
  dead-key style like the US layout's own é/ñ: press the mark, then the base
  absorbs it (`⌥e`+`a`→á, `⌥n`+`n`→ñ). Spacing marks — length, tone, stress —
  stay postfix (`a`+`⌥;`→aː). Chao tone letters live on `⌥1`–`⌥5`.
- **Option + Shift** — a mark's second form (`⌥⇧n`→creaky, `⌥⇧e`→extra-high),
  and on the number row the raw-US escape, which exists only because `⇧<digit>`
  is an IPA glyph (`⇧2` is ʔ, so `@` lives on `⌥⇧2`).

Escapes, for when the IPA layer claims something you meant literally:

- **Ctrl + Shift + letter** — the literal capital. `⇧<letter>` transforms the
  glyph before it, so "GitHub" would come out "Giθub"; `⌃⇧H` commits a raw `H`
  and bypasses every transform.
- **Caps Lock** — a *lock*, not a modifier: letters type their literal capitals
  and never transform (a locked `T` then `H` is "TH", not θ). Shift still means
  the modifier while locked.
- **⌥⇧Space** — the Raw-US Lock. The whole keyboard goes native until pressed
  again: write code, paste in a terminal, type camelCase.

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

**The standard IPA chart is complete.** Every symbol is typeable — pulmonic and
non-pulmonic consonants (clicks, implosives, ejectives), all 28 vowels, ɧ, both
tie bars, every diacritic and suprasegmental, and the Chao tone letters. Tier 1
(segments) lives on the shifted layers; Tier 2 (diacritics) on the Option layer,
grounded in ABC Extended and X-SAMPA/TIPA convention.

Two known gaps, both deliberate: **extIPA** (the extensions for disordered
speech) is not covered — see `docs/extipa-proposal.md`; and `g` is U+0067, not
U+0261 script g, which the bare-layer law buys and corpus work must normalize
(`laws.scriptG`).

The layout is **provisional** until the first release — keystrokes may still
change between versions.

## License

MIT © 2026 Brian Kim
