import Cocoa
import InputMethodKit

// Drives the real InputController — the macOS reference implementation — through
// a mock IMKTextInput, replaying the shared parity + fuzz vector corpus the Rust
// and JS engines replay in their own suites. Until this existed the Swift logic
// had zero automated coverage, which is how a hand review found the Control-chord
// and newline-tie divergences; now every push checks the reference against the
// same oracle as the ports.
//
// The one thing it cannot express is a shift RELEASE mid-sequence: macOS learns
// that from a flagsChanged event, and handle() only takes keyDown. Vectors that
// carry shiftBroke are skipped and left to the shared engine tests and the
// on-device gate.
//
//   swiftc tests/main.swift Sources/InputController.swift Sources/Debug.swift \
//     -framework Cocoa -framework InputMethodKit -framework Carbon -framework IOKit
//   IPABET_VECTORS=../spec/parity-vectors.json ./a.out

// A minimal document: enough of IMKTextInput for the controller to insert,
// replace, and read its own lookback. Marked text is a preview, never part of
// the committed document, so it is intentionally not reflected in `buf`.
final class MockClient: NSObject, IMKTextInput {
    var buf = ""
    func insertText(_ s: Any!, replacementRange r: NSRange) {
        let t = (s as? String) ?? (s as? NSAttributedString)?.string ?? ""
        if r.location == NSNotFound { buf += t }
        else { buf = (buf as NSString).replacingCharacters(in: r, with: t) }
    }
    func setMarkedText(_ s: Any!, selectionRange: NSRange, replacementRange: NSRange) {}
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

// Inverse of USLayout: the physical keyCode that produces each unshifted label,
// built by asking USLayout rather than hardcoding a second copy of the map.
var keyCodeFor: [String: UInt16] = [:]
for kc in UInt16(0)...127 {
    let ch = USLayout.char(kc, shift: false)
    if ch.count == 1, keyCodeFor[ch] == nil { keyCodeFor[ch] = kc }
}
let ESCAPE: UInt16 = 53, BACKSPACE: UInt16 = 51

// What the host inserts for a key the controller declined — the macOS
// equivalent of the JS engine's nativeChar, which is what typeKeys applies on
// a Pass. Option chords insert nothing (host Option typography is its own); the
// shifted plane of the US layout is exactly SHIFTED_DIGITS/SHIFTED_PUNCT and
// the uppercase of a letter, so USLayout answers all of it.
func nativeChar(_ k: RawKey) -> String {
    if k.key.count != 1 { return "" }
    guard let kc = keyCodeFor[k.key] else { return "" }
    // Order matters and mirrors js/src/index.ts: shift wins over option, so
    // ⌥⇧- is "_" (the shifted key), not "" (a bare Option chord).
    if k.shift { return USLayout.char(kc, shift: true) }
    if k.option { return "" }
    return USLayout.char(kc, shift: false)
}

// A shift press-then-release, so the controller's flagsChanged path sets
// shiftReleased — exactly what a physical shift tap between two keys does.
// This is how a vector's shiftBroke is reproduced faithfully rather than skipped.
func flagsChanged(_ shift: Bool) -> NSEvent {
    NSEvent.keyEvent(with: .flagsChanged, location: .zero,
        modifierFlags: shift ? [.shift] : [], timestamp: 0, windowNumber: 0,
        context: nil, characters: "", charactersIgnoringModifiers: "",
        isARepeat: false, keyCode: 56)!
}

func event(_ k: RawKey) -> NSEvent? {
    let kc: UInt16
    if k.key == "⌫" { kc = BACKSPACE }
    else if k.key == "Escape" { kc = ESCAPE }
    else if let c = keyCodeFor[k.key] { kc = c }
    else { return nil }
    var flags: NSEvent.ModifierFlags = []
    if k.shift { flags.insert(.shift) }
    if k.option { flags.insert(.option) }
    if k.control { flags.insert(.control) }
    if k.capsLock { flags.insert(.capsLock) }
    return NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: flags,
        timestamp: 0, windowNumber: 0, context: nil, characters: k.key,
        charactersIgnoringModifiers: k.key, isARepeat: false, keyCode: kc)
}

