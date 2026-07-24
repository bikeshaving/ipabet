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
# entitlement — the OS enforces the no-phoning-home claim) + timestamp.
# The registration helper is hardened but NOT sandboxed (TIS enablement
# writes HIToolbox prefs, which a sandboxed process writes into its own
# container — a silent no-op for the real session). Per-binary entitlements;
# app signed without --deep so the helper's signature survives. ---
codesign --force --options runtime --timestamp --sign "$DEVID_APP" \
	"$APP/Contents/MacOS/ipabet-register"
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

# postinstall makes a BEST-EFFORT registration into the logged-in user's
# session: launchctl asuser joins the user's Mach bootstrap namespace (a bare
# sudo -u from the installer daemon stays outside the Aqua session, where TIS
# calls succeed into a namespace the input menu never reads). Even done
# right, macOS only reliably registers brand-new input methods at login — so
# the conclusion page documents the logout, and this is a bonus when it works.
SCRIPTS="build/scripts"
mkdir -p "$SCRIPTS"
cat > "$SCRIPTS/postinstall" <<'EOF'
#!/bin/bash
# Clean up what earlier releases left behind: the 0.1.0-v2 LaunchAgent (pkg
# upgrades never delete files absent from the new payload, and the orphaned
# plist would re-register at every login, unguarded).
launchctl bootout system /Library/LaunchAgents/org.bikeshaving.ipabet.register.plist 2>/dev/null || true
rm -f /Library/LaunchAgents/org.bikeshaving.ipabet.register.plist
u=$(stat -f%Su /dev/console)
uid=$(id -u "$u" 2>/dev/null)
if [ -n "$uid" ] && [ "$u" != "root" ]; then
  launchctl bootout "gui/$uid" /Library/LaunchAgents/org.bikeshaving.ipabet.register.plist 2>/dev/null || true
  launchctl asuser "$uid" sudo -u "$u" \
    "/Library/Input Methods/IPAbet.app/Contents/MacOS/ipabet-register" || true
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
<h3>IPAbet is installed.</h3>
<p>Add it under <b>System Settings → Keyboard → Input Sources</b> →
<kbd>+</kbd> → English → <b>IPA</b>, then pick <b>IPA</b> in the input menu
(top-right of the menu bar).</p>
<p><b>Not listed yet?</b> Log out and back in first — macOS registers new input
methods at login.</p>
</body></html>
EOF
DIST="build/distribution.xml"
cat > "$DIST" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
    <title>IPAbet</title>
    <conclusion file="conclusion.html"/>
    <options customize="never" require-scripts="false" hostArchitectures="arm64,x86_64"/>
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
# SKIP_NOTARIZE=1 produces a signed-but-unstapled pkg for the E2E gate (the
# gate installs via ssh, no quarantine, so Gatekeeper never assesses).
if [ "${SKIP_NOTARIZE:-0}" = "1" ]; then
  echo "⚠ SKIP_NOTARIZE=1 — signed, NOT notarized. Gate use only; do not ship."
else
  echo "submitting to Apple notary — this usually takes a minute or two…"
  xcrun notarytool submit "$PKG" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$PKG"
  xcrun stapler validate "$PKG"
fi

echo
echo "✓ notarized + stapled:  $(pwd)/$PKG"
echo "  ship it. installs to /Library/Input Methods; users add it in"
echo "  System Settings -> Keyboard -> Input Sources -> + -> English."
