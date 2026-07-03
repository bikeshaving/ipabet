# IPAKey

The macOS input method for IPAbet. Faceless InputMethodKit app, no Xcode required.

## Build

```sh
./build.sh          # builds build/IPAKey.app
./build.sh install  # builds + installs to ~/Library/Input Methods/
```

First install needs a logout (TIS registration). After that: `./build.sh install && pkill IPAKey`.

## Files

- `Sources/main.swift` — IMKServer boot.
- `Sources/InputController.swift` — the transformation engine. Loads
  `ipakey.json` and assembles each glyph in an IMK **composition** (marked
  text): modifier keys, postfix marks, and backspace all edit the composing
  glyph inside the IME, and the finished cluster is committed to the app as a
  single precomposed `insertText`. The engine never reads or edits the client's
  committed text (no `selectedRange`, `string(from:)`, or `replacementRange`
  reach-back — the calls whose support varies per app), so behavior is
  identical in every input field. State: the composing glyph, the
  Option-prefix dead-key mark, and the `9` bracket toggle.
- `ipakey.json` — mapping (copy of `spec/ipakey.json`).
- `Info.plist` — bundle ID must contain `.inputmethod.`; claims `und-fonipa`.
- `IPAbet.keylayout` — cosmetic layout used only to give the on-screen **Keyboard
  Viewer** an IPA base-layer preview. `InputController` overrides to it (by name,
  from the app bundle) on `activateServer:`. It is display-only: the engine
  decodes keys via `USLayout` (`UCKeyTranslate` against `com.apple.keylayout.US`),
  so it never reads this layout's output. If the in-bundle override ever fails,
  typing is unaffected — only the preview is lost. It faithfully mirrors US on
  every modifier layer, **including US's Option dead keys** (Option+e → acute,
  etc., reproduced as a real `<actions>`/`<terminators>` state machine), so the
  Option passthrough still composes accents. Regenerate with
  `swift tools/genkeylayout.swift > IPAbet.keylayout`.

## Key decoding

Keys are decoded from the physical `keyCode` through a fixed US layout, so the
ASCII-keyed tables work regardless of the user's selected layout (Dvorak, a
non-US QWERTY, …) and regardless of the cosmetic override above.

## Modifier layers

- bare — IPA value
- Shift — transform previous glyph
- Option — dead-key diacritics + literal digits
- Option-Shift — escape hatch: inserts the plain US character for that key
  (e.g. Option-Shift-/ → `?`, Option-Shift-1 → `!`), for literal punctuation the
  mark layer would otherwise claim

## Keyboard Viewer preview

With IPAKey active, open **Keyboard Viewer** (Input-menu → Show Keyboard Viewer,
or System Settings → Keyboard → enable it) to see the base layer: the number row
shows `ɨ ʔ ʕ ɾ ə ɐ ħ`, letters map to themselves, and Shift shows the `ǃ`/`ǀ`
clicks on `1`/`\`. Only the base/Shift layers can be shown this way — the full
transform and diacritic layers live in `web/keyboard.html`. This is Keyboard
Viewer, not the System Settings preview panel, which macOS reserves for static
keyboard-layout sources and never shows for input methods.
