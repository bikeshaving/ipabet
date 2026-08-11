# IPAbet for Windows

Status: **W1 in progress** — the engine passes every parity vector on Windows,
the text service builds, links, registers and unregisters cleanly, loads into a
real application and runs edit sessions. Typing does not work yet: the lookback
reads nothing, so digraphs do not compose. See "The open bug" below.

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

## The open bug: the lookback reads nothing

`tools/notepad-type-test.ps1` types into Notepad through the registered text
service and reads the result back off the clipboard. Run it with the
`windows-typing` workflow. What is established:

- the text service loads into a real application and `ActivateEx` runs
- the engine initialises from the shipped spec
- keystrokes arrive with the right scancodes, and the US label resolves
- edit sessions run and `SetText` reports success

What fails is the lookback. `ShiftStart` back from the selection moves zero
units on every keystroke, so the engine is asked what follows an empty
document. `⇧H` after `t` therefore has no `t` to rebase and correctly passes,
which is why Notepad ends up with `tH` rather than `θ`. Plain letters, which
need no lookback, are correct.

Two facts worth keeping together, because they do not fit the obvious
explanation. Reading the whole document straight after a successful `SetText`
returns one unit, and it still returns one unit after the next keystroke — the
document never grows. Meanwhile Notepad visibly ends up holding two characters.
Whatever the text service is editing may not be the buffer the application is
showing, which would point at the context rather than at the range arithmetic.

Reproduced in Notepad, so this is not an artefact of a purpose-built test host
— `tools/type-test.cpp`, which drives a RichEdit control in its own process,
shows the same thing. The next signal worth having is how this behaves across
several real applications, which is a question for an interactive machine
rather than for more CI rounds.

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
