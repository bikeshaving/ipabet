# IPAbet

Type the International Phonetic Alphabet at typing speed, in any app.

IPAbet is a **normal US keyboard** with the IPA added on its shifted layers.
Bare keys stay plain US — letters, digits, punctuation, shortcuts — so ordinary
writing is untouched. Every IPA symbol is one or two keystrokes.

```
s ⇧H i ⇧H p    → ʃɪp
t ⇧H i ⇧H n ⇧G → θɪŋ
n ⇧J a         → ɲa
⌥e a           → á
```

**[ipabet.org](https://ipabet.org)** — the full chart with audio, the keystroke
reference, a browser scratchpad, and a typing course.

## Install (macOS)

[Download **IPAbet.pkg**](https://ipabet.org/download) and run the installer,
then log out and back in (first install only) and add **IPA** under System
Settings → Keyboard → Input Sources.

Building from source is one command — `cd macos && ./build.sh install` — see
[`macos/README.md`](macos/README.md) for the build, the architecture, and the
install prefixes.

## How it types

- **Shift + letter** modifies the glyph before it, following spellings you
  already know rather than codes:
  `s ⇧H` → ʃ
  `t ⇧R` → ʈ
  `n ⇧G` → ŋ
- **Digits are bases** for the symbols with no Latin letter:
  `5 ⇧H` → ə
  `2 ⇧H` → ʔ
  `7 ⇧H` → ħ
  They sit on the *unshifted* digit, so `⇧2`–`⇧7` type `@ # $ % ^ &` as normal
  (`⇧5` doubles as the centralize modifier right after a bare e, o, or a).
- **Option** is the diacritic layer, dead-key style like the US layout's own é/ñ:
  `⌥e a` → á (combining marks are prefix)
  `a ⌥;` → aː (spacing marks are postfix)
- **Escapes** exist for everything the IPA layer claims: `⌃⇧`+letter for a
  literal capital ("GitHub", not "Giθub"), Caps Lock for literal capitals, `⌃⌫`
  to unconvert a transform back to its keystrokes, and `⌃Space` to flip to the
  plain US layout macOS always keeps installed.

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

A contour tone is its level tones typed in order: the Chao letters `⌥3 ⌥5` → ˧˥
rising, and the combining tone accents fold into contour diacritics the same
way (`⌥e ⌥⇧e` → ◌᷄ high rising).

Two gaps: extIPA (the extensions for disordered speech) has every diacritic of
the 2015 set but none of its symbol letters (ʬ ʭ ʪ ʫ ʩ ꞎ ʞ); and bare `g` is
U+0067 rather than U+0261 script ɡ, the price of the bare layer being plain US
(`g`+`⇧G` types the exact U+0261).

## License

MIT © 2026 Brian Kim
