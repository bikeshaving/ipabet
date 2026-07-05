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

# compile app icon if iconset present and iconutil available
if [ -d IPAbet.iconset ] && command -v iconutil >/dev/null; then
  iconutil -c icns IPAbet.iconset -o "$APP/Contents/Resources/IPAbet.icns"
fi
cp Info.plist "$APP/Contents/"
cp ipabet.json ipabet.pdf ipabet-alt.pdf "$APP/Contents/Resources/"
# Cosmetic Keyboard Viewer layout, referenced by name via overrideKeyboard.
cp IPAbet.keylayout "$APP/Contents/Resources/"

# Ad-hoc sign (required on Apple Silicon)
codesign --force --deep --sign - "$APP"

echo "built $APP"

if [[ "${1:-}" == "install" ]]; then
  rm -rf ~/Library/Input\ Methods/IPAbet.app
  cp -R "$APP" ~/Library/Input\ Methods/
  echo "installed. Log out/in (or: killall -HUP TextInputMenuAgent),"
  echo "then add it under System Settings → Keyboard → Input Sources → + → English."
fi
