#!/bin/bash
# Build IPAbet.app without Xcode. Run on macOS: ./build.sh [install]
set -euo pipefail
cd "$(dirname "$0")"

APP=build/IPAbet.app
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc Sources/*.swift \
  -o "$APP/Contents/MacOS/IPAbet" \
  -framework Cocoa -framework InputMethodKit \
  -O

# The registration helper: the one UNSANDBOXED binary (TIS enablement writes
# HIToolbox prefs, which the sandbox would silently redirect into the container).
swiftc Helper/register.swift -o "$APP/Contents/MacOS/ipabet-register" -framework Carbon -O

# compile app icon if iconset present and iconutil available
if [ -d IPAbet.iconset ] && command -v iconutil >/dev/null; then
  iconutil -c icns IPAbet.iconset -o "$APP/Contents/Resources/IPAbet.icns"
fi
cp Info.plist "$APP/Contents/"
cp ../spec/ipabet.json "$APP/Contents/Resources/ipabet.json"
cp ipabet.pdf "$APP/Contents/Resources/"
cp ../www/src/chart.pdf "$APP/Contents/Resources/chart.pdf"   # the input menu's cheat sheet
# Regenerate the cosmetic layout from the live US layout + the spec, then bundle
# it. Complete US so passed keys (Return, Tab, …) keep their output; ⌥/⌥⇧ show
# the marks. See tools/genkeylayout.swift.
swiftc tools/genkeylayout.swift -o /tmp/ipabet-genkl -framework Carbon -framework Cocoa
( cd "$(dirname "$0")" && /tmp/ipabet-genkl )
cp IPAbet.keylayout "$APP/Contents/Resources/IPAbet.keylayout"  # what Keyboard Viewer draws
mkdir -p "$APP/Contents/Resources/en.lproj"
cp en.lproj/InfoPlist.strings "$APP/Contents/Resources/en.lproj/"

# Ad-hoc sign (required on Apple Silicon), sandboxed exactly like the
# distribution build so dev and shipped behavior can't diverge. The helper is
# signed first, WITHOUT the sandbox entitlement (per-binary by design); the
# app signature (no --deep) then seals it as a resource.
codesign --force --sign - "$APP/Contents/MacOS/ipabet-register"
codesign --force --entitlements IPAbet.entitlements --sign - "$APP"

echo "built $APP"

if [[ "${1:-}" == "install" || "${1:-}" == "reload" ]]; then
  rm -rf ~/Library/Input\ Methods/IPAbet.app
  cp -R "$APP" ~/Library/Input\ Methods/
  ~/Library/Input\ Methods/IPAbet.app/Contents/MacOS/ipabet-register \
    && echo "installed; registration attempted — if IPA is not in the input menu, log out/in." \
    || echo "installed; registration failed — log out/in and add it in System Settings."
fi

if [[ "${1:-}" == "reload" ]]; then
  # Kill the running server so macOS respawns it with the new binary. Host apps
  # keep a session to the old process, so switch the input source away and back
  # (or relaunch the app) to reconnect. No effect if the .pkg copy in
  # /Library/Input Methods/ is the live one — check `pgrep -lf IPAbet`.
  if pkill IPAbet; then
    echo "killed IPAbet — toggle the input source to reconnect."
  else
    echo "IPAbet was not running; it starts on the next input-source switch."
  fi
fi
