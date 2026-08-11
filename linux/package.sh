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

BUILD=fcitx5/build
ROOT=build/pkgroot
[ -f "$BUILD/libipabet.so" ] || { echo "✗ nothing built — run ./build.sh first"; exit 1; }

VERSION="$(sed -n 's/^project(fcitx5-ipabet VERSION \([0-9.]*\).*/\1/p' fcitx5/CMakeLists.txt)"
ARCH="$(dpkg --print-architecture)"
[ -n "$VERSION" ] || { echo "✗ could not read version from fcitx5/CMakeLists.txt"; exit 1; }

rm -rf build
mkdir -p "$ROOT/DEBIAN" "$ROOT/usr/bin"
DESTDIR="$PWD/$ROOT" cmake --install "$BUILD" --prefix /usr >/dev/null
install -m 755 ipabet-register "$ROOT/usr/bin/ipabet-register"

cat > "$ROOT/DEBIAN/control" <<EOF
Package: ipabet-fcitx5
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Depends: fcitx5
Maintainer: Brian Kim <briankimpossible@gmail.com>
Homepage: https://github.com/bikeshaving/ipabet
Description: Type the International Phonetic Alphabet
 An fcitx5 input method for the International Phonetic Alphabet, typed from
 the letters the sounds are named after rather than from a character palette.
EOF

# Enabling an input method is per-user state, and a package installs as root —
# so the package makes IPAbet available and leaves enabling it to the user.
cat > "$ROOT/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
echo "IPAbet installed. Enable it for your user with: ipabet-register"
EOF
chmod 755 "$ROOT/DEBIAN/postinst"

DEB="build/ipabet-fcitx5_${VERSION}_${ARCH}.deb"
dpkg-deb --build --root-owner-group "$ROOT" "$DEB" >/dev/null
echo "packaged: $DEB"
dpkg-deb --contents "$DEB" | awk '{print $NF}'
