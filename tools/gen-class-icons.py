"""Cuts the class emblems out of a screenshot of the game's class list (transparent PNGs for the overlay).

Usage: python tools/gen-class-icons.py <screenshot.png>

The emblems are the game's artwork (NCSOFT); the images are not stored in this repository. Without them the overlay
falls back to the emblems drawn in ClassIcon.tsx.
Boxes are (left, top, right, bottom) in the 264x636 screenshot of the class list.
"""
import sys
from pathlib import Path

from PIL import Image

BOXES = {
    'gladiator': (42, 17, 79, 67),
    'assassin': (40, 73, 83, 119),
    'cleric': (38, 168, 88, 236),
    'ranger': (48, 282, 84, 322),
    'chanter': (48, 328, 82, 367),
    'sorcerer': (45, 371, 85, 411),
    'templar': (47, 445, 84, 492),
    'spiritmaster': (46, 498, 85, 544),
}
OUT = Path('src/renderer/src/assets/classes')
OUT.mkdir(parents=True, exist_ok=True)
SIZE = 96

src = Image.open(sys.argv[1]).convert('RGB')
for name, box in BOXES.items():
    crop = src.crop(box)
    w, h = crop.size
    px = crop.load()
    # background colour: the median of the crop's border pixels
    border = [px[x, y] for x in range(w) for y in (0, h - 1)] + [px[x, y] for y in range(h) for x in (0, w - 1)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    out = Image.new('RGBA', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            dist = max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2]))
            a = max(0.0, min(1.0, (dist - 14) / 56))
            if a <= 0:
                op[x, y] = (0, 0, 0, 0)
                continue
            # un-mix the background so the emblem keeps its own colour on any backdrop
            col = [max(0, min(255, round((c - bgc * (1 - a)) / a))) for c, bgc in zip((r, g, b), bg)]
            op[x, y] = (col[0], col[1], col[2], round(a * 255))
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    scale = (SIZE - 8) / max(out.size)
    out = out.resize((max(1, round(out.width * scale)), max(1, round(out.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(out, ((SIZE - out.width) // 2, (SIZE - out.height) // 2), out)
    canvas.save(OUT / f'{name}.png', optimize=True)
    print(name, box, 'bg', bg)
