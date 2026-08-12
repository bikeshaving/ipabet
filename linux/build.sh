#!/bin/bash
# Build both input-method shells. Run on Linux: ./build.sh [install]
#
# The engine is the same Rust crate for both; only the shell differs. IBus is
# what GNOME, Ubuntu and Fedora already run, so it is the one most people will
# install. fcitx5 is for people already running fcitx5.
set -euo pipefail
cd "$(dirname "$0")"

# /usr, not CMake's /usr/local default: both frameworks only scan their own
# prefix, so a shell installed under /usr/local is invisible to a distro
# package no matter how correct it is.
PREFIX="${PREFIX:-/usr}"

build() {
    local dir="$1" name="$2"
    if ! cmake -S "$dir" -B "$dir/build" -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX="$PREFIX" >/dev/null; then
        echo "skipping $name — its development headers are not installed"
        return 1
    fi
    cmake --build "$dir/build" --parallel
    echo "built: $dir/build"
}

BUILT=()
build ibus IBus && BUILT+=(ibus)
build fcitx5 fcitx5 && BUILT+=(fcitx5)

if [ ${#BUILT[@]} -eq 0 ]; then
    echo "✗ nothing built — install libibus-1.0-dev or libfcitx5core-dev"
    exit 1
fi

if [ "${1:-}" = install ]; then
    for dir in "${BUILT[@]}"; do
        sudo cmake --install "$dir/build"
    done
    echo
    echo "Log out and back in, then pick IPAbet from your input-method menu."
    if [[ " ${BUILT[*]} " == *" fcitx5 "* ]]; then
        echo "On fcitx5, enable it with: ./ipabet-register"
    fi
fi
