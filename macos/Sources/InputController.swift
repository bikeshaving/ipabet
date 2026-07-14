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

// A diacritic on the Option layer. `spacing` marks insert in place, postfix
// (ˈ ː …); combining marks are prefix (dead-key) and the next base absorbs
// them. `double` is the ⌥⇧ second form (⌥n → ã, ⌥⇧n → a̰).
struct Mark {
    let mark: String
    let spacing: Bool
    let double: String?
    /// Spacing form of a combining mark (´ for acute) — the dead-key preview
    /// glyph, and Apple's "terminator" concept. Nil for IPA-only marks.
    let clone: String?
}

struct Tables {
    let letters: [String: String]
    // Option-layer diacritics, keyed by the Option key's unshifted US character.
    let optMarks: [String: Mark]
    let sups: [String: String]
    // transformation index: (previous output glyph + keystroke) → combined glyph
    let transforms: [String: String]
    /// combining scalar → its spacing form, for the dead-key preview.
    let clones: [Unicode.Scalar: String]
    /// Exclusive duals: a mark and its ⌥⇧ twin are the two values of ONE feature
    /// (advanced/retracted, apical/laminal…). Mutually exclusive, so the twin
    /// *replaces* rather than stacks. Independent shape-twins (tilde/creaky)
    /// are absent from this map and stack normally.
    let exclusiveTwin: [Unicode.Scalar: Unicode.Scalar]
    /// ⌥⇧<digit> slots spent on a character instead of the raw-US escape
    /// (⌥⇧1 → ¡, ⌥⇧6 → ß). See spec `optShift`.
    let optShiftDigits: [String: String]

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
                                 clone: clone)
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
        return Tables(letters: letters, optMarks: optMarks, sups: sups,
                      transforms: transforms, clones: clones, exclusiveTwin: exclusiveTwin,
                      optShiftDigits: optShiftDigits)
    }()
}

