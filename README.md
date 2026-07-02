# IPAbet

Type the full IPA chart from a Latin keyboard. Every sound in one or two keystrokes; bare keys are their IPA values, so plain English types through untouched.

```
sHip  → ʃip      tRip → ʈip      3arabi → ʕarabi
f5nEtIks → fənɛtɪks             8bad8 → /bad/
```

## The one rule

Unshifted key = a segment. Shifted key = a modifier on the previous segment.

- **Bare Latin** emits its exact IPA value (`r`→r trill, `x`→x, `c`→c).
- **Capital suffix** modifies the base (`tR`→ʈ, `sH`→ʃ, `nG`→ŋ).
- **Digits** hold the Latin-exhausted sounds (`2`→ʔ, `3`→ʕ, `7`→ħ, `4`→ɾ, `5`→ə, `1`→ɨ) plus delimiters (`8`→/…/, `9`→[…]).
- **Punctuation** carries the diacritics and suprasegmentals (`:`→ː, `~`→nasal, `/`→tone).

Three borrowed registers ground the choices: IPA for bare letters, romanization (pinyin/ITRANS/ALA-LC) for modifiers, Arabizi + X-SAMPA for digits.

Every glyph has exactly one canonical keystroke sequence — the notation is a bijection, so IPAbet↔IPA round-trips losslessly.

## Layout

- `spec/ipakey.json` — the canonical mapping. Source of truth for every implementation.
- `ime/` — **IPAKey**, the macOS input method (reference implementation).
- `web/` — interactive chart and visual keyboard.
- `lib/` — JS transcoder (planned).

## IPAKey (macOS)

```sh
cd ime && ./build.sh install
```

Log out and back in, then add "IPAKey — IPA Transcription" under System Settings → Keyboard → Input Sources. Pure transformation: every key commits instantly, modifiers rewrite the character before the cursor. Transparent to English.

## Status

Tier 1 (segments) covers 100% of the standard IPA chart. Tier 2 (marks) covers the common diacritics and suprasegmentals. Not yet covered: Chao tone letters, prosodic bars, extIPA.

## License

MIT © 2026 Brian Kim
