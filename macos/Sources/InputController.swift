import Cocoa
import InputMethodKit
import Carbon
import IOKit

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

// A diacritic on the Option layer. `spacing` marks insert in place (ˈ ː …);
// combining marks decorate the previous glyph. `double` is the second-press
// "other form"; `cycle` steps through variants (dental → apical → …).
struct Mark {
    let mark: String
    let spacing: Bool
    let double: String?
    let cycle: [String]
    // spacing clone (´ for acute, ^ for circumflex): what a combining mark
    // emits standing alone — no base to decorate, or the base already wears
    // it (the "cap"). IPA-only marks with no clone ride a no-break space.
    let clone: String?

    var standalone: String { clone ?? "\u{00A0}" + mark }
}

struct Tables {
    let letters: [String: String]
    // Option-layer diacritics, keyed by the Option key's unshifted US character.
    let optMarks: [String: Mark]
    let sups: [String: String]
    // transformation index: (previous output glyph + keystroke) → combined glyph
    let transforms: [String: String]

    static let shared: Tables = {
        guard let url = Bundle.main.url(forResource: "ipabet", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { fatalError("ipabet.json missing") }
        var letters: [String: String] = [:]
        for r in root["letters"] as? [[String: Any]] ?? [] {
            if let k = r["key"] as? String, let g = r["glyph"] as? String { letters[k] = g }
        }
        var optMarks: [String: Mark] = [:]
        for r in root["marks"] as? [[String: Any]] ?? [] {
            guard let opt = r["opt"] as? String, let mark = r["mark"] as? String else { continue }
            optMarks[opt] = Mark(mark: mark,
                                 spacing: (r["type"] as? String) == "spacing",
                                 double: r["double"] as? String,
                                 cycle: r["cycle"] as? [String] ?? [],
                                 clone: r["clone"] as? String)
        }
        var sups: [String: String] = [:]
        if let s = root["superscripts"] as? [String: Any] {
            for r in s["table"] as? [[String: Any]] ?? [] {
                if let b = r["base"] as? String, let sp = r["sup"] as? String { sups[b] = sp }
            }
        }
        var transforms: [String: String] = [:]
        for (k, glyph) in letters where k.count == 2 {
            let base = String(k.prefix(1)), mod = String(k.suffix(1))
            if let prev = letters[base] { transforms[prev + mod] = glyph }
        }
        return Tables(letters: letters, optMarks: optMarks, sups: sups, transforms: transforms)
    }()
}

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
    // Secure/password fields. macOS normally routes keystrokes AROUND the
    // IME when a field enables secure event input, so we're simply never
    // called there (the OS handles it). This closes the two documented
    // gaps (pattern verified against fcitx5-macos):
    //  1. Hosts that show password fields but never call
    //     EnableSecureEventInput — a real macOS bug; Apple's own auth sheets
    //     do this. We decline for them by bundle ID.
    //  2. A host that leaks events despite secure input being on: decline
    //     when IsSecureEventInputEnabled() AND the app we're typing into is
    //     the one that owns secure input (the PID cross-check avoids a
    //     background app's stuck secure-input state disabling IPA globally).
    private static let secureHosts: Set<String> = [
        "com.apple.loginwindow",
        "com.apple.SecurityAgent",
        "com.apple.wifi.WiFiAgent",
        "com.apple.wifi-settings-extension",
        "com.apple.systempreferences",   // Apple-ID / iCloud password sheets
        "com.apple.AppStore",            // purchase auth
    ]

    /// The app currently holding secure event input, by bundle ID (via the
    /// IORegistry console-users table), or nil.
    private static func secureInputOwner() -> String? {
        let root = IORegistryGetRootEntry(kIOMainPortDefault)
        guard root != 0 else { return nil }
        defer { IOObjectRelease(root) }
        var unmanaged: Unmanaged<CFMutableDictionary>?
        guard IORegistryEntryCreateCFProperties(root, &unmanaged, kCFAllocatorDefault, 0) == KERN_SUCCESS,
              let props = unmanaged?.takeRetainedValue() as? [String: Any],
              let users = props["IOConsoleUsers"] as? [[String: Any]] else { return nil }
        for user in users {
            if let pid = user["kCGSSessionSecureInputPID"] as? pid_t, pid != 0 {
                return NSRunningApplication(processIdentifier: pid)?.bundleIdentifier
            }
        }
        return nil
    }

