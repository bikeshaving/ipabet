// genmenupdf.swift — generates the input-source icon PDFs.
//
// The two system renderers frame icons differently: the menu-bar dropdown
// wraps each entry in a rounded badge; the fn/Ctrl-Space cycler shows bare
// glyphs (only the selected entry is filled). Apple's IMEs supply a
// context-specific composited icon; we approximate by shipping BOTH files
// and pointing the menu icon key at the badge and the alternate/palette key
// at the bare glyph (requires ComponentInputModeDict registration).
//
//   ipabet.pdf       — 22×16 badge (menu dropdown)
//   ipabet-bare.pdf  — bare ə glyph (fn cycler / palette)
//
// Template images: color ignored, alpha is the mask.
//
// Usage: swift genmenupdf.swift   (writes both, cwd)

import Cocoa
import CoreText

func glyphPath(scale: CGFloat, in box: CGRect, heightFrac: CGFloat) -> CGPath {
    let font = CTFontCreateWithName("Helvetica-Bold" as CFString, 16, nil)
    var uni: [UniChar] = Array("ə".utf16)
    var glyphs = [CGGlyph](repeating: 0, count: 1)
    CTFontGetGlyphsForCharacters(font, &uni, &glyphs, 1)
    let gp = CTFontCreatePathForGlyph(font, glyphs[0], nil)!
    let gb = gp.boundingBox
    let s = (box.height * heightFrac) / gb.height
    var xf = CGAffineTransform(translationX: box.midX - gb.midX * s,
                               y: box.midY - gb.midY * s).scaledBy(x: s, y: s)
    return gp.copy(using: &xf)!
}

func writePDF(_ path: String, _ draw: (CGContext, CGRect) -> Void) {
    var box = CGRect(x: 0, y: 0, width: 22, height: 16)
    let data = NSMutableData()
    let ctx = CGContext(consumer: CGDataConsumer(data: data as CFMutableData)!, mediaBox: &box, nil)!
    ctx.beginPDFPage(nil)
    draw(ctx, box)
    ctx.endPDFPage(); ctx.closePDF()
    try! (data as Data).write(to: URL(fileURLWithPath: path))
    FileHandle.standardError.write("wrote \(path)\n".data(using: .utf8)!)
}

// Badge: rounded rect with the glyph knocked out (even-odd), like Korean's.
writePDF("ipabet.pdf") { ctx, box in
    let path = CGMutablePath()
    path.addRoundedRect(in: box, cornerWidth: 1.75, cornerHeight: 1.75)
    path.addPath(glyphPath(scale: 1, in: box, heightFrac: 0.56))
    ctx.addPath(path)
    ctx.setFillColor(CGColor(gray: 0, alpha: 1))
    ctx.fillPath(using: .evenOdd)
}

// Bare glyph: larger, no frame — matches the fn cycler.
writePDF("ipabet-bare.pdf") { ctx, box in
    ctx.addPath(glyphPath(scale: 1, in: box, heightFrac: 0.72))
    ctx.setFillColor(CGColor(gray: 0, alpha: 1))
    ctx.fillPath()
}
