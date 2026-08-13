# Releasing IPAbet

Four version strings, three platforms, one tag. This is the order that works.

## Versioning

Semantic versioning. While the major is 0, the keystroke layout can still
change between minors, and does — a minor is where a glyph moves. A patch is a
fix to a port, a packaging change, or a website change.

The version lives in four files and they must agree:

- `windows/CMakeLists.txt`
- `linux/ibus/CMakeLists.txt`
- `linux/fcitx5/CMakeLists.txt`
- `macos/Info.plist`

`tools/check-version.sh` reads all four and fails if they differ. CI runs it on
every push, so a half-finished bump is a red build rather than a release where
the Mac package and the Windows installer claim different versions.

## The rule

`main` is always releasable, and a tag is only ever cut from a green `main`.
Every gate runs on every push. There is no release branch, no freeze, and no
batching: one idea per commit, and a release is a tag on whatever is there.

## A preview

For anything that needs testing on a real machine before people see it.

1. Tag: `git tag v0.1.3-beta.1 && git push origin v0.1.3-beta.1`
2. `release.yml` builds both Windows installers and all four debs, attaches a
   provenance attestation to each, and stops at a **draft prerelease**.
3. Build the Mac package by hand — notarization needs the keychain:
   `cd macos && ./package.sh`
4. Attach it: `gh release upload v0.1.3-beta.1 macos/build/IPAbet.pkg`
5. Publish: `gh release edit v0.1.3-beta.1 --draft=false`

A tag with a suffix is marked as a prerelease, which GitHub excludes from
`releases/latest`. The website links through `latest`, so a preview cannot
change what ipabet.org hands to a stranger.

## A release

1. Bump all four version strings in one commit. Push. Wait for green.
2. Tag `v0.1.3`, with no suffix. Same build, same draft.
3. Build and attach the Mac package, as above.
4. Read the draft's notes — `.github/release-notes.md` — and check that the
   file table matches the files actually attached.
5. Publish.
6. **Then** deploy the website: `cd www && npm run deploy`.

Step 6 comes last and the order is not a preference. The site's download links
resolve through `releases/latest/download/<file>`, so deploying before the
release is published points every download button at a file that does not
exist.

7. Check the links, from outside the machine that built them:

```
curl -sI -o /dev/null -w '%{http_code}\n' -L https://ipabet.org/download/windows
curl -sI -o /dev/null -w '%{http_code}\n' -L https://ipabet.org/download/linux
curl -sI -o /dev/null -w '%{http_code}\n' -L https://ipabet.org/download/macos
```

## What each gate covers

| Gate | Answers |
| --- | --- |
| `windows-parity` | The engine agrees with the reference on 3825 vectors, on both architectures |
| `windows-build` | The DLL links, needs no redistributable, and carries its tray icon |
| `windows-registration` | absent → register → present → unregister → absent |
| `windows-installer` | Installs, registers, reinstalls without duplicating, upgrades over the last published release, uninstalls clean — both architectures |
| `windows-typing` | Real keystrokes into real Notepad, including both spellings of the diacritic key |
| `linux-package` | The deb declares what it links, and installs on 22.04, 24.04 and Debian 12 |
| `linux-e2e` | Real keystrokes into a real text entry, on IBus and on fcitx5 |
| `macos-build` | Both architecture slices, the bundled spec, and registration |

What no gate covers, and therefore what a human checks before a non-preview
release:

- **Wayland.** X11 grants synthetic input ambient trust and Wayland closes that
  hole deliberately, so the Linux gate cannot drive it.
- **macOS typing.** Accessibility consent cannot be granted on a runner.
- **Windows on ARM typing.** The ARM runners will not yield the foreground, so
  the typing gate is x64 only. The engine and the installer are gated on both.

## Signing

macOS is signed and notarized. Windows and Linux are not, and Windows says so
loudly — see `windows/README.md`.
