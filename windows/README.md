# IPAbet for Windows

Status: **W0** — the engine builds and passes every parity vector on Windows.
There is no text service yet, so nothing is installable; that is W1.

## One engine, two shells

The keystroke logic is not ported to Windows. It is the same Rust crate in
`engine/` that the fcitx5 addon links on Linux, exposed through the C ABI in
`engine/include/ipabet_engine.h` and linked into the text service as a static
library. `spec/ipabet.json` ships alongside as data and is parsed at startup —
the tables are never transcribed into code.

`.github/workflows/windows-parity.yml` builds the crate on a real Windows
runner, replays `spec/parity-vectors.json` through it, and produces the
`x86_64` and `aarch64` static libraries. PE has no fat-binary mechanism, so
each architecture ships its own artifact rather than a slice of one file.

## What the text service has to do (W1)

`ITfTextInputProcessor` for activation and `ITfKeyEventSink` for keystrokes;
edits go through `RequestEditSession` → `ITfEditSession::DoEditSession`,
walking an `ITfRange`. Two things about that mapping are worth knowing before
starting:

- Windows `wchar_t` is UTF-16 and the engine reports replacement lengths in
  codepoints, so the two disagree on any glyph outside the BMP and on any
  cluster carrying combining marks. Convert; do not assume they match.
- TSF can read the document back through the range, which macOS also does. The
  Linux addon cannot, and keeps the trailing run in its preedit instead — so
  the Linux composition model is not the one to copy here.

## Registration

COM registration under `HKEY_CLASSES_ROOT\CLSID\{clsid}` plus TSF's own keys
under `HKLM\SOFTWARE\Microsoft\CTF\TIP\{clsid}`, written by the DLL's
`DllRegisterServer` — so `regsvr32 ipabet.dll` is what `register.swift` is on
macOS. Both need administrator rights, which makes every development iteration
an elevation prompt.

## Signing

SmartScreen is a reputation heuristic rather than a hard gate, but an unsigned
installer from a project with no download history produces a warning users are
right to distrust. An EV Authenticode certificate carries reputation from the
first download; Azure Trusted Signing is the subscription alternative. Either
one has identity-verification lead time that no amount of engineering
compresses, so procurement starts before the installer does.
