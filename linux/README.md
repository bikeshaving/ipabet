# IPAbet for Linux

Status: **done** — two shells over one engine, both gated on every push, and
confirmed by hand on KDE Plasma Wayland in a Qt application.

## Install

```
sudo apt install ./ipabet-ibus_0.1.2_amd64.deb
```

Log out, log back in, and pick IPAbet from the input menu already in your top
bar. Three steps, the same as macOS and Windows.

**IBus is what ships**, because it is what GNOME, Ubuntu and Fedora already
run — there is no framework to install or switch first. A second package,
`ipabet-fcitx5`, is there for people already running fcitx5; the two install
side by side and neither owns the other's files.

A fcitx5 user needs one extra step an IBus user does not: run
`./ipabet-register` to add IPAbet to the input-method group.

**KDE Wayland asks for one more thing, whichever framework you use.** The
compositor has to launch the input method for the Wayland input-method protocol
to work, and KDE does not do it on its own — both IBus and fcitx5 pop up a
notification saying so. System Settings → Virtual Keyboard → **IBus Wayland**
or **Fcitx 5**, then log back in. Ignoring it is survivable: typing works in Qt
and GTK applications either way, and what you lose is the panel indicator and
the toggle key. GNOME launches IBus itself, so nothing there needs doing.

## Layout

- `../engine/` — the Rust crate holding every keystroke decision, shared with
  the Windows port and both Linux shells. It loads `spec/ipabet.json` as data at runtime, exactly as
  the macOS IME loads the same file as a bundled resource; the tables are never
  transcribed into code. `serde`/`serde_json` and `unicode-normalization` are
  real crates.io dependencies, compiled once on the maintainer's machine — no
  package manager is involved in what ships to users.
- `ibus/src/engine.c` — the IBus engine, and what the shipped package installs.
- `fcitx5/src/ipabet.cpp` — the fcitx5 addon. Neither shell owns any phonetics:
  each translates its framework's key events into the engine's keystroke shape
  and turns the edit that comes back into client text.
- `common/uslayout.h` — X11 keycode to the US label of the physical key, shared
  by both shells and plain C because one is C++ and the other is C.
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
./build.sh            # both shells, engine included; skips either if its
                      # development headers are missing
./build.sh install    # and install into /usr (needs sudo)
./package.sh          # one .deb per shell
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

Both shells run the same vectors, one CI matrix leg each. That is not
belt-and-braces: fcitx5 filters modifier keys before handing them over and IBus
does not, so ⌥ pressed on its own ended the run and threw away an armed
diacritic — a bug that existed only in the IBus shell and only showed up
because the other one passed.

X11 has no consent wall in front of synthetic keystrokes, which is what makes
this possible where the macOS gate documents it as out of reach. Wayland closes
that same hole deliberately, so the gate cannot drive it and Wayland is checked
by hand instead: both shells confirmed on Plasma Wayland in Qt clients on
2026-08-12, IBus in the Plasma launcher itself.

The gap that leaves is smaller than it looks. With `GTK_IM_MODULE=ibus` the
client talks to IBus over D-Bus and the compositor is not in the input-method
protocol at all, so the engine sees the same evdev keycode either way — what
differs between X11 and Wayland is upstream of anything here.

`wtype` looks like the answer for driving Wayland and is not: it synthesises
its own keymap and assigns keysyms to arbitrary keycodes, and IPAbet reads the
physical keycode to know which key was pressed. Its keycodes mean nothing here.
`ydotool` injects through uinput and would carry real ones, if this is ever
worth automating.

A vector names a key by the label the engine sees, which is not always the key
a person presses — `|` is typed as ⇧\, `H` as ⇧h. The harness translates label
back to physical keystroke, which is the same translation the addon performs in
reverse, so those cases are worth keeping in the sample rather than skipping.
