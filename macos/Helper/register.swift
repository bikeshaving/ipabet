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

// --login (the LaunchAgent's mode): enable once per user, then never again —
// a marker file records that this user has been set up, so removing IPA from
// the input menu is respected instead of resurrected at every login.
let loginMode = CommandLine.arguments.contains("--login")
let marker = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/IPAbet/registered")
if loginMode && FileManager.default.fileExists(atPath: marker.path) { exit(0) }

let me = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
let app = me.deletingLastPathComponent()   // MacOS/
    .deletingLastPathComponent()           // Contents/
    .deletingLastPathComponent()           // IPAbet.app
let status = TISRegisterInputSource(app as CFURL)
guard status == noErr else {
    FileHandle.standardError.write(Data("TISRegisterInputSource failed: \(status)\n".utf8))
    exit(1)
}
if let list = TISCreateInputSourceList(nil, true)?.takeRetainedValue() as? [TISInputSource] {
    for src in list {
        guard let p = TISGetInputSourceProperty(src, kTISPropertyInputSourceID) else { continue }
        let id = Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String
        if id.hasPrefix("org.bikeshaving.inputmethod.IPAbet") { TISEnableInputSource(src) }
    }
}
try? FileManager.default.createDirectory(at: marker.deletingLastPathComponent(),
                                         withIntermediateDirectories: true)
FileManager.default.createFile(atPath: marker.path, contents: nil)
print("registered + enabled in the current session")
