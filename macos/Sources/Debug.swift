import Cocoa

/// Runtime-gated debug logging for IME development.
///
/// Off in production: writes nothing unless the sentinel file `~/.ipabet-debug`
/// exists, so a shipped build carries this at ~zero cost (one cached bool check
/// per keystroke, and `msg` is an @autoclosure so the string is never built
/// when disabled). Toggle live with `tools/debug.sh on|off` — no rebuild — and
/// the flag refreshes on every focus change (`activateServer`).
///
/// Log lands at `~/Library/Logs/IPAbet.log`; `tools/debug.sh tail` follows it.
enum Dbg {
    private static let home = FileManager.default.homeDirectoryForCurrentUser
    static let logURL = home.appendingPathComponent("Library/Logs/IPAbet.log")
    private static let sentinelPath = home.appendingPathComponent(".ipabet-debug").path
    private static let fmt: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "HH:mm:ss.SSS"; return f
    }()

    private(set) static var enabled = false

    /// Re-read the sentinel so `debug.sh on/off` takes effect without a reinstall.
    static func refresh() {
        enabled = FileManager.default.fileExists(atPath: sentinelPath)
    }

    static func log(_ msg: @autoclosure () -> String) {
        guard enabled else { return }
        let line = fmt.string(from: Date()) + " " + msg() + "\n"
        guard let data = line.data(using: .utf8) else { return }
        if let fh = try? FileHandle(forWritingTo: logURL) {
            defer { try? fh.close() }
            fh.seekToEndOfFile()
            fh.write(data)
        } else {
            try? data.write(to: logURL)   // first line creates the file
        }
    }

    // ---- readable formatters (debug-only, so clarity over speed) ----

    /// Modifier flags as glyphs: `⌃⌥⇧⌘`, or `-` for none.
    static func mods(_ f: NSEvent.ModifierFlags) -> String {
        var s = ""
        if f.contains(.control) { s += "⌃" }
        if f.contains(.option)  { s += "⌥" }
        if f.contains(.shift)   { s += "⇧" }
        if f.contains(.command) { s += "⌘" }
        return s.isEmpty ? "-" : s
    }

    /// A string with control chars and combining marks made visible.
    static func str(_ s: String?) -> String {
        guard let s = s, !s.isEmpty else { return "∅" }
        return s.unicodeScalars.map { sc -> String in
            if sc.value < 0x20 || sc.properties.canonicalCombiningClass != .notReordered {
                return "◌\\u{" + String(sc.value, radix: 16) + "}"
            }
            return String(sc)
        }.joined()
    }
}
