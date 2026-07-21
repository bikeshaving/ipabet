import Cocoa
import InputMethodKit
import Carbon
import IOKit

// Decodes a physical key through a fixed US layout, so the ASCII-keyed tables
// work regardless of the active layout. The active layout's delivered
// characters are never consulted for logic.
enum USLayout {
    private static let uchr: Data? = {
        let filter = [kTISPropertyInputSourceID as String: "com.apple.keylayout.US"] as CFDictionary
        guard let cf = TISCreateInputSourceList(filter, true)?.takeRetainedValue(),
              let list = cf as? [TISInputSource], let src = list.first,
              let ptr = TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData)
        else { return nil }
        return Unmanaged<CFData>.fromOpaque(ptr).takeUnretainedValue() as Data
    }()

    /// The character US would produce for `keyCode`, dead keys resolved.
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

// A diacritic on the Option layer. `spacing` marks insert postfix; combining
// marks are prefix and the next base absorbs them. `double` is the ⌥⇧ form.
struct Mark {
    let mark: String
    let spacing: Bool
    let double: String?
    /// The ⌥⇧ form is SPACING while the ⌥ form is combining. Spacing is a
    /// property of the FORM, not the key.
    let doubleSpacing: Bool
    /// Spacing form of a combining mark (´ for acute). Nil for IPA-only marks.
    let clone: String?
    /// Repeat-press family: the key again on its own pending mark advances
    /// through these and wraps.
    let cycle: [String]
    /// The ⌥⇧ form's repeat-press family, exactly as `cycle` is for ⌥.
    let doubleCycle: [String]
}

struct Tables {
    let letters: [String: String]
    // Option-layer diacritics, keyed by the Option key's unshifted US character.
    let optMarks: [String: Mark]
    let sups: [String: String]
    let subs: [String: String]
    let unsup: [String: String]
    let unsub: [String: String]
    // transformation index: (previous output glyph + keystroke) → combined glyph
    let transforms: [String: String]
    /// glyph → its two-key spelling, for ⌃⌫ unconvert (θ → "tH"). First key wins.
    let unconvertKey: [String: String]
    /// combining scalar → its spacing form, for the dead-key preview.
    let clones: [Unicode.Scalar: String]
    /// A mark and its ⌥⇧ twin are two values of ONE feature, so the twin
    /// *replaces* rather than stacks. Shape-twins that stack are absent.
    let exclusiveTwin: [Unicode.Scalar: Unicode.Scalar]
    /// ⌥⇧<digit> slots spent on a character (⌥⇧1 → ¡). See spec `optShift`.
    let optShiftDigits: [String: String]
    /// locale → [openPrimary, closePrimary, openSecondary, closeSecondary].
    let quoteLocales: [String: [String]]
    let quoteDefault: String

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
        var clones: [Unicode.Scalar: String] = [:]
        var exclusiveTwin: [Unicode.Scalar: Unicode.Scalar] = [:]
        for r in root["marks"] as? [[String: Any]] ?? [] {
            guard let opt = r["opt"] as? String, let mark = r["mark"] as? String else { continue }
            let clone = r["clone"] as? String
            optMarks[opt] = Mark(mark: mark,
                                 spacing: (r["type"] as? String) == "spacing",
                                 double: r["double"] as? String,
                                 doubleSpacing: r["doubleSpacing"] as? Bool == true,
                                 clone: clone,
                                 cycle: r["cycle"] as? [String] ?? [],
                                 doubleCycle: r["doubleCycle"] as? [String] ?? [])
            if let c = clone, let sc = mark.unicodeScalars.first { clones[sc] = c }
            if let dc = r["doubleClone"] as? String,
               let ds = (r["double"] as? String)?.unicodeScalars.first { clones[ds] = dc }
            if r["exclusive"] as? Bool == true,
               let ms = mark.unicodeScalars.first,
               let ds = (r["double"] as? String)?.unicodeScalars.first {
                exclusiveTwin[ms] = ds
                exclusiveTwin[ds] = ms
            }
        }
        var optShiftDigits: [String: String] = [:]
        for (k, v) in root["optShift"] as? [String: Any] ?? [:] {
            if k.count == 1, k.first!.isNumber, let ch = v as? String { optShiftDigits[k] = ch }
        }
        var quoteLocales: [String: [String]] = [:]
        var quoteDefault = "en"
        if let q = root["quotes"] as? [String: Any] {
            quoteLocales = q["locales"] as? [String: [String]] ?? [:]
            quoteDefault = q["default"] as? String ?? "en"
        }
        var sups: [String: String] = [:]
        if let s = root["superscripts"] as? [String: Any] {
            for r in s["table"] as? [[String: Any]] ?? [] {
                if let b = r["base"] as? String, let sp = r["sup"] as? String { sups[b] = sp }
            }
        }
        var subs: [String: String] = [:]
        if let s = root["subscripts"] as? [String: Any] {
            for r in s["table"] as? [[String: Any]] ?? [] {
                if let b = r["base"] as? String, let sp = r["sub"] as? String { subs[b] = sp }
            }
        }
        // Raised/lowered glyph → its plain base, for unraise-transform-re-raise.
        var unsup: [String: String] = [:]
        for (b, sp) in sups where unsup[sp] == nil { unsup[sp] = b }
        var unsub: [String: String] = [:]
        for (b, sb) in subs where unsub[sb] == nil { unsub[sb] = b }
        var transforms: [String: String] = [:]
        var unconvertKey: [String: String] = [:]
        for (k, glyph) in letters where k.count == 2 {
            if unconvertKey[glyph] == nil { unconvertKey[glyph] = k }
            let base = String(k.prefix(1)), mod = String(k.suffix(1))
            // A leading digit is a literal base a modifier transforms (5H → ɜ).
            let prev = base.first!.isNumber ? base : letters[base]
            if let prev = prev { transforms[prev + mod] = glyph }
        }
        return Tables(letters: letters, optMarks: optMarks, sups: sups, subs: subs,
                      unsup: unsup, unsub: unsub,
                      transforms: transforms, unconvertKey: unconvertKey, clones: clones, exclusiveTwin: exclusiveTwin,
                      optShiftDigits: optShiftDigits,
                      quoteLocales: quoteLocales, quoteDefault: quoteDefault)
    }()
}

