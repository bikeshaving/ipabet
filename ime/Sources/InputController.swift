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

// The controller is built on IMK's composition contract and nothing else.
// The glyph currently being assembled lives in `composing` and is shown to the
// client as marked text; it reaches the document only through a single
// insertText commit of the complete, precomposed cluster. The engine never
// reads the client's text (no selectedRange / string(from:)) and never edits
// committed text (no replacementRange reach-back) — those calls are exactly
// where host support diverges. While a glyph is composing, backspace, digraph
// merges, and mark stacking are resolved inside the IME, so behavior is
// identical in every app; once committed, text is ordinary text.
@objc(InputController)
class InputController: IMKInputController {

    // The uncommitted glyph cluster shown as marked text ("" = not composing).
    private var composing = ""
    // An Option-prefixed dead-key mark, applied to the next glyph.
    private var pendingMark = ""
    // Narrow-bracket toggle for the 9 key.
    private var bracketOpen = false

    // Override to the bundled cosmetic IPAbet layout so the on-screen Keyboard
    // Viewer shows the IPA base layer. Display-only: the engine decodes keys
    // via USLayout, so if this lookup fails on some macOS release, typing is
    // unaffected. IMK requires the override on every activation.
    override func activateServer(_ sender: Any!) {
        (sender as? IMKTextInput)?.overrideKeyboard(withKeyboardNamed: "IPAbet")
    }

    // The system calls this when composition must end (mouse click, focus
    // change, input-source switch). Flushing here is what keeps the composed
    // glyph from being lost or left dangling as marked text.
    override func commitComposition(_ sender: Any!) {
        pendingMark = ""
        guard let client = sender as? IMKTextInput else { composing = ""; return }
        commit(client)
    }

    override func handle(_ event: NSEvent!, client sender: Any!) -> Bool {
        guard event.type == .keyDown,
              let client = sender as? IMKTextInput else { return false }
        let t = Tables.shared

        // Chorded shortcuts are never ours: flush and let the app see the event.
        if event.modifierFlags.contains(.command) || event.modifierFlags.contains(.control) {
            pendingMark = ""
            commit(client)
            return false
        }

        // Backspace edits the composition one scalar at a time (mark, then
        // base) — deletion of anything the user is mid-glyph on is decided
        // here, not by the host. With nothing composing it stays native.
        if event.keyCode == 51 {
            pendingMark = ""
            guard !composing.isEmpty else { return false }
            composing = String(String.UnicodeScalarView(composing.unicodeScalars.dropLast()))
            showComposition(client)
            return true
        }

        // Editing/navigation keys end the glyph and pass through.
        // return, keypad-enter, tab, escape, forward-delete, home/end, page up/down, arrows
        switch event.keyCode {
        case 36, 76, 48, 53, 117, 115, 119, 116, 121, 123, 124, 125, 126:
            pendingMark = ""
            commit(client)
            return false
        default:
            break
        }

        let opt = event.modifierFlags.contains(.option)
        // Decode the physical key through US, independent of the active layout.
        let s = USLayout.char(event.keyCode, shift: opt ? false : event.modifierFlags.contains(.shift))
        guard s.count == 1 else { commit(client); return false }

        if opt {
            if event.modifierFlags.contains(.shift) {
                // Option-Shift: escape hatch. Insert the plain US character for
                // this key WITH Shift — e.g. Option-Shift-/ → "?". The mark
                // layer claims many shifted-symbol keys, so this is how you
                // type a literal ? ! : ~ ( ) etc.
                let raw = USLayout.char(event.keyCode, shift: true)
                guard !raw.isEmpty else { return false }
                pendingMark = ""
                commit(client)
                client.insertText(raw, replacementRange: NSRange(location: NSNotFound, length: 0))
                return true
            }
            if s.first!.isNumber { compose(s, client); return true }   // literal numeral
            if let mark = t.marks[s], isCombining(mark) {
                pendingMark = mark                                     // dead-key, invisible
                return true
            }
            commit(client)
            return false
        }

        // modifier keys transform the composing glyph in place
        if let p = composing.last, let combo = t.transforms[String(p) + s] {
            replaceLast(String(p), with: combo, client); return true
        }
        // doubled mark upgrades the one just appended
        if let m = composing.unicodeScalars.last, let up = upgrades[String(m) + s] {
            replaceLast(String(m), with: up, client); return true
        }
        // generic vowel rhoticization: R after any vowel glyph appends the hook
        if s == "R", let p = composing.last, "iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ".contains(p) {
            replaceLast(String(p), with: String(p) + "\u{02DE}", client); return true
        }
        // superscriptize
        if s == "$" {
            if let p = composing.last, let sup = t.sups[String(p)] {
                replaceLast(String(p), with: sup, client)
            }
            return true
        }
        // 9 alternates narrow-transcription brackets
        if s == "9" {
            commit(client)
            client.insertText(bracketOpen ? "]" : "[",
                              replacementRange: NSRange(location: NSNotFound, length: 0))
            bracketOpen.toggle()
            return true
        }
        // postfix mark: extends the composing glyph
        if let mark = t.marks[s] { append(mark, client); return true }
        // letter / digit / click base: previous glyph is done, start a new one
        if let glyph = t.letters[s] { compose(glyph, client); return true }
        // capitals with no transform, prose punctuation: flush, type normally
        commit(client)
        return false
    }

    // MARK: - composition

    /// Commit the previous glyph and start composing a new one.
    private func compose(_ glyph: String, _ client: IMKTextInput) {
        commit(client)
        composing = (glyph + pendingMark).precomposedStringWithCanonicalMapping
        pendingMark = ""
        showComposition(client)
    }

    /// Extend the composing glyph (postfix marks).
    private func append(_ text: String, _ client: IMKTextInput) {
        composing = (composing + text + pendingMark).precomposedStringWithCanonicalMapping
        pendingMark = ""
        showComposition(client)
    }

    /// Rewrite the tail of the composing glyph (digraph merges, upgrades).
    /// Drops by scalar count: `old` may be a lone combining mark inside the
    /// final grapheme cluster, which Character-based dropLast would overshoot.
    private func replaceLast(_ old: String, with new: String, _ client: IMKTextInput) {
        let scalars = composing.unicodeScalars.dropLast(old.unicodeScalars.count)
        composing = String(String.UnicodeScalarView(scalars)) + new
        showComposition(client)
    }

    /// Push the composition to the client as marked text (or clear it).
    private func showComposition(_ client: IMKTextInput) {
        client.setMarkedText(composing,
                             selectionRange: NSRange(location: (composing as NSString).length, length: 0),
                             replacementRange: NSRange(location: NSNotFound, length: 0))
    }

    /// Commit the composing glyph as one atomic, precomposed insertion.
    private func commit(_ client: IMKTextInput) {
        guard !composing.isEmpty else { return }
        client.insertText(composing, replacementRange: NSRange(location: NSNotFound, length: 0))
        composing = ""
    }

    private func isCombining(_ s: String) -> Bool {
        s.unicodeScalars.first.map { $0.value >= 0x300 && $0.value < 0x370 } == true
    }
}
