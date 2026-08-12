#!/bin/bash
# Builds the little ISO that answers Windows setup's questions.
#
# Attach it to the VM as a second CD alongside the Windows installer: setup
# scans attached media for autounattend.xml and, finding it, stops asking.
#
# Usage: ./build-unattend-iso.sh [output.iso]
set -euo pipefail
cd "$(dirname "$0")"

OUT="${1:-$PWD/unattend.iso}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp autounattend.xml "$STAGE/"
hdiutil makehybrid -iso -joliet -default-volume-name UNATTEND -o "$OUT" "$STAGE" >/dev/null
echo "built: $OUT"
