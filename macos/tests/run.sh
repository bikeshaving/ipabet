#!/bin/bash
# Replays the shared vector corpus through the real InputController with a mock
# IMKTextInput — the macOS reference implementation's automated coverage, the
# counterpart of the Rust parity test and the JS suite. Run from macos/.
set -euo pipefail
cd "$(dirname "$0")/.."

BIN="$(mktemp -d)/ipabet-vectors"
swiftc -O -o "$BIN" tests/main.swift Sources/InputController.swift Sources/Debug.swift \
	-framework Cocoa -framework InputMethodKit -framework Carbon -framework IOKit

# Tables.shared reads ipabet.json from Bundle.main — for a bare executable that
# is the binary's own directory.
cp ../spec/ipabet.json "$(dirname "$BIN")/ipabet.json"

fail=0
for vf in parity-vectors fuzz-vectors; do
	echo "== $vf"
	IPABET_VECTORS="../spec/$vf.json" "$BIN" || fail=1
done
exit $fail
