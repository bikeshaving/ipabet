#!/bin/bash
# Build the fcitx5 addon. Run on Linux: ./build.sh [install]
#
# The CMake project builds the Rust engine as part of its own build, so this is
# a thin wrapper over configure-and-build rather than a separate pipeline.
set -euo pipefail
cd "$(dirname "$0")"

BUILD=fcitx5/build

# /usr, not the CMake default of /usr/local: fcitx5 only scans its own prefix
# for addon libraries and manifests, so an addon installed to /usr/local is
# invisible to a distro-packaged daemon no matter how correct it is.
PREFIX="${PREFIX:-/usr}"

cmake -S fcitx5 -B "$BUILD" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="$PREFIX"
cmake --build "$BUILD" --parallel

echo
echo "built: $BUILD/libipabet.so"

if [ "${1:-}" = install ]; then
    sudo cmake --install "$BUILD"
    echo
    echo "Now enable it for your user:  ./ipabet-register"
fi
