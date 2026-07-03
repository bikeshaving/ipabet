import Cocoa
import InputMethodKit
import Carbon

// Decodes a physical key (virtual keyCode) through a fixed US layout, so the
// engine's ASCII-keyed tables work regardless of the active keyboard layout —
// including the cosmetic IPAbet layout we override to for Keyboard Viewer. The
// active layout's delivered characters are therefore never consulted for logic.
enum USLayout {
    private static let uchr: Data? = {
        let filter = [kTISPropertyInputSourceID as String: "com.apple.keylayout.US"] as CFDictionary
        guard let cf = TISCreateInputSourceList(filter, true)?.takeRetainedValue(),
              let list = cf as? [TISInputSource], let src = list.first,
              let ptr = TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData)
        else { return nil }
        return Unmanaged<CFData>.fromOpaque(ptr).takeUnretainedValue() as Data
    }()

    /// The character US would produce for `keyCode` (optionally with Shift),
    /// with dead keys resolved to their spacing form. Empty for non-typing keys.
    static func char(_ keyCode: UInt16, shift: Bool) -> String {
        guard let data = uchr else { return "" }
        return data.withUnsafeBytes { raw in
            let layout = raw.baseAddress!.assumingMemoryBound(to: UCKeyboardLayout.self)
            let mod = shift ? (UInt32(shiftKey) >> 8) & 0xFF : 0
            var dead: UInt32 = 0
            var buf = [UniChar](repeating: 0, count: 8)
            var len = 0
            UCKeyTranslate(layout, keyCode, UInt16(kUCKeyActionDown), mod,
                           UInt32(LMGetKbdType()), OptionBits(kUCKeyTranslateNoDeadKeysBit),
                           &dead, buf.count, &len, &buf)
            return String(utf16CodeUnits: buf, count: len)
        }
    }
}

struct Tables {
    let letters: [String: String]
    let marks: [String: String]
    let sups: [String: String]
    // transformation index: (previous output glyph + keystroke) → combined glyph
    let transforms: [String: String]

    static let shared: Tables = {
        guard let url = Bundle.main.url(forResource: "ipakey", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { fatalError("ipakey.json missing") }
        func rows(_ key: String, _ vk: String) -> [String: String] {
            var out: [String: String] = [:]
            for r in root[key] as? [[String: Any]] ?? [] {
                out[r["key"] as? String ?? ""] = r[vk] as? String
            }
            return out
        }
        var sups: [String: String] = [:]
        if let s = root["superscripts"] as? [String: Any] {
            for r in s["table"] as? [[String: Any]] ?? [] {
                sups[r["base"] as? String ?? ""] = r["sup"] as? String
            }
        }
        let letters = rows("letters", "glyph")
        var transforms: [String: String] = [:]
        for (k, glyph) in letters where k.count == 2 {
            let base = String(k.prefix(1)), mod = String(k.suffix(1))
            if let prev = letters[base] {
                transforms[prev + mod] = glyph
            }
        }
        return Tables(letters: letters, marks: rows("marks", "mark"),
                      sups: sups, transforms: transforms)
    }()
}

// doubled-mark upgrades: emitted single mark + same key → doubled mark
let upgrades: [String: String] = {
    var u: [String: String] = [:]
    for (k, v) in Tables.shared.marks where k.count == 2 && k.first == k.last {
        if let single = Tables.shared.marks[String(k.prefix(1))] {
            u[single + String(k.prefix(1))] = v
        }
    }
    return u
}()

// The engine mimics Apple's Korean (2-Set) input method, whose exact client
// protocol we captured with tools/probe.swift: NO marked text, ever. Each
// keystroke either inserts text at the cursor or rewrites the previous
// grapheme cluster in place via insertText(_:replacementRange:) — the same
// call pattern every Mac app must support or Hangul typing would break in it.
// There is no composition session: no underline, no state to flush on clicks,
// focus changes, or input-source switches, and nothing for a host to desync.
//
// Backspace: stacked combining marks peel off one scalar at a time (rewriting
// the cluster in place); single-codepoint glyphs are declined so the host
// performs its native delete — exactly Korean's jamo-peel-then-native pattern.
//
// Hard-won macOS 15 rules (probe- and crash-verified this session; see README):
//  - never call updateComposition()/composedString() — segfaults in the bridge
//  - never insertText an empty string — the IMK transport silently drops it
//  - the bundle must declare NSPrincipalClass, LSUIElement (not
//    LSBackgroundOnly), and set an explicit .accessory activation policy,
//    or the client discards key events the IME declines

@objc(InputController)
class InputController: IMKInputController {

