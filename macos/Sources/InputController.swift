import Cocoa
import InputMethodKit
import Carbon
import IOKit

// The macOS shell over the shared Rust engine (engine/, reached through the C
// ABI in engine/include/ipabet_engine.h — the same crate the IBus, fcitx5, and
// Windows shells link). This file owns no phonetics: it translates IMKit key
// events into the engine's keystroke shape, calls the engine, and applies the
// edit it hands back to the client. Every notation decision — the option layer,
// shift transforms, dead-key marks, contours, quotes, the escapes — is the
// engine's, so the ports cannot drift.
//
// Composition model, mirroring the IBus shell: an edit commits to the document
// immediately, and the engine's `pending` (an armed dead-key mark) shows as
// marked text — the preview a base will absorb. The engine looks back at what is
// already committed, which macOS lets us read from the client.

// Decodes a physical key through a fixed US layout, so the engine's ASCII-keyed
// tables work regardless of the active layout. The active layout's delivered
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

// The quote-locale list, read from the spec for the settings menu only — display
// data, not engine logic (the engine carries its own copy and switches locale
// through ipabet_engine_set_quote_locale). Nil-safe: a missing file just yields
// an empty submenu.
enum QuoteMenu {
    static let locales: [String: [String]] = data?.locales ?? [:]
    static let `default`: String = data?.default ?? "en"

    private struct Quotes: Decodable { let locales: [String: [String]]; let `default`: String }
    private struct Root: Decodable { let quotes: Quotes }
    private static let data: Quotes? = {
        guard let url = Bundle.main.url(forResource: "ipabet", withExtension: "xml"),
              let bytes = try? Data(contentsOf: url),
              let root = try? JSONDecoder().decode(Root.self, from: bytes) else { return nil }
        return root.quotes
    }()
}

// The engine's edit kinds, matched against the plain-int CEdit.edit_type.
private func editType(_ e: CEdit) -> Int32 { e.edit_type }
private func editText(_ e: CEdit) -> String {
    var edit = e
    return withUnsafePointer(to: &edit.text) {
        $0.withMemoryRebound(to: CChar.self, capacity: Int(EDIT_TEXT_MAX)) { String(cString: $0) }
    }
}

