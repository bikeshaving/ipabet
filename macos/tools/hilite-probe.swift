// hilite-probe: which marked-text attribute sets render INVISIBLY?
//
// A text view is just an NSTextInputClient — this harness calls setMarkedText
// on text views hosted in real (never-shown) windows, playing the IME's role,
// then pixel-diffs the render against the same text committed normally, in
// both TextKit 2 and TextKit 1.
//
// Validity gates, printed per stack — if either fails, the rows are noise:
//   - marked text must TAKE (hasMarkedText)
//   - the decoration control (explicit underline-1 marked run) must be VISIBLE
// Alongside pixels, the TK1 pass dumps the temporary attributes the view
// applied to the marked range — the decoration DECISION, even where drawing
// is suppressed.
//
// Caveat: direct setMarkedText bypasses the IMK transport; cross-check
// winners with tools/probe.swift in live hosts before trust.

import AppKit

let _ = NSApplication.shared
NSApp.setActivationPolicy(.prohibited)   // never a UI, never a dock icon

let W = 260, H = 44
let BASE = "abc "               // committed prefix
let MARK = "s\u{0328}\u{0301}"  // marked cluster with combining marks (worst-case ink)

struct Candidate {
    let name: String
    /// nil = pass a plain NSString (no attributes at all)
    let attrs: [NSAttributedString.Key: Any]?
    let content: String
}

let clause = NSAttributedString.Key("NSMarkedClauseSegment")
let rawUnderline = NSAttributedString.Key("NSUnderline")
let candidates: [Candidate] = [
    .init(name: "plain-string (no attrs)", attrs: nil, content: MARK),
    .init(name: "empty-dict run", attrs: [:], content: MARK),
    .init(name: "underline 0", attrs: [.underlineStyle: 0], content: MARK),
    .init(name: "underline 0 + clause 0", attrs: [.underlineStyle: 0, clause: 0], content: MARK),
    .init(name: "single + clear color", attrs: [.underlineStyle: NSUnderlineStyle.single.rawValue,
                                                .underlineColor: NSColor.clear], content: MARK),
    .init(name: "single + alpha-0 color", attrs: [.underlineStyle: NSUnderlineStyle.single.rawValue,
                                                  .underlineColor: NSColor.black.withAlphaComponent(0)], content: MARK),
    .init(name: "clause 0 only", attrs: [clause: 0], content: MARK),
    .init(name: "fg color only", attrs: [.foregroundColor: NSColor.black], content: MARK),
    .init(name: "TSM-noHilite (raw NSUnderline 0)", attrs: [rawUnderline: 0], content: MARK),
    .init(name: "ZWS content, plain", attrs: nil, content: "\u{200B}"),
    .init(name: "ZWS content, underline single", attrs: [.underlineStyle: NSUnderlineStyle.single.rawValue], content: "\u{200B}"),
]

/// The decoration positive control: this SHOULD draw a visible underline.
let decorationControl = Candidate(name: "CONTROL: underline 1 + clause (must be VISIBLE)",
                                  attrs: [rawUnderline: 1, clause: 0], content: MARK)

struct Host {
    let win: NSWindow
    let tv: NSTextView
}

func makeHost(tk1: Bool) -> Host {
    let rect = NSRect(x: 0, y: 0, width: W, height: H)
    let tv = NSTextView(frame: rect)
    if tk1 { _ = tv.layoutManager }          // forces TextKit-1 compatibility mode
    tv.font = NSFont.systemFont(ofSize: 15)
    tv.backgroundColor = .white
    tv.textColor = .black
    // A real window, never ordered onto the screen: enough for a first
    // responder and an input context, invisible to the user.
    let win = NSWindow(contentRect: rect, styleMask: [.borderless],
                       backing: .buffered, defer: false)
    win.contentView = tv
    win.makeFirstResponder(tv)
    return Host(win: win, tv: tv)
}

func layout(_ tv: NSTextView, tk1: Bool) {
    if tk1 {
        tv.layoutManager?.ensureLayout(for: tv.textContainer!)
    } else if let tlm = tv.textLayoutManager {
        tlm.ensureLayout(for: tlm.documentRange)
    }
    tv.layoutSubtreeIfNeeded()
}

func snapshot(_ tv: NSTextView, tk1: Bool) -> [UInt8] {
    layout(tv, tk1: tk1)
    guard let rep = tv.bitmapImageRepForCachingDisplay(in: tv.bounds) else { return [] }
    tv.cacheDisplay(in: tv.bounds, to: rep)
    guard let data = rep.bitmapData else { return [] }
    return Array(UnsafeBufferPointer(start: data, count: rep.bytesPerPlane))
}

