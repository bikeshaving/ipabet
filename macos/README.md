# IPAbet for macOS

A faceless InputMethodKit app, no Xcode required. The reference implementation
of the notation; other platforms port against the [`js/`](../js) parity suite.

## Build

```sh
./build.sh          # build/IPAbet.app
./build.sh install  # + install to ~/Library/Input Methods/
```

First install needs a logout for TIS registration. After that: `pkill IPAbet`,
then quit and relaunch the app under test — apps hold a session to the old
process.

**The dev loop and the pkg install to different prefixes.** `build.sh install`
writes `~/Library/Input Methods/`, `package.sh` writes `/Library/Input Methods/`.
macOS scans both, so once the pkg is installed the system copy runs and every
`build.sh install` lands where the OS has stopped reading — silently, reporting
success. `pgrep -lf IPAbet` says which is live.

## Architecture

The engine is **stateless**, mimicking Apple's Korean (2-Set) input method,
whose client protocol `tools/probe.swift` captured. Each keystroke inserts text
at the cursor or rewrites the previous grapheme cluster through
`insertText(_:replacementRange:)` — the call pattern every Mac app must support
or Hangul typing breaks. No composition session, no underline, nothing to
desync, no per-host mode. The only marked text is the dead-key preview of a
pending prefix diacritic (`⌥e` → ´), committed by the next base.

Every previous-glyph rule operates on the **decomposed view** of the cluster —
base plus combining marks, split via NFD — and recomposes to NFC on write, so
NFC fusion (é is one codepoint, n̥ is two) never changes rule behavior. On a
rule miss the keystroke falls through until something emits.

Backspace on a marked cluster deletes the base and re-arms its marks as
pending: marks are prefix keystrokes, so the base was typed last, and fixing a
wrong base is one key (ã ⌫ o → õ). A trailing tie is postfix and peels instead.
A bare glyph is declined so the host deletes it natively.

Keys are decoded from the physical `keyCode` through a fixed US layout
(`UCKeyTranslate` against `com.apple.keylayout.US`), so the ASCII-keyed tables
hold under Dvorak or a non-US QWERTY.

## Files

- `Sources/main.swift` — IMKServer boot, `.accessory` activation policy, the
  raw-lock-clears-on-arrival observer.
- `Sources/InputController.swift` — the engine, the raw-US lock, secure-field
  handling. Loads `ipabet.json`.
- `ipabet.json` — copied from `spec/ipabet.json` at build time.
- `Info.plist` — the bundle ID must contain `.inputmethod.`. Registers one
  visible input mode. Read the macOS 15 rules before touching the launch keys.
- `tools/genmenupdf.swift` — regenerates `ipabet.pdf`, the input-source icon.
- `tools/reregister.swift` — `TISRegisterInputSource`, so a reinstall appears
  without a logout.
- `tools/probe.swift` — instrumented test host: an `NSTextView` logging every
  NSTextInputClient call and a `WKWebView` logging DOM composition events, to
  the window, stdout and `/tmp/imeprobe.log`. Build with
  `swiftc tools/probe.swift -o /tmp/imeprobe -framework Cocoa -framework WebKit`.
  Ground truth for any input bug — trust the log, not terminal scrollback.

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

## Keystrokes

The full chart, every keystroke, and audio: [ipabet.org](https://ipabet.org).
