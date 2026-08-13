# Synthetic keystrokes, shared by the scripts that need them.
#
# Scancodes rather than KEYEVENTF_UNICODE: Unicode injection hands a character
# straight to the target and skips the keyboard layout and the text services
# above it, which are exactly the layers an input method lives in.

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
    static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hWnd, int cmd);

    [DllImport("user32.dll")]
    static extern bool AttachThreadInput(uint attach, uint to, bool attaching);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);

    [DllImport("kernel32.dll")]
    static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    static extern bool SystemParametersInfo(uint action, uint param, IntPtr ptr, uint winIni);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool GetUserObjectInformation(
        IntPtr obj, int index, System.Text.StringBuilder info, int len, out int needed);

    [DllImport("user32.dll")]
    static extern IntPtr GetProcessWindowStation();

    const uint KEYEVENTF_EXTENDED = 0x0001;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_SCANCODE = 0x0008;
    const ushort VK_SHIFT = 0x10;
    const ushort VK_CONTROL = 0x11;
    const ushort VK_MENU = 0x12;
    const ushort VK_RMENU = 0xA5;

    static INPUT Key(ushort vk, bool up) {
        var i = new INPUT();
        i.type = 1; // INPUT_KEYBOARD
        i.ki.wVk = 0;
        i.ki.wScan = (ushort)MapVirtualKey(vk, 0); // MAPVK_VK_TO_VSC
        i.ki.dwFlags = KEYEVENTF_SCANCODE | (up ? KEYEVENTF_KEYUP : 0);
        return i;
    }

    /// The right-hand twin of a key that has one. Right Alt shares its scancode
    /// with left Alt and is told apart only by the extended-key flag, so sending
    /// it without the flag sends the left one and tests nothing.
    static INPUT KeyEx(ushort vk, bool up) {
        var i = Key(vk, up);
        i.ki.dwFlags |= KEYEVENTF_EXTENDED;
        return i;
    }

    static void Send(INPUT[] arr) {
        uint sent = SendInput((uint)arr.Length, arr, Marshal.SizeOf(typeof(INPUT)));
        if (sent != arr.Length) {
            throw new Exception("SendInput rejected input: " + Marshal.GetLastWin32Error());
        }
    }

    public static void PressWithAlt(ushort vk, bool shift, bool altGr) {
        PressWithAlt(vk, shift, altGr, false);
    }

    /// One key, with the diacritic modifier held around it when asked.
    ///
    /// The layer answers to two different keys, so the tests have to press both.
    /// Ctrl+Alt is how Windows reports AltGr, and works on every layout. Right
    /// Alt on its own is the one-key form: AltGr where the layout defines one,
    /// plain Alt on a US keyboard, which is why it has to be reserved by name
    /// rather than arriving as an ordinary key.
    public static void PressWithAlt(ushort vk, bool shift, bool altGr, bool rightAlt) {
        var seq = new System.Collections.Generic.List<INPUT>();
        if (altGr) {
            if (rightAlt) {
                seq.Add(KeyEx(VK_RMENU, false));
            } else {
                seq.Add(Key(VK_CONTROL, false));
                seq.Add(Key(VK_MENU, false));
            }
        }
        if (shift) seq.Add(Key(VK_SHIFT, false));
        seq.Add(Key(vk, false));
        seq.Add(Key(vk, true));
        if (shift) seq.Add(Key(VK_SHIFT, true));
        if (altGr) {
            if (rightAlt) {
                seq.Add(KeyEx(VK_RMENU, true));
            } else {
                seq.Add(Key(VK_MENU, true));
                seq.Add(Key(VK_CONTROL, true));
            }
        }
        Send(seq.ToArray());
        System.Threading.Thread.Sleep(110);
    }

    /// One key, with optional modifiers held around it.
    public static void Press(ushort vk, bool shift, bool ctrl) {
        var seq = new System.Collections.Generic.List<INPUT>();
        if (ctrl) seq.Add(Key(VK_CONTROL, false));
        if (shift) seq.Add(Key(VK_SHIFT, false));
        seq.Add(Key(vk, false));
        seq.Add(Key(vk, true));
        if (shift) seq.Add(Key(VK_SHIFT, true));
        if (ctrl) seq.Add(Key(VK_CONTROL, true));
        Send(seq.ToArray());
        System.Threading.Thread.Sleep(120);
    }

    /// Types `text` as the physical keystrokes a US keyboard would need for it.
    public static void Type(string text) {
        foreach (char c in text) {
            ushort scan = VkKeyScan(c);
            Press((ushort)(scan & 0xFF), (scan & 0x100) != 0, false);
        }
    }

    public static string StationName() {
        var sb = new System.Text.StringBuilder(256);
        int needed;
        if (GetUserObjectInformation(GetProcessWindowStation(), 2, sb, 512, out needed)) {
            return sb.ToString();
        }
        return "<unknown>";
    }

    // Windows refuses SetForegroundWindow from a process the user has not
    // interacted with, which is every process in an automated session. The two
    // documented ways around it: drop the lock timeout, and attach to the input
    // queue of the thread that currently owns the foreground, which makes the
    // two threads count as one for this rule.
    public static bool Foreground(IntPtr hWnd, int timeoutMs) {
        SystemParametersInfo(0x2001 /* SPI_SETFOREGROUNDLOCKTIMEOUT */, 0, IntPtr.Zero, 0);
        uint self = GetCurrentThreadId();

        for (int waited = 0; waited < timeoutMs; waited += 100) {
            if (GetForegroundWindow() == hWnd) return true;

            uint owner = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
            bool attached = owner != 0 && owner != self && AttachThreadInput(self, owner, true);
            ShowWindow(hWnd, 9); // SW_RESTORE
            SetForegroundWindow(hWnd);
            if (attached) AttachThreadInput(self, owner, false);

            System.Threading.Thread.Sleep(100);
        }
        return GetForegroundWindow() == hWnd;
    }
}
'@
