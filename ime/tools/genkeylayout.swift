// genkeylayout.swift — generates IPAbet.keylayout, a COSMETIC keyboard layout
// whose only job is to make the on-screen Keyboard Viewer show IPAbet's base
// layer. The real transformation engine decodes keys via USLayout (UCKeyTranslate
// against com.apple.keylayout.US) and never reads this layout's output, so this
// file is display-only and safe: a bad/absent layout just costs the preview.
//
// It faithfully mirrors US on every modifier layer — INCLUDING US's Option dead
// keys (Option+e → acute, etc.), reproduced as a proper <actions>/<terminators>
// state machine so the Option passthrough still composes accents — then paints
// the IPA bare glyphs onto the number row (base layer) and the two click letters
// onto Shift+1 / Shift+backslash.
//
// Usage: swift genkeylayout.swift > IPAbet.keylayout

import Carbon

let uchr: Data = {
    let filter = [kTISPropertyInputSourceID as String: "com.apple.keylayout.US"] as CFDictionary
    let cf = TISCreateInputSourceList(filter, true)!.takeRetainedValue()
    let src = (cf as! [TISInputSource]).first!
    let ptr = TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData)!
    return Unmanaged<CFData>.fromOpaque(ptr).takeUnretainedValue() as Data
}()

/// Translate through US. `state` is threaded in/out for dead-key composition;
/// `noDead` resolves dead keys to their spacing form instead of arming them.
func us(_ keyCode: UInt16, _ mod: UInt32, state: inout UInt32, noDead: Bool) -> String {
    uchr.withUnsafeBytes { raw in
        let layout = raw.baseAddress!.assumingMemoryBound(to: UCKeyboardLayout.self)
        var buf = [UniChar](repeating: 0, count: 8), len = 0
        let opts: OptionBits = noDead ? OptionBits(kUCKeyTranslateNoDeadKeysBit) : 0
        UCKeyTranslate(layout, keyCode, UInt16(kUCKeyActionDown), mod,
                       UInt32(LMGetKbdType()), opts, &state, buf.count, &len, &buf)
        return String(utf16CodeUnits: buf, count: len)
    }
}

func base(_ keyCode: UInt16, _ mod: UInt32) -> String {  // spacing output, no dead-key state
    var st: UInt32 = 0
    return us(keyCode, mod, state: &st, noDead: true)
}

let SHIFT = (UInt32(shiftKey)  >> 8) & 0xFF
let OPT   = (UInt32(optionKey) >> 8) & 0xFF
let layers: [(index: Int, mod: UInt32)] = [(0, 0), (1, SHIFT), (2, OPT), (3, OPT | SHIFT)]

// Cosmetic overrides: (keyMapIndex, keyCode) → scalar. Base-layer IPA glyphs
// (number row) plus the click letters on the Shift layer.
let overrides: [String: Unicode.Scalar] = [
    "0,18": "\u{0268}",  // 1 → ɨ
    "0,19": "\u{0294}",  // 2 → ʔ
    "0,20": "\u{0295}",  // 3 → ʕ
    "0,21": "\u{027E}",  // 4 → ɾ
    "0,23": "\u{0259}",  // 5 → ə
    "0,22": "\u{0250}",  // 6 → ɐ
    "0,26": "\u{0127}",  // 7 → ħ
    "1,18": "\u{01C3}",  // Shift+1 → ǃ (retroflex click)
    "1,42": "\u{01C0}",  // Shift+\ → ǀ (dental click)
]

func esc(_ s: String) -> String {
    var out = ""
    for scalar in s.unicodeScalars {
        let v = scalar.value
        if v == 0x09 || v == 0x0D { out += String(format: "&#x%04X;", v) }   // tab, return
        else if v < 0x20 || v == 0x7F { continue }                          // drop control keys
        else if v == 0x26 { out += "&#x0026;" }
        else if v == 0x3C { out += "&#x003C;" }
        else if v == 0x3E { out += "&#x003E;" }
        else if v == 0x22 { out += "&#x0022;" }
        else if v > 0x7E { out += String(format: "&#x%04X;", v) }
        else { out += String(UnicodeScalar(v)!) }
    }
    return out
}

// ── Pass 1: discover US dead keys and their composition tables ────────────────
// A cell is a dead key if, from the clean state, it emits nothing but arms a
// non-zero state. Name each distinct armed state and record its terminator
// (the spacing accent = the NoDeadKeys output of the arming key).
var stateName: [UInt32: String] = [:]      // numeric UCKeyTranslate state → "s1"
var terminator: [UInt32: String] = [:]     // numeric state → spacing accent
var deadCell: [String: UInt32] = [:]       // "index,kc" → armed state (this cell arms a dead key)

