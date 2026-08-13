# IPAbet for Windows

Status: **W1 done** — the engine passes every parity vector on Windows, and the
text service builds, registers, loads into a real application and types IPA
into it. What remains is an installer and signing, and confirming behaviour in
applications beyond Notepad.

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

## Typing works, and is checked on every push

`tools/notepad-type-test.ps1` types into Notepad through the registered text
service and reads the result back off the clipboard — real keystrokes, a real
application, no VM. `t` then ⇧H gives θ there.

Two things about this platform are worth knowing before changing any of it,
because both cost a day to find.

**Anchors do not move.** `ShiftStart` back from the selection reports success
and shifts nothing, so reading the document back returns an empty string
however it is asked, and a replacement built on it inserts rather than
replaces. The service therefore keeps its own record of the run as it wrote it
and hands that to the engine as the lookback — the same thing the fcitx5 addon
does for clients that cannot be read at all. The record ends when the run does.

**The run lives in a composition.** A composition is a range the service owns
and can rewrite whole, which is how a glyph gets replaced without moving an
anchor over the document, and it is what every Windows input method does.
`StartComposition` requires a composition sink; it answers `E_INVALIDARG`
without one. Composed text is not committed text — the client takes it when the
run ends at a key IPAbet declines, or when focus moves.

## The diacritic layer is reserved key by key

TSF hands a text service ordinary typing and keeps the modifier chords for
itself: Shift arrives at the key sink, Ctrl and Alt never do. A service that
wants one asks for it by name through `ITfKeystrokeMgr::PreserveKey`, and gets
it back through `OnPreservedKey` instead of `OnKeyDown`. So the whole ⌥ layer
is a loop at activation: every key on the US layout, in both shift states.

It is reserved twice, because the key users press has two spellings that
Windows reports differently:

- **Ctrl+Alt** (`TF_MOD_CONTROL | TF_MOD_ALT`) — what a layout with an AltGr
  reports when AltGr is pressed, and a chord that works on every layout.
- **Right Alt alone** (`TF_MOD_RALT`) — the same physical key on a US keyboard,
  where it is plain Alt and matches no Ctrl+Alt reservation.

Without the second one, the key labeled Alt beside the spacebar does nothing on
a US keyboard and the layer needs two hands. `windows-typing.yml` presses both,
which is not redundant: they arrive as different keys, so one passing says
nothing about the other. Injecting right Alt needs `KEYEVENTF_EXTENDEDKEY` —
it shares a scancode with left Alt and the flag is the only thing that tells
them apart.

A preserved key reaches the engine as Option and never as Control, whatever
Windows reported: the engine tests control first and would pass on the key.

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

## Two architectures, two installers

`IPAbet-x64.msi` and `IPAbet-arm64.msi`. This is not a nicety. TSF loads the
text service DLL **into every client process**, so an x64 build on an ARM
machine cannot load into a native ARM application at all — and it does not get
that far: the registration custom action fails and the install rolls back with
a generic "a program run as part of the setup did not finish as expected".

The engine was built for both architectures from the start; the installer was
not, and CI could not notice because its Windows runner is x64 and the
installer job only ever ran there. Both are gated now, on `windows-latest` and
`windows-11-arm`.

## The installer

`package.ps1` builds `IPAbet.msi` from `installer/Product.wxs`. Per-machine,
because a text service's profile is machine-wide; registration runs through
`ipabet-register.exe` rather than MSI self-registration, so there is one idea of
what registering means rather than two. `windows-installer.yml` installs the
result, checks the profile appears and the files land, uninstalls, and checks
both are gone — an installer that builds is not an installer that works.

WiX is pinned to 5, which is MIT. From v6 the toolset requires accepting the
Open Source Maintenance Fee EULA, which asks anyone earning over $10,000/yr to
sponsor the project. That is a reasonable thing to ask and IPAbet would be
exempt, but it is the owner's agreement to make and not a build script's — and
nothing here needs v6. Do not bump the pin as housekeeping. If v5 ever stops
working, NSIS is the fallback: its zlib licence asks nothing of anyone.

## Signing

SmartScreen is a reputation heuristic rather than a hard gate, but an unsigned
installer from a project with no download history produces a warning users are
right to distrust. An EV Authenticode certificate carries reputation from the
first download; Azure Trusted Signing is the subscription alternative. Either
one has identity-verification lead time that no amount of engineering
compresses, so procurement starts before the installer does.
