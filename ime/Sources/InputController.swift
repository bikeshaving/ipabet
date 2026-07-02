import Cocoa
import InputMethodKit

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

@objc(InputController)
class InputController: IMKInputController {

    // State: an Option-prefixed dead-key mark, and the narrow-bracket toggle.
    private var pendingMark = ""
    private var bracketOpen = false

    // Pin the underlying layout to US so the engine always receives the ASCII
    // key values its tables are keyed on, regardless of the user's selected
    // physical layout (Dvorak, Colemak, a non-US QWERTY, …). IMK requires this
    // to be reasserted every time the input method is activated.
    override func activateServer(_ sender: Any!) {
        (sender as? IMKTextInput)?.overrideKeyboard(withKeyboardNamed: "com.apple.keylayout.US")
    }

    override func handle(_ event: NSEvent!, client sender: Any!) -> Bool {
        guard event.type == .keyDown,
              let client = sender as? IMKTextInput else { return false }
        let t = Tables.shared
        let opt = event.modifierFlags.contains(.option)
        let s = (opt ? event.charactersIgnoringModifiers : event.characters) ?? ""
        guard s.count == 1, !event.modifierFlags.contains(.command) else { return false }
        if event.keyCode == 51 { pendingMark = ""; return false }  // backspace: native

        if opt {
            if event.modifierFlags.contains(.shift) { return false }  // Option-Shift: passthrough
            if s.first!.isNumber { insert(s, client); return true }   // literal numeral
            if let mark = t.marks[s], isCombining(mark) {
                pendingMark = mark                                     // dead-key, invisible
                return true
            }
            return false
        }

        let prev = charBeforeCursor(client)

        // modifier keys transform the previous glyph in place
        if let p = prev, let combo = t.transforms[String(p) + s] {
            replace(String(p), with: combo, client); return true
        }
        // doubled mark upgrades the one just emitted
        if let p = prev, let up = upgrades[String(p) + s] {
            replace(String(p), with: up, client); return true
        }
        // generic vowel rhoticization: R after any vowel glyph appends the hook
        if s == "R", let p = prev, "iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ".contains(p) {
            replace(String(p), with: String(p) + "\u{02DE}", client); return true
        }
        // superscriptize
        if s == "$" {
            if let p = prev, let sup = t.sups[String(p)] { replace(String(p), with: sup, client) }
            return true
        }
        // 9 alternates narrow-transcription brackets
        if s == "9" {
            insert(bracketOpen ? "]" : "[", client)
            bracketOpen.toggle()
            return true
        }
        // postfix mark
        if let mark = t.marks[s] { insert(mark, client); return true }
        // letter / digit / click base
        if let glyph = t.letters[s] { insert(glyph, client); return true }
        return false   // capitals with no transform, prose punctuation: type normally
    }

    // MARK: - helpers

    private func isCombining(_ s: String) -> Bool {
        s.unicodeScalars.first.map { $0.value >= 0x300 && $0.value < 0x370 } == true
    }

    private func insert(_ text: String, _ client: IMKTextInput) {
        var out = text
        if !pendingMark.isEmpty {
            out = (text + pendingMark).precomposedStringWithCanonicalMapping
            pendingMark = ""
        }
        client.insertText(out, replacementRange: NSRange(location: NSNotFound, length: 0))
    }

    private func replace(_ old: String, with new: String, _ client: IMKTextInput) {
        let sel = client.selectedRange()
        let n = (old as NSString).length
        guard sel.location != NSNotFound, sel.location >= n else { return }
        client.insertText(new, replacementRange: NSRange(location: sel.location - n, length: n))
    }

    private func charBeforeCursor(_ client: IMKTextInput) -> Character? {
        let sel = client.selectedRange()
        guard sel.location != NSNotFound, sel.location > 0 else { return nil }
        var actual = NSRange()
        let s = client.string(from: NSRange(location: max(0, sel.location - 2),
                                            length: min(2, sel.location)), actualRange: &actual)
        return s?.last
    }
}
