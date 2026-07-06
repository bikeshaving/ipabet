// genmenupdf.swift — generates ipabet.pdf, the input-source icon.
//
// Both system renderers of input-source icons — TextInputMenuAgent (menu-bar
// dropdown) and TextInputSwitcher (fn/Ctrl-Space HUD) — frame each entry in a
// rounded-rect badge and expect the icon to fill it. Apple's own IMEs get a
// per-context composited badge (a path gated to Apple: KLInputSourceIconManager
// returns nil for third parties). We can only ship ONE static file, so we ship
// a badge that mimics the composed one — traced from a headless render of
// Korean's 2SetKorean badge: 22×16pt, full bleed, ~1.75pt corner radius, glyph
// knocked out at ~56% of the tile height. Template image: color ignored, alpha
// is the mask.
//
// Usage: swift genmenupdf.swift ipabet.pdf

import Cocoa
import CoreText

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write("usage: genmenupdf.swift <out.pdf>\n".data(using: .utf8)!)
    exit(1)
}

var box = CGRect(x: 0, y: 0, width: 22, height: 16)   // pt; the system badge frame
let data = NSMutableData()
let ctx = CGContext(consumer: CGDataConsumer(data: data as CFMutableData)!, mediaBox: &box, nil)!
ctx.beginPDFPage(nil)

// Glyph path, knocked out of the badge as an even-odd hole.
let font = CTFontCreateWithName("Helvetica-Bold" as CFString, 16, nil)
var uni: [UniChar] = Array("ə".utf16)
var glyphs = [CGGlyph](repeating: 0, count: 1)
CTFontGetGlyphsForCharacters(font, &uni, &glyphs, 1)
let gp = CTFontCreatePathForGlyph(font, glyphs[0], nil)!
let gb = gp.boundingBox
let scale = (box.height * 0.56) / gb.height
var xf = CGAffineTransform(translationX: box.midX - gb.midX * scale,
                           y: box.midY - gb.midY * scale)
    .scaledBy(x: scale, y: scale)

let path = CGMutablePath()
path.addRoundedRect(in: box, cornerWidth: 1.75, cornerHeight: 1.75)
path.addPath(gp.copy(using: &xf)!)
ctx.addPath(path)
ctx.setFillColor(CGColor(gray: 0, alpha: 1))
ctx.fillPath(using: .evenOdd)

ctx.endPDFPage()
ctx.closePDF()
try! (data as Data).write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
FileHandle.standardError.write("wrote \(CommandLine.arguments[1]) (22×16 pt badge)\n".data(using: .utf8)!)
