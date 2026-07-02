import Cocoa
import InputMethodKit

// Connection name must match InputMethodConnectionName in Info.plist.
let kConnectionName = "IPAKey_Connection"

let server = IMKServer(name: kConnectionName,
                       bundleIdentifier: Bundle.main.bundleIdentifier!)
NSApplication.shared.run()
