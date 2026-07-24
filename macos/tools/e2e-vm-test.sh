#!/bin/bash
# End-to-end clean-install test: a pristine arm64 macOS VM gets the pkg the way
# a stranger's Mac does. This is the release gate — no artifact ships until this
# passes on the image matching the current macOS.
#
#   tools/e2e-vm-test.sh [path/to/IPAbet.pkg]     (default: build/IPAbet.pkg)
#
# Requires: tart, sshpass, a pulled ghcr.io/cirruslabs/macos-sequoia-base image.
# The Cirrus images auto-login as admin/admin with SSH enabled.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG="${1:-build/IPAbet.pkg}"
[ -f "$PKG" ] || { echo "✗ no pkg at $PKG"; exit 1; }
IMG="ghcr.io/cirruslabs/macos-sequoia-base:latest"
VM="ipabet-e2e"
KEY="/tmp/ipabet-e2e-key"
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -f "$KEY"
OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o IdentitiesOnly=yes"
SSHP="sshpass -p admin ssh $OPTS -o PubkeyAuthentication=no -o PreferredAuthentications=password admin@"
SSH="ssh $OPTS -i $KEY admin@"
SCP="scp $OPTS -i $KEY"


step() { echo; echo "━━ $1"; }

step "fresh VM from $IMG"
tart delete "$VM" 2>/dev/null || true
tart clone "$IMG" "$VM"
tart run --no-graphics "$VM" >/dev/null 2>&1 &
TART_PID=$!
trap 'kill $TART_PID 2>/dev/null; wait $TART_PID 2>/dev/null; tart delete "$VM" 2>/dev/null || true' EXIT

step "waiting for the VM to boot"
IP=""
for i in $(seq 1 60); do
  IP=$(tart ip "$VM" 2>/dev/null) && [ -n "$IP" ] && ${SSHP}${IP} true 2>/dev/null && break
  IP=""; sleep 5
done
[ -n "$IP" ] || { echo "✗ VM never became reachable"; exit 1; }
echo "   up at $IP — installing test key"
${SSHP}${IP} "mkdir -p .ssh && chmod 700 .ssh && cat >> .ssh/authorized_keys && chmod 600 .ssh/authorized_keys" < "$KEY.pub"
${SSH}${IP} "sw_vers; uname -m"

step "building the arm64 probe"
swiftc tools/tis-probe.swift -target arm64-apple-macos13.0 -o /tmp/tis-probe-e2e -framework Carbon

step "pkg + probe → VM, install"
# home, not /tmp — macOS clears /tmp on the reboot below
$SCP "$PKG" /tmp/tis-probe-e2e tools/e2e-type-test.applescript admin@${IP}:
${SSH}${IP} "echo admin | sudo -S installer -pkg ~/IPAbet.pkg -target / && echo INSTALLED"
${SSH}${IP} "grep -i ipabet /var/log/install.log | tail -8" || true

step "reboot (the logout/login a real user performs)"
${SSH}${IP} "echo admin | sudo -S shutdown -r now" 2>/dev/null || true
sleep 20
for i in $(seq 1 60); do
  ${SSH}${IP} true 2>/dev/null && break
  sleep 5
done
${SSH}${IP} true || { echo "✗ VM did not come back"; exit 1; }
echo "   rebooted"

step "ASSERT: input method registered on the clean machine"
${SSH}${IP} "~/tis-probe-e2e assert-present"

step "select IPA the way the OS honors it: prefs, then a fresh login"
# TISSelectInputSource refuses outside a real Aqua session (asuser included).
# Writing HIToolbox prefs and logging in again is the legitimate equivalent of
# "added in System Settings" — the login session comes up with IPA selected.
${SSH}${IP} 'defaults write com.apple.HIToolbox AppleEnabledInputSources -array \
  "<dict><key>InputSourceKind</key><string>Keyboard Layout</string><key>KeyboardLayout ID</key><integer>0</integer><key>KeyboardLayout Name</key><string>U.S.</string></dict>" \
  "<dict><key>InputSourceKind</key><string>Keyboard Input Method</string><key>Bundle ID</key><string>org.bikeshaving.inputmethod.IPAbet</string></dict>" \
  "<dict><key>InputSourceKind</key><string>Input Mode</string><key>Bundle ID</key><string>org.bikeshaving.inputmethod.IPAbet</string><key>Input Mode</key><string>org.bikeshaving.inputmethod.IPAbet.IPA</string></dict>"'
${SSH}${IP} 'defaults write com.apple.HIToolbox AppleSelectedInputSources -array \
  "<dict><key>InputSourceKind</key><string>Input Mode</string><key>Bundle ID</key><string>org.bikeshaving.inputmethod.IPAbet</string><key>Input Mode</key><string>org.bikeshaving.inputmethod.IPAbet.IPA</string></dict>"'
echo "   prefs written; rebooting into the selected state"
${SSH}${IP} "sudo shutdown -r now" 2>/dev/null || true
sleep 20
for i in $(seq 1 60); do
  ${SSH}${IP} true 2>/dev/null && break
  sleep 5
done
${SSH}${IP} true || { echo "✗ VM did not come back from second reboot"; exit 1; }
echo "   logged in with IPA selected"

step "selection state after login (verbatim)"
${SSH}${IP} "defaults read com.apple.HIToolbox AppleSelectedInputSources" || true

step "ASSERT: keystrokes become IPA (TextEdit, synthetic keys)"
# The IME launches lazily — on first text-client focus, not at login — so
# TextEdit comes first and the process assertion follows it. A fresh login's
# GUI warmup can starve the VM briefly: retry connections.
vmssh() { local n; for n in 1 2 3 4; do ${SSH}${IP} "$@" && return 0; echo "   (ssh retry $n)"; sleep 8; done; return 1; }
# GUI apps must be launched INTO the auto-login Aqua session: bare ssh context
# gets LaunchServices -10810. launchctl asuser joins that session's bootstrap.
GUI='sudo launchctl asuser $(id -u admin) sudo -u admin'
vmssh "$GUI osascript e2e-type-test.applescript" > /tmp/e2e-typed.txt || true
vmssh "pgrep -fl IPAbet" && echo "   IME process alive" || echo "   (IME process not visible to pgrep)"
OUT=$(tail -1 /tmp/e2e-typed.txt | tr -d '[:space:]')
echo "   typed: '$OUT'"
if [ "$OUT" = "ʃɪp" ]; then
  echo
  echo "✓✓ E2E PASS — clean machine: registered, selectable, and s⇧Hi⇧Hp → ʃɪp"
else
  echo
  echo "✗ E2E FAIL — expected 'ʃɪp', got '$OUT'"
  exit 1
fi