func diffCount(_ a: [UInt8], _ b: [UInt8]) -> Int {
    guard a.count == b.count, !a.isEmpty else { return -1 }
    var n = 0
    for i in 0..<a.count where a[i] != b[i] { n += 1 }
    return n
}

/// What temporary attributes did the view apply to the marked range? (TK1 API;
/// this is the decoration DECISION regardless of whether drawing happens.)
func appliedDecoration(_ tv: NSTextView) -> String {
    guard tv.hasMarkedText(), let lm = tv.layoutManager else { return "n/a" }
    let r = tv.markedRange()
    guard r.location != NSNotFound, r.length > 0 else { return "empty-range" }
    var eff = NSRange()
    let attrs = lm.temporaryAttributes(atCharacterIndex: r.location, effectiveRange: &eff)
    if attrs.isEmpty { return "none" }
    return attrs.map { k, v in "\(k.rawValue)=\(v)" }.sorted().joined(separator: " ")
}

func runOne(_ c: Candidate, tk1: Bool) -> String {
    // baseline: the same final text, all committed — the invisibility target
    let baseHost = makeHost(tk1: tk1)
    baseHost.tv.string = BASE + (c.content == "\u{200B}" ? "" : c.content)
    let want = snapshot(baseHost.tv, tk1: tk1)

    // marked: prefix committed, candidate content as marked text
    let host = makeHost(tk1: tk1)
    let tv = host.tv
    tv.string = BASE
    tv.setSelectedRange(NSRange(location: (BASE as NSString).length, length: 0))
    let none = NSRange(location: NSNotFound, length: 0)
    let sel = NSRange(location: (c.content as NSString).length, length: 0)
    if let attrs = c.attrs {
        tv.setMarkedText(NSAttributedString(string: c.content, attributes: attrs),
                         selectedRange: sel, replacementRange: none)
    } else {
        tv.setMarkedText(c.content, selectedRange: sel, replacementRange: none)
    }
    let got = snapshot(tv, tk1: tk1)
    let d = diffCount(want, got)
    let took = tv.hasMarkedText() ? "" : " [MARKED TEXT DID NOT TAKE]"
    let deco = tk1 ? "  temp-attrs: \(appliedDecoration(tv))" : ""
    let verdict = d == 0 ? "INVISIBLE" : d < 0 ? "SNAPSHOT-FAILED" : "visible (\(d))"
    return String(format: "  %-44s %@%@%@", (c.name as NSString).utf8String!, verdict, took, deco)
}

for tk1 in [false, true] {
    print(tk1 ? "== TextKit 1 ==" : "== TextKit 2 ==")
    print(runOne(decorationControl, tk1: tk1))
    for c in candidates { print(runOne(c, tk1: tk1)) }
}

// ---- FLASH COMPOSITION mechanics check ----
// The lazy-composition design: commit letters directly; when a transform
// fires, convert the committed cluster to marked text carrying the result
// (reconversion shape), then commit it in the same event cycle. Verify:
// final text correct, and pixel-identical to a plain replacementRange edit.
print("== flash composition (TextKit 2 view) ==")
do {
    let host = makeHost(tk1: false)
    let tv = host.tv
    tv.string = "abc s"                       // "s" committed, cursor after it
    tv.setSelectedRange(NSRange(location: 5, length: 0))
    let sRange = NSRange(location: 4, length: 1)
    // flash: mark the committed cluster with the transform result…
    tv.setMarkedText(NSAttributedString(string: "ʃ", attributes: [.underlineStyle: 0]),
                     selectedRange: NSRange(location: 1, length: 0),
                     replacementRange: sRange)
    let midMarked = tv.hasMarkedText()
    // …and commit it immediately, same cycle.
    tv.insertText("ʃ", replacementRange: NSRange(location: NSNotFound, length: 0))
    let after = tv.string
    print("  replacementRange honored: \(after == "abc ʃ" ? "YES" : "NO — got '\(after)'")")
    print("  marked mid-flash: \(midMarked), after commit: \(tv.hasMarkedText())")
    // pixel check vs the same result typed committed
    let ref = makeHost(tk1: false); ref.tv.string = "abc ʃ"
    let d = diffCount(snapshot(tv, tk1: false), snapshot(ref.tv, tk1: false))
    print("  pixel diff vs committed result: \(d) \(d == 0 ? "(IDENTICAL)" : "(differs)")")
}
