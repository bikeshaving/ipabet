IPAbet is a fast and memorable keyboard for typing the International Phonetic
Alphabet. Report anything that goes wrong at
https://github.com/bikeshaving/ipabet/issues.

## New in 0.1.4

**The Windows installer is signed now.** Earlier releases were unsigned, so
Windows called the publisher unknown and warned hard. This one is signed as
Brian Kim. Windows may still show a "Windows protected your PC" screen for a
while — a brand-new signing identity has no reputation yet, and that builds as
more people install — but it now names the publisher, and the warning fades
over time. Click **More info**, then **Run anyway** if you still see it.

**Typing fixes on every platform:**

- Pressing Backspace right after an emoji, a flag, or some Korean no longer
  deletes only half of it (Windows and Linux).
- On Windows, the rarer IPA superscript letters no longer come out garbled,
  and switching windows in the middle of typing a symbol no longer drops it.
- On Mac, stacking a lot of Option accents at once no longer freezes the
  keyboard.
- Windows on an ARM processor now gets the ARM installer from the download
  button instead of the Intel one.
- On European keyboard layouts, the AltGr symbols like @ and € work again.

**Two new ways to install and stay updated:**

- **Linux:** add the package repository once (below) and IPAbet updates with
  the rest of your system through `apt upgrade` — no more checking back here.
- **Mac:** `brew install --cask bikeshaving/tap/ipabet`.

**Debian 12 is supported now.** The Linux packages install on Debian 12 and
every newer Ubuntu, Debian, and Mint.

## Which file do I download?

You can skip this and use the repository (Linux) or Homebrew (Mac) below, which
also keep IPAbet updated. To download directly:

| Your computer | File |
| --- | --- |
| Windows, Intel or AMD processor | `IPAbet-x64.msi` |
| Windows, ARM processor | `IPAbet-arm64.msi` |
| Mac | `IPAbet.pkg` |
| Ubuntu, Debian or Mint, Intel or AMD processor | `ipabet-ibus-amd64.deb` |
| Ubuntu, Debian or Mint, ARM processor | `ipabet-ibus-arm64.deb` |
| Ubuntu, Debian or Mint with fcitx5, Intel or AMD processor | `ipabet-fcitx5-amd64.deb` |
| Ubuntu, Debian or Mint with fcitx5, ARM processor | `ipabet-fcitx5-arm64.deb` |

On Windows, if you do not know which processor you have, open Settings, go to
System, then About, and read the line called System type.

On Linux, pick an `ipabet-ibus` file unless you know you run fcitx5. IBus is
what Ubuntu, Debian and every GNOME desktop already use.

There is no package for Fedora, Arch or openSUSE yet. Those systems can build
from source: the repository has the steps in `linux/README.md`.

Windows and Linux both install for every account on the machine, so both ask
for an administrator password.

## Windows

1. Download the `.msi` file for your processor.
2. Open it. If Windows shows a "Windows protected your PC" screen, click **More
   info** and **Run anyway** — the file is signed as Brian Kim; the screen is
   SmartScreen waiting for this signing identity to earn a reputation.
3. **Sign out of Windows and sign back in.** Windows only loads a new keyboard
   when you sign in. If you skip this the keyboard will not appear.
4. Press **Windows key + Space** to switch keyboards. Pick IPAbet. The letters
   IPA appear in the tray at the bottom right.
5. Try it in Notepad. Type `t` then `Shift+H` and you get θ. Hold the **Alt key
   to the right of the spacebar**, press `n`, release, then press `a`, and you
   get ã. `Ctrl+Alt` does the same thing if you prefer it.

To remove it, open Settings, go to Apps, find IPAbet, and uninstall.

## Mac

Either install with Homebrew:

```
brew install --cask bikeshaving/tap/ipabet
```

Or download `IPAbet.pkg` and open it. Then, whichever way you installed:

1. **Log out and back in.** macOS registers new input methods at login.
2. Pick **IPA** in the input menu at the top right, or add it under System
   Settings, Keyboard, Input Sources, `+`, English, **IPA**.

The Mac package is signed by Apple's notary service, so it installs without a
warning.

## Linux

The package repository is the easiest way, and it keeps IPAbet updated with the
rest of your system:

```
curl -fsSL https://apt.bikeshaving.org/bikeshaving.gpg | sudo tee /usr/share/keyrings/bikeshaving.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/bikeshaving.gpg] https://apt.bikeshaving.org stable main" | sudo tee /etc/apt/sources.list.d/bikeshaving.list
sudo apt update && sudo apt install ipabet-ibus
```

Or install a downloaded file directly:

```
sudo apt install ./ipabet-ibus-amd64.deb
```

Either way, log out, log back in, and pick IPAbet from the input menu already in
your top bar. Nothing else gets installed, because your system already has IBus.

If you run fcitx5, install `ipabet-fcitx5` instead (it is in the repository too)
and then run `ipabet-register` to add IPAbet to your input method group.

On KDE with Wayland, open System Settings, go to Virtual Keyboard, and choose
IBus Wayland or Fcitx 5, then log back in. KDE will not start an input method
on its own. Typing works without this, but the panel indicator and the keyboard
switch key do not.

## How to type

Unshifted keys type ordinary letters, digits and punctuation, so you can leave
IPAbet on all day. IPA comes from Shift and from the Alt key. The full chart and
a tutorial are at [ipabet.org](https://ipabet.org).

## Checking the files are genuine

Every file was built by a public GitHub Actions run, and GitHub recorded which
commit and which workflow produced it. To check that record:

```
gh attestation verify IPAbet-x64.msi --owner bikeshaving
```

This is optional, and it works on the Windows and Linux downloads. The Mac
package carries Apple's notarization instead, and the Windows installers are
also signed as Brian Kim.
