// genmenupdf.swift — generates the input-source icon PDFs.
//
// macOS typesets Apple IMEs' icons from TISIconLabels into a fixed 22×16pt
// rounded-rect badge, but hard-excludes third-party ("plugin") input methods
// from that path (verified: KLInputSourceIconManager returns nil for our
// source while composing badges even for disabled Apple IMEs). Third-party
// icons are drawn verbatim from the tsInputMode*IconFileKey files in every
// context. So we ship files that mimic the composed output, traced from a
// headless render of Korean's badge via the same private API the UIs use:
//
//   badge (ipabet.pdf):  22×16pt, full bleed, corner radius ~1.75pt,
//                        glyph knockout ~56% of tile height
//   bare  (ipabet-alt.pdf): glyph only — the fn/Ctrl-Space switcher look
//                        (tsInputModeAlternateMenuIconFileKey)
//
// Both are template images: color ignored, alpha is the mask.
//
// Usage: swift genmenupdf.swift <badge.pdf> <bare.pdf>

import Cocoa
import CoreText

guard CommandLine.arguments.count == 3 else {
    FileHandle.standardError.write("usage: genmenupdf.swift <badge.pdf> <bare.pdf>\n".data(using: .utf8)!)
    exit(1)
}

func glyphPath(_ size: CGFloat) -> CGPath {
    let font = CTFontCreateWithName("Helvetica-Bold" as CFString, size, nil)
    var uni: [UniChar] = Array("ə".utf16)
    var glyphs = [CGGlyph](repeating: 0, count: 1)
    CTFontGetGlyphsForCharacters(font, &uni, &glyphs, 1)
    return CTFontCreatePathForGlyph(font, glyphs[0], nil)!
}

func writePDF(_ path: String, draw: (CGContext, CGRect) -> Void) {
    var box = CGRect(x: 0, y: 0, width: 22, height: 16)   // pt; the system badge frame
    let data = NSMutableData()
    let ctx = CGContext(consumer: CGDataConsumer(data: data as CFMutableData)!, mediaBox: &box, nil)!
    ctx.beginPDFPage(nil)
    draw(ctx, box)
    ctx.endPDFPage()
    ctx.closePDF()
    try! (data as Data).write(to: URL(fileURLWithPath: path))
    FileHandle.standardError.write("wrote \(path) (22×16 pt)\n".data(using: .utf8)!)
}

// Center the glyph scaled to `height`, returning the positioned path.
func centeredGlyph(in box: CGRect, height: CGFloat) -> CGPath {
    let gp = glyphPath(16)
    let gb = gp.boundingBox
    let scale = height / gb.height
    var xf = CGAffineTransform(translationX: box.midX - gb.midX * scale,
                               y: box.midY - gb.midY * scale)
        .scaledBy(x: scale, y: scale)
    return gp.copy(using: &xf)!
}

// Badge: filled rounded rect with the glyph as an even-odd knockout.
writePDF(CommandLine.arguments[1]) { ctx, box in
    let path = CGMutablePath()
    path.addRoundedRect(in: box, cornerWidth: 1.75, cornerHeight: 1.75)
    path.addPath(centeredGlyph(in: box, height: box.height * 0.56))
    ctx.addPath(path)
    ctx.setFillColor(CGColor(gray: 0, alpha: 1))
    ctx.fillPath(using: .evenOdd)
}

// Bare glyph: the switcher look, slightly larger since there is no frame.
writePDF(CommandLine.arguments[2]) { ctx, box in
    ctx.addPath(centeredGlyph(in: box, height: box.height * 0.70))
    ctx.setFillColor(CGColor(gray: 0, alpha: 1))
    ctx.fillPath()
}
