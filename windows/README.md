# IPAbet for Windows

Status: **W1 in progress** — the engine passes every parity vector on Windows,
the text service builds, links, registers and unregisters cleanly, and receives
keystrokes and runs edit sessions. Typing has not been confirmed end to end;
see "What the typing gate has established" below for exactly where it stops.

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

## Synthetic keystrokes work in CI

`windows/tools/sendinput-type-test.ps1` injects scancodes through `SendInput`
into a real focused text field on a hosted runner and reads the text back, and
it passes. Windows has no equivalent of the consent wall that makes this
impossible to automate on macOS, so the Windows port can be gated on real
keystroke correctness — the layer the macOS gate documents as out of reach.

x86_64 only. The ARM runners report themselves interactive and attached to
`WinSta0`, but another window holds the foreground there and will not yield it
— not to a `SetForegroundWindow` loop, not with the foreground lock timeout at
zero, not through `AttachThreadInput`. Injected input goes wherever the
foreground is, so that architecture cannot gate the keystroke layer. It still
gates the engine natively.

## What the typing gate has established

`tools/type-test.cpp` activates the text service in its own process, injects
scancodes into a RichEdit control and reads the result back. Run it with the
`windows-typing` workflow. What it has settled so far, from the debug log:

- the text service loads and `ActivateEx` runs
- the engine initialises from the shipped spec
- keystrokes arrive with the right scancodes, and the US label resolves
- edit sessions run, and `SetText` reports success with the text in the document

What it has not settled is the round trip. The document does not accumulate
across keystrokes: after the first key it holds one unit, and after the second
it still holds one. Each keystroke sees an empty document with the selection at
the start, so the lookback reads nothing and the second key of a digraph
correctly passes — `t` then ⇧H gives `tH` rather than `θ`.

That is a property of this test host rather than of the text service, and the
next move is confirming behaviour in a real application rather than making the
harness more elaborate. Until then the workflow runs on request rather than on
push, so it does not sit red while telling nobody anything new.

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

`windows-registration.yml` runs the whole lifecycle on every push: absent,
register, present, unregister, absent again. The last step earns its keep —
`UnregisterProfile` reports success and leaves TSF's own key behind, which
leaves the service registered after an uninstall that looked clean and makes a
reinstall register a second copy of it.

Two habits worth keeping when touching any of this. The probe matches on the
class id *and* the profile id, because matching the class alone passes on any
profile the service happens to own. And `regsvr32` reports failure in a message
box it cannot show under automation, so the gate calls `DllRegisterServer`
directly and prints the HRESULT — otherwise a failure arrives as silence.

## Signing

SmartScreen is a reputation heuristic rather than a hard gate, but an unsigned
installer from a project with no download history produces a warning users are
right to distrust. An EV Authenticode certificate carries reputation from the
first download; Azure Trusted Signing is the subscription alternative. Either
one has identity-verification lead time that no amount of engineering
compresses, so procurement starts before the installer does.
