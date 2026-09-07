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
	echo "== $vf (InputController)"
	IPABET_VECTORS="../spec/$vf.json" "$BIN" || fail=1
done

# The Rust core, driven from Swift through the C ABI — the acceptance test for
# re-shelling InputController onto it. Host-arch static lib is enough to prove
# the interop; the universal (lipo'd) lib the shipped app needs is a build.sh
# concern that requires the x86_64-apple-darwin rustc target.
echo "== building the engine static lib"
( cd ../engine && cargo build --release )
RC="$(mktemp -d)/ipabet-rustcore"
swiftc -O -import-objc-header ../engine/include/ipabet_engine.h \
	-L ../engine/target/release -lipabet_engine tests/rustcore.swift -o "$RC"
for vf in parity-vectors fuzz-vectors; do
	echo "== $vf (Rust core via C ABI)"
	IPABET_VECTORS="../spec/$vf.json" "$RC" || fail=1
done
exit $fail
