#!/bin/bash
# IPAbet IME debug-logging control. The IME logs per-keystroke decisions to
# ~/Library/Logs/IPAbet.log when the sentinel ~/.ipabet-debug exists.
#
#   tools/debug.sh on      # enable (then click into the app you're testing)
#   tools/debug.sh off     # disable
#   tools/debug.sh tail    # follow the log live
#   tools/debug.sh clear   # truncate the log
#   tools/debug.sh cat     # dump the log
#
# The flag refreshes on focus change (activateServer), so `on`/`off` take
# effect the next time you switch into a text field — no reinstall needed.
set -euo pipefail
# The IME is App-Sandboxed: its home-relative paths resolve into the app
# container, so the sentinel and log live there — not in the real $HOME.
DATA="$HOME/Library/Containers/org.bikeshaving.inputmethod.IPAbet/Data"
LOG="$DATA/Library/Logs/IPAbet.log"
SENTINEL="$DATA/.ipabet-debug"

case "${1:-tail}" in
  on)    touch "$SENTINEL"
         echo "debug ON → switch focus into the app under test to activate."
         echo "log: $LOG" ;;
  off)   rm -f "$SENTINEL"; echo "debug OFF" ;;
  tail)  echo "tailing $LOG  (Ctrl-C to stop)"; touch "$LOG"; tail -f "$LOG" ;;
  clear) : > "$LOG"; echo "cleared $LOG" ;;
  cat)   [ -f "$LOG" ] && cat "$LOG" || echo "(no log yet)" ;;
  *)     echo "usage: debug.sh [on|off|tail|clear|cat]"; exit 1 ;;
esac
