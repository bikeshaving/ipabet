// reregister.swift — force macOS to re-read IPAKey's input-source metadata
// (including its icon) by re-running TISRegisterInputSource on the installed
// bundle. Run after (re)installing to ~/Library/Input Methods/.
import Carbon

let home = FileManager.default.homeDirectoryForCurrentUser
let url = home.appendingPathComponent("Library/Input Methods/IPAKey.app")
guard FileManager.default.fileExists(atPath: url.path) else {
    FileHandle.standardError.write("not installed: \(url.path)\n".data(using: .utf8)!)
    exit(1)
}
let status = TISRegisterInputSource(url as CFURL)
FileHandle.standardError.write("TISRegisterInputSource -> \(status)\n".data(using: .utf8)!)
