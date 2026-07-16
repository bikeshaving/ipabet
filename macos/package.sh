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

# --- 2. sign for distribution: hardened runtime + App Sandbox (no network
# entitlement — the OS enforces the no-phoning-home claim) + timestamp ---
codesign --force --options runtime --timestamp \
	--entitlements IPAbet.entitlements --sign "$DEVID_APP" "$APP"
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

# postinstall registers the input method into the logged-in user's session
# (TISRegisterInputSource via the binary's --register mode), so installing
# needs no logout in the normal case.
SCRIPTS="build/scripts"
mkdir -p "$SCRIPTS"
cat > "$SCRIPTS/postinstall" <<'EOF'
#!/bin/bash
# Runs as root; TIS registration must happen as the console user.
u=$(stat -f%Su /dev/console)
if [ -n "$u" ] && [ "$u" != "root" ]; then
  sudo -u "$u" "/Library/Input Methods/IPAbet.app/Contents/MacOS/IPAbet" --register || true
fi
exit 0
EOF
chmod +x "$SCRIPTS/postinstall"

pkgbuild --root "$PKGROOT" --component-plist "$PLIST" --scripts "$SCRIPTS" \
	--install-location "/" \
	--identifier "org.bikeshaving.inputmethod.IPAbet.pkg" --version "$VERSION" "$COMPONENT"

# --- 4. wrap into a product installer with a conclusion page, signed ---
RES="build/resources"
mkdir -p "$RES"
cat > "$RES/conclusion.html" <<'EOF'
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { font: 13px -apple-system, sans-serif; color: #333; margin: 16px; }
kbd { font-family: ui-monospace, monospace; background: #eee; border-radius: 4px; padding: 1px 5px; }
</style></head><body>
<h3>IPAbet is installed and registered.</h3>
<p>Pick <b>IPA</b> in the input menu (top-right of the menu bar) and start typing —
<kbd>s</kbd> <kbd>⇧H</kbd> → ʃ. The cheat sheet lives in the same menu.</p>
<p>If <b>IPA</b> is missing from the input menu, log out and back in once —
macOS occasionally requires it for brand-new input methods — then add it under
System Settings → Keyboard → Input Sources → <kbd>+</kbd> → English → <b>IPA</b>.</p>
</body></html>
EOF
DIST="build/distribution.xml"
cat > "$DIST" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
    <title>IPAbet</title>
    <conclusion file="conclusion.html"/>
    <options customize="never" require-scripts="false"/>
    <pkg-ref id="org.bikeshaving.inputmethod.IPAbet.pkg" version="$VERSION">IPAbet-component.pkg</pkg-ref>
    <choices-outline>
        <line choice="default"/>
    </choices-outline>
    <choice id="default" visible="false">
        <pkg-ref id="org.bikeshaving.inputmethod.IPAbet.pkg"/>
    </choice>
</installer-gui-script>
EOF
productbuild --distribution "$DIST" --resources "$RES" --package-path build \
	--sign "$DEVID_INST" "$PKG"

# --- 5. notarize (waits for Apple) and staple the ticket ---
echo "submitting to Apple notary — this usually takes a minute or two…"
xcrun notarytool submit "$PKG" --keychain-profile "$NOTARY_PROFILE" --wait
xcrun stapler staple "$PKG"
xcrun stapler validate "$PKG"

echo
echo "✓ notarized + stapled:  $(pwd)/$PKG"
echo "  ship it. installs to /Library/Input Methods; users add it in"
echo "  System Settings -> Keyboard -> Input Sources -> + -> English."
