"""Cuts the second set of class emblems (coloured crests) out of two screenshots of a class list.

Usage: python tools/gen-class-icons-alt.py <list-1.png> <list-2.png>
  list-1: Assassin, Elementalist (Spirit Master), Templar, Gladiator
  list-2: Chanter, Sorcerer, Ranger, Cleric

The emblems are the game's artwork (NCSOFT); the images are not stored in this repository. Without them the overlay
offers only the first set. Boxes are (left, top, right, bottom) in the two screenshots.
"""
import sys
from pathlib import Path

from PIL import Image

LIST1 = {'assassin': (5, 18, 38, 46), 'spiritmaster': (5, 53, 38, 79), 'templar': (5, 86, 38, 113), 'gladiator': (5, 119, 38, 147)}
LIST2 = {'chanter': (14, 4, 41, 30), 'sorcerer': (14, 37, 41, 64), 'ranger': (14, 71, 41, 97), 'cleric': (14, 105, 41, 132)}
OUT = Path('src/renderer/src/assets/classes-alt')
OUT.mkdir(parents=True, exist_ok=True)
SIZE = 96


def cut(src: Image.Image, name: str, box: tuple[int, int, int, int]) -> None:
    crop = src.crop(box)
    w, h = crop.size
    px = crop.load()
    border = [px[x, y] for x in range(w) for y in (0, h - 1)] + [px[x, y] for y in range(h) for x in (0, w - 1)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    out = Image.new('RGBA', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            dist = max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2]))
            a = max(0.0, min(1.0, (dist - 16) / 50))
            if a <= 0:
                op[x, y] = (0, 0, 0, 0)
                continue
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


first = Image.open(sys.argv[1]).convert('RGB')
second = Image.open(sys.argv[2]).convert('RGB')
for name, box in LIST1.items():
    cut(first, name, box)
for name, box in LIST2.items():
    cut(second, name, box)
