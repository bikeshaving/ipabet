import Cocoa
import InputMethodKit
import Carbon

// --register: run by the pkg postinstall (as the console user) and by
// build.sh install. TISRegisterInputSource is the API Apple provides
// installers so a new input method appears in the CURRENT session — no
// logout. Enabling makes it show up in the input menu without a trip
// through System Settings; selecting it is left to the user.
if CommandLine.arguments.contains("--register") {
    let status = TISRegisterInputSource(Bundle.main.bundleURL as CFURL)
    guard status == noErr else {
        FileHandle.standardError.write(Data("TISRegisterInputSource failed: \(status)\n".utf8))
        exit(1)
    }
    if let list = TISCreateInputSourceList(nil, true)?.takeRetainedValue() as? [TISInputSource] {
        for src in list {
            guard let p = TISGetInputSourceProperty(src, kTISPropertyInputSourceID) else { continue }
            let id = Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String
            if id.hasPrefix("org.bikeshaving.inputmethod.IPAbet") {
                TISEnableInputSource(src)
            }
        }
    }
    print("registered + enabled in the current session")
    exit(0)
}

// Connection name must match InputMethodConnectionName in Info.plist.
let kConnectionName = "IPAbet_Connection"

let server = IMKServer(name: kConnectionName,
                       bundleIdentifier: Bundle.main.bundleIdentifier!)

// There is no raw mode and no mode state to manage: for native typing,
// switch input sources — the OS's own switcher (⌃Space) is the off switch,
// since macOS always keeps a plain US layout installed.
// Both Squirrel and vChewing set an explicit accessory activation policy;
// LSUIElement alone is not demonstrably equivalent on macOS 15's IMK stack.
NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
