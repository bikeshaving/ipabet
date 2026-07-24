// Regenerate macos/IPAbet.keylayout — the cosmetic layout Keyboard Viewer draws
// while IPAbet is active, and (because override makes it the functional layout)
// the layout that translates every key the IME PASSES rather than consumes.
//
// It is therefore derived from the real US layout via UCKeyTranslate, so Return,
// Tab, the numpad, arrows, and every functional key keep their exact US output —
// an incomplete layout strips them (Return arriving as ch=∅ was the Enter bug).
// Only the ⌥ and ⌥⇧ planes are overridden, at the keys the spec assigns a mark,
// so those planes show IPAbet's marks while every key it does NOT claim keeps
// its US output (⌥6 §, ⌥8 •). The bare and Shift planes stay pure US, since ⇧H's
// output is contextual and no static layout can express it.
//
//   swiftc tools/genkeylayout.swift -o /tmp/genkl -framework Carbon && /tmp/genkl
//
// Run from macos/. Reads ../spec/ipabet.json, writes ./IPAbet.keylayout.

import Foundation
import Carbon

// ---- the US layout, as ground truth for every keyCode × modifier ----

let usData: Data = {
    let filter = [kTISPropertyInputSourceID as String: "com.apple.keylayout.US"] as CFDictionary
    guard let cf = TISCreateInputSourceList(filter, true)?.takeRetainedValue(),
          let list = cf as? [TISInputSource], let src = list.first,
          let ptr = TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData)
    else { fatalError("no US layout") }
    return Unmanaged<CFData>.fromOpaque(ptr).takeUnretainedValue() as Data
}()

/// What US emits for a physical key in a modifier state, dead keys resolved to
/// their spacing form — exactly what Keyboard Viewer would draw and what a
/// passed event needs to carry.
func usOutput(_ keyCode: Int, carbonMods: UInt32) -> String {
    usData.withUnsafeBytes { raw in
        let layout = raw.baseAddress!.assumingMemoryBound(to: UCKeyboardLayout.self)
        var dead: UInt32 = 0
        var buf = [UniChar](repeating: 0, count: 8)
        var len = 0
        UCKeyTranslate(layout, UInt16(keyCode), UInt16(kUCKeyActionDown),
                       (carbonMods >> 8) & 0xFF, UInt32(LMGetKbdType()),
                       OptionBits(kUCKeyTranslateNoDeadKeysBit), &dead, buf.count, &len, &buf)
        return String(utf16CodeUnits: buf, count: len)
    }
}

// ---- the marks the ⌥ / ⌥⇧ planes should show, keyed by US bare character ----

struct Spec: Decodable {
    struct Mark: Decodable { let opt: String; let mark: String; let clone: String?
                             let double: String?; let doubleClone: String? }
    let marks: [Mark]
    let optShift: [String: JSON]?
}
enum JSON: Decodable { case s(String), other
    init(from d: Decoder) throws {
        if let v = try? d.singleValueContainer().decode(String.self) { self = .s(v) } else { self = .other }
    }
}

let spec = try! JSONDecoder().decode(Spec.self,
    from: Data(contentsOf: URL(fileURLWithPath: "../spec/ipabet.json")))

// A combining mark becomes a DEAD KEY: Keyboard Viewer outlines it (orange) and
// draws the state's terminator, which we set to a dotted-circle carrier (◌́). A
// spacing mark or symbol is a plain key. Combining-ness is read from the glyph,
// so a ⌥⇧ form is judged on its own class (⌥⇧4 ͇ is combining though ⌥4 ˦ is not).
enum Cap { case out(String); case dead(String) }   // .dead carries the ◌+mark terminator
func combining(_ s: String) -> Bool {
    guard let f = s.unicodeScalars.first else { return false }
    switch f.properties.generalCategory {
    case .nonspacingMark, .spacingMark, .enclosingMark: return true
    default: return false
    }
}
func cap(_ glyph: String) -> Cap { combining(glyph) ? .dead("\u{25CC}" + glyph) : .out(glyph) }

