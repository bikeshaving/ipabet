#!/bin/bash
# Regenerate www/src/gen/chart.pdf from the live /chart page (one Letter page).
# Run whenever the chart changes; needs Chrome + a running dev server.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
(npx shovel develop src/server.ts --platform cloudflare >/tmp/chartpdf.log 2>&1 &) ; sleep 5
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=src/gen/chart.pdf "http://localhost:7777/chart"
pkill -f "shovel develop" || true
echo "wrote src/gen/chart.pdf"
