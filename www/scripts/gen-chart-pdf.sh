#!/bin/bash
# Regenerate the chart PDFs from the live /chart page (one Letter page each), one
# per keystroke spelling: chart.pdf (Mac, also the macOS app's cheat sheet),
# chart-windows.pdf, chart-linux.pdf. Run whenever the chart changes; needs
# Chrome + a free port 7777.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Kill the dev server on ANY exit — under `set -e` a failed Chrome run would
# otherwise leave it holding port 7777, and the next run would render the
# stale orphan into the PDFs with no error.
trap 'pkill -f "shovel develop" || true' EXIT
(npx shovel develop src/server.ts --platform cloudflare >/tmp/chartpdf.log 2>&1 &) ; sleep 5
for mode in mac windows linux; do
  out=src/gen/chart-$mode.pdf
  [ "$mode" = mac ] && out=src/gen/chart.pdf
  "$CHROME" --headless --disable-gpu --no-pdf-header-footer --virtual-time-budget=4000 \
    --print-to-pdf="$out" "http://localhost:7777/chart?keys=$mode"
  echo "wrote $out"
done