    private func inSecureContext(_ bundleID: String) -> Bool {
        if Self.secureHosts.contains(bundleID) { return true }
        guard IsSecureEventInputEnabled() else { return false }
        return Self.secureInputOwner() == bundleID
    }

    // Raw-US lock: when on, every keystroke is declined — the IME is
    // transparent (for code, camelCase, shifted symbols). Toggled by
    // ⌥⇧Space or the input menu.
    //
    // Two policies (input-menu preferences, UserDefaults-backed):
    //  - global (default): one lock, session-only, cleared on arrival
    //  - per-app: the lock remembers each app (Terminal stays raw forever
    //    after one toggle), persisted across restarts, arrival-proof
    static var rawLock = false
    static var perAppLock: Bool {
        get { UserDefaults.standard.bool(forKey: "PerAppRawLock") }
        set { UserDefaults.standard.set(newValue, forKey: "PerAppRawLock") }
    }
    static var lockedApps: Set<String> {
        get { Set(UserDefaults.standard.stringArray(forKey: "RawLockedApps") ?? []) }
        set { UserDefaults.standard.set(Array(newValue), forKey: "RawLockedApps") }
    }

    private func clientBundleID() -> String {
        client()?.bundleIdentifier() ?? ""
    }

    private func isRawLocked(for bundleID: String) -> Bool {
        Self.perAppLock ? Self.lockedApps.contains(bundleID) : Self.rawLock
    }

    private func toggleRaw(for bundleID: String) {
        if Self.perAppLock {
            var apps = Self.lockedApps
            if apps.contains(bundleID) { apps.remove(bundleID) } else { apps.insert(bundleID) }
            Self.lockedApps = apps
        } else {
            Self.rawLock.toggle()
        }
    }

