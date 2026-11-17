"""Builds the pet portraits and family crystals used by the overlay (src/renderer/src/assets/pets) from a PetTracker checkout.

Usage: python tools/gen-pet-assets.py <path to PetTracker-main>

The images are the game's artwork (NCSOFT) as shipped by PetTracker; they are not stored in this repository.
Without them the overlay still works (the pet rows just show an empty portrait box).
"""
import sys
from pathlib import Path

from PIL import Image

src = Path(sys.argv[1]) / 'assets'
out = Path('src/renderer/src/assets/pets')
(out / 'portraits').mkdir(parents=True, exist_ok=True)
(out / 'crystals').mkdir(parents=True, exist_ok=True)

count = 0
for f in sorted((src / 'portraits').glob('*.png')):
    im = Image.open(f).convert('RGBA')
    im.thumbnail((112, 112), Image.LANCZOS)
    im.save(out / 'portraits' / (f.stem + '.webp'), 'WEBP', quality=88, method=6)
    count += 1
for f in (src / 'crystals').glob('*.png'):
    im = Image.open(f).convert('RGBA')
    im.thumbnail((48, 48), Image.LANCZOS)
    im.save(out / 'crystals' / f.name, 'PNG', optimize=True)
print(count, 'portraits written to', out)
