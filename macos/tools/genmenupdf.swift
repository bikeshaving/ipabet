// genmenupdf.swift — generates ipabet.pdf, the input-source icon.
//
// A 22×16pt rounded-badge template (glyph knocked out), traced from Apple's
// own composed input-source badge (2SetKorean). One icon serves every
// surface: there is no Info.plist key targeting the fn/Ctrl-Space cycler
// distinctly, so per-surface icons (bare in the cycler, badge in the menu,
// as Apple renders its own) are not available to third-party input methods.
// Template image: color ignored, alpha is the mask.
//
// Usage: swift genmenupdf.swift   (writes ipabet.pdf to cwd)

import Cocoa
import CoreText

func glyphPath(in box: CGRect, heightFrac: CGFloat) -> CGPath {
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
    path.addPath(glyphPath(in: box, heightFrac: 0.56))
    ctx.addPath(path)
    ctx.setFillColor(CGColor(gray: 0, alpha: 1))
    ctx.fillPath(using: .evenOdd)
}