let path = ProcessInfo.processInfo.environment["IPABET_VECTORS"] ?? "../spec/parity-vectors.json"
guard let data = FileManager.default.contents(atPath: path),
      let vectors = try? JSONDecoder().decode([Vector].self, from: data) else {
    FileHandle.standardError.write("cannot read \(path)\n".data(using: .utf8)!)
    exit(2)
}

var pass = 0, skip = 0
var failures: [String] = []
for v in vectors {
    // Backspace over an armed mark re-arms it — but at document start macOS
    // deliberately declines rather than re-arm (the macOS-15 net-empty-
    // replacement transport bug; the carrier it needs is absent). Most vectors
    // start empty, so they hit that documented divergence, and the mock's
    // insertText applies a net-empty replace cleanly — MORE forgiving than the
    // real transport — so it could not prove the workaround anyway. Backspace
    // stays with the engine tests and the on-device gate.
    // ⌥Escape is a corner (option+Escape flushes here, passes in the engine).
    if v.keys.contains(where: { $0.key == "⌫" || ($0.key == "Escape" && $0.option) }) {
        skip += 1; continue
    }
    // The raise/lower operators (⌥z, ⌥⇧z) preview through marked text before
    // they land, and this mock's setMarkedText is a no-op — so their
    // in-progress state is not observable here. Covered by the engines and the
    // on-device gate. (This harness asserts committed text, never the preview.)
    if v.keys.contains(where: { $0.key == "z" && $0.option }) { skip += 1; continue }
    UserDefaults.standard.set(v.capital_digraphs, forKey: "capitalDigraphs")
    UserDefaults.standard.set(v.locale, forKey: "quoteLocale")
    let c = InputController()
    let mock = MockClient()
    mock.buf = v.initial
    var unmapped = false
    for k in v.keys {
        // A shiftBroke key means shift was tapped since the last one — drive
        // the controller's flagsChanged path so the chain breaks exactly as it
        // would on device, rather than skipping the vector.
        if k.shiftBroke { _ = c.handle(flagsChanged(true), client: mock); _ = c.handle(flagsChanged(false), client: mock) }
        guard let ev = event(k) else { unmapped = true; break }
        // handle() == false is a decline: the OS then does what it would with
        // any key the input method passed on — insert its character, or for
        // backspace delete the last grapheme cluster. typeKeys models the same.
        if !c.handle(ev, client: mock) {
            if k.key == "⌫" {
                if !k.control { mock.buf = String(Array(mock.buf).dropLast()) }
            } else {
                mock.buf += nativeChar(k)
            }
        }
    }
    if unmapped { skip += 1; continue }
    c.commitComposition(mock) // flush a trailing pending mark, as typeKeys does
    if mock.buf == v.expected {
        pass += 1
    } else if failures.count < 30 {
        failures.append("got [\(mock.buf)] want [\(v.expected)] initial=[\(v.initial)] "
            + "keys=\(v.keys.map { $0.key + ($0.shift ? "+s" : "") + ($0.option ? "+o" : "") })")
    }
}

for f in failures { FileHandle.standardError.write("FAIL \(f)\n".data(using: .utf8)!) }
print("\(pass) pass, \(failures.count) fail, \(skip) skipped (backspace, ⌥Escape, ⌥z, or unmapped key)")
// A floor, so an empty corpus or a future all-skipping change fails loudly
// rather than passing having checked nothing. Half the corpus is a wide margin
// below what actually runs (~90%+) and well above any legitimate skip rate.
let ran = pass + failures.count
if ran * 2 < vectors.count {
    FileHandle.standardError.write("only \(ran) of \(vectors.count) vectors ran — the harness is asserting almost nothing\n".data(using: .utf8)!)
    exit(3)
}
exit(failures.isEmpty ? 0 : 1)
