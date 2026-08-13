#!/bin/bash
# Drive parity vectors into a real text entry through the real fcitx5 stack.
#
# Everything upstream of the client is under test: xdotool's synthetic X11
# events, the GTK input-method module, the fcitx5 daemon, the addon, and the
# engine. What the entry ends up holding is what a user would have got.
#
# X11 only, and that is a real limit rather than a temporary one. Synthetic
# input works here because X11 extends ambient trust to any client on the
# display; Wayland deliberately closes that hole, so the path some users are on
# cannot be driven this way.
#
# Usage: e2e-test.sh [count|"tricky"]
set -euo pipefail
cd "$(dirname "$0")"

COUNT="${1:-200}"
export DISPLAY="${DISPLAY:-:99}"
export GTK_IM_MODULE=fcitx
export XMODIFIERS=@im=fcitx

cleanup() {
    pkill -f test-entry.py 2>/dev/null || true
    pkill -x fcitx5 2>/dev/null || true
    pkill -x openbox 2>/dev/null || true
    pkill -f "Xvfb $DISPLAY" 2>/dev/null || true
}
trap cleanup EXIT

cleanup
sleep 1
rm -f "/tmp/.X${DISPLAY#:}-lock"

Xvfb "$DISPLAY" -screen 0 1280x800x24 >/tmp/xvfb.log 2>&1 &
sleep 2
# A window manager, because focus and activation are its job and xdotool's
# window activation is unreliable without one.
openbox >/tmp/openbox.log 2>&1 &
sleep 1

# fcitx5 rewrites the profile from memory when it saves, so it has to be down
# while the profile is written or the edit is lost the moment it exits.
mkdir -p ~/.config/fcitx5
cat > ~/.config/fcitx5/profile <<'PROFILE'
[Groups/0]
Name=Default
Default Layout=us
DefaultIM=ipabet

[Groups/0/Items/0]
Name=keyboard-us
Layout=

[Groups/0/Items/1]
Name=ipabet
Layout=

[GroupOrder]
0=Default
PROFILE

fcitx5 --verbose '*=4' >/tmp/fcitx5.log 2>&1 &
sleep 5

if ! grep -q "Loaded addon ipabet" /tmp/fcitx5.log; then
    echo "FAIL: fcitx5 did not load the addon"
    tail -30 /tmp/fcitx5.log
    exit 1
fi

rm -f /tmp/entry-wid.txt
python3 test-entry.py >/tmp/entry.log 2>&1 &
ENTRY_PID=$!

# Polled rather than slept at: how long a GTK client takes to map its window
# depends on what its input-method module does at startup, and a fixed wait
# turns a slow start into a failure that reads like a broken input method.
WID=""
for _ in $(seq 1 40); do
    # `|| true`, because set -e kills the script the moment neither lookup
    # finds anything -- which is every iteration before the window maps, and
    # takes the diagnostic below down with it.
    WID=$(cat /tmp/entry-wid.txt 2>/dev/null || xdotool search --name ipabet-test-entry 2>/dev/null | head -1) || true
    [ -n "$WID" ] && break
    kill -0 "$ENTRY_PID" 2>/dev/null || break
    sleep 0.5
done
if [ -z "$WID" ]; then
    echo "FAIL: no text entry to type into after 20s"
    cat /tmp/entry.log
    exit 1
fi
xdotool windowactivate --sync "$WID"
sleep 1
xdotool key --clearmodifiers ctrl+space
sleep 1

python3 xtype-vectors.py "$COUNT" "${2:-}"