    override func menu() -> NSMenu! {
        let menu = NSMenu()
        let bundleID = clientBundleID()
        let lock = NSMenuItem(title: "Raw US Lock (⌥⇧Space)",
                              action: #selector(toggleRawLock(_:)), keyEquivalent: "")
        lock.target = self
        lock.state = isRawLocked(for: bundleID) ? .on : .off
        menu.addItem(lock)
        let perApp = NSMenuItem(title: "Per-App Lock",
                                action: #selector(togglePerApp(_:)), keyEquivalent: "")
        perApp.target = self
        perApp.state = Self.perAppLock ? .on : .off
        menu.addItem(perApp)
        return menu
    }

    @objc func toggleRawLock(_ sender: Any?) {
        toggleRaw(for: clientBundleID())
    }

    @objc func togglePerApp(_ sender: Any?) {
        Self.perAppLock.toggle()
    }


    // Stateless: no pending marks, no modes, nothing to desync. Every keystroke
    // reads the document and acts.

    override func activateServer(_ sender: Any!) {
        // overrideKeyboard (Keyboard Viewer preview) intentionally not called:
        // reference IMEs only pass full system TIS layout IDs here, and the
        // bare in-bundle name was a misrouting suspect on macOS 15.
    }

    override func commitComposition(_ sender: Any!) {}   // no composition to flush

    override func handle(_ event: NSEvent!, client sender: Any!) -> Bool {
        guard event.type == .keyDown,
              let client = sender as? IMKTextInput else { return false }
        let t = Tables.shared
        let flags = event.modifierFlags
        if flags.contains(.command) || flags.contains(.control) { return false }
        // Secure input (password fields): the OS already bypasses IMEs here,
        // but decline explicitly in case a host leaks events — never
        // transform what someone types into a password.
        if inSecureContext(client.bundleIdentifier() ?? "") { return false }

        let opt = flags.contains(.option)
        let shift = flags.contains(.shift)

        // ⌥⇧Space toggles the raw-US lock: the whole IME goes transparent
        // (every key native — code, camelCase, $, %) until toggled back.
        // The sticky sibling of the ⌥⇧ escape. One bit of *settings* state;
        // composition remains stateless.
        if opt && shift && event.keyCode == 49 {
            toggleRaw(for: clientBundleID())
            return true
        }
        if isRawLocked(for: clientBundleID()) { return false }

        if event.keyCode == 51 { return handleBackspace(client) }

        // Option-Shift: escape hatch. On letters/digits it inserts the raw-US
        // shifted char (⌥⇧H → H to dodge a transform, ⌥⇧1 → !, ⌥⇧4 → $). On
        // punctuation it DECLINES, so Mac's own Option-layer typography passes
        // through untouched (⌥⇧[ → “, ⌥⇧] → ’, ⌥⇧- → em-dash). Inserting the
        // plain shifted char there would clobber curly quotes and dashes.
        if opt && shift {
            let bare = USLayout.char(event.keyCode, shift: false)
            guard let c = bare.first, c.isLetter || c.isNumber else { return false }
            let raw = USLayout.char(event.keyCode, shift: true)
            guard !raw.isEmpty else { return false }
            insert(raw, client)
            return true
        }

        // Option: the postfix diacritic layer, keyed by the key's unshifted US
        // character (⌥e → acute, ⌥6 → circumflex, ⌥; → length, ⌥4 → superscript).
        if opt {
            let oc = USLayout.char(event.keyCode, shift: false)
            guard oc.count == 1 else { return false }
            if oc == "4" { return superscriptize(client) }
            if let m = t.optMarks[oc] { applyMark(m, client); return true }
            if oc.first!.isNumber { insert(oc, client); return true }   // ⌥3/5/7/8 → digit
            return false
        }

        // Number row: bare → decline (native passthrough), so a digit key is a
        // real digit key — usable as a tmux/vim/app command, not just text.
        // Shift → the IPA glyph (Shift-5 → ə, Shift-2 → ʔ …). Shifted symbols
        // (! @ # …) live on ⌥⇧.
        let bareKey = USLayout.char(event.keyCode, shift: false)
        if bareKey.count == 1, bareKey.first!.isNumber {
            if shift, let glyph = t.letters[bareKey] { insert(glyph, client); return true }
            return false
        }

        // Decode the physical key through US for the ASCII-keyed tables.
        let s = USLayout.char(event.keyCode, shift: shift)
        guard s.count == 1 else { return false }

        // Shift-letter modifiers transform the previous glyph in place; any
        // combining marks already on it survive the swap (decomposed view).
        if let (p, r) = lastCluster(client) {
            let (base, marks) = decompose(p)
            if let combo = t.transforms[base + s] {
                replace(r, with: recompose(combo, marks), client); return true
            }
            // vowel rhoticization: R after any vowel. ə and ɜ have precomposed
            // rhotic glyphs (ɚ ɝ); every other vowel takes the spacing hook ˞,
            // which has no fused form in Unicode.
            if s == "R", let b = base.first, "iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ".contains(b) {
                let out: String
                switch base {
                case "ə": out = recompose("ɚ", marks)
                case "ɜ": out = recompose("ɝ", marks)
                default:  out = recompose(base, marks) + "\u{02DE}"
                }
                replace(r, with: out, client); return true
            }
            // ejective: P after a voiceless obstruent appends ʼ (U+02BC). Open
            // class — any voiceless obstruent, matching the chart's "p t k s …".
            // Guarded like R; a non-obstruent falls through to a literal P.
            if s == "P", let b = base.first, "ptʈckqɸfθsʃʂçxχɬ".contains(b) {
                replace(r, with: recompose(base, marks) + "\u{02BC}", client); return true
            }
        }
        // letter base glyph
        if let glyph = t.letters[s] { insert(glyph, client); return true }
        // capitals with no transform, punctuation, digits 8/9/0: type literally
        return false
    }

    // MARK: - Option diacritic layer (postfix)

    private func applyMark(_ m: Mark, _ client: IMKTextInput) {
        m.spacing ? applySpacing(m, client) : applyCombining(m, client)
    }

    /// IPA bases whose descenders collide with below-marks. Marks with a
    /// positional twin ride above these: voiceless ring (n̥ but ŋ̊) and
    /// syllabic line (n̩ but ŋ̍). Position is non-contrastive; the engine
    /// owns it.
    private static let descenders: Set<Unicode.Scalar> =
        Set("gɡjɟʄpqyŋɱɳɻɭɽʂʐʝɣɖʈɥɰʒ".unicodeScalars)

    /// below-form → above-form for descender bases
    private static let positional: [Unicode.Scalar: Unicode.Scalar] = [
        "\u{0325}": "\u{030A}",   // ring below → ring above
        "\u{0329}": "\u{030D}",   // vertical line below → above (syllabic)
    ]

    /// Combining mark: decorate the previous glyph. Repeat presses cycle
    /// through the mark's forms (double / positional twin / cycle variants),
    /// wrapping around. A mark with only one form is the degenerate cycle
    /// [mark, absence]: the second press lifts it back off — its "other
    /// form" is bare. With no glyph to decorate, the standalone form
    /// (spacing clone, or NBSP-carried) — never a dead keystroke.
    private func applyCombining(_ m: Mark, _ client: IMKTextInput) {
        guard let (p, r) = lastCluster(client) else { insert(m.standalone, client); return }
        // pressing the mark key on its own standalone form: another one
        if String(p) == m.clone { insert(m.standalone, client); return }
        let (base, marks) = decompose(p)
        var scalar = m.mark.unicodeScalars.first!
        // Velarization on l: Unicode never fuses overlay marks (l + U+0334
        // stays two ragged codepoints), but the literature's dark l is the
        // atomic ɫ — emit it, and toggle back off, like the ɚ/ɝ rhotics.
        if scalar == "\u{0334}" {
            if base == "l" { replace(r, with: recompose("ɫ", marks), client); return }
            if base == "ɫ" { replace(r, with: recompose("l", marks), client); return }
        }
        if let above = Self.positional[scalar], let b = base.unicodeScalars.first,
           Self.descenders.contains(b) {
            scalar = above
        }
        if let last = marks.last {
            var forms = [scalar]
            if let dbl = m.double { forms.append(dbl.unicodeScalars.first!) }
            forms += m.cycle.map { $0.unicodeScalars.first! }
            if forms.count > 1, let i = forms.firstIndex(of: last) {
                replace(r, with: recompose(base, Array(marks.dropLast()) + [forms[(i + 1) % forms.count]]), client)
                return
            }
            if last == scalar {   // its "other form" is absence: lift it off
                replace(r, with: recompose(base, marks.dropLast()), client)
                return
            }
        }
        replace(r, with: recompose(base, marks + [scalar]), client)
    }

    /// Spacing mark: insert in place. Same mark again upgrades it (read back
    /// the just-inserted glyph and replace); on the upgraded form it cycles
    /// back (ˈ ⇄ ˌ) rather than stacking a stray mark.
    private func applySpacing(_ m: Mark, _ client: IMKTextInput) {
        if let dbl = m.double, let (p, r) = lastCluster(client) {
            if String(p) == m.mark { replace(r, with: dbl, client); return }
            if String(p) == dbl { replace(r, with: m.mark, client); return }
        }
        insert(m.mark, client)
    }

    /// ⌥4: superscriptize the previous glyph (`t` `h` ⌥4 → tʰ). No
    /// superscriptable base → the literal digit 4 (never a dead keystroke).
    private func superscriptize(_ client: IMKTextInput) -> Bool {
        if let (p, r) = lastCluster(client) {
            let (base, marks) = decompose(p)
            if let sup = Tables.shared.sups[base] {
                replace(r, with: recompose(sup, marks), client); return true
            }
        }
        insert("4", client); return true
    }

    // MARK: - backspace

    /// Diacritic peel: a cluster carrying combining marks loses its last mark
    /// (rewritten in place, through decomposition — so é peels to e just like
    /// n̥ peels to n, regardless of whether Unicode fused the pair); a bare
    /// glyph is declined so the host deletes it natively — Korean's
    /// jamo-peel-then-native pattern.
    private func handleBackspace(_ client: IMKTextInput) -> Bool {
        guard let (p, r) = lastCluster(client) else { return false }
        let (base, marks) = decompose(p)
        guard !marks.isEmpty else { return false }   // bare glyph: native delete
        // orphan combining mark (base-less cluster): peeling would mean
        // inserting an empty replacement, which the macOS 15 transport
        // silently drops — decline and let the host delete it natively.
        guard !base.isEmpty else { return false }
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
        client.insertText(text, replacementRange: NSRange(location: NSNotFound, length: 0))
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
}
