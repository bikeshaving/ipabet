#!/bin/bash
# The version lives in four files, one per build system, and they have to agree.
# A half-finished bump ships a Mac package and a Windows installer that claim
# different versions, which no other check would notice.
#
# Usage: tools/check-version.sh [expected]
set -euo pipefail
cd "$(dirname "$0")/.."

read_cmake() { sed -n "s/^project([^ ]* VERSION \([0-9.]*\).*/\1/p" "$1"; }
read_plist() {
    sed -n '/CFBundleShortVersionString/{n;s/.*<string>\(.*\)<\/string>.*/\1/p;}' macos/Info.plist
}

FILES="windows/CMakeLists.txt linux/ibus/CMakeLists.txt linux/fcitx5/CMakeLists.txt macos/Info.plist"
first=""
fail=0
for file in $FILES; do
    case "$file" in
        *.plist) version="$(read_plist)" ;;
        *) version="$(read_cmake "$file")" ;;
    esac
    printf '%-32s %s\n' "$file" "${version:-<none>}"
    [ -n "$version" ] || fail=1
    [ -n "$first" ] || first="$version"
    [ "$version" = "$first" ] || fail=1
done

if [ "$fail" != 0 ]; then
    echo "✗ the four version strings do not agree"
    exit 1
fi
if [ $# -gt 0 ] && [ "$1" != "$first" ]; then
    echo "✗ expected $1, the tree says $first"
    exit 1
fi
echo "✓ $first"
