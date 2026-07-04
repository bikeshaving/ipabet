// geniconset.swift — generates the IPAbet input-source icons.
//
// Produces a "badge with knockout" template image that matches the macOS
// system input-source icons (A, 한, 拼): a filled rounded-square badge with
// the ə glyph cut out of it. TISIconIsTemplate renders the opaque badge
// tinted to context (dark in the list, white when the row is selected) and
// the knocked-out glyph shows the row background through it.
//
// Usage: swift geniconset.swift <out.png> <pixelSize>
//   swift geniconset.swift ipabet.png    16
//   swift geniconset.swift ipabet@2x.png 32

import Cocoa
import CoreText

guard CommandLine.arguments.count == 3,
      let px = Int(CommandLine.arguments[2]) else {
    FileHandle.standardError.write("usage: geniconset.swift <out.png> <pixelSize>\n".data(using: .utf8)!)
    exit(1)
}
let outPath = CommandLine.arguments[1]
let size = CGFloat(px)

let cs = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(data: nil,
                          width: px, height: px,
                          bitsPerComponent: 8, bytesPerRow: 0,
                          space: cs,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
    fatalError("no context")
}
ctx.setAllowsAntialiasing(true)
ctx.setShouldAntialias(true)
ctx.interpolationQuality = .high

// Badge geometry measured off Apple's own input-source icons (2SetKorean
// .tiff, 32 px rep): the badge is FULL BLEED — no inset — with a corner
// radius of 12.5% of the tile. (Our previous 6% inset + 28% radius read as
// a circle at list size.)
let rect   = CGRect(x: 0, y: 0, width: size, height: size)
let radius = size * 0.125

// Schwa glyph path from a heavy weight so the knockout reads at 16 px.
let font = CTFontCreateWithName("Helvetica-Bold" as CFString, size * 0.72, nil)
var uni: [UniChar] = Array("ə".utf16)
var glyphs = [CGGlyph](repeating: 0, count: uni.count)
CTFontGetGlyphsForCharacters(font, &uni, &glyphs, uni.count)
guard let glyphPath = CTFontCreatePathForGlyph(font, glyphs[0], nil) else {
    fatalError("no glyph path")
}
// Scale the glyph to Apple's knockout proportion (한 spans ~66% of the
// tile; the round ə sits at ~60% for the same optical weight) and center.
let gb = glyphPath.boundingBox
let scale = (size * 0.60) / gb.height
var xf = CGAffineTransform(translationX: rect.midX - gb.midX * scale,
                           y: rect.midY - gb.midY * scale)
    .scaledBy(x: scale, y: scale)
let centeredGlyph = glyphPath.copy(using: &xf)!

// Compose: rounded-rect badge + glyph as an even-odd hole.
let path = CGMutablePath()
path.addRoundedRect(in: rect, cornerWidth: radius, cornerHeight: radius)
path.addPath(centeredGlyph)

ctx.beginPath()
ctx.addPath(path)
ctx.setFillColor(NSColor.black.cgColor)   // template: color is ignored, alpha is the mask
ctx.fillPath(using: .evenOdd)

guard let img = ctx.makeImage() else { fatalError("no image") }
let rep = NSBitmapImageRep(cgImage: img)
guard let data = rep.representation(using: .png, properties: [:]) else { fatalError("no png") }
try! data.write(to: URL(fileURLWithPath: outPath))
FileHandle.standardError.write("wrote \(outPath) (\(px)×\(px))\n".data(using: .utf8)!)
