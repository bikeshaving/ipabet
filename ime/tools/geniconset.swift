// geniconset.swift — generates the IPAKey input-source icons.
//
// Produces a "badge with knockout" template image that matches the macOS
// system input-source icons (A, 한, 拼): a filled rounded-square badge with
// the ə glyph cut out of it. TISIconIsTemplate renders the opaque badge
// tinted to context (dark in the list, white when the row is selected) and
// the knocked-out glyph shows the row background through it.
//
// Usage: swift geniconset.swift <out.png> <pixelSize>
//   swift geniconset.swift ipakey.png    16
//   swift geniconset.swift ipakey@2x.png 32

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

// Badge geometry: slight inset so it doesn't kiss the tile edges, generous
// corner radius like the system superellipse badges.
let inset  = (size * 0.06).rounded()
let rect   = CGRect(x: inset, y: inset, width: size - 2*inset, height: size - 2*inset)
let radius = rect.width * 0.28

// Schwa glyph path from a heavy weight so the knockout reads at 16 px.
let font = CTFontCreateWithName("Helvetica-Bold" as CFString, size * 0.72, nil)
var uni: [UniChar] = Array("ə".utf16)
var glyphs = [CGGlyph](repeating: 0, count: uni.count)
CTFontGetGlyphsForCharacters(font, &uni, &glyphs, uni.count)
guard let glyphPath = CTFontCreatePathForGlyph(font, glyphs[0], nil) else {
    fatalError("no glyph path")
}
let gb = glyphPath.boundingBox
// Center the glyph optically within the badge.
let tx = rect.midX - gb.midX
let ty = rect.midY - gb.midY
var xf = CGAffineTransform(translationX: tx, y: ty)
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
