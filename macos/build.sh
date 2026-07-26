#!/bin/bash
# Build IPAbet.app without Xcode. Run on macOS: ./build.sh [install]
set -euo pipefail
cd "$(dirname "$0")"

APP=build/IPAbet.app
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# DEBUG=1 compiles the keystroke logger in (Dbg — see Sources/Debug.swift).
# Release builds have NO logging capability; debug builds ship only as
# GitHub prereleases, never as /download.
DBGFLAGS="${DEBUG:+-D IPABET_DEBUG}"

# UNIVERSAL binaries — swiftc builds host-arch only, and an arm64-only input
# method on an Intel Mac registers from its plist but can never launch: the
# input source appears, and typing is dead. Build both slices, lipo them.
for arch in arm64 x86_64; do
  swiftc Sources/*.swift \
    -target "$arch-apple-macos13.0" \
    -o "/tmp/ipabet-main-$arch" \
    -framework Cocoa -framework InputMethodKit \
    -O $DBGFLAGS
done
lipo -create -output "$APP/Contents/MacOS/IPAbet" /tmp/ipabet-main-arm64 /tmp/ipabet-main-x86_64

# The registration helper: the one UNSANDBOXED binary (TIS enablement writes
# HIToolbox prefs, which the sandbox would silently redirect into the container).
for arch in arm64 x86_64; do
  swiftc Helper/register.swift -target "$arch-apple-macos13.0" \
    -o "/tmp/ipabet-register-$arch" -framework Carbon -O
done
lipo -create -output "$APP/Contents/MacOS/ipabet-register" /tmp/ipabet-register-arm64 /tmp/ipabet-register-x86_64

# compile app icon if iconset present and iconutil available
if [ -d IPAbet.iconset ] && command -v iconutil >/dev/null; then
  iconutil -c icns IPAbet.iconset -o "$APP/Contents/Resources/IPAbet.icns"
fi
cp Info.plist "$APP/Contents/"
cp ../spec/ipabet.json "$APP/Contents/Resources/ipabet.json"
cp ipabet.pdf "$APP/Contents/Resources/"
cp ../www/src/gen/chart.pdf "$APP/Contents/Resources/chart.pdf"   # the input menu's cheat sheet
# The cosmetic layout for Keyboard Viewer: without it the Viewer documents the
# US option layer while IPAbet is active — wrong on-screen documentation. The
# override that uses it is guarded (see InputController): if registration
# didn't take, the layout is simply absent and typing is untouched.
swiftc tools/genkeylayout.swift -o /tmp/ipabet-genkl -framework Carbon -framework Cocoa
( cd "$(dirname "$0")" && /tmp/ipabet-genkl )
cp IPAbet.keylayout "$APP/Contents/Resources/IPAbet.keylayout"
install -m 755 uninstall.sh "$APP/Contents/Resources/uninstall.sh"
mkdir -p "$APP/Contents/Resources/en.lproj"
cp en.lproj/InfoPlist.strings "$APP/Contents/Resources/en.lproj/"

# Ad-hoc sign (required on Apple Silicon), sandboxed exactly like the
# distribution build so dev and shipped behavior can't diverge. The helper is
# signed first, WITHOUT the sandbox entitlement (per-binary by design); the
# app signature (no --deep) then seals it as a resource.
codesign --force --sign - "$APP/Contents/MacOS/ipabet-register"
codesign --force --entitlements IPAbet.entitlements --sign - "$APP"

echo "built $APP"

if [[ "${1:-}" == "install" ]]; then
  rm -rf ~/Library/Input\ Methods/IPAbet.app
  cp -R "$APP" ~/Library/Input\ Methods/
  ~/Library/Input\ Methods/IPAbet.app/Contents/MacOS/ipabet-register \
    && echo "installed; registration attempted — if IPA is not in the input menu, log out/in." \
    || echo "installed; registration failed — log out/in and add it in System Settings."
fi
