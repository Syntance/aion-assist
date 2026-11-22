"""Builds the pet maps (Verteron, Altgard, Eltnen, Morheim and the Abyss maps): their pictures and the spawn points of the pet monsters.

Usage: python tools/gen-pet-maps.py <Aion-DPS-Meter checkout (SkeeveAN)> <aion2-interactive-map checkout> <glass-cannon checkout (xinjalin)>

From the Aion-DPS-Meter checkout (MIT): Client/assets/aion2/pets/pets.json (which monster gives which pet) and pets/spawns.json (the
positions the game client lists for every monster).
From the glass-cannon checkout (MIT): gamedata/petmap_<table>.jpg, the current world map pictures in the game's own parchment style
(Questlog's map shrunk to about 2 m a pixel).
From the aion2-interactive-map checkout: public/UI/Map/WorldMap/<map>/Res/<map>_<col>_<row>.webp, the Lower Reshanta tiles (the same
picture as glass-cannon's, but 4096 px instead of 2040).
Writes src/renderer/src/data/petMaps.ts (spawn points as 0..1 map fractions) and the tiles to
src/renderer/src/assets/maps/<key>/<col>_<row>.webp (game artwork, not stored in the repository, see .gitignore).

Adding another map (the game gets more of them: the Asian clients have six Abyss maps) is one more entry in PET_MAPS: its spawn table in
spawns.json, its picture (a tile folder or one image) and the world size it spans.

Every map is a square centred on the world origin, no flip and no rotation: fraction = 0.5 + world / span. The spans are the sector
tables of the maps (questlog.gg's map client config, as used by aion2-nyerk and glass-cannon): the four world maps 8 x 102000 = 816000,
Lower Reshanta 4 x 102000 = 408000, Middle and Outer Reshanta 2 x 102000 = 204000. They agree with what Aion-DPS-Meter fitted against
recordings (Altgard 0.004 %, Lower 0.07 %) and with the fit made here on where the Middle map's 1700 spawn points land on its islands
(0.4 %). Overlaying every table on its picture puts the spawns on land.

The names are the game's own (the client's map name table, as in Aion-DPS-Meter's field_bosses.json): the tables Abyss_Reshanta_A / _C / _D
are Chaotic Lower / Middle / Outer Reshanta (D was "Chaotic Upper Reshanta" in the tables until the patch of 2026-11-04 on Global).
Abyss_Reshanta_B is a deprecated map the game no longer lists and has no pet spawns, so it is not here.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

dps = Path(sys.argv[1]) / 'Client' / 'assets' / 'aion2'
community = Path(sys.argv[2]) / 'public' / 'UI' / 'Map' / 'WorldMap'
glass_cannon = Path(sys.argv[3]) / 'gamedata'
repo = Path(__file__).resolve().parent.parent

TILE = 1024  # px of a tile in the app
# key, group (the map list of the window), the game's name, spawn table, its picture: 'tiles' (a tile folder in the community
# checkout) or 'image' (one picture in the glass-cannon checkout), grid (tiles per side in the app) and span (world units across the map)
PET_MAPS = [
    {'key': 'verteron', 'group': 'world', 'name': 'Verteron', 'table': 'World/World_L/World_L_A', 'image': 'petmap_World_L_A.jpg', 'grid': 4, 'span': 816000},
    {'key': 'altgard', 'group': 'world', 'name': 'Altgard', 'table': 'World/World_D/World_D_A', 'image': 'petmap_World_D_A.jpg', 'grid': 4, 'span': 816000},
    {'key': 'eltnen', 'group': 'world', 'name': 'Eltnen', 'table': 'World/World_L/World_L_B', 'image': 'petmap_World_L_B.jpg', 'grid': 4, 'span': 816000},
    {'key': 'morheim', 'group': 'world', 'name': 'Morheim', 'table': 'World/World_D/World_D_B', 'image': 'petmap_World_D_B.jpg', 'grid': 4, 'span': 816000},
    {'key': 'reshanta-lower', 'group': 'abyss', 'name': 'Chaotic Lower Reshanta', 'table': 'Intersever/Abyss/Abyss_Reshanta_A', 'tiles': 'Abyss_Reshanta_A', 'grid': 4, 'span': 408000},
    {'key': 'reshanta-middle', 'group': 'abyss', 'name': 'Chaotic Middle Reshanta', 'table': 'Intersever/Abyss/Abyss_Reshanta_C', 'image': 'petmap_Abyss_Reshanta_C.jpg', 'grid': 1, 'span': 204000},
    {'key': 'reshanta-outer', 'group': 'abyss', 'name': 'Chaotic Outer Reshanta', 'table': 'Intersever/Abyss/Abyss_Reshanta_D', 'image': 'petmap_Abyss_Reshanta_D.jpg', 'grid': 1, 'span': 204000},
]

spawn_tables = json.loads((dps / 'pets' / 'spawns.json').read_text(encoding='utf-8-sig'))['maps']
monsters = json.loads((dps / 'pets' / 'pets.json').read_text(encoding='utf-8-sig'))['monsters']

# monster names come from the NPC catalogue the app already ships (generated from Aion2DPSMeter)
seed = (repo / 'src' / 'main' / 'data' / 'npcSeed.ts').read_text(encoding='utf-8')
npc_names = json.loads(re.search(r'NPC_SEED: CatalogData = (\{.*\});', seed, re.S).group(1))['npcs']

assets = repo / 'src' / 'renderer' / 'src' / 'assets' / 'maps'


def save_tile(im, out, col, row):
    im.save(out / f'{col}_{row}.webp', 'WEBP', quality=82, method=6)


regions = []
names = {}
for m in PET_MAPS:
    points = []
    for npc, spots in sorted(spawn_tables.get(m['table'], {}).items(), key=lambda kv: int(kv[0])):
        pet = monsters.get(npc)
        if pet is None:
            continue
        names[int(npc)] = npc_names.get(npc, {}).get('name', f'NPC #{npc}')
        seen = set()
        for x, y, _z in spots:
            fx = round(0.5 + x / m['span'], 4)
            fy = round(0.5 + y / m['span'], 4)
            if (fx, fy) in seen:
                continue
            seen.add((fx, fy))
            for p in pet if isinstance(pet, list) else [pet]:
                points.append([p, int(npc), fx, fy])

    out = assets / m['key']
    out.mkdir(parents=True, exist_ok=True)
    tiles = []
    if m.get('tiles'):
        for col in range(m['grid']):
            for row in range(m['grid']):
                f = community / m['tiles'] / 'Res' / f"{m['tiles']}_{col:02d}_{row:02d}.webp"
                if not f.exists():
                    continue
                im = Image.open(f).convert('RGB')
                if im.width != TILE:
                    im = im.resize((TILE, TILE), Image.LANCZOS)
                save_tile(im, out, col, row)
                tiles.append([col, row])
    elif m.get('image'):
        whole = Image.open(glass_cannon / m['image']).convert('RGB')
        side = m['grid'] * TILE
        if whole.width != side:  # e.g. 4080 px -> 4096: the picture covers the whole map either way
            whole = whole.resize((side, side), Image.LANCZOS)
        for col in range(m['grid']):
            for row in range(m['grid']):
                save_tile(whole.crop((col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE)), out, col, row)
                tiles.append([col, row])
    regions.append({'key': m['key'], 'group': m['group'], 'name': m['name'], 'grid': m['grid'], 'tiles': tiles, 'points': points})
    print(f"{m['name']}: {len(points)} points, {len(tiles)} tiles")

lines = [
    '// Generated by tools/gen-pet-maps.py: spawn points from Aion-DPS-Meter (SkeeveAN, MIT), which read them out of the game client. Static points, not live mobs.',
    '// points: [pet id, npc id, x, y] with x, y in 0..1 over the whole map; a region without tiles has no picture and is drawn as plain points',
    'export interface SpawnRegion {',
    '  key: string;',
    "  group: 'world' | 'abyss';",
    '  name: string;',
    '  grid: number;',
    '  tiles: [number, number][];',
    '  points: [number, number, number, number][];',
    '}',
    '',
    f'export const PET_MAP_REGIONS: SpawnRegion[] = {json.dumps(regions, ensure_ascii=False, separators=(",", ":"))};',
    '',
    f'export const PET_MAP_NPC_NAMES: Record<number, string> = {json.dumps({str(k): v for k, v in sorted(names.items())}, ensure_ascii=False, separators=(",", ":"))};',
    '',
]
dest = repo / 'src' / 'renderer' / 'src' / 'data' / 'petMaps.ts'
dest.write_text('\n'.join(lines), encoding='utf-8')
print(sum(len(r['points']) for r in regions), 'points,', len(names), 'monsters ->', dest.name, f'({dest.stat().st_size // 1024} KB)')
