import Cocoa
import InputMethodKit

// Drives InputController and the Rust core through the same keystrokes in
// lockstep and asserts they agree after every key — on committed text AND the
// marked-text preview (the mock models marked text, which main.swift's leaves a
// no-op). This was the acceptance test for the re-shell; now that InputController
// IS a shell over the core it is largely a tautology, kept as a guard against the
// shell's own layer (lookback reads, edit application) drifting from a direct
// core call. The one real divergence that remains is backspace re-arm at
// document start — the controller declines (macOS-15 net-empty transport), the
// core re-arms — so backspace is skipped.

final class MockClient: NSObject, IMKTextInput {
    var buf = ""
    var marked = ""
    func insertText(_ s: Any!, replacementRange r: NSRange) {
        let t = (s as? String) ?? (s as? NSAttributedString)?.string ?? ""
        marked = ""
        if r.location == NSNotFound { buf += t }
        else { buf = (buf as NSString).replacingCharacters(in: r, with: t) }
    }
    func setMarkedText(_ s: Any!, selectionRange: NSRange, replacementRange: NSRange) {
        marked = (s as? String) ?? (s as? NSAttributedString)?.string ?? ""
    }
    func selectedRange() -> NSRange { NSRange(location: (buf as NSString).length, length: 0) }
    func markedRange() -> NSRange { NSRange(location: NSNotFound, length: 0) }
    func length() -> Int { (buf as NSString).length }
    func string(from range: NSRange, actualRange: NSRangePointer) -> String! {
        let ns = buf as NSString
        let loc = min(range.location, ns.length)
        let clamped = NSRange(location: loc, length: min(range.length, ns.length - loc))
        actualRange.pointee = clamped
        return ns.substring(with: clamped)
    }
    func bundleIdentifier() -> String! { "org.example.test" }
    func supportsUnicode() -> Bool { true }
    func windowLevel() -> Int32 { 0 }
    func supportsProperty(_ p: TSMDocumentPropertyTag) -> Bool { false }
    func overrideKeyboard(withKeyboardNamed name: String!) {}
    func selectMode(_ m: String!) {}
    func attributes(forCharacterIndex i: Int, lineHeightRectangle r: UnsafeMutablePointer<NSRect>!) -> [AnyHashable: Any]! { [:] }
    func fractionOfDistanceThroughGlyph(forPoint p: NSPoint) -> Float { 0 }
    func characterIndex(for p: NSPoint, tracking t: Int, inMarkedRange m: UnsafeMutablePointer<ObjCBool>!) -> Int { 0 }
    func attributedSubstring(from range: NSRange) -> NSAttributedString? { nil }
    func validAttributesForMarkedText() -> [Any]? { [] }
    func uniqueClientIdentifierString() -> String? { "mock" }
    func firstRect(forCharacterRange range: NSRange, actualRange: NSRangePointer?) -> NSRect { .zero }
}

struct RawKey: Decodable {
    let key: String
    var shift = false, option = false, control = false, capsLock = false, shiftBroke = false
    enum CodingKeys: String, CodingKey { case key, shift, option, control, capsLock, shiftBroke }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        shift = (try? c.decode(Bool.self, forKey: .shift)) ?? false
        option = (try? c.decode(Bool.self, forKey: .option)) ?? false
        control = (try? c.decode(Bool.self, forKey: .control)) ?? false
        capsLock = (try? c.decode(Bool.self, forKey: .capsLock)) ?? false
        shiftBroke = (try? c.decode(Bool.self, forKey: .shiftBroke)) ?? false
    }
}
struct Vector: Decodable {
    let keys: [RawKey]
    let initial: String
    let expected: String
    let locale: String
    let capital_digraphs: Bool
}

// --- keycode inverse, event synthesis (as in main.swift) ---
var keyCodeFor: [String: UInt16] = [:]
for kc in UInt16(0)...127 {
    let ch = USLayout.char(kc, shift: false)
    if ch.count == 1, keyCodeFor[ch] == nil { keyCodeFor[ch] = kc }
}
func flagsChanged(_ shift: Bool) -> NSEvent {
    NSEvent.keyEvent(with: .flagsChanged, location: .zero, modifierFlags: shift ? [.shift] : [],
        timestamp: 0, windowNumber: 0, context: nil, characters: "", charactersIgnoringModifiers: "",
        isARepeat: false, keyCode: 56)!
}
func keyEvent(_ k: RawKey) -> NSEvent? {
    let kc: UInt16
    if k.key == "⌫" { kc = 51 } else if k.key == "Escape" { kc = 53 }
    else if let c = keyCodeFor[k.key] { kc = c } else { return nil }
    var flags: NSEvent.ModifierFlags = []
    if k.shift { flags.insert(.shift) }; if k.option { flags.insert(.option) }
    if k.control { flags.insert(.control) }; if k.capsLock { flags.insert(.capsLock) }
    return NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: flags,
        timestamp: 0, windowNumber: 0, context: nil, characters: k.key,
        charactersIgnoringModifiers: k.key, isARepeat: false, keyCode: kc)
}
func nativeChar(_ k: RawKey) -> String {
    if k.key.count != 1 { return "" }
    guard let kc = keyCodeFor[k.key] else { return "" }
    if k.shift { return USLayout.char(kc, shift: true) }
    if k.option { return "" }
    return USLayout.char(kc, shift: false)
}

