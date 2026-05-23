#!/usr/bin/env python3
"""Generate Context Clipboard icons in 16/48/128/256."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

BG = (245, 180, 0, 255)          # warm amber/gold (Snip-style)
INK = (26, 19, 0, 255)
SHADOW = (0, 0, 0, 40)


def make_icon(size: int):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded square background
    radius = int(size * 0.22)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BG)

    # Clipboard body: rounded rect inset
    pad = int(size * 0.20)
    body_top = int(size * 0.22)
    body = (pad, body_top, size - pad, size - pad)
    body_radius = int(size * 0.08)
    d.rounded_rectangle(body, radius=body_radius, fill=INK)

    # Clip at top (the "metal grip")
    clip_w = int(size * 0.32)
    clip_h = int(size * 0.16)
    cx = size // 2
    clip = (cx - clip_w // 2, int(size * 0.12), cx + clip_w // 2, int(size * 0.12) + clip_h)
    d.rounded_rectangle(clip, radius=int(size * 0.04), fill=INK)
    # Inner cutout to look like grip
    inner_pad = max(1, int(size * 0.04))
    d.rounded_rectangle(
        (clip[0] + inner_pad, clip[1] + inner_pad, clip[2] - inner_pad, clip[3] - inner_pad),
        radius=int(size * 0.03),
        fill=BG,
    )

    # Lines on body (text rows)
    if size >= 48:
        line_color = BG
        line_x1 = pad + int(size * 0.10)
        line_x2 = size - pad - int(size * 0.10)
        line_h = max(2, int(size * 0.05))
        gap = int(size * 0.10)
        y = body_top + int(size * 0.16)
        for i in range(3):
            end = line_x2 if i < 2 else line_x1 + (line_x2 - line_x1) * 6 // 10
            d.rounded_rectangle((line_x1, y, end, y + line_h), radius=line_h // 2, fill=line_color)
            y += gap

    return img


for s in (16, 32, 48, 128, 256):
    icon = make_icon(s)
    out_path = os.path.join(OUT, f"icon-{s}.png")
    icon.save(out_path, "PNG")
    print(f"  wrote {out_path}")
