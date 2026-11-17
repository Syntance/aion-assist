"""Converts the Odyle energy item icon (an AVIF from the game's item list) to the 64 px webp the overlay uses.

Usage: python tools/gen-odyle-icon.py <Icon_item_odenergy_a_001.avif>

The icon is the game's artwork (NCSOFT) and is not stored in this repository; without it the footer shows a drawn bolt.
"""
import sys
from pathlib import Path

from PIL import Image

out = Path('src/renderer/src/assets/items')
out.mkdir(parents=True, exist_ok=True)
im = Image.open(sys.argv[1]).convert('RGBA')
im.thumbnail((64, 64), Image.LANCZOS)
im.save(out / 'odyle.webp', 'WEBP', quality=90, method=6)
print('written', out / 'odyle.webp', im.size)
