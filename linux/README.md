# IPAbet for Linux

Two input-method shells over one engine. Neither owns any phonetics: each
translates its framework's key events into the shape the Rust crate in
`engine/` expects, and turns the edit that comes back into client text.

## Install

```sh
sudo apt install ./ipabet-ibus_0.1.2_amd64.deb
```

Log out, log back in, pick IPAbet from the input menu.

**IBus is what ships** — GNOME, Ubuntu and Fedora already run it, so nothing
has to be installed or switched first. `ipabet-fcitx5` is a second package for
people already on fcitx5. The two install side by side and neither owns the
other's files. fcitx5 needs one extra step: `./ipabet-register` adds IPAbet to
the input-method group.

**KDE Wayland needs the compositor to launch the input method**, whichever
framework you use, and does not do it on its own. System Settings → Virtual
Keyboard → IBus Wayland or Fcitx 5, then log back in. Skipping it costs the
panel indicator and the toggle key; typing works either way. GNOME does it
itself.

## Layout

- `ibus/src/engine.c` — the IBus engine, and what the shipped package installs.
- `fcitx5/src/ipabet.cpp` — the fcitx5 addon.
- `fcitx5/*.conf` — the manifests fcitx5 scans at startup, installed under
  `share/fcitx5/`.
- `common/uslayout.h` — X11 keycode → US label of the physical key. Plain C,
  because one shell is C and the other C++. IPAbet's tables are keyed by that
  label, not by what the user's layout produces, so ⇧5 stays the centralize
  modifier on any layout.
- `ipabet-register` — puts IPAbet in the user's input-method group.

## Composition model

The trailing two clusters stay in the preedit, because a Linux client cannot be
read back. `Edit::Pass` means the host inserts the key's own character; here the
preedit is the only record of the run, so a passed printable key keeps composing
with its native character appended. Dropping it loses the digit in `5` `⇧H`.

`Edit::Replace.length` is a codepoint count.

## Build

```sh
./build.sh            # both shells; skips either if its headers are missing
./build.sh install    # into /usr (needs sudo)
./package.sh          # one .deb per shell
```

`/usr`, not CMake's `/usr/local`: fcitx5 only scans its own prefix, so an addon
under `/usr/local` is invisible to a distro-packaged daemon.

## Gate

`tools/e2e-test.sh` brings up Xvfb, openbox and the framework, drives
`spec/parity-vectors.json` into a real text entry with `xdotool`, and reads the
result back.

```sh
./tools/e2e-test.sh 200        # a spread across the vectors
./tools/e2e-test.sh 999 tricky # labels that are not the key pressed
```

Both shells run the same vectors, one CI matrix leg each. fcitx5 filters
modifier keys before handing them over and IBus does not, so ⌥ pressed alone
ended the run and threw away an armed diacritic — a bug in one shell only,
found because the other passed.

X11 has no consent wall in front of synthetic input. Wayland closes that hole,
so the gate cannot drive it and Wayland is checked by hand. With
`GTK_IM_MODULE=ibus` the client talks to IBus over D-Bus and the compositor is
not in the protocol at all, so the engine sees the same evdev keycode either
way.

`wtype` cannot drive this: it synthesises a keymap and assigns keysyms to
arbitrary keycodes, and IPAbet reads the physical keycode. `ydotool` injects
through uinput and would carry real ones.

A vector names a key by the label the engine sees, not the key a person presses
— `|` is ⇧\, `H` is ⇧h. The harness does that translation in reverse of what
the shells do, so those cases are worth sampling rather than skipping.
