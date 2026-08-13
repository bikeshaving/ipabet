#!/bin/bash
# Package the built addon as a .deb. Run on Linux, after ./build.sh:
#   ./package.sh
#
# The staging tree comes from `cmake --install` under DESTDIR rather than being
# assembled by hand, so the package carries exactly the layout an install
# produces — including the multiarch library directory, which differs per
# architecture and is fcitx5's own answer rather than something to guess at.
set -euo pipefail
cd "$(dirname "$0")"

ARCH="$(dpkg --print-architecture)"
VERSION="$(sed -n 's/^project(ibus-ipabet VERSION \([0-9.]*\).*/\1/p' ibus/CMakeLists.txt)"
[ -n "$VERSION" ] || { echo "✗ could not read version from ibus/CMakeLists.txt"; exit 1; }
rm -rf build
mkdir -p build

# What the built objects actually link, as dpkg dependency syntax.
#
# Without this the package declares only its framework and installs happily on a
# system whose glibc or libibus is older than the one it was built against,
# where it then fails to load. dpkg-shlibdeps reads the ELF headers and says so,
# which turns a runtime mystery into apt refusing the package.
#
# dpkg-shlibdeps insists on a debian/control beside it, so it runs in a throwaway
# tree that has one.
shlib_depends() {
    local root="$1"
    local objects=()
    while IFS= read -r f; do objects+=("$f"); done < <(
        find "$PWD/$root" -type f \( -name '*.so' -o -perm -u+x \) ! -name '*.json' ! -name '*.conf'
    )
    [ ${#objects[@]} -gt 0 ] || return 0

    local tmp
    tmp="$(mktemp -d)"
    mkdir -p "$tmp/debian"
    printf 'Source: ipabet\n\nPackage: ipabet\nArchitecture: any\n' > "$tmp/debian/control"
    (cd "$tmp" && dpkg-shlibdeps -O --ignore-missing-info "${objects[@]}" 2>/dev/null) |
        sed 's/^shlibs:Depends=//'
    rm -rf "$tmp"
}

# One binary package per framework. They install side by side: each ships its
# spec where its own framework looks for it, so neither owns the other's files.
package() {
    local dir="$1" name="$2" depends="$3" blurb="$4"
    [ -d "$dir/build" ] || { echo "skipping $name — not built"; return; }

    local root="build/pkgroot-$name"
    rm -rf "$root"
    mkdir -p "$root/DEBIAN"
    DESTDIR="$PWD/$root" cmake --install "$dir/build" --prefix /usr >/dev/null

    if [ "$name" = ipabet-fcitx5 ]; then
        mkdir -p "$root/usr/bin"
        install -m 755 ipabet-register "$root/usr/bin/ipabet-register"
    fi

    local linked
    linked="$(shlib_depends "$root")"
    if [ -n "$linked" ]; then depends="$depends, $linked"; fi

    cat > "$root/DEBIAN/control" <<EOF
Package: $name
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Depends: $depends
Maintainer: Brian Kim <briankimpossible@gmail.com>
Homepage: https://github.com/bikeshaving/ipabet
Description: Type the International Phonetic Alphabet
 $blurb
EOF

    local deb="build/${name}_${VERSION}_${ARCH}.deb"
    dpkg-deb --build --root-owner-group "$root" "$deb" >/dev/null
    echo "packaged: $deb"
}

package ibus ipabet-ibus ibus \
    "An IBus input method for the International Phonetic Alphabet, typed from
 the letters the sounds are named after rather than from a character palette."
package fcitx5 ipabet-fcitx5 fcitx5 \
    "An fcitx5 input method for the International Phonetic Alphabet, typed from
 the letters the sounds are named after rather than from a character palette."

ls -1 build/*.deb 2>/dev/null || { echo "✗ nothing packaged — run ./build.sh first"; exit 1; }
