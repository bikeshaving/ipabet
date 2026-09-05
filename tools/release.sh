#!/bin/bash
# The human half of a release, in one sitting. CI owns the other half: the
# tag builds the signed MSIs and the debs and stops at a draft. This script
# does everything that needs a key that lives only on this machine — the
# notarized Mac package (keychain) and the apt repository (GPG) — plus the
# tagging and publishing around it.
#
# Usage: tools/release.sh 0.1.4        (or 0.1.4-beta.1 for a prerelease)
#
# Run it after the version bump is committed, pushed, and green. It prompts
# once for the notarization keychain and once for the GPG passphrase, and
# takes a few minutes at each of the two waits (CI build, notarization).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?usage: tools/release.sh <version, e.g. 0.1.4 or 0.1.4-beta.1>}"
TAG="v$VERSION"
BARE="${VERSION%%-*}"
REPO=bikeshaving/ipabet

echo "== Preflight"
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = main ] || { echo "on '$branch', not main"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean"; exit 1; }
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
    || { echo "HEAD is not origin/main — push (or pull) first"; exit 1; }
./tools/check-version.sh "$BARE"

sha=$(git rev-parse HEAD)
echo "== CI at $sha"
tries=0
while true; do
    runs=$(gh run list --repo "$REPO" --commit "$sha" \
        --json status,conclusion,workflowName \
        --jq '.[] | "\(.status) \(.conclusion) \(.workflowName)"')
    if [ -z "$runs" ]; then
        tries=$((tries + 1))
        if [ "$tries" -ge 4 ]; then
            # Every workflow has a paths filter, so a HEAD that touched only
            # unwatched files (docs, tools) ran nothing. The green-main rule
            # then rests on the runs before it — show them, ask.
            echo "no CI ran for this commit. The latest runs on main:"
            gh run list --repo "$REPO" --branch main --limit 8
            printf "Is main green? [y/N] "
            read -r ok
            [ "$ok" = y ] || exit 1
            break
        fi
        echo "no CI runs for HEAD yet; waiting"
        sleep 15
        continue
    fi
    echo "$runs" | grep -v "^completed" || true
    if echo "$runs" | grep "^completed" | grep -qv "success"; then
        echo "a workflow failed on HEAD — a tag only comes off a green main"
        exit 1
    fi
    echo "$runs" | grep -q -v "^completed" || break
    sleep 20
done
echo "all green"

case "$TAG" in
*-*) ;;
*)
    # README, "Releasing": the three things no gate covers.
    echo
    echo "Hand checks for a non-prerelease: Wayland typing, macOS typing,"
    printf "Windows-on-ARM typing. Done all three? [y/N] "
    read -r ok
    [ "$ok" = y ] || exit 1
    ;;
esac

echo "== Tag $TAG"
git tag "$TAG"
git push origin "$TAG"

echo "== Waiting for CI to build and sign the draft"
run_id=""
until [ -n "$run_id" ]; do
    sleep 10
    run_id=$(gh run list --repo "$REPO" --workflow release.yml --branch "$TAG" \
        --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)
done
gh run watch "$run_id" --repo "$REPO" --exit-status

echo "== Mac package (keychain + notarization)"
(cd macos && ./package.sh)
gh release upload "$TAG" --repo "$REPO" macos/build/IPAbet.pkg

echo "== Publish"
gh release edit "$TAG" --repo "$REPO" --draft=false

case "$TAG" in
*-*) echo "== Homebrew cask: skipped for a prerelease" ;;
*)
    echo "== Homebrew cask"
    pkg_sha=$(shasum -a 256 macos/build/IPAbet.pkg | cut -d' ' -f1)
    tap=$(mktemp -d)
    gh repo clone bikeshaving/homebrew-tap "$tap" -- -q
    sed -i '' \
        -e "s/version \"[^\"]*\"/version \"$VERSION\"/" \
        -e "s/sha256 \"[^\"]*\"/sha256 \"$pkg_sha\"/" \
        "$tap/Casks/ipabet.rb"
    git -C "$tap" commit -aqm "ipabet $VERSION"
    git -C "$tap" push -q
    rm -rf "$tap"
    ;;
esac

echo "== Apt repository (GPG passphrase)"
./tools/apt/build.sh
(cd tools/apt && npx wrangler deploy)

echo
echo "$TAG is out. The site deploys itself on push; check a download:"
echo "  https://ipabet.org/download"
