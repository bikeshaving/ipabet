#!/bin/bash
# Build IPAbet.app without Xcode. Run on macOS: ./build.sh [install]
set -euo pipefail
cd "$(dirname "$0")"

APP=build/IPAbet.app
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# A private temp dir for the per-arch slices and the keylayout generator.
# Fixed /tmp names are a symlink/TOCTOU hole on a multi-user Mac — another
# user could pre-create the path and have swiftc clobber it or swap the binary
# that gets lipo'd and shipped.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# DEBUG=1 compiles the keystroke logger in (Dbg — see Sources/Debug.swift).
# Release builds have NO logging capability; debug builds ship only as
# GitHub prereleases, never as /download.
DBGFLAGS="${DEBUG:+-D IPABET_DEBUG}"

# The app is a thin shell over the shared Rust engine (engine/), linked as a
# static lib through the C header the IBus/fcitx5/Windows shells also use. The
# crate builds per Apple target; needs the x86_64-apple-darwin rustc target
# installed (rustup target add x86_64-apple-darwin).
rust_target() { [ "$1" = arm64 ] && echo aarch64-apple-darwin || echo x86_64-apple-darwin; }

# UNIVERSAL binaries — swiftc builds host-arch only, and an arm64-only input
# method on an Intel Mac registers from its plist but can never launch: the
# input source appears, and typing is dead. Build both slices, lipo them.
for arch in arm64 x86_64; do
  rt="$(rust_target "$arch")"
  ( cd ../engine && cargo build --release --target "$rt" )
  swiftc Sources/*.swift \
    -target "$arch-apple-macos13.0" \
    -import-objc-header ../engine/include/ipabet_engine.h \
    -L "../engine/target/$rt/release" -lipabet_engine \
    -o "$TMP/ipabet-main-$arch" \
    -framework Cocoa -framework InputMethodKit \
    -O $DBGFLAGS
done
lipo -create -output "$APP/Contents/MacOS/IPAbet" $TMP/ipabet-main-arm64 $TMP/ipabet-main-x86_64

# The registration helper: the one UNSANDBOXED binary (TIS enablement writes
# HIToolbox prefs, which the sandbox would silently redirect into the container).
for arch in arm64 x86_64; do
  swiftc Helper/register.swift -target "$arch-apple-macos13.0" \
    -o "$TMP/ipabet-register-$arch" -framework Carbon -O
done
lipo -create -output "$APP/Contents/MacOS/ipabet-register" $TMP/ipabet-register-arm64 $TMP/ipabet-register-x86_64

# compile app icon if iconset present and iconutil available
if [ -d IPAbet.iconset ] && command -v iconutil >/dev/null; then
  iconutil -c icns IPAbet.iconset -o "$APP/Contents/Resources/IPAbet.icns"
fi
cp Info.plist "$APP/Contents/"
cp ../spec/ipabet.xml "$APP/Contents/Resources/ipabet.xml"
cp ipabet.pdf "$APP/Contents/Resources/"
cp ../www/src/gen/chart.pdf "$APP/Contents/Resources/chart.pdf"   # the input menu's cheat sheet
# The cosmetic layout for Keyboard Viewer: without it the Viewer documents the
# US option layer while IPAbet is active — wrong on-screen documentation. The
# override that uses it is guarded (see InputController): if registration
# didn't take, the layout is simply absent and typing is untouched.
# Checked in; regenerate with tools/genkeylayout.swift when the layout changes.
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
  # Disable the prior registration before replacing the bundle, so repeated
  # dev installs (each re-signed, which TIS sees as a new source) don't pile up
  # duplicate enabled entries in the input-source list.
  OLD=~/Library/Input\ Methods/IPAbet.app
  [ -x "$OLD/Contents/MacOS/ipabet-register" ] && "$OLD/Contents/MacOS/ipabet-register" --disable >/dev/null 2>&1 || true
  rm -rf ~/Library/Input\ Methods/IPAbet.app
  cp -R "$APP" ~/Library/Input\ Methods/
  ~/Library/Input\ Methods/IPAbet.app/Contents/MacOS/ipabet-register \
    && echo "installed; registration attempted — if IPA is not in the input menu, log out/in." \
    || echo "installed; registration failed — log out/in and add it in System Settings."
fi
