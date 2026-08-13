#!/usr/bin/env python3
# Generates windows/tsf/ipabet.ico — the letters IPA, which is what Windows
# draws in the tray for a text service.
#
# The second line of the tray indicator is a keyboard layout's own name (USA,
# INTL), read from a registry field a TSF text service does not have. A text
# service gets an icon and nothing else, so matching "ENG / USA" means the icon
# is the three letters.
#
# White, with a dark outline at the sizes that can carry one. The icon is a
# single bitmap and the taskbar is dark by default and light when the user says
# so, so the outline is what keeps the letters legible on a light taskbar. At 16
# and 20 pixels there is no room for it: three letters leave four pixels each,
# and an outline turns them into one gray mass.
#
# Run on macOS (it uses a system font): python3 windows/tools/genicon.py

import struct
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf"
SIZES = (16, 20, 24, 32, 48, 256)
TEXT = "IPA"


def render(px):
    # Supersampled, except at the sizes where it hurts: at 16 and 20 pixels a
    # downsampled outline and fill blur into one gray mass, and drawing at the
    # final size keeps the stroke exactly one pixel wide.
    scale = 1 if px <= 20 else 8
    img = Image.new("RGBA", (px * scale, px * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    size = px * scale
    font = ImageFont.truetype(FONT, int(size * 0.78))
    box = d.textbbox((0, 0), TEXT, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    if w > size * 0.96:
        font = ImageFont.truetype(FONT, int(size * 0.78 * (size * 0.96) / w))
        box = d.textbbox((0, 0), TEXT, font=font)
        w, h = box[2] - box[0], box[3] - box[1]
    x = (size - w) / 2 - box[0]
    y = (size - h) / 2 - box[1]

    stroke = 0 if px <= 20 else max(1, round(size * 0.045))
    d.text((x, y), TEXT, font=font, fill=(250, 250, 250, 255),
           stroke_width=stroke, stroke_fill=(0, 0, 0, 215) if stroke else None)
    return img if scale == 1 else img.resize((px, px), Image.LANCZOS)


def main():
    blobs = []
    for px in SIZES:
        buf = BytesIO()
        render(px).save(buf, format="PNG")
        blobs.append((px, buf.getvalue()))

    out = bytearray(struct.pack("<HHH", 0, 1, len(blobs)))
    offset = 6 + 16 * len(blobs)
    entries, data = bytearray(), bytearray()
    for px, blob in blobs:
        # 256 is stored as 0: the field is one byte.
        entries += struct.pack("<BBBBHHII", px % 256, px % 256, 0, 0, 1, 32,
                               len(blob), offset)
        data += blob
        offset += len(blob)

    with open("windows/tsf/ipabet.ico", "wb") as f:
        f.write(bytes(out + entries + data))
    print(f"wrote windows/tsf/ipabet.ico — {len(blobs)} sizes")


if __name__ == "__main__":
    main()
