# Testing IPAbet on Windows without sitting through Windows

Verifying a Windows build means having Windows, and tart cannot run it. This
makes the part that costs an afternoon — installing it — into something you
start and walk away from.

## What you do

**1. Get an ARM64 installer.** Open **CrystalFetch** (`brew install --cask
crystalfetch`). It downloads Windows installation files from Microsoft's own
servers — the same ESD endpoints Microsoft's Media Creation Tool uses — and
builds them into an ISO. It exists because Microsoft publishes ARM64 Windows
only as those files, never as a plain ISO. Pick Windows 11, ARM64, your
language.

**2. Build the answer file ISO.**

```
./build-unattend-iso.sh
```

**3. Create the VM.** UTM → **+** → **Virtualize** → **Windows**. Point it at
the Windows ISO. Then, before starting it, add the unattend ISO as a second CD
drive in the VM's settings. 4GB memory, 40GB disk.

**4. Start it, and come back later.**

## What you get back

A logged-in Windows desktop with IPAbet already installed and Notepad already
open. Type `t` then `⇧H`; you want `θ`.

`autounattend.xml` answers every question setup asks — product key, edition,
partitioning, the account screens, the privacy carousel — creates a passwordless
local administrator, logs it in, downloads IPAbet from the published release and
installs it silently.

## Why the machine is disposable

No password, auto logon, no product key, and the Windows 11 hardware checks
switched off. It exists to answer whether IPAbet types correctly in real
applications and then to be deleted. Do not keep it, and do not put anything in
it you would miss.

## What this is actually for

Typing is already gated in CI on every push: real keystrokes, real text
service, real Notepad. What CI cannot reach is **other applications** — Word,
browsers, Electron — where each client implements the text services framework
its own way. That is the question this VM answers, and it is the last one on
Windows that a machine cannot.