// The runtime name Info.plist names (InputMethodServerControllerClass /
// DelegateClass = "InputController"). build.sh compiles a plain executable with
// no -module-name, so without this the Objective-C name is "main.InputController"
// and IMKit's NSClassFromString("InputController") returns nil — the source
// registers but every keystroke goes nowhere.
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

    private func clientBundleID() -> String { client()?.bundleIdentifier() ?? "" }

    // MARK: - the engine

    /// The Rust engine, one per controller, built from the bundled spec. Its
    /// settings (capital digraphs, quote locale) are pushed from UserDefaults on
    /// creation and whenever the menu changes them.
    private lazy var engine: OpaquePointer? = {
        guard let url = Bundle.main.url(forResource: "ipabet", withExtension: "xml"),
              let spec = try? String(contentsOf: url, encoding: .utf8),
              let e = spec.withCString({ ipabet_engine_new($0) }) else {
            Dbg.log("engine did not construct — spec missing or unparseable")
            return nil
        }
        applySettings(to: e)
        return e
    }()

    deinit {
        if let e = engine { ipabet_engine_free(e) }
    }

    private func applySettings(to engine: OpaquePointer) {
        ipabet_engine_set_capital_digraphs(engine, capitalDigraphs)
        let locale = UserDefaults.standard.string(forKey: "quoteLocale") ?? QuoteMenu.default
        locale.withCString { ipabet_engine_set_quote_locale(engine, $0) }
    }

    private var capitalDigraphs: Bool { UserDefaults.standard.bool(forKey: "capitalDigraphs") }

    /// The armed dead-key mark(s), as the engine reports them — shown as marked
    /// text, absorbed by the next base.
    private var pending = CPending()

    // MARK: - settings menu

    override func menu() -> NSMenu! {
        let menu = NSMenu()
        let active = UserDefaults.standard.string(forKey: "quoteLocale") ?? QuoteMenu.default
        let quotes = NSMenuItem(title: "Quote Style", action: nil, keyEquivalent: "")
        let sub = NSMenu()
        for locale in QuoteMenu.locales.keys.sorted() {
            let quad = QuoteMenu.locales[locale] ?? []
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

        let caps = NSMenuItem(title: "Capital Digraphs (⇧S⇧H → Ʃ)",
                              action: #selector(toggleCapitalDigraphs(_:)), keyEquivalent: "")
        caps.target = self
        caps.state = capitalDigraphs ? .on : .off
        caps.toolTip = "Off: holding shift types capitals, so SHIP stays SHIP."
        menu.addItem(caps)

        let chart = NSMenuItem(title: "IPA Cheat Sheet",
                               action: #selector(openCheatSheet(_:)), keyEquivalent: "")
        chart.target = self
        menu.addItem(chart)
        let about = NSMenuItem(title: "About IPAbet",
                               action: #selector(openAbout(_:)), keyEquivalent: "")
        about.target = self
        menu.addItem(about)
        return menu
    }

    @objc func toggleCapitalDigraphs(_ sender: NSMenuItem) {
        UserDefaults.standard.set(!capitalDigraphs, forKey: "capitalDigraphs")
        if let e = engine { ipabet_engine_set_capital_digraphs(e, capitalDigraphs) }
    }

    @objc func setQuoteLocaleItem(_ sender: NSMenuItem) {
        guard let locale = sender.representedObject as? String else { return }
        UserDefaults.standard.set(locale, forKey: "quoteLocale")
        if let e = engine { locale.withCString { ipabet_engine_set_quote_locale(e, $0) } }
    }

    /// The bundled one-page chart — the printable cheat sheet, offline.
    @objc func openCheatSheet(_ sender: Any?) {
        if let url = Bundle.main.url(forResource: "chart", withExtension: "pdf") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc func openAbout(_ sender: Any?) {
        NSApplication.shared.activate(ignoringOtherApps: true)
        let center = NSMutableParagraphStyle()
        center.alignment = .center
        let credits = NSAttributedString(string: "ipabet.org", attributes: [
            .link: URL(string: "https://ipabet.org")!,
            .font: NSFont.systemFont(ofSize: 11),
            .paragraphStyle: center,
        ])
        NSApplication.shared.orderFrontStandardAboutPanel(options: [.credits: credits, .version: ""])
    }

    // MARK: - lifecycle

    override func activateServer(_ sender: Any!) {
        pending = CPending()
        shiftWasDown = false
        shiftReleased = false
        chainBroken = false
        // Re-sync the engine's cached settings from UserDefaults: another
        // controller instance may have changed them via its menu while this one
        // was inactive, and each controller has its own engine.
        if let e = engine { applySettings(to: e) }
        Dbg.refresh()
        Dbg.log("── activate app=\(clientBundleID()) ──")
        overrideViewerKeyboard(sender)
    }

    private static let viewerLayoutRegistered: Bool = {
        guard let list = TISCreateInputSourceList(nil, true)?.takeRetainedValue() as? [TISInputSource] else { return false }
        for src in list {
            guard let p = TISGetInputSourceProperty(src, kTISPropertyInputSourceID) else { continue }
            let id = Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String
            if id.contains(".keylayout.") && id.contains("IPAbet") {
                Dbg.log("viewer keylayout registered: \(id)")
                return true
            }
        }
        Dbg.log("viewer keylayout registered: false")
        return false
    }()

    private func overrideViewerKeyboard(_ sender: Any!, name: String = "IPAbet") {
        guard Self.viewerLayoutRegistered else { return }
        let sel = NSSelectorFromString("overrideKeyboardWithKeyboardNamed:")
        guard let client = sender as? NSObject, client.responds(to: sel) else { return }
        client.perform(sel, with: name)
    }

    override func commitComposition(_ sender: Any!) {
        if let c = (sender as? IMKTextInput) ?? client() { flush(c) }
    }

    override func deactivateServer(_ sender: Any!) {
        if let c = (sender as? IMKTextInput) ?? client() { flush(c) }
        overrideViewerKeyboard(sender, name: "com.apple.keylayout.US")
    }

    // MARK: - shift-chain state

    // A physical shift RELEASE between two keystrokes breaks the chain; the
    // engine merges shiftBroke into its own chain logic, so the shell only has
    // to observe the release and thread the persistent flag.
    private var shiftWasDown = false
    private var shiftReleased = false
    private var chainBroken = false

    override func recognizedEvents(_ sender: Any!) -> Int {
        Int(NSEvent.EventTypeMask.keyDown.rawValue | NSEvent.EventTypeMask.flagsChanged.rawValue)
    }

    // MARK: - the key path

    override func handle(_ event: NSEvent!, client sender: Any!) -> Bool {
        if event.type == .flagsChanged {
            let nowShift = event.modifierFlags.contains(.shift)
            if shiftWasDown && !nowShift { shiftReleased = true; Dbg.log("⇧ released") }
            shiftWasDown = nowShift
            return false
        }
        guard event.type == .keyDown, let client = sender as? IMKTextInput else { return false }
        // Secure input: never transform, never log a leaked keystroke.
        if inSecureContext(client.bundleIdentifier() ?? "") { return false }
        Dbg.log("↓ kc=\(event.keyCode) mods=\(Dbg.mods(event.modifierFlags)) app=\(client.bundleIdentifier() ?? "?")")
        guard let engine = engine else { return false }

        let flags = event.modifierFlags
        // Command chords are always the host's; commit what is composed and pass.
        if flags.contains(.command) { flush(client); return false }

        // The key label the engine reads: Escape and Backspace by name, else the
        // unshifted US character. Anything off the claimed plane ends the run.
        let backspace = event.keyCode == 51
        let label: String
        if event.keyCode == 53 { label = "Escape" }
        else if backspace { label = "⌫" }
        else {
            label = USLayout.char(event.keyCode, shift: false)
            if label.count != 1 { flush(client); return false }
        }

        var k = CKeystroke()
        let control = flags.contains(.control)
        return label.withCString { kp -> Bool in
            k.key = kp
            k.shift = flags.contains(.shift)
            k.option = flags.contains(.option)
            k.control = control
            k.caps_lock = flags.contains(.capsLock)
            k.shift_broke = shiftReleased
            shiftReleased = false

            let before = lookback(client)
            let step: CStep = before.withCString { bp in
                if backspace {
                    return control ? ipabet_engine_handle_unconvert(engine, bp, pending)
                                   : ipabet_engine_handle_backspace(engine, bp, pending)
                }
                return ipabet_engine_handle_key(engine, bp, k, pending, chainBroken)
            }
            return apply(step, key: k, before: before, client: client)
        }
    }

    /// Apply one engine step to the document, then show the new pending as marked
    /// text. Returns whether the key was consumed.
    private func apply(_ step: CStep, key k: CKeystroke, before: String,
                       client: IMKTextInput) -> Bool {
        let type = editType(step.edit)

        if type == Int32(Pass.rawValue) {
            // The engine passes: the host gets the key and types its own
            // character (a printable key), or nothing (a command/control/option
            // chord). Either way the armed mark is KEPT — a control chord
            // executes and its accent still absorbs the next base, matching the
            // engine (lib.rs / index.ts keep pending on a passed chord). The
            // engine only ever passes with a mark armed when the native
            // character is empty, so a host-typed character never collides with
            // the marked preview.
            pending = step.pending
            if step.has_chain_broken { chainBroken = step.chain_broken }
            updateMarked(client)
            return false   // the host handles the key; the next lookback recovers any char
        }

        pending = step.pending
        if step.has_chain_broken { chainBroken = step.chain_broken }

        switch type {
        case Int32(Insert.rawValue):
            insert(editText(step.edit), client)
        case Int32(Replace.rawValue):
            // A backspace over the only cluster in the document can't be
            // carried (no preceding cluster), so applyReplace declines; hand the
            // key to the host for a native delete rather than swallow it.
            if !applyReplace(Int(step.edit.replace_length), with: editText(step.edit), before: before, client: client) {
                return false
            }
        default: // Noop
            break
        }
        updateMarked(client)
        return true
    }

    // MARK: - applying edits to the document

    /// Delete the last `length` codepoints before the cursor and put `text`
    /// there. A pure deletion (empty text) rides the macOS-15 net-empty carrier:
    /// a net-empty replacement is dropped by the transport, so the deletion is
    /// carried by rewriting the untouched cluster before it. With no carrier
    /// (document start) it declines and the stack is not re-armed — the one
    /// deliberate divergence from the other shells.
    /// Returns whether the replacement was applied. False means decline — the
    /// caller hands the key to the host.
    private func applyReplace(_ length: Int, with text: String, before: String, client: IMKTextInput) -> Bool {
        let sel = client.selectedRange()
        guard sel.location != NSNotFound, sel.length == 0, length > 0 else {
            insert(text, client); return true
        }
        // The UTF-16 span of the last `length` codepoints of the committed text.
        let tailUnits = utf16Units(ofLast: length, in: before)
        let start = sel.location - tailUnits
        guard start >= 0 else { insert(text, client); return true }
        let range = NSRange(location: start, length: tailUnits)

        if !text.isEmpty {
            replace(range, with: text, client); return true
        }
        // Net-empty deletion (a backspace re-arming marks): a net-empty
        // replacement is dropped by the macOS-15 transport, so carry the
        // deletion on the untouched cluster before it.
        guard let (carrier, cr) = clusterBefore(range, client) else {
            // Document start: no carrier. Decline so the host deletes natively,
            // and do not re-arm — the one deliberate divergence from the other
            // shells (documented macOS-15).
            pending = CPending()
            return false
        }
        replace(NSRange(location: cr.location, length: cr.length + range.length),
                with: String(carrier), client)
        return true
    }

    private func utf16Units(ofLast codepoints: Int, in text: String) -> Int {
        let scalars = Array(text.unicodeScalars)
        let take = scalars.suffix(codepoints)
        return take.reduce(0) { $0 + String($1).utf16.count }
    }

    private func insert(_ text: String, _ client: IMKTextInput) {
        client.insertText(text, replacementRange: NSRange(location: NSNotFound, length: 0))
    }

    private func replace(_ range: NSRange, with new: String, _ client: IMKTextInput) {
        client.insertText(new, replacementRange: range)
    }

    // MARK: - the pending preview (marked text)

    private func updateMarked(_ client: IMKTextInput) {
        let s = preview()
        let none = NSRange(location: NSNotFound, length: 0)
        guard !s.isEmpty else {
            client.setMarkedText("", selectionRange: NSRange(location: 0, length: 0), replacementRange: none)
            return
        }
        // A dead-key preview, not a composition. IMK stamps a blue composition
        // underline on a plain string by default; our own attributed string
        // wins, so we set the yellow dead-key highlight (matching Apple's ⌥e
        // layout dead key, captured with tools/probe.swift) and suppress the
        // underline with .underlineStyle 0.
        let len = (s as NSString).length
        let a = NSMutableAttributedString(string: s, attributes: [
            .backgroundColor: NSColor.systemYellow.withAlphaComponent(0.45),
            .foregroundColor: NSColor.textColor,
            .underlineStyle: 0,
        ])
        client.setMarkedText(a, selectionRange: NSRange(location: len, length: 0),
                             replacementRange: none)
    }

    private func preview() -> String {
        guard let engine = engine, pending.count > 0 else { return "" }
        var out = [CChar](repeating: 0, count: 256)
        ipabet_preview_string(engine, pending, &out, 256)
        return String(cString: out)
    }

    /// Commit any armed pending as its spacing form and clear the preview — for
    /// losing focus, a command chord, or a run-ending key.
    private func flush(_ client: IMKTextInput) {
        guard let engine = engine, pending.count > 0 else {
            if pending.count == 0 { return }
            pending = CPending(); updateMarked(client); return
        }
        var out = [CChar](repeating: 0, count: 256)
        ipabet_commit_string(engine, pending, &out, 256)
        let s = String(cString: out)
        pending = CPending()
        if !s.isEmpty { insert(s, client) } else { updateMarked(client) }
    }

    // MARK: - reading the document

    /// The committed text before the cursor, up to a 64-UTF-16-unit window (two
    /// grapheme clusters is the whole of the engine's lookback; 64 covers a tall
    /// mark stack). The engine does its own segmentation on this.
    private func lookback(_ client: IMKTextInput) -> String {
        let sel = client.selectedRange()
        guard sel.location != NSNotFound, sel.location > 0, sel.length == 0 else { return "" }
        let start = max(0, sel.location - 64)
        var actual = NSRange()
        guard let s = client.string(from: NSRange(location: start, length: sel.location - start),
                                    actualRange: &actual),
              // A client may answer a different range than asked (that is what
              // actualRange is for); unless it ends at the caret, the byte math
              // below is wrong, so treat it as no lookback.
              actual.length == 0 || actual.location + actual.length == sel.location else { return "" }
        return s
    }

    /// The grapheme cluster immediately before `range`, and its UTF-16 range —
    /// the carrier for a net-empty backspace.
    private func clusterBefore(_ range: NSRange, _ client: IMKTextInput) -> (Character, NSRange)? {
        let end = range.location
        guard end > 0 else { return nil }
        let start = max(0, end - 64)
        var actual = NSRange()
        guard let s = client.string(from: NSRange(location: start, length: end - start),
                                    actualRange: &actual),
              actual.length == 0 || actual.location + actual.length == end,
              let last = s.last else { return nil }
        let len = (String(last) as NSString).length
        return (last, NSRange(location: end - len, length: len))
    }
}
