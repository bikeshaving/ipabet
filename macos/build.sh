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
cp ../spec/ipabet.json "$APP/Contents/Resources/ipabet.json"
cp ipabet.pdf "$APP/Contents/Resources/"
cp ../www/src/chart.pdf "$APP/Contents/Resources/chart.pdf"   # the input menu's cheat sheet
mkdir -p "$APP/Contents/Resources/en.lproj"
cp en.lproj/InfoPlist.strings "$APP/Contents/Resources/en.lproj/"

# Ad-hoc sign (required on Apple Silicon), sandboxed exactly like the
# distribution build so dev and shipped behavior can't diverge.
codesign --force --deep --entitlements IPAbet.entitlements --sign - "$APP"

echo "built $APP"

if [[ "${1:-}" == "install" ]]; then
  rm -rf ~/Library/Input\ Methods/IPAbet.app
  cp -R "$APP" ~/Library/Input\ Methods/
  ~/Library/Input\ Methods/IPAbet.app/Contents/MacOS/IPAbet --register \
    && echo "installed + registered — IPA is in the input menu, no logout needed." \
    || echo "installed; registration failed — log out/in and add it in System Settings."
fi
