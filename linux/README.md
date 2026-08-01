# IPAbet for Linux

Status: **L0 done** — the pure keystroke engine is a Rust crate, verified
byte-for-byte against every vector in `spec/parity-vectors.json`
(3825/3825, generated straight from `js/test`, the same suite the macOS
Swift mirror is pinned to). No fcitx5 integration yet — that's L1.

An earlier pass hand-ported the engine to C first; it worked (also
3825/3825) but cost a hand-rolled JSON parser and a real Unicode bug
(`utf8proc_normalize_utf32` doesn't canonically reorder combining marks by
class before composing, unlike a real `.normalize("NFC")` — needed a
hand-written fix). Rewritten in Rust: `serde_json` replaces the JSON parser
outright, and `unicode-normalization`'s `nfc()`/`nfd()` operate on real
`char` sequences the way JS's `.normalize()` does, so that whole bug class
doesn't exist here — verified directly before relying on it. The C version
is gone; this crate is the only implementation now.

## Layout

- `engine/src/lib.rs` — the transform logic, ported from `js/src/index.ts`
  (itself ported from `macos/Sources/InputController.swift`). Loads
  `spec/ipabet.json` as data at runtime (`Engine::new`), exactly like the
  macOS IME loads the same file as a bundled resource — never
  hand-transcribed.
- `engine/src/spec.rs` — `serde::Deserialize` structs matching
  `spec/ipabet.json`'s shape.
- `engine/tests/parity.rs` — replays `spec/parity-vectors.json` directly
  against the crate. No fcitx5, no VM, sub-second (`cargo test`). This is
  the fast, cheap verification layer; a tart-based real-fcitx5-stack E2E
  gate is L3.
- `engine/Cargo.toml` — `serde`/`serde_json` (spec parsing) and
  `unicode-normalization` (NFC/NFD, combining-mark detection) are real
  crates.io dependencies, resolved and compiled once at build time on the
  maintainer's machine — no package manager is involved in what ships to
  users, same spirit as SECURITY.md's existing "no third-party dependencies
  in the shipped binary" stance, just no longer "no dependencies at build
  time at all."

## Building and testing

```
cd linux/engine && cargo test
```

Regenerate the fixture after any `js/test` change:

```
cd js && IPABET_DUMP_VECTORS=1 bun test
```

## Windows, later

The same crate is meant to be reused there: cross-compile for the Windows
targets, generate a C header with `cbindgen`, link it into the TSF text
service the same way `fcitx5`'s C++ glue will link it here. Avoids a second
hand-port and, more importantly, a second from-scratch Unicode bug hunt.

## Next (L1)

Wrap the crate in a minimal fcitx5 `InputMethodEngineV2` addon (C++, via a
thin `extern "C"` FFI boundary — `cbindgen` generates the header) and verify
manually on a `tart` Linux VM. See the plan at the top-level for the full
phased rollout (L1–L3) and the Windows track.
