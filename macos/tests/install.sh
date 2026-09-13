#!/bin/bash
# The install contract, checked against the real pkg: install, upgrade over
# it, uninstall. Needs sudo and a built macos/build/IPAbet.app. Run from macos/.
#
#   sudo tests/install.sh
set -euo pipefail
trap 'echo "FAIL line $LINENO: $BASH_COMMAND" >&2; tail -40 /var/log/install.log >&2' ERR
cd "$(dirname "$0")/.."
[ "$(id -u)" = 0 ] || { echo "run me with sudo"; exit 1; }
[ -d build/IPAbet.app ] || { echo "build first: ./build.sh"; exit 1; }

APP="/Library/Input Methods/IPAbet.app"
BIN="$APP/Contents/MacOS/IPAbet"
u=$(stat -f%Su /dev/console)

root=$(mktemp -d); mkdir -p "$root/Library/Input Methods"
cp -R build/IPAbet.app "$root/Library/Input Methods/"
plist="$root/component.plist"
pkgbuild --analyze --root "$root" "$plist" >/dev/null
/usr/libexec/PlistBuddy -c 'Set :0:BundleIsRelocatable false' "$plist"
pkgbuild --root "$root" --component-plist "$plist" --scripts scripts --install-location / \
  --identifier org.bikeshaving.inputmethod.IPAbet.pkg --version 0 "$root/IPAbet.pkg" >/dev/null

running() { pgrep -f "^$BIN" || true; }
check() {  # label
  [ -d "$APP" ] || { echo "FAIL $1: $APP missing"; exit 1; }
  local n; n=$(running | wc -l | tr -d ' ')
  [ "$n" = 1 ] || { echo "FAIL $1: $n IPAbet processes running from $APP, want 1"; pgrep -fl IPAbet || true; exit 1; }
  sudo -u "$u" swift tools/tis-probe.swift assert-present >/dev/null 2>&1 || { echo "FAIL $1: input source not present"; exit 1; }
  echo "ok  $1: installed, one process (pid $(running)), input source present"
}

installer -pkg "$root/IPAbet.pkg" -target /
sleep 2
check "install"
first=$(running)

installer -pkg "$root/IPAbet.pkg" -target /
sleep 2
check "upgrade"
[ "$(running)" != "$first" ] || { echo "FAIL upgrade: the old process (pid $first) survived"; exit 1; }
echo "ok  upgrade: old process stopped, new one launched"

"$APP/Contents/Resources/uninstall.sh" >/dev/null
sleep 1
[ ! -d "$APP" ] || { echo "FAIL uninstall: $APP still there"; exit 1; }
[ -z "$(running)" ] || { echo "FAIL uninstall: IPAbet still running"; exit 1; }
pkgutil --pkg-info org.bikeshaving.inputmethod.IPAbet.pkg >/dev/null 2>&1 && { echo "FAIL uninstall: receipt left"; exit 1; }
echo "ok  uninstall: app, process and receipt gone"
rm -rf "$root"
