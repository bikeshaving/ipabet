// tis-probe — the clean-install assertions, run inside the E2E VM over ssh.
//   tis-probe list             → print every input-source id
//   tis-probe assert-present   → exit 0 iff the IPAbet input method is registered
//   tis-probe enable-select    → enable + select the IPA mode (what System Settings' + does)
import Carbon
import Foundation

let IME = "org.bikeshaving.inputmethod.IPAbet"
let MODE = "org.bikeshaving.inputmethod.IPAbet.IPA"

func sources() -> [(String, TISInputSource)] {
    guard let list = TISCreateInputSourceList(nil, true)?.takeRetainedValue() as? [TISInputSource] else { return [] }
    return list.compactMap { src in
        guard let p = TISGetInputSourceProperty(src, kTISPropertyInputSourceID) else { return nil }
        return (Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String, src)
    }
}

let cmd = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "list"
let all = sources()
switch cmd {
case "list":
    for (id, _) in all { print(id) }
case "assert-present":
    let present = all.contains { $0.0 == IME || $0.0 == MODE }
    print(present ? "PRESENT: \(IME)" : "ABSENT: \(IME)")
    exit(present ? 0 : 1)
case "enable-select":
    var ok = false
    for (id, src) in all where id == IME || id == MODE {
        TISEnableInputSource(src)
        if id == MODE { ok = TISSelectInputSource(src) == noErr }
    }
    print(ok ? "SELECTED: \(MODE)" : "SELECT FAILED")
    exit(ok ? 0 : 1)
default:
    print("unknown: \(cmd)"); exit(2)
}
