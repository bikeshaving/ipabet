# Security

An input method sees every keystroke, so IPAbet is built to need as little
trust as possible, and to make what remains verifiable.

## What constrains the input method

- The keystroke-handling binary runs under the macOS App Sandbox with **zero
  network entitlements**. The OS denies it network access; this is enforced by
  macOS, not promised by us.
- **No third-party dependencies.** The macOS input method is compiled from
  first-party Swift against system frameworks only — no package manager is
  involved in the binary users install. This is policy, not accident.
- **Release builds contain no logging code.** The debug logger is compiled out
  of releases entirely (verifiable with `strings`); debug builds are published
  only as GitHub prereleases.
- One binary in the bundle, `ipabet-register`, runs unsandboxed by necessity
  (input-source registration writes session preferences the sandbox would
  redirect). It is deliberately small; changes to it get extra scrutiny.

## Release integrity

Every release is built on the maintainer's machine, install-tested in a
disposable clean-VM gate, signed with a Developer ID certificate that never
leaves that machine, notarized by Apple, and stapled. Gatekeeper will refuse a
package that was not signed and notarized this way — including a tampered
asset uploaded by a compromised GitHub account.

To verify a downloaded package yourself:

```
spctl -a -vv -t install IPAbet.pkg   # expect: accepted, Notarized Developer ID: Brian Kim (2R9XM4BRFZ)
shasum -a 256 IPAbet.pkg             # compare against the checksum in the release notes
```

## Reporting

Please report suspected vulnerabilities privately via GitHub's private
vulnerability reporting on this repository rather than a public issue.
