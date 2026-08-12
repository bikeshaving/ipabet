# IPAbet

A fast and memorable keyboard for typing the International Phonetic Alphabet.

IPAbet is an extended US keyboard: unshifted keys type plain US letters, digits, punctuation, while IPA symbols are typed as at most two keystrokes, using a grammatical mnemonic system based on shifted modifiers.

```
s ⇧H i ⇧H p    → ʃɪp
t ⇧H i ⇧H n ⇧G → θɪŋ
n ⇧J a         → ɲa
⌥e a           → á
```

**[ipabet.org](https://ipabet.org)** — the full chart with audio, the keystroke
reference, a browser scratchpad, and a typing course.

## Install

Three steps everywhere: install, log out and back in, pick IPAbet from the
input menu.

**macOS** — [download **IPAbet.pkg**](https://ipabet.org/download), run it, then
add **IPA** under System Settings → Keyboard → Input Sources. Uninstalling is
`sudo "/Library/Input Methods/IPAbet.app/Contents/Resources/uninstall.sh"`.

**Windows** — download **IPAbet.msi** and run it, then pick IPAbet from the
language bar. The installer is not signed yet, so Windows warns on first run.

**Linux** — `sudo apt install ./ipabet-ibus_*.deb`, then pick IPAbet from the
input menu. IBus is what GNOME, Ubuntu and Fedora already run, so there is no
framework to install first; `ipabet-fcitx5` is there for people already running
fcitx5.

Building from source is one command per platform — `cd macos && ./build.sh
install`, `cd linux && ./build.sh install`, or `windows\package.ps1`. See
[`macos/README.md`](macos/README.md), [`linux/README.md`](linux/README.md) and
[`windows/README.md`](windows/README.md) for the builds and install prefixes.

Every download carries a build provenance attestation naming the commit and
workflow that produced it:

```
gh attestation verify IPAbet.msi --owner bikeshaving
```

## How it works

- **Shift + letter** modifies the glyph before it, following spellings you
  already know rather than codes:
  `s ⇧H` → ʃ
  `t ⇧R` → ʈ
  `n ⇧G` → ŋ
- **Digits are bases** for the symbols with no Latin letter:
  `2 ⇧H` → ʔ
  `3 ⇧H` → ʕ
  `7 ⇧H` → ħ
  `4 ⇧H` → ɾ
  `5 ⇧H` → ə
- **Option** is the diacritic layer, dead-key style like the US layout's own é/ñ:
  `⌥e a` → á (combining marks are prefix)
  `a ⌥;` → aː (spacing marks are postfix)
- **Escapes** exist for everything the IPA layer claims: `⌃⇧`+letter for a
  literal capital ("GitHub", not "Giθub"), Caps Lock for literal capitals.

The full official IPA chart is covered and notated at [ipabet.org/chart](https://ipabet.org/chart). The complete mapping is at [ipabet.org/keys](https://ipabet.org/keys) and in [`spec/ipabet.json`](spec/ipabet.json).

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

**The [standard IPA chart](https://ipabet.org/chart) is complete** — pulmonic and non-pulmonic consonants,
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
