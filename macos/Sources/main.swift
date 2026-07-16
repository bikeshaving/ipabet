import Cocoa
import InputMethodKit
import Carbon

// Registration lives in Helper/register.swift (ipabet-register): TIS
// enablement must run UNSANDBOXED, and this binary is sandboxed.

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
