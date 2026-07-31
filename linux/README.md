# IPAbet for Linux

Status: **L0 done** — the pure keystroke engine is hand-ported to C and
verified byte-for-byte against every vector in `spec/parity-vectors.json`
(3825/3825, generated straight from `js/test`, the same suite the macOS
Swift mirror is pinned to). No fcitx5 integration yet — that's L1.

## Layout

- `src/engine.h` / `src/engine.c` — the transform logic, ported from
  `js/src/index.ts` (itself ported from `macos/Sources/InputController.swift`).
  Loads `spec/ipabet.json` as data at startup, exactly like the macOS IME
  loads the same file as a bundled resource — never hand-transcribed.
- `src/json.h` / `src/json.c` — a small first-party JSON reader, scoped to
  `spec/ipabet.json`'s shape (not a general-purpose library).
- `third_party/utf8proc/` — vendored (MIT-licensed, unmodified) for Unicode
  normalization and general-category lookups, which C has no stdlib
  equivalent for. Real NFC/NFD via `utf8proc_decompose`/`utf8proc_normalize_utf32`.
  One gotcha worth knowing if you touch `recompose()`: `utf8proc_normalize_utf32`
  composes strictly in the order you hand it codepoints — it does **not**
  canonically reorder combining marks by class first, unlike a real
  `string.normalize("NFC")`. `canonical_reorder()` in `engine.c` does that by
  hand before every compose call; without it, armed-mark order (which key you
  pressed first) changes the result in cases where it shouldn't.
- `tools/parity-test.c` — replays `spec/parity-vectors.json` directly against
  `engine.c`. No fcitx5, no VM, sub-second. This is the fast, cheap
  verification layer; a tart-based real-fcitx5-stack E2E gate is L3.

## Building the parity test

```
cc -std=c11 -Wall -Wextra -Ilinux/src -Ilinux/third_party/utf8proc \
  -o /tmp/parity-test linux/tools/parity-test.c linux/src/engine.c linux/src/json.c \
  linux/third_party/utf8proc/utf8proc.c -lm
/tmp/parity-test spec/ipabet.json spec/parity-vectors.json
```

Regenerate the fixture after any `js/test` change:

```
cd js && IPABET_DUMP_VECTORS=1 bun test
```

## Next (L1)

Wrap `engine.c` in a minimal fcitx5 `InputMethodEngineV2` addon
(`fcitx5/Ipabet.cpp`) and verify manually on a `tart` Linux VM. See the plan
at the top-level for the full phased rollout (L1–L3) and the Windows track.