// NOTHING COMPOSES. Every glyph commits to the document as it is typed, and
// every previous-glyph rule rewrites it in place via
// insertText(_:replacementRange:) — Apple's 2-Set Korean pattern, the call
// every Mac app must support or Hangul typing would break.
//
// The pending prefix diacritic is the sole exception, and is a preview rather
// than document content: it lives in the marked range, highlighted as the US
// layout's ⌥e dead key is — the representation that works even in Terminal.app,
// where a committed NBSP+combining renders as "<032a>".
//
// Backspace peels stacked combining marks one scalar at a time; a bare glyph is
// declined so the host performs its native delete.
//
// The macOS 15 IMK landmines this code is shaped around — the calls that
// segfault, the ones the transport drops, the load-bearing bundle keys — are in
// README.md under "Hard-won macOS 15 rules". Read it before changing any of it.

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

    private func clientBundleID() -> String {
        client()?.bundleIdentifier() ?? ""
    }

        // The input menu IS the settings surface: System Settings offers
        // third-party input methods no options UI. Rebuilt on every open.
    override func menu() -> NSMenu! {
        let menu = NSMenu()
        let t = Tables.shared
        let active = UserDefaults.standard.string(forKey: "quoteLocale") ?? t.quoteDefault
        let quotes = NSMenuItem(title: "Quote Style", action: nil, keyEquivalent: "")
        let sub = NSMenu()
        for locale in t.quoteLocales.keys.sorted() {
            let quad = t.quoteLocales[locale] ?? []
            let sample = quad.count == 4 ? "   \(quad[0])a\(quad[1]) \(quad[2])a\(quad[3])" : ""
            let item = NSMenuItem(title: locale + sample,
                                  action: #selector(setQuoteLocaleItem(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = locale
            item.state = locale == active ? .on : .off
            sub.addItem(item)
        }
        quotes.submenu = sub
        menu.addItem(quotes)

        menu.addItem(.separator())
        let chart = NSMenuItem(title: "IPA Cheat Sheet",
                               action: #selector(openCheatSheet(_:)), keyEquivalent: "")
        chart.target = self
        menu.addItem(chart)
        let site = NSMenuItem(title: "ipabet.org/keys",
                              action: #selector(openSite(_:)), keyEquivalent: "")
        site.target = self
        menu.addItem(site)
        return menu
    }

    @objc func setQuoteLocaleItem(_ sender: NSMenuItem) {
        if let locale = sender.representedObject as? String {
            UserDefaults.standard.set(locale, forKey: "quoteLocale")
        }
    }

    /// The bundled one-page chart — the printable cheat sheet, offline.
    @objc func openCheatSheet(_ sender: Any?) {
        if let url = Bundle.main.url(forResource: "chart", withExtension: "pdf") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func openSite(_ sender: Any?) {
        if let url = URL(string: "https://ipabet.org/keys") { NSWorkspace.shared.open(url) }
    }


    override func activateServer(_ sender: Any!) {
        pending = []
        // overrideKeyboard (Keyboard Viewer preview) intentionally not called:
        // reference IMEs only pass full system TIS layout IDs here, and the
        // bare in-bundle name was a misrouting suspect on macOS 15.
        Dbg.refresh()   // pick up tools/debug.sh on/off without a reinstall
        Dbg.log("── activate app=\(clientBundleID()) ──")
    }

    /// The host is taking the composition away (click, focus loss, source switch).
    override func commitComposition(_ sender: Any!) {
        if let c = (sender as? IMKTextInput) ?? client() { flush(c) }
    }

    override func deactivateServer(_ sender: Any!) {
        if let c = (sender as? IMKTextInput) ?? client() { flush(c) }
    }

    // Shift-chaining state: BROKEN by a shift release, re-armed by producing an
    // IPA segment. `chainBroken` persists across keystrokes.
    private var shiftWasDown = false
    private var shiftReleased = false
    private var chainBroken = false

        // flagsChanged too, not just keyDown — that is how a shift release between
        // two keystrokes is seen.
    override func recognizedEvents(_ sender: Any!) -> Int {
        return Int(NSEvent.EventTypeMask.keyDown.rawValue | NSEvent.EventTypeMask.flagsChanged.rawValue)
    }

    override func handle(_ event: NSEvent!, client sender: Any!) -> Bool {
        // Track shift up/down transitions without ever consuming the event.
        if event.type == .flagsChanged {
            let nowShift = event.modifierFlags.contains(.shift)
            if shiftWasDown && !nowShift {
                shiftReleased = true                                // a release
                Dbg.log("⇧ released")
            }
            shiftWasDown = nowShift
            return false
        }
        guard event.type == .keyDown,
              let client = sender as? IMKTextInput else { return false }
        let t = Tables.shared
        let flags = event.modifierFlags
        Dbg.log("↓ kc=\(event.keyCode) ch=\(Dbg.str(event.characters)) mods=\(Dbg.mods(flags)) app=\(client.bundleIdentifier() ?? "?")")
        // Secure input (password fields): the OS already bypasses IMEs here, but
        // decline explicitly in case a host leaks events — never transform, and
        // never run the escape below, into a password.
        if inSecureContext(client.bundleIdentifier() ?? "") { return false }
        // Command chords always pass, and Control chords are leader keys — with one
        // exception: ⌃⇧<letter> is the escape to a literal capital.
        if flags.contains(.command) { Dbg.log("  → pass (cmd chord)"); flush(client); return false }
        if flags.contains(.control) {
            if flags.contains(.shift) {
                let oc = USLayout.char(event.keyCode, shift: false)
                if oc.count == 1, oc.first!.isLetter {
                    flush(client)
                    let cap = oc.uppercased()
                    insert(cap, client)
                    Dbg.log("  → ⌃⇧ escape → literal '\(cap)'")
                    return true
                }
            }
            // ⌃⌫ — unconvert: the committed transform before the cursor becomes its
            // literal keystroke spelling (θ → "tH"). While marks pend it peels.
            if event.keyCode == 51 {
                if !pending.isEmpty {
                    pending.removeLast()
                    updateMarked(client)
                    return true
                }
                if unconvert(client) { return true }
                flush(client)   // declining with an open cluster would desync it
                return false
            }
            Dbg.log("  → pass (ctrl chord — leader keys land here)")
            flush(client)
            return false
        }

        let opt = flags.contains(.option)
        let shift = flags.contains(.shift)


        // Once broken the chain stays broken until a segment re-arms it. chainLive
        // gates the capital rebase and the capital-digraph rule below.
        if shiftReleased { chainBroken = true; shiftReleased = false }
        let chainLive = !chainBroken

        // The pending accent is peeled first, before the document is touched.
        if event.keyCode == 51 {
            if !pending.isEmpty {
                pending.removeLast()
                Dbg.log("  → backspace peels pending")
                updateMarked(client)
                return true
            }
            return handleBackspace(client)
        }

        // Esc and space commit the spacing clones and are consumed; with nothing
        // pending both pass untouched.
        if event.keyCode == 53, !flags.contains(.option) {
            if !pending.isEmpty { flush(client); return true }
            return false           // nothing pending: Esc stays the app's
        }
        if event.keyCode == 49, !flags.contains(.option), !pending.isEmpty {
            // Nothing to commit (an operator alone) → the arm lifts and the
            // space stays a space; swallowing it would eat a real keystroke.
            let writes = !commitString().isEmpty
            flush(client)
            return writes
        }

        // Option-Shift: a mark's second form. With no claim it DECLINES, so the
        // host's own Option typography passes (⌥⇧/ ¿, ⌥⇧- —).
        if opt && shift {
            let oc = USLayout.char(event.keyCode, shift: false)
            // The tie bar's BELOW form (⌥⇧j → U+035C, colliding descenders: t͜ɕ d͜ʒ).
            if oc == "j" { emitJoiner(Self.tieBelow, client); return true }
            // Locale quotes: ⌥⇧[ closes primary, ⌥⇧] closes secondary.
            if oc == "[" { flush(client); insert(quoteQuad()[1], client); return true }
            if oc == "]" { flush(client); insert(quoteQuad()[3], client); return true }
            // ⌥⇧z lowers the previous glyph — the shifted twin of ⌥z's raise.
            if oc == "z" { return armOperator(Self.lowerOp, client) }
            // secondary form of a two-form mark (⌥⇧n → creaky).
            if oc.count == 1, let m = t.optMarks[oc], m.double != nil {
                applyMark(m, secondary: true, client); return true
            }
            // A deliberately spent digit slot (⌥⇧1 → ¡); everything else declines.
            guard let c = oc.first, c.isNumber else { flush(client); return false }
            if let spent = t.optShiftDigits[oc] { flush(client); insert(spent, client); return true }
            guard t.letters[oc] != nil else { flush(client); return false }
            let raw = USLayout.char(event.keyCode, shift: true)
            guard !raw.isEmpty else { flush(client); return false }
            flush(client)
            insert(raw, client)
            return true
        }

        // Option: the diacritic layer, keyed by the key's unshifted US character.
        // Combining marks are PREFIX (dead-key style); spacing marks stay postfix.
        if opt {
            let oc = USLayout.char(event.keyCode, shift: false)
            guard oc.count == 1 else { flush(client); return false }
            // The tie bar is a postfix JOINER: it attaches to the PREVIOUS segment.
            if oc == "j" { emitJoiner(Self.tieAbove, client); return true }
            // Locale quotes: ⌥[ opens primary, ⌥] opens secondary.
            if oc == "[" { flush(client); insert(quoteQuad()[0], client); return true }
            if oc == "]" { flush(client); insert(quoteQuad()[2], client); return true }
            // ⌥z raises the previous glyph — the operators live on the prime chord.
            if oc == "z" { return armOperator(Self.raiseOp, client) }
            // Unicode has no combining rhotic hook, so ˞ is spacing and the join is the
            // font's job. The one join owed is ə/ɜ → precomposed ɚ/ɝ.
            if oc == "r", pending.isEmpty, let (p, site) = prevCluster(client) {
                let (base, marks) = decompose(p)
                if base == "ə" { rewrite(site, with: recompose("ɚ", marks), client); return true }
                if base == "ɜ" { rewrite(site, with: recompose("ɝ", marks), client); return true }
            }
            // ⌥. on its own pending dot commits the INTERPUNCT (l ⌥. ⌥. l → l·l).
            if oc == ".", pending.count == 1, pending[0].value == 0x0307 {
                pending = []
                flush(client)                 // the open cluster commits; the dot is spent
                insert("\u{00B7}", client)
                return true
            }
            if let m = t.optMarks[oc] { applyMark(m, secondary: false, client); return true }
            // An unassigned ⌥ key declines, so the host's ⌥6 §, ⌥7 ¶, ⌥8 • survive.
            flush(client)
            return false
        }

        // Number row: bare and shifted digits both decline to the host. A pending
        // prefix diacritic absorbs onto the bare digit.
        let bareKey = USLayout.char(event.keyCode, shift: false)
        if bareKey.count == 1, bareKey.first!.isNumber {
            if !shift, !pending.isEmpty { emitBase(bareKey, client); return true }
            flush(client)
            return false
        }

        // Caps Lock types the literal CAPITAL and never acts as ⇧, so Caps-Lock T
        // then H is "TH", not θ. A pending accent still absorbs onto it.
        if flags.contains(.capsLock), !shift {
            let oc = USLayout.char(event.keyCode, shift: false)
            if oc.count == 1, oc.first!.isLetter {
                Dbg.log("  → caps lock → literal '\(oc.uppercased())'")
                emitBase(oc.uppercased(), client)
                return true
            }
        }

        // Decode the physical key through US for the ASCII-keyed tables.
        let s = USLayout.char(event.keyCode, shift: shift)
        guard s.count == 1 else { flush(client); return false }

        // Shift-letter modifiers transform the previous glyph in place; its combining
        // marks survive the swap. Skipped while an accent pends.
        if pending.isEmpty, let (p, site) = prevCluster(client) {
            let (base0, marks) = decompose(p)
            var base = base0
            // A capital right after a non-ASCII IPA glyph with shift still held is a
            // pending base — lower it so this modifier transforms it. Otherwise it is a
            // fresh capital digraph (⇧A⇧E → Æ), which declines under Caps Lock.
            if shift, !flags.contains(.capsLock),
               base.count == 1, let bc = base.unicodeScalars.first, (65...90).contains(bc.value) {
                let p2Segment = clusterBefore(site, client).map {
                    String($0).unicodeScalars.contains(where: isSegmentScalar)
                } ?? false
                if p2Segment, chainLive {
                    base = base.lowercased()
                } else if let low = t.transforms[base.lowercased() + s],
                          let up = Self.capitalOf(low) {
                    Dbg.log("  → capital digraph \(base)+\(s) ⇒ \(Dbg.str(up))")
                    rewrite(site, with: recompose(up, marks), client)
                    chainBroken = false; return true
                }
            }
            // The shifted digit is the digit's capital plane (⇧5⇧Y → Ə), gated on the
            // live chain.
            if chainLive, !flags.contains(.capsLock),
               let digit = ["!": "1", "@": "2", "#": "3", "$": "4", "%": "5",
                            "^": "6", "&": "7", "*": "8", "(": "9", ")": "0"][base],
               let low = t.transforms[digit + s],
               let up = Self.capitalOf(low) {
                Dbg.log("  → digit capital \(base)+\(s) ⇒ \(Dbg.str(up))")
                rewrite(site, with: recompose(up, marks), client)
                chainBroken = false; return true
            }
            if let combo = t.transforms[base + s] {
                Dbg.log("  → transform \(Dbg.str(base))+\(s) ⇒ \(Dbg.str(combo))")
                rewrite(site, with: recompose(combo, marks), client)
                chainBroken = false; return true
            }
            // A raised or lowered glyph still transforms: unraise, transform, re-raise.
            // This is what lets the operator be prefix — armed, it could never know
            // when a digraph ends.
            let raised = t.unsup[base]
            if let plain = raised ?? t.unsub[base],
               let mid = t.transforms[plain + s],
               let back = (raised != nil ? t.sups : t.subs)[mid] {
                Dbg.log("  → transform through raise \(Dbg.str(base))+\(s) ⇒ \(Dbg.str(back))")
                rewrite(site, with: recompose(back, marks), client)
                chainBroken = false; return true
            }
        }
        // letter base glyph — absorbing any pending prefix diacritics
        if let glyph = t.letters[s] {
            Dbg.log("  → emitBase '\(glyph)'")
            emitBase(glyph, client)
            // A non-ASCII base (5 ⇧Y → ə) is an IPA segment and re-arms the chain.
            if glyph.unicodeScalars.contains(where: { $0.value > 127 }) { chainBroken = false }
            return true
        }
        // A pending accent absorbs onto a CAPITAL base (⌥u ⇧A → Ä); the letters
        // table is lowercase-keyed, so without this it commits as a spacing clone.
        if !pending.isEmpty, s.count == 1, let c = s.unicodeScalars.first,
           (65...90).contains(c.value) {
            Dbg.log("  → emitBase capital '\(s)'")
            emitBase(s, client); return true
        }
        // Not a base: the pending accent commits as its spacing form, key passes.
        flush(client)
        Dbg.log("  → pass (literal '\(s)')")
        return false
    }

    // MARK: - Option diacritic layer

    /// Apply a mark's primary (⌥) or secondary (⌥⇧, the `double`) form.
    private func applyMark(_ m: Mark, secondary: Bool, _ client: IMKTextInput) {
        let scalarStr = (secondary ? m.double : nil) ?? m.mark
        // Spacing belongs to the FORM, not the key.
        let spacing = (secondary && m.double != nil) ? m.doubleSpacing : m.spacing
        if spacing {
            flush(client)          // a pending accent commits before a spacing mark
            applySpacing(scalarStr, client)
        } else {
            applyCombining(scalarStr, client, cycle: secondary ? m.doubleCycle : m.cycle)
        }
    }

// Each above/below placement is its own keystroke (⌥k/⌥⇧k, ⌥s/⌥⇧s, ⌥j/⌥⇧j).
// The engine emits the mark asked for, on the base asked for.

    // MARK: - the pending accent (real marked text, like the US dead keys)
    //
    // Never updateComposition()/composedString() — they segfault in the bridge;
    // never insertText("") — the IMK transport silently drops it.

    /// The accumulated prefix diacritics awaiting a base. Empty = no composition.
    private var pending: [Unicode.Scalar] = []

    /// ⌥z / ⌥⇧z pend as private-use sentinels, not combining scalars: nothing is
    /// stacked onto the base, the base is SUBSTITUTED. They preview as ⁻ / ₋ —
    /// every other small mark is already a diacritic's clone, or is IPA's own
    /// raised/lowered pair on ⌥g — and commit as nothing.
    private static let raiseOp: Unicode.Scalar = "\u{F8F0}"
    private static let lowerOp: Unicode.Scalar = "\u{F8F1}"
    private static let opPreview: [Unicode.Scalar: String] = [raiseOp: "\u{207B}", lowerOp: "\u{208B}"]
    /// The grapheme cluster before the cursor, read from the document.
    private func prevCluster(_ client: IMKTextInput) -> (Character, NSRange)? {
        return lastCluster(client)
    }

    /// Rewrite the previous cluster in place, over its committed range.
    private func rewrite(_ r: NSRange, with new: String, _ client: IMKTextInput) {
        replace(r, with: new, client)
    }

    /// Emit `s`. Every glyph commits to the document immediately — there is
    /// no active cluster and no composition to hold one.
    private func openCluster(_ s: String, _ client: IMKTextInput) {
        insert(s, client)
    }

    /// The tie bar (⌥j) and its below-form (⌥⇧j). See `laws.tieBar`.
    private static let tieAbove: Unicode.Scalar = "\u{0361}"
    private static let tieBelow: Unicode.Scalar = "\u{035C}"
    /// ⌥j/⌥⇧j is a placement pair; the other chord flips placement, the same
    /// chord again toggles sliding ͢ and back.
    private static let slide: Unicode.Scalar = "\u{0362}"
    /// NFC cannot fuse an overlay, so every combination Unicode encodes atomically
    /// must be emitted atomic — a raw combining render is a permanent homoglyph
    /// (i̵ beside ɨ fails search forever). Horizontal-bar atoms only.
    private static let stroked: [String: String] = [
        "l": "ł", "L": "Ł", "d": "đ", "D": "Đ", "t": "ŧ", "T": "Ŧ",
        "g": "ǥ", "G": "Ǥ", "h": "ħ", "H": "Ħ", "b": "ƀ", "B": "Ƀ",
        "z": "ƶ", "Z": "Ƶ", "i": "ɨ", "I": "Ɨ", "u": "ʉ", "U": "Ʉ",
        "o": "ɵ", "O": "Ɵ", "j": "ɟ", "r": "ɍ", "R": "Ɍ", "y": "ɏ",
        "Y": "Ɏ", "c": "ȼ", "C": "Ȼ", "p": "ᵽ", "P": "Ᵽ", "k": "ꝁ",
        "K": "Ꝁ", "2": "ƻ",
    ]

    /// The tilde overlay's family — the middle-tilde atoms plus the dark ls.
    private static let tilded: [String: String] = [
        "l": "ɫ", "L": "Ɫ", "b": "ᵬ", "d": "ᵭ", "f": "ᵮ", "m": "ᵯ",
        "n": "ᵰ", "p": "ᵱ", "r": "ᵲ", "s": "ᵴ", "t": "ᵵ", "z": "ᵶ",
    ]

    /// Each pending mark as its spacing glyph where one exists, else the bare
    /// combining glyph. Never a dotted circle — U+25CC renders enormous in some
    /// hosts.
    private func previewString() -> String {
        guard !pending.isEmpty else { return "" }
        let clones = Tables.shared.clones
        var s = ""
        for sc in pending {
            if let p = Self.opPreview[sc] { s += p }
            else if let c = clones[sc] { s += c } else { s.unicodeScalars.append(sc) }
        }
        return s
    }

    /// Push the pending dead-key preview into the marked-text range, or clear it.
    private func updateMarked(_ client: IMKTextInput) {
        let s = previewString()
        let none = NSRange(location: NSNotFound, length: 0)
        guard !s.isEmpty else {
            Dbg.log("    marked: clear")
            client.setMarkedText("", selectionRange: NSRange(location: 0, length: 0),
                                 replacementRange: none)
            return
        }
        // Captured with tools/probe.swift against an instrumented NSTextView:
        //   Apple's ⌥e (a *layout* dead key, set by TSM directly in the client):
        //     setMarkedText "´" [U+00B4] sel=(1,0) attrs=<plain String, none>
        //     → NSTextView draws its yellow dead-key highlight.
        //   Ours, through the IMK bridge, passing a plain String:
        //     setMarkedText "´" attrs={NSUnderline=2, NSUnderlineColor=blue, …}
        //     → IMK *stamps* composition styling on, so we get an underline.
        // IMK only supplies those as a DEFAULT: our own attributed string wins.
        // So to be a dead key rather than a composition, we set the highlight
        // ourselves and suppress the underline. (This is the same lever xkey
        // uses in reverse — it omits backgroundColor "to prevent highlighting".)
        let len = (s as NSString).length
        let a = NSMutableAttributedString(string: s, attributes: [
            .backgroundColor: NSColor.systemYellow.withAlphaComponent(0.45),
            .foregroundColor: NSColor.textColor,
            .underlineStyle: 0,
        ])
        Dbg.log("    marked: '\(Dbg.str(s))' sel=(\(len),0)")
        client.setMarkedText(a,
                             selectionRange: NSRange(location: len, length: 0),
                             replacementRange: none)
    }

    /// What a pending composition writes when it commits: a mark as its spacing
    /// clone, an operator as nothing.
    private func commitString() -> String {
        let clones = Tables.shared.clones
        var s = ""
        for sc in pending where Self.opPreview[sc] == nil {
            if let c = clones[sc] { s += c } else { s.unicodeScalars.append(sc) }
        }
        return s
    }

    private func flush(_ client: IMKTextInput) {
        let s = commitString()
        guard !s.isEmpty else {
            // An operator alone leaves nothing behind: the arm just lifts.
            if !pending.isEmpty { pending = []; updateMarked(client) }
            return
        }
        pending = []
        Dbg.log("    flush → '\(Dbg.str(s))'")
        insert(s, client)   // insertText over marked text commits & clears it
    }

    /// A contour tone is its LEVEL tones typed in order — the keystroke is the
    /// tone number. Where Unicode encodes that sequence as one character it is
    /// emitted instead of stacking or replacing, the same law the stroke and
    /// tilde overlays follow, and what lets ⌥e ⌥⇧e spell a contour rather than
    /// the twin replacing its partner. Mirrors js/src/index.ts.
    private static let contours: [String: Unicode.Scalar] = [
        "\u{030F}\u{030B}": "\u{030C}",           // ˩˥  extra low → extra high   rising
        "\u{030B}\u{030F}": "\u{0302}",           // ˥˩  extra high → extra low   falling
        "\u{0301}\u{030B}": "\u{1DC4}",           // ˦˥  high → extra high        high rising
        "\u{030F}\u{0300}": "\u{1DC5}",           // ˩˨  extra low → low          low rising
        "\u{0304}\u{0301}\u{0304}": "\u{1DC8}",  // ˧˦˧ mid → high → mid        rising-falling
    ]

    /// Fold the pending levels into the contour this mark completes, if any.
    private func applyContour(_ scalar: Unicode.Scalar, _ client: IMKTextInput) -> Bool {
        for len in [3, 2] {
            let keep = pending.count - (len - 1)
            guard keep >= 0 else { continue }
            var key = String(String.UnicodeScalarView(pending[keep...]))
            key.unicodeScalars.append(scalar)
            if let atom = Self.contours[key] {
                pending = Array(pending[0..<keep]) + [atom]
                updateMarked(client)
                return true
            }
        }
        return false
    }

    /// Combining ⌥ diacritic, PREFIX: stack the mark into the marked-text preview.
    /// The same form again peels it off, unless the key declares a CYCLE, which
    /// advances through the family and wraps.
    private func applyCombining(_ scalarStr: String, _ client: IMKTextInput, cycle: [String] = []) {
        let scalar = scalarStr.unicodeScalars.first!
        if applyContour(scalar, client) { return }
        let family = [scalar] + cycle.compactMap { $0.unicodeScalars.first }
        if !cycle.isEmpty, let top = pending.last, let at = family.firstIndex(of: top) {
            pending[pending.count - 1] = family[(at + 1) % family.count]
        } else if pending.last == scalar {
            pending.removeLast()                       // same form again: peel it off
        } else {
        // An exclusive dual replaces its twin; independent shape-twins stack.
            if let twin = Tables.shared.exclusiveTwin[scalar] {
                pending.removeAll { $0 == twin }
            }
            pending.append(scalar)
        }
        updateMarked(client)
    }

    /// The active quote quad, from the `quoteLocale` user default.
    private func quoteQuad() -> [String] {
        let t = Tables.shared
        let locale = UserDefaults.standard.string(forKey: "quoteLocale") ?? t.quoteDefault
        return t.quoteLocales[locale] ?? t.quoteLocales[t.quoteDefault] ?? ["\u{201C}", "\u{201D}", "\u{2018}", "\u{2019}"]
    }

    /// ⌥j / ⌥⇧j: emit a joiner, or rewrite the one just emitted.
    private func emitJoiner(_ start: Unicode.Scalar, _ client: IMKTextInput) {
        if pending.isEmpty, let (p, site) = prevCluster(client), let last = p.unicodeScalars.last {
            let ties: [Unicode.Scalar] = [Self.tieAbove, Self.tieBelow]
            let next: Unicode.Scalar? =
                last == start ? Self.slide :
                last == Self.slide ? start :
                ties.contains(last) ? start : nil
            if let next = next {
                var scalars = Array(p.unicodeScalars.dropLast())
                scalars.append(next)
                rewrite(site, with: String(String.UnicodeScalarView(scalars)), client)
                return
            }
                // No walk: the joiner APPENDS to the previous segment, after the
                // committed text — a lone combining mark never opens a composition.
            insert(String(start), client)
            return
        }
        if !pending.isEmpty { emitBase(String(start), client); return }
        insert(String(start), client)
    }

    /// Emit a base glyph, absorbing any pending prefix diacritics.
    private func emitBase(_ glyph: String, _ client: IMKTextInput) {
        guard !pending.isEmpty else {
            Dbg.log("    emitBase: no pending → open '\(glyph)'")
            openCluster(glyph, client); return
        }
        let marks = pending
        pending = []
            // Raise/lower substitutes the glyph itself; any marks ride the result.
        if let op = marks.first(where: { $0 == Self.raiseOp || $0 == Self.lowerOp }) {
            let rest = marks.filter { $0 != op }
            let table = op == Self.raiseOp ? Tables.shared.sups : Tables.shared.subs
            let out = recompose(table[glyph] ?? glyph, rest)
            Dbg.log("    emitBase: operator → open '\(Dbg.str(out))'")
            openCluster(out, client); return
        }
        // tilde overlay: middle-tilde atoms (ɫ Ɫ ᵯ …) — ɫ is also a digraph, l⇧Q
        if marks.count == 1, marks[0] == "\u{0334}",
           let t = Self.tilded[glyph] {
            Dbg.log("    emitBase: open \(t)")
            openCluster(t, client); return
        }
        // stroke overlay: the orthographic letters are precomposed (⌥y l → ł).
        if marks.count == 1, marks[0] == "\u{0335}",
           let s = Self.stroked[glyph] {
            Dbg.log("    emitBase: open \(s)")
            openCluster(s, client); return
        }
        let out = recompose(glyph, marks)
        Dbg.log("    emitBase: open '\(Dbg.str(out))'")
        openCluster(out, client)
    }

    /// Spacing mark: insert it in place, postfix.
    private func applySpacing(_ scalarStr: String, _ client: IMKTextInput) {
        flush(client)
        insert(scalarStr, client)
    }

    /// ⌥z / ⌥⇧z: arm the raise or the lower. Same chord again lifts it; the twin
    /// replaces.
    private func armOperator(_ op: Unicode.Scalar, _ client: IMKTextInput) -> Bool {
        if pending.contains(op) {
            pending.removeAll { $0 == op }
        } else {
            let twin = op == Self.raiseOp ? Self.lowerOp : Self.raiseOp
            pending.removeAll { $0 == twin }
            pending.append(op)
        }
        updateMarked(client)
        return true
    }

    // MARK: - backspace

    /// Diacritic peel: a cluster carrying combining marks loses its last mark,
    /// rewritten in place through decomposition; a bare glyph is declined so the
    /// host deletes it natively.
    private func unconvert(_ client: IMKTextInput) -> Bool {
        guard let (p, site) = prevCluster(client) else { return false }
        let (base, marks) = decompose(p)
        guard marks.isEmpty, !base.isEmpty else { return false }
        let low = base.lowercased()
        guard let key = Tables.shared.unconvertKey[low] else { return false }
        let text = base == low ? key : key.uppercased()
        Dbg.log("  → unconvert \(Dbg.str(base)) ⇒ '\(text)'")
        replace(site, with: text, client)
        return true
    }

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
        guard sel.location != NSNotFound, sel.location > 0, sel.length == 0 else {
            Dbg.log("  lastCluster → nil (sel loc=\(sel.location) len=\(sel.length))")
            return nil
        }
        let start = max(0, sel.location - 16)
        var actual = NSRange()
        guard let s = client.string(from: NSRange(location: start, length: sel.location - start),
                                    actualRange: &actual),
              let last = s.last else {
            Dbg.log("  lastCluster → nil (no string; client won't read)")
            return nil
        }
        Dbg.log("  lastCluster → '\(Dbg.str(String(last)))'")
        return (last, NSRange(location: sel.location - (String(last) as NSString).length,
                              length: (String(last) as NSString).length))
    }

    /// A chain-seeding IPA segment: a non-ASCII LETTER or combining mark, not
    /// merely non-ASCII — a terminal reports the empty start-of-line cell as
    /// NBSP, and a bare `> 127` test would rebase it into θ.
    private func isSegmentScalar(_ u: Unicode.Scalar) -> Bool {
        guard u.value > 127 else { return false }
        switch u.properties.generalCategory {
        // An uppercase Æ/Ŋ is chain content too, so a held run continues in
        // lowercase. A release, not the letter's case, ends the chain.
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter,
             .modifierLetter, .otherLetter,
             .nonspacingMark, .spacingMark, .enclosingMark:
            return true
        default:
            return false
        }
    }

    /// Lookback for shift-chaining. Nil at the document start.
    private func clusterBefore(_ range: NSRange, _ client: IMKTextInput) -> Character? {
        let end = range.location
        guard end > 0 else { return nil }
        let start = max(0, end - 16)
        var actual = NSRange()
        return client.string(from: NSRange(location: start, length: end - start),
                             actualRange: &actual)?.last
    }

    private func insert(_ text: String, _ client: IMKTextInput) {
        client.insertText(text, replacementRange: NSRange(location: NSNotFound, length: 0))
    }

    private func replace(_ range: NSRange, with new: String, _ client: IMKTextInput) {
        client.insertText(new, replacementRange: range)
    }

    /// A cluster's canonical decomposition: base glyph plus trailing combining
    /// marks, so NFC fusion never changes rule behavior.
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

    // Marks of the SAME combining class never reorder under NFC, so a tone typed
    // before its shape mark freezes as a permanent homoglyph of ế. So try every
    // arrangement and keep the shortest NFC.
    private func recompose<S: Sequence>(_ base: String, _ marks: S) -> String
    where S.Element == Unicode.Scalar {
        let list = Array(marks)
        func fold(_ order: [Unicode.Scalar]) -> String {
            var s = base
            s.unicodeScalars.append(contentsOf: order)
            return s.precomposedStringWithCanonicalMapping
        }
        if list.count <= 1 { return fold(list) }
        func permutations(_ items: [Unicode.Scalar]) -> [[Unicode.Scalar]] {
            if items.count <= 1 { return [items] }
            var out: [[Unicode.Scalar]] = []
            for i in items.indices {
                var rest = items
                rest.remove(at: i)
                for p in permutations(rest) { out.append([items[i]] + p) }
            }
            return out
        }
        var best: String?
        for perm in permutations(list) {
            let s = fold(perm)
            if best == nil || s.unicodeScalars.count < best!.unicodeScalars.count { best = s }
        }
        return best!
    }

// A capital digraph capitalizes its result; a plain-ASCII result is excluded
// (⇧T⇧J stays "TJ"). ʔ is caseless in Unicode — Ɂ is the one hand map.
    static func capitalOf(_ low: String) -> String? {
        if low == "\u{0294}" { return "\u{0241}" } // ʔ → Ɂ
        let up = low.uppercased()
        guard up != low, up.unicodeScalars.count == 1, let u = up.unicodeScalars.first,
              u.value > 0x7f
        else { return nil }
        return up
    }
}
