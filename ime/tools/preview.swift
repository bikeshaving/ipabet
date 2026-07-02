// preview.swift — render the template icon the way macOS would: tint the
// alpha mask a color and place it on a background. Emits a side-by-side
// proof (dark-on-light like an unselected row, white-on-blue like selected).
import Cocoa

let src = CommandLine.arguments[1]
let scale = 12                      // blow up for inspection
let img = NSBitmapImageRep(data: try! Data(contentsOf: URL(fileURLWithPath: src)))!
let w = img.pixelsWide, h = img.pixelsHigh

func tinted(_ tint: NSColor, _ bg: NSColor) -> [UInt8] {
    var out = [UInt8](repeating: 0, count: w*h*4)
    for y in 0..<h { for x in 0..<w {
        let a = img.colorAt(x: x, y: y)!.usingColorSpace(.sRGB)!.alphaComponent
        let r = tint.redComponent*a + bg.redComponent*(1-a)
        let g = tint.greenComponent*a + bg.greenComponent*(1-a)
        let b = tint.blueComponent*a + bg.blueComponent*(1-a)
        let i = (y*w+x)*4
        out[i]=UInt8(r*255); out[i+1]=UInt8(g*255); out[i+2]=UInt8(b*255); out[i+3]=255
    }}
    return out
}

func rgb(_ r:CGFloat,_ g:CGFloat,_ b:CGFloat) -> NSColor { NSColor(srgbRed:r,green:g,blue:b,alpha:1) }
let panels = [
    tinted(rgb(0.30,0.30,0.30), rgb(0.96,0.96,0.96)),   // unselected row
    tinted(rgb(1,1,1),          rgb(0.30,0.55,1))         // selected (blue) row
]
let PW = w*scale, PH = h*scale, gap = scale, total = PW*2+gap
let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data:nil,width:total,height:PH,bitsPerComponent:8,bytesPerRow:0,space:cs,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(NSColor.white.cgColor); ctx.fill(CGRect(x:0,y:0,width:total,height:PH))
for (p,px) in panels.enumerated() {
    let small = CGContext(data:nil,width:w,height:h,bitsPerComponent:8,bytesPerRow:0,space:cs,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
    small.data!.copyMemory(from:px, byteCount:w*h*4)
    let cg = small.makeImage()!
    ctx.interpolationQuality = .none
    ctx.draw(cg, in: CGRect(x: p*(PW+gap), y:0, width:PW, height:PH))
}
let outImg = ctx.makeImage()!
let data = NSBitmapImageRep(cgImage: outImg).representation(using:.png,properties:[:])!
try! data.write(to: URL(fileURLWithPath:"/tmp/icon_proof.png"))
print("wrote /tmp/icon_proof.png")
