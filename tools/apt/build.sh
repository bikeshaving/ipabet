#!/bin/sh
set -eu
cd "$(dirname "$0")"

# The bikeshaving apt repository: debs from the latest published GitHub
# release, indexed and signed into a static tree under public/, ready for
# `npx wrangler deploy`. Signing prompts for the passphrase of the local
# "Bike Shaving apt repository" key — this script is meant to be run by a
# person, never CI.

KEY=3019CB51FCD7B73E6D97B9B266044CE799073D97
GH_REPO=bikeshaving/ipabet
ARCHES="amd64 arm64"

rm -rf public tmp
mkdir -p tmp public/pool/main
cp index.html public/

gh release download --repo "$GH_REPO" --pattern '*.deb' --dir tmp

# The GPG signature below launders whatever is signed into something every
# apt client trusts, so first prove each deb is the byte-exact output of
# this repository's CI — the attestation release.yml attached to it.
# The identity regex pins the attestation to the release workflow on a
# version tag — an attestation minted by any other workflow or ref of the
# same repository does not count.
for f in tmp/*.deb; do
	gh attestation verify "$f" --repo "$GH_REPO" \
		--cert-identity-regex "^https://github\.com/$GH_REPO/\.github/workflows/release\.yml@refs/tags/v" \
		>/dev/null
	echo "attestation verified: $(basename "$f")"
done

# Release assets carry version-less names for stable URLs; the pool restores
# the name_version_arch convention from each deb's own control fields.
for f in tmp/*.deb; do
	pkg=$(dpkg-deb -f "$f" Package)
	ver=$(dpkg-deb -f "$f" Version)
	arch=$(dpkg-deb -f "$f" Architecture)
	cp "$f" "public/pool/main/${pkg}_${ver}_${arch}.deb"
done

cd public
for arch in $ARCHES; do
	mkdir -p "dists/stable/main/binary-$arch"
	dpkg-scanpackages --arch "$arch" pool > "dists/stable/main/binary-$arch/Packages"
	gzip -9 -kf "dists/stable/main/binary-$arch/Packages"
done

cd dists/stable
{
	echo "Origin: Bike Shaving"
	echo "Label: Bike Shaving"
	echo "Suite: stable"
	echo "Codename: stable"
	echo "Architectures: $ARCHES"
	echo "Components: main"
	echo "Date: $(date -u '+%a, %d %b %Y %H:%M:%S UTC')"
	echo "SHA256:"
	find main -type f | sort | while read -r f; do
		printf ' %s %16d %s\n' "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$(wc -c < "$f")" "$f"
	done
} > Release

gpg --local-user "$KEY" --batch --yes --armor --detach-sign --output Release.gpg Release
gpg --local-user "$KEY" --batch --yes --clearsign --output InRelease Release
cd ../..

gpg --export --armor "$KEY" > bikeshaving.asc
gpg --export "$KEY" > bikeshaving.gpg

echo
echo "Repository built in tools/apt/public — deploy with: cd tools/apt && npx wrangler deploy"