// --- Rust core side (C ABI) ---
func emptyPending() -> CPending { var p = CPending(); p.count = 0; return p }
func applyEdit(_ before: String, _ edit: CEdit, _ native: String) -> String {
    var e = edit; var out = [CChar](repeating: 0, count: 256)
    before.withCString { b in native.withCString { n in
        withUnsafePointer(to: &e) { ep in ipabet_apply_edit(b, ep, n, &out, 256) } } }
    return String(cString: out)
}
func corePreview(_ engine: OpaquePointer, _ pending: CPending) -> String {
    var out = [CChar](repeating: 0, count: 256)
    ipabet_preview_string(engine, pending, &out, 256)
    return String(cString: out)
}
func dropLastCluster(_ text: String) -> String {
    let n = Int(text.withCString { ipabet_last_cluster_byte_len($0) })
    if n == 0 { return text }
    var b = Array(text.utf8); b.removeLast(min(n, b.count)); return String(decoding: b, as: UTF8.self)
}

let path = ProcessInfo.processInfo.environment["IPABET_VECTORS"] ?? "../spec/parity-vectors.json"
guard let data = FileManager.default.contents(atPath: path),
      let vectors = try? JSONDecoder().decode([Vector].self, from: data) else {
    FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!); exit(2)
}
let spec = try! String(contentsOfFile: "../spec/ipabet.json", encoding: .utf8)
guard let engine = spec.withCString({ ipabet_engine_new($0) }) else { fatalError("engine did not parse") }

var agree = 0, skip = 0
var failures: [String] = []
for v in vectors {
    // Backspace re-arm at document start is the one remaining divergence (see
    // the header). ⌥Escape and the ⌥z operators used to be skipped for the old
    // Swift engine's bugs; the re-shell onto the core fixed both, so they run.
    if v.keys.contains(where: { $0.key == "⌫" }) { skip += 1; continue }

    v.locale.withCString { ipabet_engine_set_quote_locale(engine, $0) }
    ipabet_engine_set_capital_digraphs(engine, v.capital_digraphs)
    UserDefaults.standard.set(v.capital_digraphs, forKey: "capitalDigraphs")
    UserDefaults.standard.set(v.locale, forKey: "quoteLocale")

    let controller = InputController()
    let mock = MockClient()
    mock.buf = v.initial
    var coreText = v.initial, corePending = emptyPending(), coreChain = false
    var diverged: String? = nil
    var unmapped = false

    for k in v.keys {
        // Core step.
        var ks = CKeystroke()
        ks.shift = k.shift; ks.option = k.option; ks.control = k.control
        ks.caps_lock = k.capsLock; ks.shift_broke = k.shiftBroke
        k.key.withCString { kp in
            ks.key = kp
            let step = coreText.withCString { ipabet_engine_handle_key(engine, $0, ks, corePending, coreChain) }
            corePending = step.pending
            coreChain = step.has_chain_broken ? step.chain_broken : false
            let native = step.edit.edit_type == Int32(Pass.rawValue) ? nativeChar(k) : ""
            coreText = applyEdit(coreText, step.edit, native)
        }
        // Controller step.
        if k.shiftBroke { _ = controller.handle(flagsChanged(true), client: mock); _ = controller.handle(flagsChanged(false), client: mock) }
        guard let ev = keyEvent(k) else { unmapped = true; break }
        if !controller.handle(ev, client: mock) { mock.buf += nativeChar(k) }

        // Agree after this key, on both committed text and preview.
        if mock.buf != coreText || mock.marked != corePreview(engine, corePending) {
            diverged = "after '\(k.key)': controller buf=[\(mock.buf)] marked=[\(mock.marked)] vs core text=[\(coreText)] preview=[\(corePreview(engine, corePending))]"
            break
        }
    }
    if unmapped { skip += 1; continue }
    if let d = diverged {
        if failures.count < 25 { failures.append("initial=[\(v.initial)] keys=\(v.keys.map { $0.key }) — \(d)") }
    } else {
        agree += 1
    }
}
ipabet_engine_free(engine)

for f in failures { FileHandle.standardError.write("DIVERGE \(f)\n".data(using: .utf8)!) }
print("\(agree) agree, \(failures.count) diverge, \(skip) skipped — InputController vs Rust core, step by step, text + preview")
let ran = agree + failures.count
if ran * 2 < vectors.count { FileHandle.standardError.write("too few ran\n".data(using: .utf8)!); exit(3) }
exit(failures.isEmpty ? 0 : 1)
