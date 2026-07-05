// genmenupdf.swift — generates ipabet.pdf, the input-source icon.
//
// macOS typesets Apple IMEs' icons from TISIconLabels into per-context
// chrome (rounded-rect badge in menus, bare glyph in the fn/Ctrl-Space
// HUD) but hard-excludes third-party input methods from that path — the
// label pipeline in KLInputSourceIconManager gates on IsPluginIM. Third
// parties get ONE file drawn verbatim in every context: badge-everywhere
// or bare-everywhere, nothing in between. IPAbet ships the bare glyph —
// honest everywhere, native in the HUD — rather than fake badge chrome.
// Template image: color is ignored, alpha is the mask. 22×16pt is the
// system icon frame (measured off Squirrel's rime.pdf and Apple's
// composed badges).
//
// Usage: swift genmenupdf.swift ipabet.pdf

import Cocoa
import CoreText

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write("usage: genmenupdf.swift <out.pdf>\n".data(using: .utf8)!)
    exit(1)
}

var box = CGRect(x: 0, y: 0, width: 22, height: 16)
let data = NSMutableData()
let ctx = CGContext(consumer: CGDataConsumer(data: data as CFMutableData)!, mediaBox: &box, nil)!
ctx.beginPDFPage(nil)

let font = CTFontCreateWithName("Helvetica-Bold" as CFString, 16, nil)
var uni: [UniChar] = Array("ə".utf16)
var glyphs = [CGGlyph](repeating: 0, count: 1)
CTFontGetGlyphsForCharacters(font, &uni, &glyphs, 1)
let gp = CTFontCreatePathForGlyph(font, glyphs[0], nil)!
let gb = gp.boundingBox
let scale = (box.height * 0.70) / gb.height
var xf = CGAffineTransform(translationX: box.midX - gb.midX * scale,
                           y: box.midY - gb.midY * scale)
    .scaledBy(x: scale, y: scale)
ctx.addPath(gp.copy(using: &xf)!)
ctx.setFillColor(CGColor(gray: 0, alpha: 1))
ctx.fillPath()

ctx.endPDFPage()
ctx.closePDF()
try! (data as Data).write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
FileHandle.standardError.write("wrote \(CommandLine.arguments[1]) (22×16 pt, bare glyph)\n".data(using: .utf8)!)