    // An Option-prefixed dead-key mark, applied to the next glyph.
    private var pendingMark = ""
    // Narrow-bracket toggle for the 9 key.
    private var bracketOpen = false

    override func activateServer(_ sender: Any!) {
        // overrideKeyboard (Keyboard Viewer preview) intentionally not called:
        // reference IMEs only pass full system TIS layout IDs here, and the
        // bare in-bundle name was a misrouting suspect on macOS 15.
    }

    override func commitComposition(_ sender: Any!) {
        pendingMark = ""   // nothing else: there is never an open composition
    }

    override func handle(_ event: NSEvent!, client sender: Any!) -> Bool {
        guard event.type == .keyDown,
              let client = sender as? IMKTextInput else { return false }
        let t = Tables.shared

        if event.modifierFlags.contains(.command) || event.modifierFlags.contains(.control) {
            pendingMark = ""
            return false
        }
        if event.keyCode == 51 { return handleBackspace(client) }

        let opt = event.modifierFlags.contains(.option)
        // Decode the physical key through US, independent of the active layout.
        let s = USLayout.char(event.keyCode, shift: opt ? false : event.modifierFlags.contains(.shift))
        guard s.count == 1 else { return false }

        if opt {
            if event.modifierFlags.contains(.shift) {
                // Option-Shift: escape hatch. Insert the plain US character for
                // this key WITH Shift — e.g. Option-Shift-/ → "?". The mark
                // layer claims many shifted-symbol keys, so this is how you
                // type a literal ? ! : ~ ( ) etc.
                let raw = USLayout.char(event.keyCode, shift: true)
                guard !raw.isEmpty else { return false }
                pendingMark = ""
                insert(raw, client)
                return true
            }
            if s.first!.isNumber { insert(s, client); return true }    // literal numeral
            if let mark = t.marks[s], isCombining(mark) {
                pendingMark = mark                                     // dead-key, invisible
                return true
            }
            return false
        }

        // All previous-glyph rules operate on the DECOMPOSED view of the
        // cluster: NFC on write means diacritics sometimes fuse into the base
        // (é is one codepoint, n̥ is two), and matching against the written
        // form makes every rule behave differently for the two classes. So:
        // split into base + combining marks, match on the relevant part,
        // preserve the rest, recompose on write. On any miss, fall through —
        // a keystroke must always emit something, never dead-end.
        if let (p, r) = lastCluster(client) {
            let (base, marks) = decompose(p)
            // modifier keys transform the base glyph, diacritics survive
            if let combo = t.transforms[base + s] {
                replace(r, with: recompose(combo, marks), client); return true
            }
            // doubled mark upgrades the trailing single mark
            if let m = marks.last, let up = upgrades[String(m) + s] {
                replace(r, with: recompose(base, marks.dropLast() + Array(up.unicodeScalars)), client)
                return true
            }
            // already at the doubled mark: no further IPA meaning, so the key
            // reverts to its literal US character (decline → host types it)
            if let m = marks.last, let single = t.marks[s], upgrades[single + s] == String(m) {
                return false
            }
            // generic vowel rhoticization: R after any vowel appends the hook
            if s == "R", let b = base.first, "iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ".contains(b) {
                replace(r, with: recompose(base, marks) + "\u{02DE}", client); return true
            }
            // superscriptize (miss falls through: Shift-4 types "$" natively)
            if s == "$", let sup = t.sups[base] {
                replace(r, with: recompose(sup, marks), client); return true
            }
        }
        // 9 alternates narrow-transcription brackets
        if s == "9" {
            insert(bracketOpen ? "]" : "[", client)
            bracketOpen.toggle()
            return true
        }
        // postfix combining mark: merge into the previous cluster atomically,
        // so a bare combining scalar is never inserted on its own. Where the
        // mark has no IPA meaning — no glyph before the cursor, or the mark is
        // already on the glyph — the key reverts to its literal US character.
        if let mark = t.marks[s] {
            if isCombining(mark) {
                guard let (p, r) = lastCluster(client) else { return false }
                let (b, ms) = decompose(p)
                // marks decorate letters only — after punctuation, digits, or
                // whitespace the key is its literal US character
                guard b.first?.isLetter == true else { return false }
                if ms.contains(where: { String($0) == mark }) { return false }
                replace(r, with: (String(p) + mark).precomposedStringWithCanonicalMapping, client)
            } else {
                insert(mark, client)
            }
            return true
        }
        // letter / digit / click base
        if let glyph = t.letters[s] { insert(glyph, client); return true }
        // capitals with no transform, prose punctuation: type normally
        return false
    }

