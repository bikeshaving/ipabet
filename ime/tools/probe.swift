// IME probe: instrumented text clients for debugging IPAKey against real hosts.
// Two panes accept input — an AppKit NSTextView that logs every NSTextInputClient
// call the IME makes (with ranges and codepoints), and a WKWebView <input> that
// logs DOM key/composition events (what Safari's engine believes is happening).
// The log pane below shows both streams interleaved; it also goes to stdout.
//
// Build & run:
//   swiftc tools/probe.swift -o /tmp/imeprobe -framework Cocoa -framework WebKit && /tmp/imeprobe
import Cocoa
import WebKit

let logView = NSTextView()

let logFile: FileHandle? = {
    let path = "/tmp/imeprobe.log"
    FileManager.default.createFile(atPath: path, contents: nil)
    return FileHandle(forWritingAtPath: path)
}()

func log(_ tag: String, _ msg: String) {
    let line = "[\(tag)] \(msg)\n"
    print(line, terminator: "")
    logFile?.write(line.data(using: .utf8)!)
    DispatchQueue.main.async {
        logView.textStorage?.append(NSAttributedString(
            string: line,
            attributes: [.font: NSFont.monospacedSystemFont(ofSize: 11, weight: .regular),
                         .foregroundColor: NSColor.textColor]))
        logView.scrollToEndOfDocument(nil)
    }
}

func fmt(_ r: NSRange) -> String {
    r.location == NSNotFound ? "(NSNotFound,\(r.length))" : "(\(r.location),\(r.length))"
}

func fmt(_ s: Any) -> String {
    let str = (s as? NSAttributedString)?.string ?? (s as? String) ?? "\(s)"
    let cps = str.unicodeScalars.map { String(format: "U+%04X", $0.value) }.joined(separator: " ")
    let visible = str.unicodeScalars.map { $0.value < 0x20 || $0.value == 0x7F ? "␀" : String($0) }.joined()
    return "\"\(visible)\"\(cps.isEmpty ? "" : " [\(cps)]")"
}

final class ProbeTextView: NSTextView {
    override func keyDown(with event: NSEvent) {
        log("AppKit", "keyDown keyCode=\(event.keyCode)")
        super.keyDown(with: event)
        log("AppKit", "  post-keyDown: hasMarked=\(hasMarkedText()) doc=\(fmt(string))")
    }
    override func setMarkedText(_ string: Any, selectedRange: NSRange, replacementRange: NSRange) {
        log("AppKit", "setMarkedText \(fmt(string)) sel=\(fmt(selectedRange)) repl=\(fmt(replacementRange))")
        super.setMarkedText(string, selectedRange: selectedRange, replacementRange: replacementRange)
        log("AppKit", "  → hasMarked=\(hasMarkedText()) markedRange=\(fmt(markedRange()))")
    }
    override func insertText(_ string: Any, replacementRange: NSRange) {
        log("AppKit", "insertText \(fmt(string)) repl=\(fmt(replacementRange))")
        super.insertText(string, replacementRange: replacementRange)
    }
    override func unmarkText() {
        log("AppKit", "unmarkText")
        super.unmarkText()
    }
    override func doCommand(by selector: Selector) {
        log("AppKit", "doCommand \(selector)")
        super.doCommand(by: selector)
    }
}

let html = """
<!doctype html><meta charset="utf-8">
<body style="margin:0;font-family:-apple-system">
<input id="i" style="font-size:20px;width:96%;margin:6px;padding:4px" placeholder="WebKit input — type here">
<script>
const i = document.getElementById('i');
for (const t of ['keydown','beforeinput','input','compositionstart','compositionupdate','compositionend'])
  i.addEventListener(t, e => {
    let d = t;
    if (e.key !== undefined) d += ` key=${e.key === ' ' ? 'Space' : e.key}`;
    if (e.isComposing !== undefined) d += ` isComposing=${e.isComposing}`;
    if (e.inputType) d += ` inputType=${e.inputType}`;
    if (e.data != null) d += ` data="${e.data}"`;
    d += ` value="${i.value}"`;
    window.webkit.messageHandlers.log.postMessage(d);
  });
</script>
"""

final class LogHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ u: WKUserContentController, didReceive message: WKScriptMessage) {
        log("WebKit", "\(message.body)")
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)

let win = NSWindow(contentRect: NSRect(x: 200, y: 200, width: 680, height: 720),
                   styleMask: [.titled, .closable, .resizable],
                   backing: .buffered, defer: false)
win.title = "IME Probe"
let content = win.contentView!
let W = content.bounds.width

func label(_ text: String, y: CGFloat) {
    let l = NSTextField(labelWithString: text)
    l.frame = NSRect(x: 10, y: y, width: W - 20, height: 16)
    l.font = .boldSystemFont(ofSize: 11)
    l.autoresizingMask = [.width, .minYMargin]
    content.addSubview(l)
}

label("AppKit NSTextView (instrumented NSTextInputClient):", y: 694)
let probeScroll = NSScrollView(frame: NSRect(x: 10, y: 646, width: W - 20, height: 44))
probeScroll.autoresizingMask = [.width, .minYMargin]
probeScroll.borderType = .bezelBorder
let probe = ProbeTextView(frame: NSRect(origin: .zero, size: probeScroll.contentSize))
probe.font = .systemFont(ofSize: 20)
probe.autoresizingMask = [.width]
probeScroll.documentView = probe
content.addSubview(probeScroll)

label("WKWebView (Safari's engine, DOM events):", y: 622)
let config = WKWebViewConfiguration()
config.userContentController.add(LogHandler(), name: "log")
let web = WKWebView(frame: NSRect(x: 10, y: 566, width: W - 20, height: 50), configuration: config)
web.autoresizingMask = [.width, .minYMargin]
web.loadHTMLString(html, baseURL: nil)
content.addSubview(web)

let logScroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: W, height: 558))
logScroll.autoresizingMask = [.width, .height]
logScroll.hasVerticalScroller = true
logView.frame = NSRect(origin: .zero, size: logScroll.contentSize)
logView.isEditable = false
logView.autoresizingMask = [.width]
logScroll.documentView = logView
content.addSubview(logScroll)

win.makeKeyAndOrderFront(nil)
win.makeFirstResponder(probe)
app.activate(ignoringOtherApps: true)
app.run()
