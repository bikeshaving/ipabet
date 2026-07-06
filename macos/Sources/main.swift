import Cocoa
import InputMethodKit
import Carbon

// Connection name must match InputMethodConnectionName in Info.plist.
let kConnectionName = "IPAbet_Connection"

let server = IMKServer(name: kConnectionName,
                       bundleIdentifier: Bundle.main.bundleIdentifier!)

// Cycling TO IPAbet declares intent: you want the IPA-ness. Clear the
// raw-US lock whenever the selected input source becomes us. (Not in
// activateServer — that fires on every app focus change, and the lock
// must survive a ⌘-tab to the terminal.)
DistributedNotificationCenter.default().addObserver(
    forName: NSNotification.Name(kTISNotifySelectedKeyboardInputSourceChanged as String),
    object: nil, queue: .main
) { _ in
    guard let src = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue(),
          let idPtr = TISGetInputSourceProperty(src, kTISPropertyInputSourceID) else { return }
    let id = Unmanaged<CFString>.fromOpaque(idPtr).takeUnretainedValue() as String
    // Prefix match, not equality: since the goftam mode registration, the
    // selected source is the mode "…IPAbet.IPA", not the bare method
    // "…IPAbet". Both share this prefix.
    if id.hasPrefix("org.bikeshaving.inputmethod.IPAbet") {
        // Arrival clears the global lock; per-app locks are sticky by
        // design (Terminal stays raw — that's their whole point).
        InputController.rawLock = false
    }
}
// Both Squirrel and vChewing set an explicit accessory activation policy;
// LSUIElement alone is not demonstrably equivalent on macOS 15's IMK stack.
NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