    // MARK: - backspace

    /// Diacritic peel: a cluster carrying combining marks loses its last mark
    /// (rewritten in place, through decomposition — so é peels to e just like
    /// n̥ peels to n, regardless of whether Unicode fused the pair); a bare
    /// glyph is declined so the host deletes it natively — Korean's
    /// jamo-peel-then-native pattern.
    private func handleBackspace(_ client: IMKTextInput) -> Bool {
        pendingMark = ""
        guard let (p, r) = lastCluster(client) else { return false }
        let (base, marks) = decompose(p)
        guard !marks.isEmpty else { return false }   // bare glyph: native delete
        replace(r, with: recompose(base, marks.dropLast()), client)
        return true
    }

    // MARK: - client document access (the Korean-IME call pattern)

    /// The grapheme cluster before the cursor and its UTF-16 range.
    private func lastCluster(_ client: IMKTextInput) -> (Character, NSRange)? {
        let sel = client.selectedRange()
        guard sel.location != NSNotFound, sel.location > 0, sel.length == 0 else { return nil }
        let start = max(0, sel.location - 16)
        var actual = NSRange()
        guard let s = client.string(from: NSRange(location: start, length: sel.location - start),
                                    actualRange: &actual),
              let last = s.last else { return nil }
        return (last, NSRange(location: sel.location - (String(last) as NSString).length,
                              length: (String(last) as NSString).length))
    }

    private func insert(_ text: String, _ client: IMKTextInput) {
        var out = text
        if !pendingMark.isEmpty {
            out = (text + pendingMark).precomposedStringWithCanonicalMapping
            pendingMark = ""
        }
        client.insertText(out, replacementRange: NSRange(location: NSNotFound, length: 0))
    }

    private func replace(_ range: NSRange, with new: String, _ client: IMKTextInput) {
        client.insertText(new, replacementRange: range)
    }

    /// A cluster's canonical decomposition, split into the base glyph and its
    /// trailing combining marks. The pair of views every previous-glyph rule
    /// matches against, so NFC fusion (é vs n̥) never changes rule behavior.
    private func decompose(_ c: Character) -> (base: String, marks: [Unicode.Scalar]) {
        var base = "", marks: [Unicode.Scalar] = []
        for sc in String(c).decomposedStringWithCanonicalMapping.unicodeScalars {
            if marks.isEmpty && sc.properties.canonicalCombiningClass == .notReordered {
                base.unicodeScalars.append(sc)
            } else {
                marks.append(sc)
            }
        }
        return (base, marks)
    }

    private func recompose<S: Sequence>(_ base: String, _ marks: S) -> String
    where S.Element == Unicode.Scalar {
        var s = base
        s.unicodeScalars.append(contentsOf: marks)
        return s.precomposedStringWithCanonicalMapping
    }

    private func isCombining(_ s: String) -> Bool {
        s.unicodeScalars.first.map { $0.value >= 0x300 && $0.value < 0x370 } == true
    }
}
