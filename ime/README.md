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
- `Sources/InputController.swift` — the transformation engine. Loads `ipakey.json`, rewrites the character before the cursor on modifier keys. Only state is the Option-prefix dead-key mark.
- `ipakey.json` — mapping (copy of `spec/ipakey.json`).
- `Info.plist` — bundle ID must contain `.inputmethod.`; claims `und-fonipa`.

## Modifier layers

- bare — IPA value
- Shift — transform previous glyph
- Option — dead-key diacritics + literal digits
- Option-Shift — raw macOS passthrough (the escape hatch)
