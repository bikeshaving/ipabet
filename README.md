# IPAbet

Type the International Phonetic Alphabet at typing speed, in any app.

IPAbet is a **normal US keyboard** with the IPA added on its shifted layers.
Bare keys stay plain US — letters, digits, punctuation, shortcuts — so English,
code, and the terminal are untouched. Every IPA symbol is one or two keystrokes.

```
s ⇧H i ⇧H p   → ʃɪp          n ⇧J a   → ɲa
t ⇧H i ⇧H n ⇧G → θɪŋ         ⌥e a     → á
```

**[ipabet.org](https://ipabet.org)** — the full chart with audio, the keystroke
reference, a browser scratchpad, and a typing course.

## Install (macOS)

```sh
cd macos && ./build.sh install
```

Log out and back in (first install only), then add **IPA** under System Settings
→ Keyboard → Input Sources. See [`macos/README.md`](macos/README.md) for the
build, the architecture, and the install prefixes.

There is no signed release yet, so building from source is the only route.

## How it types

- **Shift + letter** modifies the glyph before it: `s`+`⇧H`→ʃ, `t`+`⇧R`→ʈ,
  `n`+`⇧G`→ŋ — following pinyin/ITRANS romanization rather than codes.
- **Digits are bases** for the symbols with no Latin letter: `5`+`⇧Y`→ə,
  `2`+`⇧H`→ʔ, `7`+`⇧H`→ħ. They sit on the *unshifted* digit, so `⇧2`–`⇧7` type
  `@ # $ % ^ &` as normal.
- **Option** is the diacritic layer. Combining marks are prefix, dead-key style
  like the US layout's own é/ñ: `⌥e`+`a`→á. Spacing marks are postfix: `a`+`⌥;`→aː.
- **Escapes** exist for everything the IPA layer claims: `⌃⇧`+letter for a
  literal capital ("GitHub", not "Giθub"), Caps Lock for literal capitals, and
  `⌥⇧Space` to make the whole keyboard native until pressed again.

Every glyph has exactly one keystroke sequence, so IPAbet↔IPA round-trips
losslessly. The complete mapping is at [ipabet.org/keys](https://ipabet.org/keys)
and in [`spec/ipabet.json`](spec/ipabet.json).

## Repo

One notation, one implementation per platform.

- `spec/ipabet.json` — the canonical mapping. Source of truth for everything else.
- `macos/` — the input method (Swift / InputMethodKit). The reference implementation.
- `js/` — `@b9g/ipabet`, the engine in TypeScript. Its parity suite is the
  notation's executable spec.
- `www/` — [ipabet.org](https://ipabet.org).

Planned, each driven by the same spec and pinned to the `js/` parity suite:
`linux/` (IBus/fcitx), `windows/` (TSF), `ios/` and `android/`.

## Status

**The standard IPA chart is complete** — pulmonic and non-pulmonic consonants,
all 28 vowels, ɧ, both tie bars, every diacritic and suprasegmental, and the
Chao tone letters.

Two gaps: extIPA (the extensions for disordered speech) has every diacritic of
the 2015 set but none of its symbol letters (ʬ ʭ ʪ ʫ ʩ ꞎ ʞ); and bare `g` is
U+0067 rather than U+0261 script ɡ, the price of the bare layer being plain US
(`g`+`⇧G` types the exact U+0261).

The layout is **provisional** until the first release — keystrokes may still
change between versions.

## License

MIT © 2026 Brian Kim
