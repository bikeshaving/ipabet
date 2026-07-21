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
    /// The ⌥⇧ form is SPACING even though the ⌥ form is combining. A key can carry
    /// one of each: ⌥9 is the linguolabial seagull (combining, prefix), while ⌥⇧9 is
    /// extIPA's pre-voicing bracket ₍ — a standalone character that lands postfix.
    /// Spacing is a property of the FORM, not of the key.
    let doubleSpacing: Bool
    /// Spacing form of a combining mark (´ for acute) — the dead-key preview
    /// glyph, and Apple's "terminator" concept. Nil for IPA-only marks.
    let clone: String?
    /// Repeat-press family: pressing the key again on its own pending mark
    /// advances through these forms and wraps (⌥n: ̃ → ͊ → ͋ → ͌). One
    /// dimension only; the marked-text preview shows every step.
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
    /// Exclusive duals: a mark and its ⌥⇧ twin are the two values of ONE feature
    /// (advanced/retracted, apical/laminal…). Mutually exclusive, so the twin
    /// *replaces* rather than stacks. Independent shape-twins (tilde/creaky)
    /// are absent from this map and stack normally.
    let exclusiveTwin: [Unicode.Scalar: Unicode.Scalar]
    /// ⌥⇧<digit> slots spent on a character (⌥⇧1 → ¡). See spec `optShift`.
    let optShiftDigits: [String: String]
    /// Locale-semantic quotes: locale → [openPrimary, closePrimary, openSecondary,
    /// closeSecondary]. The active locale is the `quoteLocale` user default —
    /// configuration, not composition state.
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
        // Raised/lowered glyph → its plain base, so a modifier still transforms
        // a glyph that has already moved (⌥z s ⇧H → ᶴ). Mirrors js/src/index.ts.
        var unsup: [String: String] = [:]
        for (b, sp) in sups where unsup[sp] == nil { unsup[sp] = b }
        var unsub: [String: String] = [:]
        for (b, sb) in subs where unsub[sb] == nil { unsub[sb] = b }
        var transforms: [String: String] = [:]
        var unconvertKey: [String: String] = [:]
        for (k, glyph) in letters where k.count == 2 {
            if unconvertKey[glyph] == nil { unconvertKey[glyph] = k }
            let base = String(k.prefix(1)), mod = String(k.suffix(1))
            // A leading digit is a LITERAL base a modifier transforms (5H → ɜ,
            // 2Q → ʡ), and the roots are digraphs too (5Y → ə, 2H → ʔ), so ⇧2–7
            // pass through to native @ # $ % ^ & and the tie bar lives on ⌥j.
            // Mirrors js/src/index.ts.
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

// The ACTIVE CLUSTER composes. The most recently typed cluster stays open in
// the client's marked-text range — styled as plain text, so nothing looks
// composed — and every previous-glyph rule (⇧-transforms, joiners, ⌥z, the
// fusions) rewrites it there via setMarkedText: the IME path every host
// tests hardest, because CJK typing depends on it. A boundary — any declined
// key, space, Esc, a click, focus loss — commits the cluster as ordinary
// text. Hosts also SEE the composition (compositionstart/isComposing in
// browsers), so IME-aware pages defer to this engine instead of racing it.
//
// Edits to already-committed text (click after an old glyph, then transform
// it) use insertText(_:replacementRange:) — the pattern Apple's 2-Set Korean
// uses, captured with tools/probe.swift.
//
// In DIRECT hosts (terminals and modal editors, where a keystroke is a
// command and latency is the interface) nothing ever composes: every
// keystroke commits immediately and rewrites use replacementRange, so `dd`
// in vim and a tmux prefix stay single-keystroke.
//
// The *pending prefix diacritic* is a preview, not document content: it
// trails the active cluster in the marked range, highlighted exactly as the
// US layout's ⌥e dead key is — the representation that works even in hosts
// like Terminal.app where a committed NBSP+combining renders as "<032a>".
// The next base absorbs it.
//
// Backspace: stacked combining marks peel off one scalar at a time; a bare
// open cluster clears; a bare committed glyph is declined so the host
// performs its native delete — Korean's jamo-peel-then-native pattern.
//
// Hard-won macOS 15 rules (probe- and crash-verified; see README):
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

    private func clientBundleID() -> String {
        client()?.bundleIdentifier() ?? ""
    }

    // The input menu IS the settings surface: System Settings' Input Sources
    // pane offers third-party input methods no options UI, so everything
    // configurable lives here. Rebuilt on every open, so the checkmarks are
    // always current. There is no raw mode to toggle: the OS's own
    // input-source switcher is the off switch, since macOS always keeps a
    // plain US layout installed.
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


    // Hosts where a keystroke is a command, not text: composing would hold
    // each key in the marked range until the next one arrives, lagging
    // vim/tmux/readline by a full keystroke. These hosts get the direct
    // path — immediate commits, replacementRange rewrites — which they
    // already handle (Hangul depends on it).
    private static let directHosts: Set<String> = [
        "com.apple.Terminal",
        "com.googlecode.iterm2",
        "net.kovidgoyal.kitty",
        "io.alacritty",
        "com.github.wez.wezterm",
        "com.mitchellh.ghostty",
        "org.vim.MacVim",
        "org.gnu.Emacs",
    ]
    // Stateless by default; a stale read-back flips this to composition for the
    // session (Apple's Korean/Vietnamese trick). Terminals are LOCKED direct —
    // never composed, never probed — because composing lags a pty by a keystroke.
    private var direct = true
    private var directLocked = false
    private var probed = false

    override func activateServer(_ sender: Any!) {
        composed = ""
        pending = []
        directLocked = Self.directHosts.contains(clientBundleID())
        direct = true
        probed = directLocked
        // overrideKeyboard (Keyboard Viewer preview) intentionally not called:
        // reference IMEs only pass full system TIS layout IDs here, and the
        // bare in-bundle name was a misrouting suspect on macOS 15.
        Dbg.refresh()   // pick up tools/debug.sh on/off without a reinstall
        Dbg.log("── activate app=\(clientBundleID()) ──")
    }

    /// The host is taking the composition away (click, focus loss, input-source
    /// switch). Commit the open cluster and any pending accent rather than
    /// stranding them.
    override func commitComposition(_ sender: Any!) {
        if let c = (sender as? IMKTextInput) ?? client() { flush(c) }
    }

    override func deactivateServer(_ sender: Any!) {
        if let c = (sender as? IMKTextInput) ?? client() { flush(c) }
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
            // ⌃⌫ — unconvert, the Japanese IMEs' Ctrl+Backspace: the committed
            // transform before the cursor becomes its literal keystroke spelling
            // (θ → "tH", so "Giθub" repairs to "GitHub"). While marks pend it
            // peels like plain ⌫; anything unconvertible passes.
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
            if !composed.isEmpty {
                let (base, marks) = decompose(composed.last!)
                if !marks.isEmpty, !base.isEmpty {
                    composed = recompose(base, marks.dropLast())
                } else {
                    composed = ""            // bare open glyph: gone entirely
                }
                Dbg.log("  → backspace peels open cluster → '\(Dbg.str(composed))'")
                updateMarked(client)
                return true
            }
            return handleBackspace(client)
        }

        // ESCAPE and SPACE terminate a pending composition by COMMITTING the
        // spacing clones — the US layout's own dead-key behavior (⌥e Esc → ´,
        // ⌥e ␣ → ´, both probe-verified against the uchr; the terminator is
        // consumed). With nothing pending both pass untouched — Esc stays
        // vim's key, space stays a space.
        if event.keyCode == 53, !flags.contains(.option) {
            if !pending.isEmpty { flush(client); return true }
            flush(client)          // commit the open cluster; Esc stays the app's
            return false
        }
        if event.keyCode == 49, !flags.contains(.option), !pending.isEmpty {
            flush(client)
            return true
        }

        // Option-Shift: the secondary form of a two-form mark. NOT an escape —
        // the literal capital lives on Ctrl+Shift (see handle()'s top) — so a
        // ⌥⇧ key with no claim DECLINES and the host's own Option typography
        // passes (⌥⇧/ ¿, ⌥⇧- —). A few digit slots are spent deliberately
        // (⌥⇧1 → ¡), and the bracket keys close the locale quotes.
        if opt && shift {
            let oc = USLayout.char(event.keyCode, shift: false)
            // The tie bar's BELOW form (⌥⇧j → U+035C, colliding descenders: t͜ɕ d͜ʒ).
            if oc == "j" { emitJoiner(Self.tieBelow, client); return true }
            // Locale quotes: ⌥⇧[ closes primary, ⌥⇧] closes secondary.
            if oc == "[" { flush(client); insert(quoteQuad()[1], client); return true }
            if oc == "]" { flush(client); insert(quoteQuad()[3], client); return true }
            // ⌥⇧z lowers the previous glyph — the shifted twin of ⌥z's raise.
            if oc == "z" { return armOperator(Self.lowerOp, client) }
            // secondary form of a two-form mark (⌥⇧n → creaky, ⌥⇧' → secondary
            // stress).
            if oc.count == 1, let m = t.optMarks[oc], m.double != nil {
                applyMark(m, secondary: true, client); return true
            }
            // Digits: a deliberately spent slot inserts its glyph (⌥⇧1 → ¡);
            // everything else declines, letting the host's ⌥⇧ typography pass —
            // the capital escape lives on Ctrl+Shift.
            guard let c = oc.first, c.isNumber else { flush(client); return false }
            if let spent = t.optShiftDigits[oc] { flush(client); insert(spent, client); return true }
            guard t.letters[oc] != nil else { flush(client); return false }
            let raw = USLayout.char(event.keyCode, shift: true)
            guard !raw.isEmpty else { flush(client); return false }
            flush(client)
            insert(raw, client)
            return true
        }

        // Option: the diacritic layer, keyed by the key's unshifted US character
        // (⌥e → acute, ⌥6 → circumflex, ⌥; → length, ⌥z → superscript, ⌥1–⌥5 →
        // Chao tone letters ˩˨˧˦˥, ⌥o/⌥i → downstep/upstep). Combining marks are
        // PREFIX (dead-key style, é/ñ); spacing marks stay postfix.
        if opt {
            let oc = USLayout.char(event.keyCode, shift: false)
            guard oc.count == 1 else { flush(client); return false }
            // The tie bar is a postfix combining JOINER (t ⌥j s → t͡s): attaches to the
            // PREVIOUS segment, unlike the prefix dead-key diacritics, so it emits now.
            if oc == "j" { emitJoiner(Self.tieAbove, client); return true }
            // Locale quotes: ⌥[ opens primary, ⌥] opens secondary.
            if oc == "[" { flush(client); insert(quoteQuad()[0], client); return true }
            if oc == "]" { flush(client); insert(quoteQuad()[2], client); return true }
            // ⌥z raises the previous glyph — the operators live on the prime chord.
            if oc == "z" { return armOperator(Self.raiseOp, client) }
            // Rhoticity ⌥r emits immediately — Unicode has no combining rhotic hook,
            // so ˞ is a spacing character and the visual join onto the vowel is the
            // font's job. The one join the engine owes is ə/ɜ → precomposed ɚ/ɝ,
            // fused the way ⌥⇧y + l fuses to ɫ. Other bases fall through to the
            // marks table, which inserts the bare ˞. Mirrors js/src/index.ts.
            if oc == "r", pending.isEmpty, let (p, site) = prevCluster(client) {
                let (base, marks) = decompose(p)
                if base == "ə" { rewrite(site, with: recompose("ɚ", marks), client); return true }
                if base == "ɜ" { rewrite(site, with: recompose("ɝ", marks), client); return true }
            }
            // ⌥. on its own pending dot commits the INTERPUNCT — the dot key's
            // free-floating form (the Catalan punt volat: l ⌥. ⌥. l → l·l). One
            // hardcoded double-press, like the joiner walk; ⌫ still cancels.
            // Mirrors js/src/index.ts.
            if oc == ".", pending.count == 1, pending[0].value == 0x0307 {
                pending = []
                flush(client)                 // the open cluster commits; the dot is spent
                insert("\u{00B7}", client)
                return true
            }
            if let m = t.optMarks[oc] { applyMark(m, secondary: false, client); return true }
            // An unassigned ⌥ key declines — digits included, so the host's ⌥6 §,
            // ⌥7 ¶, ⌥8 • survive.
            flush(client)
            return false
        }

        // Number row: bare → decline (native passthrough) so a digit key is a real
        // digit key (tmux/vim/app commands). Shift → native symbol too: the roots are
        // digraphs and the tie bar is ⌥j, so no shifted digit is claimed. A pending
        // prefix diacritic absorbs onto the (bare) digit base (⌥g then 5 ⇧A → ɐ̞).
        let bareKey = USLayout.char(event.keyCode, shift: false)
        if bareKey.count == 1, bareKey.first!.isNumber {
            if !shift, !pending.isEmpty { emitBase(bareKey, client); return true }
            flush(client)
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
        guard s.count == 1 else { flush(client); return false }

        // Shift-letter modifiers transform the previous glyph in place; any
        // combining marks already on it survive the swap (decomposed view).
        // Skipped while an accent is pending — the next base absorbs it instead
        // of a modifier reaching back past the composition.
        if pending.isEmpty, let (p, site) = prevCluster(client) {
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
            // base-only test would break the chain right after a tie or a diacritic.
            // A shifted (capital) base has one question: are we in a LIVE chain —
            // shift held continuously since an IPA segment? If so, this capital
            // CONTINUES it in lowercase (ʃ⇧I⇧H → ʃɪ, Ɣ⇧G⇧H → Ɣɣ). Otherwise — a
            // fresh word, or the chain was ended by a shift release — it is a fresh
            // capital DIGRAPH (⇧A⇧E → Æ, ⇧N⇧G → Ŋ, phantom ⇧S⇧H → Ʃ, Greek ⇧T⇧H
            // → Θ). Release ends the chain, it does NOT escape to literal (that is
            // Ctrl+Shift). Under Caps Lock the digraph DECLINES — a locked capital
            // is inert text, and the lock is the promised all-caps mode. See
            // capitalOf for the exclusions.
            if shift, !flags.contains(.capsLock),
               base.count == 1, let bc = base.unicodeScalars.first, (65...90).contains(bc.value) {
                // Chain capitals always decline first (committing the open
                // cluster), so a capital in the OPEN cluster can only be
                // Caps-Lock text — freshest, with nothing chained behind it.
                let p2Segment: Bool
                switch site {
                case .open: p2Segment = false
                case .doc(let r):
                    p2Segment = clusterBefore(r, client).map {
                        String($0).unicodeScalars.contains(where: isSegmentScalar)
                    } ?? false
                }
                if p2Segment, chainLive {
                    base = base.lowercased()
                } else if let low = t.transforms[base.lowercased() + s],
                          let up = Self.capitalOf(low) {
                    Dbg.log("  → capital digraph \(base)+\(s) ⇒ \(Dbg.str(up))")
                    rewrite(site, with: recompose(up, marks), client)
                    chainBroken = false; return true
                }
            }
            // The shifted digit is the digit's capital plane: a held chain ⇧5⇧Y → Ə
            // (Azerbaijani's capital schwa), exactly as ⇧S⇧H → Ʃ. Gated on the live
            // chain, so a shift release escapes to the literal (%Y). Same guard as
            // the capital digraphs (⇧2⇧H → Ɂ), and it declines under Caps Lock
            // like every digraph. Mirrors js/src/index.ts.
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
            // A glyph that has already been raised or lowered still transforms:
            // unraise, transform, re-raise (⌥z s ⇧H → ᶴ). This is what lets the
            // operator be prefix — armed, it could never know when a digraph ends.
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
        flush(client)
        Dbg.log("  → pass (literal '\(s)')")
        return false
    }

    // MARK: - Option diacritic layer

    /// Apply a mark's primary (⌥) or secondary (⌥⇧, the `double`) form.
    private func applyMark(_ m: Mark, secondary: Bool, _ client: IMKTextInput) {
        let scalarStr = (secondary ? m.double : nil) ?? m.mark
        // Spacing belongs to the FORM, not the key: ⌥9 is a combining seagull (prefix)
        // while ⌥⇧9 is the ₍ voicing bracket, a standalone character that goes postfix.
        let spacing = (secondary && m.double != nil) ? m.doubleSpacing : m.spacing
        if spacing {
            flush(client)          // a pending accent commits before a spacing mark
            applySpacing(scalarStr, client)
        } else {
            applyCombining(scalarStr, client, cycle: secondary ? m.doubleCycle : m.cycle)
        }
    }

    // Mark PLACEMENT is the transcriber's, never the engine's.
    //
    // Three marks have an above/below form — the tie bar, the voiceless ring, and
    // the syllabic line — and each placement is its own keystroke: ⌥k / ⌥⇧k for
    // the ring, ⌥s / ⌥⇧s for the syllabic line, ⌥j / ⌥⇧j for the tie. Choosing
    // placement from a hardcoded "descender" set would be a TYPOGRAPHY model
    // inside a NOTATION engine — it makes explicit requests unreachable (å needs
    // an above-ring on a "descender" base) and such lists drift silently, because
    // the codepoint stays right and only the rendering collides.

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

    /// Raise and lower (⌥z / ⌥⇧z) are PREFIX operators like the diacritics: the
    /// chord arms, and the next glyph arrives raised. They pend as private-use
    /// sentinels rather than combining scalars, because nothing is stacked onto
    /// the base — the base is SUBSTITUTED for a different codepoint. They
    /// preview as ^ and _, the plain-text signs for raised and lowered.
    private static let raiseOp: Unicode.Scalar = "\u{F8F0}"
    private static let lowerOp: Unicode.Scalar = "\u{F8F1}"
    /// The ACTIVE CLUSTER: the most recently typed glyph, held open in the
    /// marked range (dressed as plain text) so every previous-glyph rule
    /// rewrites it on the composition path. At most one grapheme cluster;
    /// always empty in direct hosts.
    private var composed = ""

    /// Where the previous cluster lives: the open composition, or the document.
    private enum PrevSite { case open, doc(NSRange) }

    /// The grapheme cluster before the cursor — the open cluster when one
    /// exists (no document read needed), else read from the document.
    private func prevCluster(_ client: IMKTextInput) -> (Character, PrevSite)? {
        if let last = composed.last { return (last, .open) }
        return lastCluster(client).map { ($0.0, .doc($0.1)) }
    }

    /// Rewrite the previous cluster: the open one via marked text (the
    /// well-paved path), a committed one via replacementRange (the fallback).
    private func rewrite(_ site: PrevSite, with new: String, _ client: IMKTextInput) {
        switch site {
        case .open:
            composed = new
            updateMarked(client)
        case .doc(let r):
            replace(r, with: new, client)
        }
    }

    /// Apple's Korean read-back: after a direct commit the cursor must reflect
    /// the write. A host that answers stale (an async, multi-process client —
    /// Chromium, Electron) will silently drop our stateless replacementRange
    /// rewrites, so switch this session to composition. Probed once, on the
    /// first commit that should have moved the cursor.
    private func probeWriteModel(expected loc: Int, _ client: IMKTextInput) {
        guard !probed else { return }
        probed = true
        let got = client.selectedRange().location
        if got != loc {
            Dbg.log("  read-back stale (want \(loc) got \(got)) → composition for the session")
            direct = false
        } else {
            Dbg.log("  read-back fresh (\(got)) → staying stateless")
        }
    }

    /// Emit `s` as the new active cluster: the previous one commits, `s`
    /// opens in the marked range. Direct hosts commit immediately instead.
    private func openCluster(_ s: String, _ client: IMKTextInput) {
        if direct {
            let before = client.selectedRange().location
            insert(s, client)
            if !directLocked, before != NSNotFound {
                probeWriteModel(expected: before + (s as NSString).length, client)
            }
            return
        }
        if !composed.isEmpty { insert(composed, client) }  // commits the old cluster
        composed = s
        updateMarked(client)
    }

    /// The tie bar (⌥j) and its below-form (⌥⇧j). See `laws.tieBar`.
    private static let tieAbove: Unicode.Scalar = "\u{0361}"
    private static let tieBelow: Unicode.Scalar = "\u{035C}"
    /// The joiners: ⌥j/⌥⇧j is a placement pair (above/below); the OTHER chord
    /// flips placement in place, and the SAME chord again toggles sliding ͢
    /// (extIPA) and back. Lookback rewrites, like the ɚ fusion.
    private static let slide: Unicode.Scalar = "\u{0362}"
    /// The stroke overlay's precomposed families: every combination Unicode
    /// encodes atomically must be emitted atomic — the raw combining render is
    /// a permanent homoglyph (i̵ beside ɨ fails search forever). Horizontal-bar
    /// atoms only; diagonal-slash atoms (ø ⱥ) are a different gesture. ł keeps
    /// its pragmatic exception. Mirrors js/src/index.ts STROKED/TILDED.
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
            if sc == Self.raiseOp { s += "^" }
            else if sc == Self.lowerOp { s += "_" }
            else if let c = clones[sc] { s += c } else { s.unicodeScalars.append(sc) }
        }
        return s
    }

    /// Push the composition — the open cluster, then the pending preview —
    /// into the client's marked-text range (or clear it).
    private func updateMarked(_ client: IMKTextInput) {
        let pv = previewString()
        let s = composed + pv
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
        let a = NSMutableAttributedString()
        // The open cluster is dressed as PLAIN text — composition is plumbing
        // here, not chrome; only the dead-key preview earns the highlight.
        // Browsers repaint the composition from extracted spans and treat
        // "no underline attribute" as "draw my default one" — so declare an
        // underline and paint it TRANSPARENT: engines that honor the span
        // draw an invisible line, and AppKit hosts stay invisible too.
        if !composed.isEmpty {
            a.append(NSAttributedString(string: composed, attributes: [
                .foregroundColor: NSColor.textColor,
                .underlineStyle: NSUnderlineStyle.single.rawValue,
                .underlineColor: NSColor.clear,
            ]))
        }
        if !pv.isEmpty {
            a.append(NSAttributedString(string: pv, attributes: [
                .backgroundColor: NSColor.systemYellow.withAlphaComponent(0.45),
                .foregroundColor: NSColor.textColor,
                .underlineStyle: 0,
            ]))
        }
        Dbg.log("    marked: '\(Dbg.str(s))' sel=(\(len),0)")
        client.setMarkedText(a,
                             selectionRange: NSRange(location: len, length: 0),
                             replacementRange: none)
    }

    /// Commit everything open — the active cluster, then any pending accent
    /// as its spacing clone (dead key + non-base = the spacing accent) —
    /// closing the composition. No-op when nothing is open.
    private func flush(_ client: IMKTextInput) {
        let s = composed + previewString()
        guard !s.isEmpty else { return }
        composed = ""
        pending = []
        Dbg.log("    flush → '\(Dbg.str(s))'")
        insert(s, client)   // insertText over marked text commits & clears it
    }

    /// Combining ⌥ diacritic, PREFIX (dead-key style): stack the mark into the
    /// marked-text preview. The same form again peels it back off — unless the
    /// key declares a CYCLE: a repeat press then advances the visible pending
    /// through the family and wraps (⌥n: ̃ → ͊ → ͋ → ͌ → ̃). ⌫ still cancels.
    /// Emptying the stack clears the composition outright. Mirrors
    /// js/src/index.ts pendingDiacritic.
    private func applyCombining(_ scalarStr: String, _ client: IMKTextInput, cycle: [String] = []) {
        let scalar = scalarStr.unicodeScalars.first!
        let family = [scalar] + cycle.compactMap { $0.unicodeScalars.first }
        if !cycle.isEmpty, let top = pending.last, let at = family.firstIndex(of: top) {
            pending[pending.count - 1] = family[(at + 1) % family.count]
        } else if pending.last == scalar {
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

    /// The active quote quad, from the `quoteLocale` user default (set with
    /// `defaults write` against the IME's bundle id, or a future input menu).
    private func quoteQuad() -> [String] {
        let t = Tables.shared
        let locale = UserDefaults.standard.string(forKey: "quoteLocale") ?? t.quoteDefault
        return t.quoteLocales[locale] ?? t.quoteLocales[t.quoteDefault] ?? ["\u{201C}", "\u{201D}", "\u{2018}", "\u{2019}"]
    }

    /// ⌥j / ⌥⇧j: emit a joiner onto the previous segment — or rewrite the one
    /// just emitted: same chord again ⇄ sliding, other chord = placement flip.
    /// Mirrors js emitJoiner.
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
            // No walk: the joiner APPENDS to the previous segment — into the
            // open cluster when one exists, else straight after the committed
            // text (same cluster either way; a lone combining mark must never
            // open a composition of its own).
            if case .open = site {
                composed += String(start)
                updateMarked(client)
                return
            }
            insert(String(start), client)
            return
        }
        if !pending.isEmpty { emitBase(String(start), client); return }
        insert(String(start), client)
    }

    /// Emit a base glyph — absorbing any pending prefix diacritics — as the
    /// new active cluster.
    private func emitBase(_ glyph: String, _ client: IMKTextInput) {
        guard !pending.isEmpty else {
            Dbg.log("    emitBase: no pending → open '\(glyph)'")
            openCluster(glyph, client); return
        }
        let marks = pending
        pending = []
        // Raise/lower substitutes the glyph itself; any marks ride the result.
        // No such form in Unicode → the dead-key convention: the sign commits
        // as its own character and the glyph follows (⌥e q → ´q).
        if let op = marks.first(where: { $0 == Self.raiseOp || $0 == Self.lowerOp }) {
            let rest = marks.filter { $0 != op }
            let table = op == Self.raiseOp ? Tables.shared.sups : Tables.shared.subs
            let sign = op == Self.raiseOp ? "^" : "_"
            let out = table[glyph].map { recompose($0, rest) } ?? (sign + recompose(glyph, rest))
            Dbg.log("    emitBase: \(sign) → open '\(Dbg.str(out))'")
            openCluster(out, client); return
        }
        // tilde overlay: middle-tilde atoms (ɫ Ɫ ᵯ …) — ɫ is also a digraph, l⇧Q
        if marks.count == 1, marks[0] == "\u{0334}",
           let t = Self.tilded[glyph] {
            Dbg.log("    emitBase: open \(t)")
            openCluster(t, client); return
        }
        // stroke overlay: the orthographic letters are precomposed (⌥y l → ł,
        // ⌥y d → đ) — NFC cannot fuse an overlay. Set mirrors js/src/index.ts.
        if marks.count == 1, marks[0] == "\u{0335}",
           let s = Self.stroked[glyph] {
            Dbg.log("    emitBase: open \(s)")
            openCluster(s, client); return
        }
        let out = recompose(glyph, marks)
        Dbg.log("    emitBase: open '\(Dbg.str(out))'")
        openCluster(out, client)
    }

    /// Spacing mark, one specific form: insert it in place (postfix). The open
    /// cluster commits first — a spacing mark is not a transform base, so it
    /// has no business staying open.
    private func applySpacing(_ scalarStr: String, _ client: IMKTextInput) {
        flush(client)
        insert(scalarStr, client)
    }

    /// ⌥z / ⌥⇧z: arm the raise or the lower. The same chord again lifts it off,
    /// the way a repeated diacritic does, and the twin replaces — nothing is
    /// raised and lowered at once.
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

    /// Diacritic peel: a cluster carrying combining marks loses its last mark
    /// (rewritten in place, through decomposition — so é peels to e just like
    /// n̥ peels to n, regardless of whether Unicode fused the pair); a bare
    /// glyph is declined so the host deletes it natively — Korean's
    /// jamo-peel-then-native pattern.
    /// ⌃⌫: replace the transform before the cursor with its keystroke spelling.
    /// Stateless via the reverse map; bare clusters only (marks peel with ⌫).
    private func unconvert(_ client: IMKTextInput) -> Bool {
        guard let (p, site) = prevCluster(client) else { return false }
        let (base, marks) = decompose(p)
        guard marks.isEmpty, !base.isEmpty else { return false }
        let low = base.lowercased()
        guard let key = Tables.shared.unconvertKey[low] else { return false }
        let text = base == low ? key : key.uppercased()
        Dbg.log("  → unconvert \(Dbg.str(base)) ⇒ '\(text)'")
        switch site {
        case .open:
            // The spelling is plain keystrokes, not a transform base worth
            // keeping open — commit it outright.
            composed = ""
            insert(text, client)
        case .doc(let r):
            replace(r, with: text, client)
        }
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

    // NFC folds cross-class mark order by itself, but marks of the SAME
    // combining class never reorder — a tone typed before its shape mark would
    // freeze as é+̂, a permanent homoglyph of ế that no normalization can
    // repair. So composition is order-insensitive: try every arrangement of
    // the marks (≤3 in practice) and keep the shortest NFC — precomposition
    // wins whichever order was typed. Ties keep typed order, so deliberate
    // IPA stacking (t̪̻) is untouched. Mirrors js/src/index.ts recompose.
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

    // A capital digraph capitalizes the digraph's result. Every real uppercase
    // forms — Latin (Æ Ŋ Ʃ) and Greek (Θ Β Χ) alike; the only exclusion is a
    // plain-ASCII result (tJ→c→C, so ⇧T⇧J stays "TJ"), which is nonsense as a
    // digraph. ʔ is caseless in Unicode, but Dene orthographies write its
    // capital as Ɂ (U+0241) — the one hand-mapped capital. Mirrors
    // js/src/index.ts capitalOf.
    static func capitalOf(_ low: String) -> String? {
        if low == "\u{0294}" { return "\u{0241}" } // ʔ → Ɂ
        let up = low.uppercased()
        guard up != low, up.unicodeScalars.count == 1, let u = up.unicodeScalars.first,
              u.value > 0x7f
        else { return nil }
        return up
    }
}