var optCap: [String: Cap] = [:]        // US bare char → ⌥ cap
var optShiftCap: [String: Cap] = [:]    // US bare char → ⌥⇧ cap
for m in spec.marks {
    optCap[m.opt] = cap(m.mark)
    if let d = m.double { optShiftCap[m.opt] = cap(d) }
}
for (k, v) in spec.optShift ?? [:] where k != "about" {
    if case let .s(ch) = v { optShiftCap[k] = cap(ch) }
}
// The raise/lower operators are not marks in the spec (they pend as sentinels,
// not combining scalars), so add their keycaps by hand — the same ⁻ / ₋ the
// engine previews, so the keycap and the pending preview read identically.
optCap["z"] = .out("\u{207B}")        // ⌥z raise → ⁻
optShiftCap["z"] = .out("\u{208B}")   // ⌥⇧z lower → ₋

// ---- emit ----

/// XML 1.0 forbids numeric refs to C0 controls except tab/LF/CR, and emitting
/// the raw ones UCKeyTranslate returns for backspace, escape, numpad-enter,
/// arrows and the function keys makes the WHOLE file fail to parse — dropping
/// unrelated keys and re-breaking Enter. Those keys need no character output
/// anyway: the host acts on their keyCode (arrows, delete) or the IME consumes
// Every non-empty output is emitted, control keys included — a functional
// layout MUST carry backspace (0x08), escape, arrows, the numpad, or the keys
// the IME passes stop working (backspace dead in Safari). Those C0 controls are
// legal only under `<?xml version="1.1">`, which is exactly what Apple's own
// layouts declare. NOTE: xmllint cannot validate this format — libxml2 has no
// XML 1.1 support and rejects the control refs even in a shipping Apple layout,
// so it is NOT used to check the output.
//
// Escaping is NUMERIC references (&#xNNNN;), not the named XML entities
// (&amp; &lt; &gt; &quot;) — Apple's parser drops a key encoded with a named
// entity (that lost ⇧7 & ⇧, < ⇧. > ⇧' " once already).
func esc(_ s: String) -> String {
    s.unicodeScalars.map { c in
        let plain = (c.value >= 0x20 && c.value < 0x7f)
            && c != "&" && c != "<" && c != ">" && c != "\""
        return plain ? String(c) : String(format: "&#x%04X;", c.value)
    }.joined()
}

// Dead-key actions and their terminators, collected as the ⌥ planes are built.
var actionDefs: [String] = []
var termDefs: [String] = []

/// One keyMap. `override` maps a US BARE character to a cap — a plain output, or a
/// dead key (⌥ combining marks) that enters a throwaway state whose terminator the
/// Viewer draws. Unclaimed keys keep their US output.
func keyMap(index: Int, carbonMods: UInt32, override: [String: Cap] = [:]) -> String {
    var rows: [String] = []
    for code in 0...127 {
        if !override.isEmpty, let c = override[usOutput(code, carbonMods: 0)] {
            switch c {
            case .out(let s):
                if !s.isEmpty { rows.append("      <key code=\"\(code)\" output=\"\(esc(s))\"/>") }
            case .dead(let term):
                let st = "s\(index)_\(code)", act = "a\(index)_\(code)"
                actionDefs.append("    <action id=\"\(act)\"><when state=\"none\" next=\"\(st)\"/></action>")
                termDefs.append("    <when state=\"\(st)\" output=\"\(esc(term))\"/>")
                rows.append("      <key code=\"\(code)\" action=\"\(act)\"/>")
            }
            continue
        }
        let out = usOutput(code, carbonMods: carbonMods)
        // NUL (⌃2, ⌃space on US) is unrepresentable even in XML 1.1 — skip the row.
        if !out.isEmpty, !out.unicodeScalars.contains(where: { $0.value == 0 }) {
            rows.append("      <key code=\"\(code)\" output=\"\(esc(out))\"/>")
        }
    }
    return "    <keyMap index=\"\(index)\">\n" + rows.joined(separator: "\n") + "\n    </keyMap>"
}

let shiftMod = UInt32(shiftKey), optMod = UInt32(optionKey), capsMod = UInt32(alphaLock)
let ctrlMod = UInt32(controlKey)

