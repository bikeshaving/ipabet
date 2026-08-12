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

**3. Create the VM.** UTM → **+** → **Virtualize** → **Windows**. Take that
path even though the answer file makes some of what it configures redundant —
UTM's "Other" classification gives Linux-shaped defaults, and every one of them
is a wall further down:

| Setting | Windows template | "Other" |
|---|---|---|
| Storage interface | NVMe | **VirtIO — Windows cannot see it at all** |
| TPM 2.0, Secure Boot | present | absent, so setup refuses |
| Disk size | 64 GB | 40 GB, below the minimum setup checks |

4GB memory. Then, before starting it, add the unattend ISO as a second drive:
Settings → **New Drive** → **Removable**, interface **USB**. Never IDE or SATA —
the ARM machine has no such bus and QEMU refuses to start.

**4. Start it, and come back later.**

## What you get back

A logged-in Windows desktop with IPAbet already installed and Notepad already
open. Type `t` then `⇧H`; you want `θ`.

`autounattend.xml` answers every question setup asks — product key, edition,
partitioning, the account screens, the privacy carousel — creates a passwordless
local administrator, logs it in, downloads IPAbet from the published release and
installs it silently.

## When it drops to a UEFI shell

Windows install media waits about five seconds on *"Press any key to boot from
CD"* and then gives up. Click into the window and press something. If it has
already fallen through, `fs1:` then `cd efi\boot` then `bootaa64.efi` boots it
by hand — check with `ls` first, since the volume numbering moves around.

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
