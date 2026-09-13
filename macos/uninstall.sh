#!/bin/bash
# Uninstall IPAbet: disable its input sources, then remove everything the
# production install leaves — the app, the pkg receipt, the sandbox container
# (settings + debug log) of the logged-in user — and any dev copy of the app
# in that user's home, which would otherwise register a second IPAbet.
#
#   sudo "/Library/Input Methods/IPAbet.app/Contents/Resources/uninstall.sh"
#
# Log out and back in afterward — macOS refreshes input sources at login,
# the same contract as installing.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run me with sudo"; exit 1; }

APP="/Library/Input Methods/IPAbet.app"
CONSOLE_USER=$(stat -f%Su /dev/console)
CONSOLE_HOME=$(eval echo "~$CONSOLE_USER")
BUNDLE=org.bikeshaving.inputmethod.IPAbet

# TIS state is per-session: disable as the logged-in user, never as root.
if [ -x "$APP/Contents/MacOS/ipabet-register" ]; then
  sudo -u "$CONSOLE_USER" "$APP/Contents/MacOS/ipabet-register" --disable || true
fi
killall IPAbet 2>/dev/null || true
[ -d "$APP" ] && rm -r "$APP"
DEV="$CONSOLE_HOME/Library/Input Methods/IPAbet.app"
[ -d "$DEV" ] && rm -r "$DEV"
pkgutil --forget "$BUNDLE.pkg" >/dev/null 2>&1 || true
CONTAINER="$CONSOLE_HOME/Library/Containers/$BUNDLE"
[ -d "$CONTAINER" ] && rm -r "$CONTAINER"

sudo -u "$CONSOLE_USER" killall TextInputMenuAgent 2>/dev/null || true
echo "IPAbet is fully removed. Log out and back in to clear the input menu."
