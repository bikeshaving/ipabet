IPAbet is a keyboard for the International Phonetic Alphabet. It is a preview
release, so expect rough edges and please report them.

## Which file do I download?

| Your computer | File |
| --- | --- |
| Windows, Intel or AMD processor | `IPAbet-x64.msi` |
| Windows, ARM processor | `IPAbet-arm64.msi` |
| Mac | `IPAbet.pkg` |
| Linux, Intel or AMD processor | `ipabet-ibus-amd64.deb` |
| Linux, ARM processor | `ipabet-ibus-arm64.deb` |
| Linux with fcitx5, Intel or AMD processor | `ipabet-fcitx5-amd64.deb` |
| Linux with fcitx5, ARM processor | `ipabet-fcitx5-arm64.deb` |

On Windows, if you do not know which processor you have, open Settings, go to
System, then About, and read the line called System type.

On Linux, pick an `ipabet-ibus` file unless you know you run fcitx5. IBus is
what Ubuntu, Debian, Fedora and every GNOME desktop already use.

## Windows

1. Download the `.msi` file for your processor.
2. Open it. Windows will warn you that it does not recognize the file, and may
   warn more than once. This release is not signed with a certificate yet, so
   there is nothing for Windows to recognize. Keep the file and run it anyway.
3. **Sign out of Windows and sign back in.** Windows only loads a new keyboard
   when you sign in. If you skip this the keyboard will not appear.
4. Press **Windows key + Space** to switch keyboards. Pick IPAbet. The letters
   IPA appear in the tray at the bottom right.
5. Try it in Notepad. Type `t` then `Shift+H` and you get θ. Hold the **Alt key
   to the right of the spacebar**, press `n`, release, then press `a`, and you
   get ã. `Ctrl+Alt` does the same thing if you prefer it.

To remove it, open Settings, go to Apps, find IPAbet, and uninstall.

## Mac

1. Download `IPAbet.pkg` and open it.
2. **Log out and back in.** macOS registers new input methods at login.
3. Pick **IPA** in the input menu at the top right, or add it under System
   Settings, Keyboard, Input Sources, `+`, English, **IPA**.

The Mac package is signed by Apple's notary service, so it installs without a
warning.

## Linux

```
sudo apt install ./ipabet-ibus-amd64.deb
```

Log out, log back in, and pick IPAbet from the input menu already in your top
bar. Nothing else gets installed, because your system already has IBus.

If you run fcitx5, install `ipabet-fcitx5-amd64.deb` instead and then run
`ipabet-register` to add IPAbet to your input method group.

On KDE with Wayland, open System Settings, go to Virtual Keyboard, and choose
IBus Wayland or Fcitx 5, then log back in. KDE will not start an input method
on its own. Typing works without this, but the panel indicator and the keyboard
switch key do not.

## How to type

Unshifted keys type ordinary letters, digits and punctuation, so you can leave
IPAbet on all day. IPA comes from Shift and from the Alt key. The full chart and
a tutorial are at [ipabet.org](https://ipabet.org).

## Checking the files are genuine

Each file was built by a public GitHub Actions run, and GitHub recorded which
commit and which workflow produced it. If you want to check that record:

```
gh attestation verify IPAbet-x64.msi --owner bikeshaving
```

This is optional. It is a substitute for a code signing certificate on Windows
and Linux, which this project does not have yet.
