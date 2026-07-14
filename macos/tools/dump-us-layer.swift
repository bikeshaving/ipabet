// Dump the REAL macOS US layout's four planes (bare, ⇧, ⌥, ⌥⇧) straight from the
// system's uchr data — the same source the IME reads — so the audit of "what
// typography does IPAbet destroy" is against ground truth, not memory.
import Carbon
import Foundation

let uchr: Data = {
    let filter = [kTISPropertyInputSourceID as String: "com.apple.keylayout.US"] as CFDictionary
    let cf = TISCreateInputSourceList(filter, true)!.takeRetainedValue()
    let src = (cf as! [TISInputSource]).first!
    let ptr = TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData)!
    return Unmanaged<CFData>.fromOpaque(ptr).takeUnretainedValue() as Data
}()

/// `dead: true` reports the dead-key state instead of resolving to a spacing form.
func char(_ keyCode: UInt16, shift: Bool, option: Bool, resolveDead: Bool) -> (String, Bool) {
    uchr.withUnsafeBytes { raw in
        let layout = raw.baseAddress!.assumingMemoryBound(to: UCKeyboardLayout.self)
        var mod: UInt32 = 0
        if shift { mod |= (UInt32(shiftKey) >> 8) & 0xFF }
        if option { mod |= (UInt32(optionKey) >> 8) & 0xFF }
        var deadState: UInt32 = 0
        var buf = [UniChar](repeating: 0, count: 8)
        var len = 0
        let bits = resolveDead ? OptionBits(kUCKeyTranslateNoDeadKeysBit) : 0
        UCKeyTranslate(layout, keyCode, UInt16(kUCKeyActionDown), mod,
                       UInt32(LMGetKbdType()), bits, &deadState, buf.count, &len, &buf)
        return (String(utf16CodeUnits: buf, count: len), deadState != 0)
    }
}

// keyCode → the US key's unshifted label, for every key the IPA layer can touch.
let codes: [UInt16] = Array(0...53)
print("key\tbare\tshift\topt\toptshift\toptDead\toptShiftDead")
for kc in codes {
    let bare = char(kc, shift: false, option: false, resolveDead: true).0
    guard bare.count == 1, let c = bare.first,
          c.isLetter || c.isNumber || "`-=[]\\;',./".contains(c) else { continue }
    let sh = char(kc, shift: true, option: false, resolveDead: true).0
    let (opt, optDead) = char(kc, shift: false, option: true, resolveDead: false)
    let (optSh, optShDead) = char(kc, shift: true, option: true, resolveDead: false)
    let optRes = char(kc, shift: false, option: true, resolveDead: true).0
    let optShRes = char(kc, shift: true, option: true, resolveDead: true).0
    print("\(bare)\t\(sh)\t\(optDead ? optRes : opt)\t\(optShDead ? optShRes : optSh)\t\(optDead)\t\(optShDead)")
}
