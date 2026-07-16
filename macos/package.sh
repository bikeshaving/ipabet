#!/bin/bash
# Sign, package, notarize, and staple IPAbet.app into a distributable .pkg that
# installs to /Library/Input Methods. Gatekeeper-clean on any Mac.
#
# One-time prereqs:
#   1. "Developer ID Application" + "Developer ID Installer" certs in your Keychain
#      (Xcode -> Settings -> Accounts -> Manage Certificates -> +).
#   2. A notary profile:
#        xcrun notarytool store-credentials ipabet-notary \
#          --apple-id you@example.com --team-id TEAMID --password <app-specific-pw>
#
# Usage:  ./package.sh [notary-profile]        (default profile: ipabet-notary)
set -euo pipefail
cd "$(dirname "$0")"

NOTARY_PROFILE="${1:-ipabet-notary}"
APP="build/IPAbet.app"
PKGROOT="build/pkgroot"
STAGE="$PKGROOT/Library/Input Methods"
COMPONENT="build/IPAbet-component.pkg"
PKG="build/IPAbet.pkg"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' Info.plist)"

# --- locate the two Developer ID identities in the Keychain ---
DEVID_APP="$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: .*\)".*/\1/p' | head -1)"
DEVID_INST="$(security find-identity -v          | sed -n 's/.*"\(Developer ID Installer: .*\)".*/\1/p' | head -1)"
[ -n "$DEVID_APP"  ] || { echo "✗ No 'Developer ID Application' cert in Keychain (Xcode -> Manage Certificates)."; exit 1; }
[ -n "$DEVID_INST" ] || { echo "✗ No 'Developer ID Installer' cert in Keychain (Xcode -> Manage Certificates)."; exit 1; }
echo "app signer:       $DEVID_APP"
echo "installer signer: $DEVID_INST"
echo "version:          $VERSION"

# --- 1. fresh build ---
./build.sh

# --- 2. sign the app for distribution: hardened runtime + secure timestamp ---
codesign --force --options runtime --timestamp --sign "$DEVID_APP" "$APP"
codesign --verify --strict --verbose=2 "$APP"

# --- 3. stage under /Library/Input Methods and build the component pkg ---
rm -rf "$PKGROOT" "$COMPONENT" "$PKG"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
# BundleIsRelocatable=false, or Installer "relocates": finding any other copy
# of the bundle ID via Spotlight (a dev build, a Trash copy), it writes the
# payload THERE and leaves /Library/Input Methods empty — receipt and all.
PLIST="build/component.plist"
pkgbuild --analyze --root "$PKGROOT" "$PLIST"
/usr/libexec/PlistBuddy -c 'Set :0:BundleIsRelocatable false' "$PLIST"
pkgbuild --root "$PKGROOT" --component-plist "$PLIST" --install-location "/" \
	--identifier "org.bikeshaving.inputmethod.IPAbet.pkg" --version "$VERSION" "$COMPONENT"

# --- 4. wrap into a product installer, signed with the Installer identity ---
productbuild --package "$COMPONENT" --sign "$DEVID_INST" "$PKG"

# --- 5. notarize (waits for Apple) and staple the ticket ---
echo "submitting to Apple notary — this usually takes a minute or two…"
xcrun notarytool submit "$PKG" --keychain-profile "$NOTARY_PROFILE" --wait
xcrun stapler staple "$PKG"
xcrun stapler validate "$PKG"

echo
echo "✓ notarized + stapled:  $(pwd)/$PKG"
echo "  ship it. installs to /Library/Input Methods; users add it in"
echo "  System Settings -> Keyboard -> Input Sources -> + -> English."
