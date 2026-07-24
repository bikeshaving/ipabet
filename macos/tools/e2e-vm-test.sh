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
SSH="sshpass -p admin ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 admin@"
SCP="sshpass -p admin scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

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
  IP=$(tart ip "$VM" 2>/dev/null) && [ -n "$IP" ] && ${SSH}${IP} true 2>/dev/null && break
  IP=""; sleep 5
done
[ -n "$IP" ] || { echo "✗ VM never became reachable"; exit 1; }
echo "   up at $IP"
${SSH}${IP} "sw_vers; uname -m"

step "building the arm64 probe"
swiftc tools/tis-probe.swift -target arm64-apple-macos13.0 -o /tmp/tis-probe-e2e -framework Carbon

step "pkg + probe → VM, install"
# home, not /tmp — macOS clears /tmp on the reboot below
$SCP "$PKG" /tmp/tis-probe-e2e admin@${IP}:
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

step "ASSERT: enable + select (what System Settings' + does)"
# TIS mutations need the user's GUI session context, not the ssh context —
# launchctl asuser joins the console user's bootstrap, as the postinstall does.
${SSH}${IP} "sudo launchctl asuser \$(id -u admin) sudo -u admin \$HOME/tis-probe-e2e enable-select"  # cirrus images: passwordless sudo; -S would starve the nested sudo

step "ASSERT: the cosmetic keylayout registered (Keyboard Viewer correctness)"
${SSH}${IP} "~/tis-probe-e2e list | grep -q 'keylayout.viewer' && echo 'VIEWER LAYOUT REGISTERED' || { echo '✗ viewer layout absent'; exit 1; }"

step "ASSERT: the IME process launches"
sleep 3
${SSH}${IP} "pgrep -fl IPAbet" || { echo "✗ IME process not running after select"; exit 1; }

step "ASSERT: keystrokes become IPA (TextEdit, synthetic keys)"
${SSH}${IP} 'osascript -e "
tell application \"TextEdit\"
  activate
  make new document
end tell
delay 2
tell application \"System Events\"
  keystroke \"s\"
  keystroke \"H\" using shift down
  keystroke \"i\"
  keystroke \"H\" using shift down
  keystroke \"p\"
end tell
delay 1
tell application \"TextEdit\" to get text of document 1
"'
OUT=$(${SSH}${IP} 'osascript -e "tell application \"TextEdit\" to get text of document 1"')
echo "   typed: '$OUT'"
if [ "$OUT" = "ʃɪp" ]; then
  echo
  echo "✓✓ E2E PASS — clean machine: registered, selectable, and s⇧Hi⇧Hp → ʃɪp"
else
  echo
  echo "✗ E2E FAIL — expected 'ʃɪp', got '$OUT'"
  exit 1
fi
