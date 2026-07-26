#!/bin/bash
# Uninstall IPAbet: disable its input sources, remove the app, forget the
# pkg receipt.
#
#   sudo "/Library/Input Methods/IPAbet.app/Contents/Resources/uninstall.sh"
#
# Log out and back in afterward — macOS refreshes input sources at login,
# the same contract as installing.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run me with sudo"; exit 1; }

APP="/Library/Input Methods/IPAbet.app"
CONSOLE_USER=$(stat -f%Su /dev/console)

# TIS state is per-session: disable as the logged-in user, never as root.
if [ -x "$APP/Contents/MacOS/ipabet-register" ]; then
  sudo -u "$CONSOLE_USER" "$APP/Contents/MacOS/ipabet-register" --disable || true
fi
killall IPAbet 2>/dev/null || true
rm -rf "$APP"
pkgutil --forget org.bikeshaving.inputmethod.IPAbet.pkg >/dev/null 2>&1 || true

echo "IPAbet is removed. Log out and back in to clear the input menu."
echo "Per-user data (if any): ~/Library/Containers/org.bikeshaving.inputmethod.IPAbet — delete it for a clean slate."
