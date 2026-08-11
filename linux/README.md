# IPAbet for Linux

Status: **L3 done** — the fcitx5 addon runs, installs as a `.deb`, and parity
vectors replayed as real X11 keystrokes through the whole stack come back
correct on every push (`linux-e2e.yml`, on `ubuntu-latest` under Xvfb).
Wayland and Qt clients are untested, and the gate cannot cover Wayland.

fcitx5 rather than IBus: its plugin API is a C++ class to subclass, its
registration is config files scanned at daemon startup, and it has the better
Wayland trajectory. The cost is real — Ubuntu and GNOME default to IBus, so an
Ubuntu user has to swap input-method frameworks rather than just add a source.
An IBus engine would reuse the same crate, and is worth building when someone
asks for it.

## Layout

- `../engine/` — the Rust crate holding every keystroke decision, shared with
  the Windows port. It loads `spec/ipabet.json` as data at runtime, exactly as
  the macOS IME loads the same file as a bundled resource; the tables are never
  transcribed into code. `serde`/`serde_json` and `unicode-normalization` are
  real crates.io dependencies, compiled once on the maintainer's machine — no
  package manager is involved in what ships to users.
- `fcitx5/src/ipabet.cpp` — the addon. It owns no phonetics: it translates
  fcitx5 key events into the engine's keystroke shape and turns the edit that
  comes back into client text.
- `fcitx5/src/uslayout.h` — X11 keycode to the US label of the physical key.
  IPAbet's tables are keyed by that label, not by what the user's layout
  produces, which is how ⇧5 stays the centralize modifier on any layout.
- `fcitx5/ipabet-addon.conf`, `fcitx5/ipabet-im.conf` — the manifests fcitx5
  scans at startup, installed under `share/fcitx5/`.
- `ipabet-register` — puts IPAbet in the user's input-method group.

## Composition model

The trailing run lives in the preedit rather than being committed straight into
the document. The engine looks back at most two grapheme clusters, so that is
all the preedit ever holds — everything older is committed as soon as the
engine can no longer reach it. Reading and rewriting already-committed text
would need the surrounding-text capability, which many clients (terminals
especially) do not offer; preedit is supported by every fcitx5 frontend.

One consequence worth knowing before touching the addon: the engine's `Pass`
means "the host inserts the key's own character." On a platform that can read
the document back, that is the end of it. Here the preedit buffer is the only
record of the run, so a printable key the engine passes on still keeps
composing, with its native character appended.

## Building

```
./build.sh            # configure + build, engine included
./build.sh install    # and install into /usr (needs sudo)
./ipabet-register     # enable it for your user
./package.sh          # a .deb from the same install tree
```

`/usr`, not CMake's `/usr/local` default: fcitx5 only scans its own prefix for
addon libraries and manifests, so an addon under `/usr/local` is invisible to a
distro-packaged daemon no matter how correct it is.

Run the engine's own tests — no fcitx5, no VM, sub-second — with:

```
cd ../engine && cargo test
```

Regenerate the fixture after any `js/test` change:

```
cd ../js && IPABET_DUMP_VECTORS=1 bun test
```

## The gate

`tools/e2e-test.sh` brings up Xvfb, openbox and fcitx5, then drives
`spec/parity-vectors.json` into a real text entry with `xdotool` and reads the
result back out. It runs locally the same way it runs in CI:

```
./tools/e2e-test.sh 200        # a spread across the vectors
./tools/e2e-test.sh 999 tricky # the labels that are not the key pressed
```

X11 has no consent wall in front of synthetic keystrokes, which is what makes
this possible where the macOS gate documents it as out of reach. The limit is
permanent rather than temporary: Wayland deliberately closes that same hole, so
the path some users are on cannot be driven this way and is not covered.

A vector names a key by the label the engine sees, which is not always the key
a person presses — `|` is typed as ⇧\, `H` as ⇧h. The harness translates label
back to physical keystroke, which is the same translation the addon performs in
reverse, so those cases are worth keeping in the sample rather than skipping.
