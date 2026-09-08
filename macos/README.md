# IPAbet for macOS

A faceless InputMethodKit app, no Xcode required. It owns no phonetics: every
keystroke decision comes from the Rust crate in `engine/` through the C ABI in
`engine/include/ipabet_engine.h`, linked as a static library — the same crate
the IBus, fcitx5, and Windows shells link. `spec/ipabet.json` ships in the
bundle and is parsed when the engine is created. This file translates IMKit key
events into the engine's keystroke shape, calls the engine, and applies the
edit it hands back, so the ports cannot drift.

## Build

```sh
./build.sh          # build/IPAbet.app
./build.sh install  # + install to ~/Library/Input Methods/
```

The app is a **universal binary**: the engine crate builds for both
`aarch64-apple-darwin` and `x86_64-apple-darwin` and the two slices are
`lipo`'d together, so an Intel Mac isn't left with an arm64-only input method
that registers but can never launch. `rustup target add x86_64-apple-darwin`
is required for the Intel slice.

First install needs a logout for TIS registration. After that: `pkill IPAbet`,
then quit and relaunch the app under test — apps hold a session to the old
process.

**The dev loop and the pkg install to different prefixes.** `build.sh install`
writes `~/Library/Input Methods/`, `package.sh` writes `/Library/Input Methods/`.
macOS scans both, so once the pkg is installed the system copy runs and every
`build.sh install` lands where the OS has stopped reading — silently, reporting
success. `pgrep -lf IPAbet` says which is live.

## Composition model

Mirrors the IBus shell. An edit commits to the document immediately through
`insertText(_:replacementRange:)` — the same call pattern Apple's Korean
(2-Set) method uses, which every Mac app must support or Hangul typing breaks.
The engine's `pending` (an armed dead-key mark, `⌥e` → ´) shows as marked text:
the preview a base will absorb, committed by the next base. There is no
composition session to desync.

Unlike Linux, a Mac client can be read back, so the engine's lookback reads
what is already committed rather than the shell keeping its own record of the
run. On a decline the keystroke falls through to the host — a bare glyph under
backspace is declined so the host deletes it natively.

Keys are decoded from the physical `keyCode` through a fixed US layout
(`UCKeyTranslate` against `com.apple.keylayout.US`), so the ASCII-keyed tables
hold under Dvorak or a non-US QWERTY. The active layout's delivered characters
are never consulted for logic.

## macOS 15 rules

Sequoia runs a half-modernized IMK stack (`IMKClient_Modern` client,
`_IMKServerLegacy` server, XPC between). Probe- and crash-verified:

1. **Never call `updateComposition()` / `composedString()`.** IMK passes
   `composedString` a dangling sender and the process segfaults in the objc
   bridge. Squirrel and vChewing avoid it; XIME reimplements it.
2. **Never `insertText` an empty string.** The transport drops it,
   `replacementRange` or not. Replace a range with shorter text, or decline and
   let the host delete.
3. **Bundle config is load-bearing.** `NSPrincipalClass = NSApplication`,
   `LSUIElement = true` (not `LSBackgroundOnly`), and
   `setActivationPolicy(.accessory)` before `run()`. Misconfigured, the client
   discards key events the IME declines once any marked text has been shown in
   that window.
4. `IMKCFRunLoopWakeUpReliable` mach-port errors are Sequoia log noise —
   Electron, Python and the JDK all emit them. Apple DTS calls it
   non-actionable.
5. Worth consulting on a client quirk: Squirrel and vChewing (per-client
   mitigation registries), macSKK (the AquaSKK `setMarkedText` flush idiom),
   azooKey-Desktop (minimal modern Swift IME).