let bodies = [
    keyMap(index: 0, carbonMods: 0),
    keyMap(index: 1, carbonMods: shiftMod),
    keyMap(index: 2, carbonMods: capsMod),
    keyMap(index: 3, carbonMods: optMod, override: optCap),
    keyMap(index: 4, carbonMods: optMod | shiftMod, override: optShiftCap),
    // The control plane. Without it a declined ⌃A translates through the bare
    // plane to "a", and WebKit's ⌃A/⌃E/⌃K bindings key off the CONTROL
    // CHARACTER — dead in Safari while Terminal (which synthesizes C0 itself)
    // works. One plane covers every control combo, like Apple's US.
    keyMap(index: 5, carbonMods: ctrlMod),
].joined(separator: "\n")

// The dead-key actions/terminators (empty if no combining marks are claimed).
let deadXML = actionDefs.isEmpty ? "" :
    "\n  <actions>\n" + actionDefs.joined(separator: "\n") + "\n  </actions>\n" +
    "  <terminators>\n" + termDefs.joined(separator: "\n") + "\n  </terminators>"

// The system CACHES a layout by its id and does not reliably reload a same-id
// update — the root of the "still broken after reinstall" churn. So derive the
// id from the content: identical layouts keep their id (no needless refresh),
// any change mints a new one and forces a clean reload. Third-party layout ids
// are negative; keep it well inside the range.
var h: UInt64 = 1469598103934665603
for b in (bodies + deadXML).utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
let layoutID = -(Int(h % 30000) + 2000)   // -2000 … -31999

let xml = """
<?xml version="1.1" encoding="UTF-8"?>
<!DOCTYPE keyboard SYSTEM "file://localhost/System/Library/DTDs/KeyboardLayout.dtd">
<!-- GENERATED by tools/genkeylayout.swift from the US layout + spec/ipabet.json.
     Complete US for every functional key; ⌥ and ⌥⇧ show IPAbet's marks. The
     Shift plane is plain US on purpose — ⇧H's output is contextual, which no
     static layout can express, and the IME intercepts it before the layout.
     The id is a content hash so a changed layout always reloads (macOS caches
     by id and ignores same-id updates). -->
<keyboard group="126" id="\(layoutID)" name="IPAbet" maxout="4">
  <layouts>
    <layout first="0" last="17" mapSet="ANSI" modifiers="Mods"/>
  </layouts>
  <modifierMap id="Mods" defaultIndex="0">
    <keyMapSelect mapIndex="0"><modifier keys=""/></keyMapSelect>
    <keyMapSelect mapIndex="1"><modifier keys="anyShift"/></keyMapSelect>
    <keyMapSelect mapIndex="2"><modifier keys="caps"/></keyMapSelect>
    <keyMapSelect mapIndex="3"><modifier keys="anyOption"/></keyMapSelect>
    <keyMapSelect mapIndex="4"><modifier keys="anyOption anyShift"/></keyMapSelect>
    <keyMapSelect mapIndex="5"><modifier keys="anyShift? caps? anyOption? anyControl"/></keyMapSelect>
  </modifierMap>
  <keyMapSet id="ANSI">
\(bodies)
  </keyMapSet>\(deadXML)
</keyboard>
"""

try! xml.write(toFile: "IPAbet.keylayout", atomically: true, encoding: .utf8)

// Validate structurally, NOT with xmllint (libxml2 has no XML 1.1 and rejects
// the very control refs a working Apple layout requires). The keys that broke
// when they went missing must be present, mapped exactly as a shipping Apple
// layout maps them.
let out = xml
let mustHave: [(String, String)] = [
    ("36", "&#x000D;"),  // Return
    ("48", "&#x0009;"),  // Tab
    ("51", "&#x0008;"),  // Backspace — the Safari regression
    ("53", "&#x001B;"),  // Escape
    ("49", " "),          // Space
    ("0", "&#x0001;"),   // ⌃A — the control plane; WebKit line-nav (Safari regression)
    ("14", "&#x0005;"),  // ⌃E
]
for (code, output) in mustHave {
    guard out.contains("<key code=\"\(code)\" output=\"\(output)\"/>") else {
        fatalError("IPAbet.keylayout missing key \(code) → \(output)")
    }
}
let planes = [("⌥", optCap.count), ("⌥⇧", optShiftCap.count)]
print("wrote IPAbet.keylayout — id=\(layoutID) (content-hashed) overrides:",
      planes.map { "\($0.0):\($0.1)" }.joined(separator: " "),
      "· dead keys:", actionDefs.count)
