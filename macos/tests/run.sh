#!/bin/bash
# The macOS engine's automated coverage. InputController is now a shell over the
# Rust core (engine/), so every harness links the crate's static lib and imports
# its C header. Run from macos/.
#
#  - InputController vs the corpus: the re-shelled controller reproduces the
#    reference behavior the vectors encode.
#  - Rust core vs the corpus (direct, no skips): the core itself is faithful.
#  - InputController vs core, step by step: they agree keystroke for keystroke on
#    committed text and preview (now largely a tautology post-re-shell, kept as a
#    guard against the shell drifting from a direct core call).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== building the engine static lib"
( cd ../engine && cargo build --release )
HDR=../engine/include/ipabet_engine.h
LIB="-L ../engine/target/release -lipabet_engine"
FRAMEWORKS="-framework Cocoa -framework InputMethodKit -framework Carbon -framework IOKit"

fail=0

build_and_run() {  # name  main-source  [extra-sources...]
	local name="$1" mainsrc="$2"; shift 2
	local d; d="$(mktemp -d)"
	cp "$mainsrc" "$d/main.swift"
	# shellcheck disable=SC2086
	swiftc -O -import-objc-header "$HDR" $LIB "$d/main.swift" "$@" $FRAMEWORKS -o "$d/bin"
	cp ../spec/ipabet.json "$d/ipabet.json"
	for vf in parity-vectors fuzz-vectors; do
		echo "== $vf ($name)"
		IPABET_VECTORS="../spec/$vf.json" "$d/bin" || fail=1
	done
}

build_and_run "InputController vs corpus" tests/main.swift Sources/InputController.swift Sources/Debug.swift
build_and_run "Rust core vs corpus" tests/rustcore.swift
build_and_run "InputController vs core, step by step" tests/differential.swift Sources/InputController.swift Sources/Debug.swift

exit $fail