// Committed text follows Apple's Korean (2-Set) protocol, captured with
// tools/probe.swift: each keystroke either inserts at the cursor or rewrites
// the previous grapheme cluster in place via insertText(_:replacementRange:) —
// the call pattern every Mac app must support or Hangul typing would break.
//
// The one exception is the *pending prefix diacritic*, which is a preview, not
// document content. It lives in the client's marked-text range (highlighted,
// uncommitted) exactly as the US layout's ⌥e dead key does — the only correct
// representation, and the one that works in hosts like Terminal.app where a
// committed NBSP+combining sequence renders as "<032a>". Composition state is
// therefore a single [Unicode.Scalar] stack, flushed on commitComposition and
// deactivateServer.
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
        Dbg.refresh()   // pick up tools/debug.sh on/off without a reinstall
        Dbg.log("── activate app=\(clientBundleID()) ──")
    }

    /// The host is taking the composition away (click, focus loss, input-source
    /// switch). Commit the pending accent rather than stranding it.
    override func commitComposition(_ sender: Any!) {
        if let c = (sender as? IMKTextInput) ?? client() { flushPending(c) }
    }

    override func deactivateServer(_ sender: Any!) {
        if let c = (sender as? IMKTextInput) ?? client() { flushPending(c) }
    }

    // Shift-chaining state. The chain is BROKEN by a shift release (so releasing
    // and re-pressing shift types a literal capital: ʃ ⟨let go⟩ ⇧I⇧H → ʃIH) and
    // re-armed by producing an IPA segment. `chainBroken` persists across
    // keystrokes; `shiftReleased` is set from flagsChanged when shift lifts
    // between keyDowns — the one thing a plain keyDown can't tell you, since two
    // ⇧-keydowns look identical whether or not shift bounced between them.
    private var shiftWasDown = false
    private var shiftReleased = false
    private var chainBroken = false

    // Ask the system for flagsChanged too, not just keyDown — that's how we see
    // a shift release land between two keystrokes.
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
        // Command chords always pass (app shortcuts). Control chords pass too —
        // they are leader keys (tmux ^b, emacs ^x) — with ONE exception:
        // Ctrl+Shift+<letter> is the escape to a literal capital. It emits the raw
        // capital and bypasses everything downstream — the ⇧-modifier transforms,
        // the shift-chain, and the capital-digraph rule — so "GitHub" stays GitHub
        // (not Giθub) and ⌃⇧A ⌃⇧E is a literal "AE" (not Æ). Letters only:
        // Ctrl+Shift+<digit/punct> keeps its native chord.
        if flags.contains(.command) { Dbg.log("  → pass (cmd chord)"); flushPending(client); return false }
        if flags.contains(.control) {
            if flags.contains(.shift) {
                let oc = USLayout.char(event.keyCode, shift: false)
                if oc.count == 1, oc.first!.isLetter {
                    flushPending(client)
                    let cap = oc.uppercased()
                    insert(cap, client)
                    Dbg.log("  → ⌃⇧ escape → literal '\(cap)'")
                    return true
                }
            }
            Dbg.log("  → pass (ctrl chord — leader keys land here)")
            flushPending(client)
            return false
        }

        let opt = flags.contains(.option)
        let shift = flags.contains(.shift)

        // ⌥⇧Space toggles the raw-US lock: the whole IME goes transparent
        // (every key native — code, camelCase, $, %) until toggled back.
        // The sticky sibling of the ⌥⇧ escape. One bit of *settings* state;
        // composition remains stateless.
        if opt && shift && event.keyCode == 49 {
            flushPending(client)
            toggleRaw(for: clientBundleID())
            return true
        }
        if isRawLocked(for: clientBundleID()) { flushPending(client); return false }

        // Fold a pending shift release into the chain state: once broken, it stays
        // broken until a segment re-arms it (see the transform section). chainLive
        // gates the capital rebase and the capital-digraph rule below.
        if shiftReleased { chainBroken = true; shiftReleased = false }
        let chainLive = !chainBroken

        // Backspace peels the pending accent first (dead key undone), before
        // touching the document at all.
        if event.keyCode == 51 {
            if !pending.isEmpty {
                pending.removeLast()
                Dbg.log("  → backspace peels pending")
                updateMarked(client)
                return true
            }
            return handleBackspace(client)
        }

        // Option-Shift: the raw-US escape on the number row. The letter escape
        // moved to Ctrl+Shift (see handle()'s top); ⌥⇧<letter> now declines, so
        // the host's own Option typography passes through. On digits the escape
        // exists only because ⇧<digit> is an IPA glyph, leaving the shifted
        // character otherwise unreachable (⇧2 is ʔ, so @ lives here) — where
        // ⇧<digit> is unclaimed the escape is redundant and we DECLINE, so the
        // host's ⌥⇧8 °, ⌥⇧9 ·, ⌥⇧0 ‚ survive. Two digit slots are spent
        // deliberately on characters (⌥⇧1 → ¡, ⌥⇧6 → ß). On punctuation it always
        // declines, so Mac's Option typography passes (⌥⇧[ → ”, ⌥⇧\ → », ⌥⇧/ → ¿).
        if opt && shift {
            let oc = USLayout.char(event.keyCode, shift: false)
            // secondary form of a two-form mark (⌥⇧n → creaky, ⌥⇧' → secondary
            // stress). A capital that forms a digraph ("GitHub" → Giθub) is escaped
            // with Ctrl+Shift now (see handle()'s top), so this no longer competes
            // with a raw-capital escape — it just applies the mark's second form.
            if oc.count == 1, let m = t.optMarks[oc], m.double != nil {
                applyMark(m, secondary: true, client); return true
            }
            // The raw-US escape survives only on the number row: ⇧<digit> is an IPA
            // glyph, so the shifted symbol is otherwise unreachable (⌥⇧2 → @). A
            // letter here declines (the guard rejects it), letting the host's ⌥⇧
            // typography pass — the capital escape lives on Ctrl+Shift.
            guard let c = oc.first, c.isNumber else { flushPending(client); return false }
            if let spent = t.optShiftDigits[oc] { flushPending(client); insert(spent, client); return true }
            guard t.letters[oc] != nil else { flushPending(client); return false }
            let raw = USLayout.char(event.keyCode, shift: true)
            guard !raw.isEmpty else { flushPending(client); return false }
            flushPending(client)
            insert(raw, client)
            return true
        }

        // Option: the diacritic layer, keyed by the key's unshifted US character
        // (⌥e → acute, ⌥6 → circumflex, ⌥; → length, ⌥p → superscript, ⌥1–⌥5 →
        // Chao tone letters ˩˨˧˦˥, ⌥o/⌥i → downstep/upstep). Combining marks are
        // PREFIX (dead-key style, é/ñ); spacing marks stay postfix.
        if opt {
            let oc = USLayout.char(event.keyCode, shift: false)
            guard oc.count == 1 else { flushPending(client); return false }
            if oc == "p" { flushPending(client); return superscriptize(client) }
            if let m = t.optMarks[oc] { applyMark(m, secondary: false, client); return true }
            // An unassigned ⌥ key declines — digits included, so the host's ⌥6 §,
            // ⌥7 ¶, ⌥8 • survive. (This used to insert the bare digit, destroying
            // them to produce a character the unshifted digit key already types.)
            flushPending(client)
            return false
        }

        // Number row: bare → decline (native passthrough), so a digit key is a
        // real digit key — usable as a tmux/vim/app command, not just text.
        // Shift → the IPA glyph (Shift-5 → ə, Shift-2 → ʔ …). Shifted symbols
        // (! @ # …) live on ⌥⇧.
        let bareKey = USLayout.char(event.keyCode, shift: false)
        if bareKey.count == 1, bareKey.first!.isNumber {
            // The tie bar owns its own second form. ⇧6 is the tie ABOVE (t͡s); the chart
            // also sanctions the tie BELOW where descenders collide (t͜ɕ, d͜ʒ). It is the
            // same mark, so it gets no key of its own: press ⇧6 again while a tie sits
            // before the cursor and it flips. Stateless — the document holds the tie.
            if shift, bareKey == "6", pending.isEmpty, let (p, r) = lastCluster(client) {
                let scalars = Array(String(p).unicodeScalars)
                if let last = scalars.last, last == Self.tieAbove || last == Self.tieBelow {
                    var flipped = String.UnicodeScalarView(scalars.dropLast())
                    flipped.append(last == Self.tieAbove ? Self.tieBelow : Self.tieAbove)
                    Dbg.log("  → ⇧6 flips the tie")
                    replace(r, with: String(flipped), client)
                    return true
                }
            }
            if shift, let glyph = t.letters[bareKey] { emitBase(glyph, client); return true }
            flushPending(client)
            return false
        }

        // Caps Lock is a LOCK, not a modifier. The bare layer is native US and Caps
        // Lock belongs to it: a letter types its CAPITAL, literally. It must never
        // act as ⇧ — Caps-Lock T then H is "TH", not θ — and the capital it types is
        // inert text downstream (the modifier tables are lowercase-keyed), the same
        // acronym safety the ⌃⇧ escape relies on. ⇧ still means the modifier while
        // locked, and a pending accent still absorbs onto the capital (⌥u then a
        // locked A → Ä), which emitBase does.
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
        guard s.count == 1 else { return false }

        // Shift-letter modifiers transform the previous glyph in place; any
        // combining marks already on it survive the swap (decomposed view).
        // Skipped while an accent is pending — the next base absorbs it instead
        // of a modifier reaching back past the composition.
        if pending.isEmpty, let (p, r) = lastCluster(client) {
            let (base0, marks) = decompose(p)
            var base = base0
            // Shift-chaining: a capital typed right after a special (non-ASCII) IPA
            // glyph is a *pending base* — lower it so this modifier transforms it,
            // while a capital with no modifier stays as typed (the host already
            // inserted it when we declined it). Two clusters of lookback keep this
            // stateless; acronyms/CamelCase never have a special glyph behind a
            // capital, so they stay literal.
            // Is the glyph behind this pending capital IPA content? Test the WHOLE
            // cluster, not just its base: "t͡" is ASCII t carrying a tie (U+0361),
            // and "s̪" is ASCII s carrying a bridge — both are plainly IPA, and a
            // base-only test would break the chain right after ⇧1 or a diacritic.
            // A shifted (capital) base has one question: are we in a LIVE chain —
            // shift held continuously since an IPA segment? If so, this capital
            // CONTINUES it in lowercase (ʃ⇧I⇧H → ʃɪ, Ɣ⇧G⇧H → Ɣɣ). Otherwise — a
            // fresh word, or the chain was ended by a shift release — it is a fresh
            // capital DIGRAPH (⇧A⇧E → Æ, ⇧N⇧G → Ŋ, phantom ⇧S⇧H → Ʃ). Release ends
            // the chain, it does NOT escape to literal (that is Ctrl+Shift). Greek
            // (θ→Θ) and ASCII (tJ→c→C) uppercases are excluded.
            if shift, base.count == 1, let bc = base.unicodeScalars.first, (65...90).contains(bc.value) {
                let p2Segment = clusterBefore(r, client).map {
                    String($0).unicodeScalars.contains(where: isSegmentScalar)
                } ?? false
                if p2Segment, chainLive {
                    base = base.lowercased()
                } else if let low = t.transforms[base.lowercased() + s] {
                    let up = low.uppercased()
                    if up != low, up.unicodeScalars.count == 1, let u = up.unicodeScalars.first,
                       u.value > 0x7f, !(0x370...0x3ff).contains(u.value) {
                        Dbg.log("  → capital digraph \(base)+\(s) ⇒ \(Dbg.str(up))")
                        replace(r, with: recompose(up, reposition(up, marks)), client)
                        chainBroken = false; return true
                    }
                }
            }
            if let combo = t.transforms[base + s] {
                Dbg.log("  → transform \(Dbg.str(base))+\(s) ⇒ \(Dbg.str(combo))")
                replace(r, with: recompose(combo, reposition(combo, marks)), client)
                chainBroken = false; return true
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
                replace(r, with: out, client)
                chainBroken = false; return true
            }
            // ejective: X (eXplosive) after a voiceless obstruent appends ʼ (U+02BC).
            // Open class — any voiceless obstruent, matching the chart's "p t k s …".
            // Guarded like R; a non-obstruent falls through to a literal X.
            if s == "X", let b = base.first, "ptʈckqɸfθsʃʂçxχɬ".contains(b) {
                replace(r, with: recompose(base, marks) + "\u{02BC}", client)
                chainBroken = false; return true
            }
        }
        // letter base glyph — absorbing any pending prefix diacritics
        if let glyph = t.letters[s] {
            Dbg.log("  → emitBase '\(glyph)'")
            emitBase(glyph, client)
            // A non-ASCII base (⇧5 → ə) is an IPA segment and re-arms the chain.
            if glyph.unicodeScalars.contains(where: { $0.value > 127 }) { chainBroken = false }
            return true
        }
        // A pending accent absorbs onto a CAPITAL base: ⌥u ⇧A → Ä. The letters
        // table is lowercase-keyed, so without this the capital misses and the
        // accent commits as a spacing clone ("¨A") — breaking every accented
        // capital in every language. Fires only while an accent pends, so
        // acronyms and shift-chaining are untouched.
        if !pending.isEmpty, s.count == 1, let c = s.unicodeScalars.first,
           (65...90).contains(c.value) {
            Dbg.log("  → emitBase capital '\(s)'")
            emitBase(s, client); return true
        }
        // Not a base: a pending accent commits as its spacing form (⌥e space → ´),
        // then the key passes. Capitals with no transform, punctuation, 8/9/0.
        flushPending(client)
        Dbg.log("  → pass (literal '\(s)')")
        return false
    }

    // MARK: - Option diacritic layer

    /// Apply a mark's primary (⌥) or secondary (⌥⇧, the `double`) form.
    private func applyMark(_ m: Mark, secondary: Bool, _ client: IMKTextInput) {
        let scalarStr = (secondary ? m.double : nil) ?? m.mark
        if m.spacing {
            flushPending(client)          // a pending accent commits before a spacing mark
            applySpacing(scalarStr, client)
        } else {
            applyCombining(scalarStr, client)
        }
    }

    /// IPA bases whose descenders collide with below-marks. Marks with a
    /// positional twin ride above these: voiceless ring (n̥ but ŋ̊) and
    /// syllabic line (n̩ but ŋ̍). Position is non-contrastive; the engine
    /// owns it. Applied to the *final* base, so a mark that landed below on n
    /// rides above once ⇧G makes it ŋ.
    private static let descenders: Set<Unicode.Scalar> =
        Set("gɡjɟʄpqyŋɱɳɻɭɽʂʐʝɣɖʈɥɰʒ".unicodeScalars)

    /// below-form ⇄ above-form for descender bases
    private static let positional: [Unicode.Scalar: Unicode.Scalar] = [
        "\u{0325}": "\u{030A}",   // ring below → ring above
        "\u{0329}": "\u{030D}",   // vertical line below → above (syllabic)
    ]
    private static let positionalInv: [Unicode.Scalar: Unicode.Scalar] = [
        "\u{030A}": "\u{0325}",
        "\u{030D}": "\u{0329}",
    ]
    private func reposition(_ base: String, _ marks: [Unicode.Scalar]) -> [Unicode.Scalar] {
        let desc = base.unicodeScalars.first.map(Self.descenders.contains) ?? false
        return marks.map { desc ? (Self.positional[$0] ?? $0) : (Self.positionalInv[$0] ?? $0) }
    }

    // MARK: - the pending accent (real marked text, like the US dead keys)
    //
    // A prefix diacritic is a *preview*, not document content, so it lives in
    // the client's marked-text range — highlighted, uncommitted, and owned by
    // the host. This is what ⌥e does on the US layout (the orange highlight),
    // and it works everywhere that does, terminals included. The next base
    // commits it; nothing is ever written to the document until then.
    //
    // Guardrails (the real macOS 15 landmines): never updateComposition() or
    // composedString() — we drive client.setMarkedText directly; and never
    // insertText("") — clearing is setMarkedText("").

    /// The accumulated prefix diacritics awaiting a base. Empty = no composition.
    private var pending: [Unicode.Scalar] = []

    /// The tie bar (⇧6) and the below-form it flips to. See `laws.tieBar`.
    private static let tieAbove: Unicode.Scalar = "\u{0361}"
    private static let tieBelow: Unicode.Scalar = "\u{035C}"

    /// What the highlighted preview shows: each pending mark as its *spacing*
    /// glyph when one exists (⌥e → ´, exactly the US dead key's terminator),
    /// else the bare combining glyph on its own. Never a dotted circle — U+25CC
    /// renders enormous in some hosts (Google's search field), and Apple's dead
    /// keys always show a real spacing character.
    private func previewString() -> String {
        guard !pending.isEmpty else { return "" }
        let clones = Tables.shared.clones
        var s = ""
        for sc in pending {
            if let c = clones[sc] { s += c } else { s.unicodeScalars.append(sc) }
        }
        return s
    }

    /// Push `pending` into the client's marked-text range (or clear it).
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
        let attrs: [NSAttributedString.Key: Any] = [
            .backgroundColor: NSColor.systemYellow.withAlphaComponent(0.45),
            .foregroundColor: NSColor.textColor,
            .underlineStyle: 0,
        ]
        Dbg.log("    marked: '\(Dbg.str(s))' sel=(\(len),0) hilite=yellow")
        client.setMarkedText(NSAttributedString(string: s, attributes: attrs),
                             selectionRange: NSRange(location: len, length: 0),
                             replacementRange: none)
    }

    /// Commit a pending accent as literal text (dead key + non-base = the
    /// spacing accent), clearing the composition. No-op when nothing pends.
    private func flushPending(_ client: IMKTextInput) {
        guard !pending.isEmpty else { return }
        let s = previewString()
        pending = []
        Dbg.log("    flush pending → '\(Dbg.str(s))'")
        insert(s, client)   // insertText over marked text commits & clears it
    }

    /// Combining ⌥ diacritic, PREFIX (dead-key style): stack the mark into the
    /// marked-text preview. The same form again peels it back off; emptying the
    /// stack clears the composition outright — no placeholder, nothing committed.
    private func applyCombining(_ scalarStr: String, _ client: IMKTextInput) {
        let scalar = scalarStr.unicodeScalars.first!
        if pending.last == scalar {
            pending.removeLast()                       // same form again: peel it off
        } else {
            // An exclusive dual replaces its twin — nothing is both advanced and
            // retracted. Independent shape-twins (tilde/creaky) just stack.
            if let twin = Tables.shared.exclusiveTwin[scalar] {
                pending.removeAll { $0 == twin }
            }
            pending.append(scalar)
        }
        updateMarked(client)
    }

    /// Emit a base glyph, committing any pending prefix diacritics onto it.
    private func emitBase(_ glyph: String, _ client: IMKTextInput) {
        guard !pending.isEmpty else {
            Dbg.log("    emitBase: no pending → insert '\(glyph)'")
            insert(glyph, client); return
        }
        let marks = pending
        pending = []
        // dark l: overlay + l is the atomic ɫ, not a ragged l̴
        if marks.count == 1, marks[0] == "\u{0334}", glyph == "l" {
            Dbg.log("    emitBase: commit ɫ")
            insert("ɫ", client); return
        }
        let out = recompose(glyph, reposition(glyph, marks))
        Dbg.log("    emitBase: commit '\(Dbg.str(out))'")
        insert(out, client)   // replaces the marked range
    }

    /// Spacing mark, one specific form: insert it in place (postfix).
    private func applySpacing(_ scalarStr: String, _ client: IMKTextInput) {
        insert(scalarStr, client)
    }

    /// ⌥p: superscriptize the previous glyph (`t` `h` ⌥p → tʰ). No
    /// superscriptable base → the literal letter p (never a dead keystroke).
    private func superscriptize(_ client: IMKTextInput) -> Bool {
        if let (p, r) = lastCluster(client) {
            let (base, marks) = decompose(p)
            if let sup = Tables.shared.sups[base] {
                replace(r, with: recompose(sup, marks), client); return true
            }
        }
        insert("p", client); return true
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

    /// The grapheme cluster immediately before `range` — the second glyph of
    /// A chain-seeding IPA segment: a non-ASCII letter or combining mark (ʃ, ə, or
    /// an ASCII base carrying a tie/diacritic). NOT merely non-ASCII — a terminal
    /// reports the empty cell before the cursor as U+00A0 NBSP (160 > 127), and the
    /// old bare > 127 test read that as a segment, rebasing every start-of-line
    /// capital: "TH" → θ. NBSP, quotes, dashes, tone letters, and arrows are excluded.
    private func isSegmentScalar(_ u: Unicode.Scalar) -> Bool {
        guard u.value > 127 else { return false }
        switch u.properties.generalCategory {
        // Any non-ASCII letter or combining mark is chain content — including an
        // uppercase Æ/Ŋ, so a held run continues in lowercase (Ɣ⇧G⇧H → Ɣɣ). A
        // release, not the letter's case, is what ends the chain.
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter,
             .modifierLetter, .otherLetter,
             .nonspacingMark, .spacingMark, .enclosingMark:
            return true
        default:
            return false
        }
    }

    /// lookback for shift-chaining (is the char behind a pending capital base a
    /// special IPA glyph?). Nil at the document start.
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