for (index, mod) in layers {
    for kc in UInt16(0)...127 {
        var st: UInt32 = 0
        let out = us(kc, mod, state: &st, noDead: false)
        guard out.isEmpty, st != 0 else { continue }
        if stateName[st] == nil {
            stateName[st] = "s\(stateName.count + 1)"
            // Terminator = the dangling accent. NoDeadKeys yields "" for a US
            // dead key, so instead arm the state and press a non-composing key
            // ('t'): US returns accent + 't'; the accent is the leading scalar.
            var armed: UInt32 = 0
            _ = us(kc, mod, state: &armed, noDead: false)          // arm (armed = st)
            let dangling = us(17, 0, state: &armed, noDead: false)  // dead + 't' → "´t"
            terminator[st] = String(dangling.prefix(1))
        }
        deadCell["\(index),\(kc)"] = st
    }
}

// ── Pass 2: build per-cell actions ────────────────────────────────────────────
// Cells needing an <action>: dead-key arming cells, and cells whose output
// composes to a single precomposed character in some dead state.
struct Cell { let index: Int, kc: UInt16; var out: String }
var actions: [(id: String, whens: [String])] = []
var cellAction: [String: String] = [:]     // "index,kc" → action id

for (index, mod) in layers {
    for kc in UInt16(0)...127 {
        let key = "\(index),\(kc)"
        let baseOut = base(kc, mod)

        if let armed = deadCell[key] {
            // Arming cell: none → arm the state. Other incoming states fall through
            // to the terminator (which re-arms), matching US.
            let id = "a\(index)_\(kc)"
            actions.append((id, ["<when state=\"none\" next=\"\(stateName[armed]!)\"/>"]))
            cellAction[key] = id
            continue
        }

        // Does this cell compose (single char, differs from base) in any state?
        var comps: [String] = []
        for (st, name) in stateName {
            var s = st
            let c = us(kc, mod, state: &s, noDead: false)
            if c.count == 1, c != baseOut { comps.append("<when state=\"\(name)\" output=\"\(esc(c))\"/>") }
        }
        if !comps.isEmpty {
            let id = "a\(index)_\(kc)"
            actions.append((id, ["<when state=\"none\" output=\"\(esc(baseOut))\"/>"] + comps.sorted()))
            cellAction[key] = id
        }
    }
}

// ── Emit ──────────────────────────────────────────────────────────────────────
var out = """
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE keyboard SYSTEM "file://localhost/System/Library/DTDs/KeyboardLayout.dtd">
<!-- Generated by tools/genkeylayout.swift — cosmetic Keyboard Viewer layout for IPAKey. -->
<keyboard group="126" id="-31201" name="IPAbet" maxout="1">
  <layouts>
    <layout first="0" last="17" mapSet="ipabet" modifiers="mods"/>
  </layouts>
  <modifierMap id="mods" defaultIndex="0">
    <keyMapSelect mapIndex="0"><modifier keys="anyControl? command?"/></keyMapSelect>
    <keyMapSelect mapIndex="1"><modifier keys="anyShift caps? anyControl? command?"/><modifier keys="caps anyControl? command?"/></keyMapSelect>
    <keyMapSelect mapIndex="2"><modifier keys="anyOption caps? anyControl? command?"/></keyMapSelect>
    <keyMapSelect mapIndex="3"><modifier keys="anyShift anyOption caps? anyControl? command?"/></keyMapSelect>
  </modifierMap>
  <keyMapSet id="ipabet">

"""

for (index, mod) in layers {
    out += "    <keyMap index=\"\(index)\">\n"
    for kc in UInt16(0)...127 {
        let key = "\(index),\(kc)"
        if let ov = overrides[key] {
            out += "      <key code=\"\(kc)\" output=\"\(esc(String(ov)))\"/>\n"
        } else if let id = cellAction[key] {
            out += "      <key code=\"\(kc)\" action=\"\(id)\"/>\n"
        } else {
            out += "      <key code=\"\(kc)\" output=\"\(esc(base(kc, mod)))\"/>\n"
        }
    }
    out += "    </keyMap>\n"
}
out += "  </keyMapSet>\n"

if !actions.isEmpty {
    out += "  <actions>\n"
    for a in actions {
        out += "    <action id=\"\(a.id)\">" + a.whens.joined() + "</action>\n"
    }
    out += "  </actions>\n"
    out += "  <terminators>\n"
    for (st, name) in stateName.sorted(by: { $0.value < $1.value }) {
        out += "    <when state=\"\(name)\" output=\"\(esc(terminator[st]!))\"/>\n"
    }
    out += "  </terminators>\n"
}

out += "</keyboard>"
print(out)
