# IPAbet for Linux

Two input-method shells over one engine. Neither owns any phonetics: each
translates its framework's key events into the shape the Rust crate in
`engine/` expects, and turns the edit that comes back into client text.

## Install

```sh
sudo apt install ./ipabet-ibus-amd64.deb
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
