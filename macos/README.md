# IPAbet — macOS

The macOS input method for IPAbet: a faceless InputMethodKit app, no Xcode
required. The reference implementation of the notation; other platforms port
against the [`js/`](../js) parity suite.

## Build

```sh
./build.sh          # builds build/IPAbet.app
./build.sh install  # builds + installs to ~/Library/Input Methods/
```

First install needs a logout (TIS registration). After that:
`./build.sh install` kills nothing by itself — follow with `pkill IPAbet`, then
**quit and relaunch the app you're testing in** (or toggle the input source):
apps hold a session to the old process and behave erratically against a stale
one.

## Architecture

The **active cluster composes**: the most recently typed cluster stays open in
the client's marked-text range — styled as plain text, so nothing looks
composed — and every previous-glyph rule rewrites it there via
`setMarkedText`, the path every host tests hardest because CJK typing depends
on it. Browsers therefore see a real composition (`compositionstart`,
`isComposing`), so IME-aware pages defer to the engine instead of racing it.
A boundary — any declined key, space, Esc, a click, focus loss — commits the
cluster as ordinary text.

Edits to already-committed text (click after an old glyph, then transform it)
use `insertText(_:replacementRange:)` — the call pattern captured from
Apple's 2-Set Korean with `tools/probe.swift`. In **direct hosts** (terminals
and modal editors — Terminal, iTerm2, kitty, alacritty, wezterm, ghostty,
MacVim, Emacs) nothing ever composes: marked text would hold each keystroke
back from the pty until the next one arrives, so there every keystroke
commits immediately and rewrites go through `replacementRange`.

All previous-glyph rules (digraph transforms, doubled-mark upgrades, rhotic
`⇧R`, ejective `⇧X`, superscript `⌥p`, spacing marks, backspace) operate on
the **decomposed view** of the cluster — base glyph + combining marks split
via NFD — and
recompose to NFC on write. NFC fusion (é is one codepoint, n̥ is two) therefore
never changes rule behavior. On any rule miss the keystroke falls through until
something emits; no key ever dead-ends.

Backspace peels the last combining mark off the previous cluster (é → e,
n̥ → n); a bare glyph is declined so the host deletes it natively — Korean's
jamo-peel-then-native pattern.

## Files

- `Sources/main.swift` — IMKServer boot + explicit `.accessory` activation
  policy + the raw-lock-clears-on-arrival observer.
- `Sources/InputController.swift` — the engine described above, plus the
  secure-field handling. Loads `ipabet.json`.
- `ipabet.json` — the mapping, copied from `spec/ipabet.json` at build time.
- `Info.plist` — bundle ID must contain `.inputmethod.`; registers one
  visible input mode (see the icon/name notes inline). See the macOS 15
  rules below before touching the launch keys.
- `tools/genmenupdf.swift` — regenerates `ipabet.pdf`, the input-source icon.
- `tools/reregister.swift` — `TISRegisterInputSource` helper (run after
  `build.sh install` so the source appears without a logout on reinstalls).
- `tools/probe.swift` — instrumented test host: an AppKit `NSTextView` that
  logs every NSTextInputClient call (strings, codepoints, ranges) plus a
  `WKWebView` input that logs DOM composition events; both stream to the
  window, stdout, and `/tmp/imeprobe.log`. Build:
  `swiftc tools/probe.swift -o /tmp/imeprobe -framework Cocoa -framework WebKit`.
  This is the ground truth for any input bug — beware terminal scrollback
  from earlier runs; trust `/tmp/imeprobe.log` (truncated per launch).

## Hard-won macOS 15 rules (probe- and crash-verified; do not relearn)

macOS 15 runs a half-modernized IMK stack (`IMKClient_Modern` client,
`_IMKServerLegacy` server, XPC in between). Empirically established with
matched client/IME transcripts:

1. **Never call `updateComposition()`/`composedString()`** — IMK passes
   `composedString` a dangling sender and the process segfaults in the objc
   bridge. Squirrel and vChewing also avoid it; the XIME project reimplements
   `updateComposition` for the same reason.
