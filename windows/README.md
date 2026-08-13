# IPAbet for Windows

A TSF text service. It owns no phonetics: every keystroke decision comes from
the Rust crate in `engine/` through the C ABI in `engine/include/ipabet_engine.h`,
linked as a static library. `spec/ipabet.json` ships beside the DLL and is
parsed at activation.

## Build

```powershell
.\package.ps1          # builds the DLL and IPAbet-<arch>.msi
```

Registration needs administrator rights, so every dev iteration is an elevation
prompt.

## The diacritic layer

AltGr, Ctrl+Alt and the right Alt key are one layer. Windows reports the right
Alt key as Ctrl+Alt on a layout that defines AltGr, and as plain Alt on one that
does not. Both are reserved, so the key works either way.

TSF never delivers modifier chords to a key sink — Shift arrives, Ctrl and Alt
do not. Each chord is reserved by name with `ITfKeystrokeMgr::PreserveKey` and
arrives through `OnPreservedKey`. `PreserveDiacriticKeys` loops every US key ×
2 shift states × 2 modifier spellings.

A preserved key reaches the engine as Option, never Control. The engine tests
control first and would pass on the key.

`KEYEVENTF_EXTENDEDKEY` is required to inject right Alt. It shares a scancode
with left Alt.

## TSF facts

**Anchors do not move.** `ShiftStart` reports success and shifts nothing, so
the document reads back empty and a replacement built on it inserts instead of
replacing. The service keeps its own record of the run and hands that to the
engine as lookback.

**The run lives in a composition** — a range the service rewrites whole, which
replaces a glyph without anchor arithmetic. `StartComposition` returns
`E_INVALIDARG` without an `ITfCompositionSink`. Composed text commits when the
run ends or focus moves.

**Lengths disagree.** `wchar_t` is UTF-16, the engine counts codepoints.
Convert.

## Registration

`DllRegisterServer` writes `HKLM\SOFTWARE\Classes\CLSID\{clsid}` and
`HKLM\SOFTWARE\Microsoft\CTF\TIP\{clsid}`, then calls `RegisterProfile` and
`RegisterCategory`. `HKLM\SOFTWARE\Classes`, not `HKEY_CLASSES_ROOT`: install
and uninstall run as SYSTEM, and a write through the merged view lands in the
caller's hive.

Uninstall deletes both keys directly and calls TSF afterward, best effort. TSF
profile enumeration answers for the calling user, SYSTEM has no profiles, so an
uninstall that only asks TSF removes nothing and reports success.

The profile is registered under every installed input language. TSF has no
neutral slot.

`regsvr32` reports failure in a message box it cannot show under automation, so
the gates call `DllRegisterServer` directly and print the HRESULT.

## Two architectures

`IPAbet-x64.msi` and `IPAbet-arm64.msi`. TSF loads the DLL into every client
process, so an x64 build on an ARM machine cannot load at all — the
registration custom action fails and the install rolls back.

## Gates

| Workflow | Covers | Arches |
| --- | --- | --- |
| `windows-parity` | 3825 vectors through the engine | x64, arm64 |
| `windows-build` | DLL builds, static CRT | x64, arm64 |
| `windows-registration` | absent → register → present → unregister → absent | x64 |
| `windows-installer` | install, profile present, files land, uninstall clean | x64, arm64 |
| `windows-typing` | 60 vectors + 25 on Ctrl+Alt + 25 on right Alt, into Notepad | x64 |

Synthetic keystrokes work on x64 runners only. ARM runners are interactive and
on `WinSta0`, but another window holds the foreground and will not yield it to
a `SetForegroundWindow` loop, a zeroed foreground lock timeout, or
`AttachThreadInput`.

A hosted runner is not a clean machine. It ships Visual Studio, so the static
CRT requirement never bit there, and it is x64, so the arch split never
surfaced. Both needed a real ARM VM.

## WiX

Pinned to 5, the last MIT version. v6 requires accepting the Open Source
Maintenance Fee EULA — the owner's agreement to make, not a build script's. Do
not bump the pin as housekeeping. NSIS is the fallback.

## Signing

Unsigned installers trip SmartScreen. An EV Authenticode certificate carries
reputation from the first download; Azure Trusted Signing is the subscription
alternative. Identity verification has lead time.
