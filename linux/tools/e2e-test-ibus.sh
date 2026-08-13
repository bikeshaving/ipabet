#!/bin/bash
# Drive parity vectors into a real text entry through the real IBus stack.
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
export GTK_IM_MODULE=ibus
export XMODIFIERS=@im=ibus
export QT_IM_MODULE=ibus

cleanup() {
    pkill -f test-entry.py 2>/dev/null || true
    pkill -f ibus-daemon 2>/dev/null || true
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

# The daemon reads /usr/share/ibus/component at startup; installing the file is
# the whole of registering, which is the point of shipping IBus.
ibus-daemon -drx >/tmp/ibus.log 2>&1
sleep 5

if ! ibus list-engine 2>/dev/null | grep -q ipabet; then
    echo "FAIL: ibus does not know about ipabet"
    ibus list-engine 2>&1 | head -20
    exit 1
fi
ibus engine ipabet
sleep 1
echo "active engine: $(ibus engine)"

rm -f /tmp/entry-wid.txt
python3 test-entry.py >/tmp/entry.log 2>&1 &
ENTRY_PID=$!

# Polled rather than slept at: how long a GTK client takes to map its window
# depends on what its input-method module does at startup, and a fixed wait
# turns a slow start into a failure that reads like a broken input method.
WID=""
for _ in $(seq 1 40); do
    WID=$(cat /tmp/entry-wid.txt 2>/dev/null || xdotool search --name ipabet-test-entry 2>/dev/null | head -1)
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

python3 xtype-vectors.py "$COUNT" "${2:-}"
