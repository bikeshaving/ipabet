# Can synthetic keystrokes drive a real Windows text field, on this machine?
#
# This asks nothing about IPAbet. It asks whether the harness a Windows E2E gate
# would be built on works at all here — SendInput at the bottom of the input
# stack, a real focused window, and the text read back out of the control. The
# answer decides whether the Windows port can be gated in CI the way the Linux
# one is, or whether it needs an interactive VM.
#
# Scancode injection, not KEYEVENTF_UNICODE: Unicode injection hands a character
# straight to the target and skips the keyboard layout and the text services
# that sit above it, which are exactly the layers a text service lives in.
#
# Exit 0 if the field received what was typed, 1 otherwise.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class Input {
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT {
        public ushort wVk, wScan;
        public uint dwFlags, time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT {
        public uint type;
        public KEYBDINPUT ki;
        // KEYBDINPUT is the smallest member of the union; pad out to MOUSEINPUT.
        public int pad1, pad2;
    }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint n, INPUT[] inputs, int size);

    [DllImport("user32.dll")]
    static extern ushort VkKeyScan(char c);

    [DllImport("user32.dll")]
    static extern uint MapVirtualKey(uint code, uint mapType);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetProcessWindowStation();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool GetUserObjectInformation(
        IntPtr obj, int index, System.Text.StringBuilder info, int len, out int needed);

    // The window station a process is attached to decides whether it has a
    // desktop at all: injected input goes nowhere from a station that is not
    // WinSta0, and SendInput reports success either way.
    public static string StationName() {
        var sb = new System.Text.StringBuilder(256);
        int needed;
        if (GetUserObjectInformation(GetProcessWindowStation(), 2, sb, 512, out needed)) {
            return sb.ToString();
        }
        return "<unknown>";
    }

    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_SCANCODE = 0x0008;
    const ushort VK_SHIFT = 0x10;

    static INPUT Key(ushort vk, bool up) {
        var i = new INPUT();
        i.type = 1; // INPUT_KEYBOARD
        i.ki.wVk = 0;
        i.ki.wScan = (ushort)MapVirtualKey(vk, 0); // MAPVK_VK_TO_VSC
        i.ki.dwFlags = KEYEVENTF_SCANCODE | (up ? KEYEVENTF_KEYUP : 0);
        return i;
    }

    // Types `text` as the physical keystrokes a US keyboard would need for it.
    public static void Type(string text) {
        foreach (char c in text) {
            ushort scan = VkKeyScan(c);
            ushort vk = (ushort)(scan & 0xFF);
            bool shift = (scan & 0x100) != 0;

            var seq = new System.Collections.Generic.List<INPUT>();
            if (shift) seq.Add(Key(VK_SHIFT, false));
            seq.Add(Key(vk, false));
            seq.Add(Key(vk, true));
            if (shift) seq.Add(Key(VK_SHIFT, true));

            var arr = seq.ToArray();
            uint sent = SendInput((uint)arr.Length, arr, Marshal.SizeOf(typeof(INPUT)));
            if (sent != arr.Length) {
                throw new Exception("SendInput rejected input: " + Marshal.GetLastWin32Error());
            }
            System.Threading.Thread.Sleep(30);
        }
    }
}
'@

$expected = 'ipabet spike'
$form = New-Object Windows.Forms.Form
$form.Text = 'ipabet-test-entry'
$form.TopMost = $true
$box = New-Object Windows.Forms.TextBox
$box.Dock = 'Fill'
$form.Controls.Add($box)

$script:got = $null
$form.Add_Shown({
    $form.Activate()
    $box.Focus() | Out-Null
    [Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 500

    # Printed whether or not the run passes: a failure is only actionable if it
    # says which of the preconditions was missing.
    Write-Host "interactive:  $([Windows.Forms.SystemInformation]::UserInteractive)"
    Write-Host "station:      $([Input]::StationName())"
    Write-Host "foreground:   $([Input]::GetForegroundWindow()) (form is $($form.Handle))"

    [Input]::Type($expected)

    # Let the queued input drain before reading the control.
    for ($i = 0; $i -lt 40; $i++) {
        [Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 50
    }
    $script:got = $box.Text
    $form.Close()
})

[Windows.Forms.Application]::Run($form)

Write-Host "expected: '$expected'"
Write-Host "got:      '$script:got'"
if ($script:got -eq $expected) {
    Write-Host 'PASS - synthetic keystrokes reach a real text field here.'
    exit 0
}
Write-Host 'FAIL - synthetic keystrokes did not arrive intact.'
exit 1