2. **Never `insertText` an empty string** — the transport silently drops it,
   real `replacementRange` or not. Delete by replacing a range with shorter
   text, or decline and let the host delete.
3. **Bundle/launch config is load-bearing**: declare
   `NSPrincipalClass = NSApplication`, `LSUIElement = true` (not
   `LSBackgroundOnly = true`), and call
   `NSApplication.shared.setActivationPolicy(.accessory)` before `run()`.
   Misconfigured, the client *discards key events the IME declines* (backspace
   returned `false` never reaches the app) once any marked text has been shown
   in that window — the bug that originally motivated the marked-text-free
   architecture above.
4. The `IMKCFRunLoopWakeUpReliable` mach-port error in host apps is ubiquitous
   Sequoia log noise (Electron, Python, JDK all emit it); Apple DTS calls it
   non-actionable. Don't chase it.
5. Reference implementations worth consulting before fighting a client quirk:
   Squirrel and vChewing (per-client mitigation registries, WeChat/Office/
   iTerm2 workarounds), macSKK (documented `setMarkedText` flush idiom from
   AquaSKK), azooKey-Desktop (minimal modern Swift IME).

## Key decoding

Keys are decoded from the physical `keyCode` through a fixed US layout
(`UCKeyTranslate` against `com.apple.keylayout.US`), so the ASCII-keyed tables
work regardless of the user's selected layout (Dvorak, a non-US QWERTY, …).

## Modifier layers

IPAbet is a **normal US keyboard** with IPA added on the shifted layers; a bare
key is always its plain US self (letters, digits, punctuation — untouched, so
tmux prefixes, vim counts, and shortcuts pass through natively).

- **bare** — plain US. IPA base letters that are Latin letters (a, s, t…) are
  typed directly; digits and punctuation are native.
- **Shift** — US shift, overridden where IPA needs it: a letter right after a
  glyph → an IPA modifier transform (`t` `⇧H` → θ, `q` `⇧C` → ǃ). The **digit keys
  are bases** too — a bare digit + a modifier gives an IPA glyph with no Latin home
  (`5` `⇧Y` → ə, `2` `⇧H` → ʔ, `5` `⇧H` → ɜ). Because those sit on the *unshifted*
  digit, ⇧2–7 are all their native symbols now (@ # $ % ^ &).
- **Option** — the diacritic layer. Combining marks are **prefix**, dead-key
  style like the US layout's own é/ñ (`⌥e` `a` → á); spacing marks — length,
  tone, stress — stay postfix (`a` `⌥;` → aː). `⌥p` superscriptizes the previous
  glyph (`h` `⌥p` → ʰ). Chao tone letters on `⌥1`–`⌥5`. The tie bar is a postfix
  **joiner** on `⌥j` (`t ⌥j s` → t͡s; `⌥⇧j` for the below-form t͜ɕ).
- **Option-Shift** — a mark's second form (`⌥⇧n` → creaky, `⌥⇧j` → the tie's
  below-form). The number-row raw-US escape is fully retired now that no shifted
  digit is claimed; `⌥⇧1` → ¡ is the one deliberate spend.
- **Ctrl-Shift-letter** — the literal capital. `⇧<letter>` transforms the glyph
  before it, so "GitHub" would come out "Giθub"; `⌃⇧H` commits a raw `H` and
  bypasses every transform. Plain `⌃` chords stay leader keys (tmux `^b`).
- **Caps Lock** — a lock, not a modifier: letters type literal capitals and never
  transform (a locked `T` then `H` is "TH", not θ). Shift is still the modifier.
- **⌥⇧Space** — the raw-US lock: toggles the whole IME transparent (for code,
  camelCase, shifted symbols) until pressed again. Cleared on switching to
  IPAbet; a Per-App Lock option (input menu) remembers it per app.

The full chart, every keystroke, and audio live at [ipabet.org](https://ipabet.org).
