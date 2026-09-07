import Cocoa
import InputMethodKit

// One test per ultrareview finding on the Rust-core re-shell, each written to
// FAIL on the pre-fix code and pass now. The three nits (an inlined wrapper, a
// removed parameter, a deinit free) are pure refactors with no observable
// behavioral contract, so they have no meaningful failing test and are not here.

// A mock IMKTextInput that records committed text, the last marked attributed
// string (for the dead-key styling check), and nothing else.
final class MockClient: NSObject, IMKTextInput {
    var buf = ""
    var lastMarked: NSAttributedString?
    func insertText(_ s: Any!, replacementRange r: NSRange) {
        let t = (s as? String) ?? (s as? NSAttributedString)?.string ?? ""
        lastMarked = nil
        if r.location == NSNotFound { buf += t }
        else { buf = (buf as NSString).replacingCharacters(in: r, with: t) }
    }
    func setMarkedText(_ s: Any!, selectionRange: NSRange, replacementRange: NSRange) {
        lastMarked = (s as? NSAttributedString) ?? (s as? String).map { NSAttributedString(string: $0) }
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

var keyCodeFor: [String: UInt16] = [:]
for kc in UInt16(0)...127 {
    let ch = USLayout.char(kc, shift: false)
    if ch.count == 1, keyCodeFor[ch] == nil { keyCodeFor[ch] = kc }
}
func keyEvent(_ label: String, shift: Bool = false, option: Bool = false, control: Bool = false) -> NSEvent {
    let kc: UInt16 = label == "⌫" ? 51 : (label == "Escape" ? 53 : (keyCodeFor[label] ?? 0))
    var flags: NSEvent.ModifierFlags = []
    if shift { flags.insert(.shift) }; if option { flags.insert(.option) }; if control { flags.insert(.control) }
    return NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: flags, timestamp: 0,
        windowNumber: 0, context: nil, characters: label, charactersIgnoringModifiers: label,
        isARepeat: false, keyCode: kc)!
}

// Drive a key through the controller and, when it declines (a plain capital
// passes to the host), simulate the host inserting the character — as the corpus
// harness does — so committed text builds up realistically.
func type(_ c: InputController, _ mock: MockClient, _ label: String, shift: Bool = false) {
    if !c.handle(keyEvent(label, shift: shift), client: mock) {
        let kc = keyCodeFor[label] ?? 0
        mock.buf += USLayout.char(kc, shift: shift)
    }
}

var failures = 0
func check(_ name: String, _ ok: Bool, _ detail: @autoclosure () -> String = "") {
    if ok { print("ok  \(name)") }
    else { failures += 1; FileHandle.standardError.write("FAIL \(name) \(detail())\n".data(using: .utf8)!) }
}

// 1. The class keeps its Objective-C runtime name "InputController" — Info.plist
//    names it as a bare string that IMKit resolves via NSClassFromString. Without
//    @objc(InputController) the name is "<module>.InputController" and the input
//    method registers but is dead.
check("finding-1: @objc(InputController) runtime name",
      NSStringFromClass(InputController.self) == "InputController",
      "got \(NSStringFromClass(InputController.self))")
check("finding-1: NSClassFromString resolves",
      NSClassFromString("InputController") != nil)

// 2. An armed dead-key mark previews with the yellow highlight and NO underline,
//    not the IMK composition underline.
do {
    let c = InputController(); let mock = MockClient()
    _ = c.handle(keyEvent("e", option: true), client: mock)   // ⌥e arms acute
    let marked = mock.lastMarked
    check("finding-2: dead-key preview was set", marked != nil && (marked?.length ?? 0) > 0)
    if let m = marked, m.length > 0 {
        let attrs = m.attributes(at: 0, effectiveRange: nil)
        let hasHighlight = attrs[.backgroundColor] != nil
        let underline = (attrs[.underlineStyle] as? Int) ?? 0
        check("finding-2: yellow highlight set", hasHighlight)
        check("finding-2: composition underline suppressed", underline == 0,
              "underlineStyle=\(underline)")
    }
}

// 3. Backspace over the only cluster in the document declines (returns false) so
//    the host deletes it natively — it must not be swallowed.
do {
    let c = InputController(); let mock = MockClient()
    mock.buf = "ã"   // a single base+mark cluster at document start
    let eaten = c.handle(keyEvent("⌫"), client: mock)
    check("finding-3: lone-cluster backspace declines to the host", eaten == false,
          "eaten=\(eaten) buf=[\(mock.buf)]")
}

// 4. A settings change reaches a controller through activateServer, not only the
//    one whose menu made it — each controller has its own engine, so activate
//    must re-sync from UserDefaults. Build the engine with capital digraphs OFF,
//    flip the default ON, re-activate, and the capital digraph must now fire.
do {
    UserDefaults.standard.set(false, forKey: "capitalDigraphs")
    UserDefaults.standard.set("en", forKey: "quoteLocale")
    let c = InputController(); let mock = MockClient()
    c.activateServer(mock)                                   // engine built with OFF
    type(c, mock, "s", shift: true)                          // ⇧S
    type(c, mock, "h", shift: true)                          // ⇧H → "SH" while OFF
    let off = mock.buf
    UserDefaults.standard.set(true, forKey: "capitalDigraphs")
    c.activateServer(mock)                                   // must re-apply ON
    mock.buf = ""
    type(c, mock, "s", shift: true)
    type(c, mock, "h", shift: true)                          // ⇧S⇧H → Ʃ while ON
    UserDefaults.standard.removeObject(forKey: "capitalDigraphs")
    check("finding-4: capitals plain while OFF", off == "SH", "got [\(off)]")
    check("finding-4: activateServer re-applied the ON setting", mock.buf == "Ʃ", "got [\(mock.buf)]")
}

print(failures == 0 ? "\nall regression tests pass" : "\n\(failures) regression test(s) failed")
exit(failures == 0 ? 0 : 1)
