#!/bin/bash
# Build IPAKey.app without Xcode. Run on macOS: ./build.sh [install]
set -euo pipefail
cd "$(dirname "$0")"

APP=build/IPAKey.app
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc Sources/*.swift \
  -o "$APP/Contents/MacOS/IPAKey" \
  -framework Cocoa -framework InputMethodKit \
  -O

# compile app icon if iconset present and iconutil available
if [ -d IPAKey.iconset ] && command -v iconutil >/dev/null; then
  iconutil -c icns IPAKey.iconset -o "$APP/Contents/Resources/IPAKey.icns"
fi
cp Info.plist "$APP/Contents/"
cp ipakey.json ipakey.png ipakey@2x.png "$APP/Contents/Resources/"

# Ad-hoc sign (required on Apple Silicon)
codesign --force --deep --sign - "$APP"

echo "built $APP"

if [[ "${1:-}" == "install" ]]; then
  rm -rf ~/Library/Input\ Methods/IPAKey.app
  cp -R "$APP" ~/Library/Input\ Methods/
  echo "installed. Log out/in (or: killall -HUP TextInputMenuAgent),"
  echo "then add it under System Settings → Keyboard → Input Sources → + → English."
fi
