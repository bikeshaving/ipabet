// ipabet-register — the one unsandboxed binary in the bundle.
//
// TIS enablement writes the user's HIToolbox preferences; under App Sandbox
// those writes land in the app CONTAINER — a silent "success" the real
// session never sees. So registration lives here, outside the sandbox,
// while the keystroke-handling binary keeps zero-network lockdown
// (entitlements are per-binary). Run by the pkg postinstall (as the console
// user) and by build.sh install.
import Carbon
import Foundation

let me = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
let app = me.deletingLastPathComponent()   // MacOS/
    .deletingLastPathComponent()           // Contents/
    .deletingLastPathComponent()           // IPAbet.app
let status = TISRegisterInputSource(app as CFURL)
guard status == noErr else {
    FileHandle.standardError.write(Data("TISRegisterInputSource failed: \(status)\n".utf8))
    exit(1)
}
// EXACT ids only — a prefix match once enabled the bundled cosmetic keylayout
// (…IPAbet.keylayout.IPAbet) as a selectable typing keyboard, and TIS persists
// that across reinstalls. Enable the input method and its mode; actively
// DISABLE the legacy layout wherever a past install left it on.
let enable: Set<String> = [
    "org.bikeshaving.inputmethod.IPAbet",
    "org.bikeshaving.inputmethod.IPAbet.IPA",
]
let legacyLayout = "org.bikeshaving.inputmethod.IPAbet.keylayout.IPAbet"
if let list = TISCreateInputSourceList(nil, true)?.takeRetainedValue() as? [TISInputSource] {
    for src in list {
        guard let p = TISGetInputSourceProperty(src, kTISPropertyInputSourceID) else { continue }
        let id = Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String
        if enable.contains(id) { TISEnableInputSource(src) }
        if id == legacyLayout { TISDisableInputSource(src) }
    }
}
print("registered + enabled in the current session")
