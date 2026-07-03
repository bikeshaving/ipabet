import Cocoa
import InputMethodKit

// Connection name must match InputMethodConnectionName in Info.plist.
let kConnectionName = "IPAKey_Connection"

let server = IMKServer(name: kConnectionName,
                       bundleIdentifier: Bundle.main.bundleIdentifier!)
// Both Squirrel and vChewing set an explicit accessory activation policy;
// LSUIElement alone is not demonstrably equivalent on macOS 15's IMK stack.
NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
