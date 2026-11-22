import { describe, expect, it } from 'vitest';
import { NPC_PETS, PET_ROWS } from '../src/core/pets/petData';
import { PET_MAP_NPC_NAMES, PET_MAP_REGIONS } from '../src/renderer/src/data/petMaps';

describe('pet spawn maps', () => {
  const known = new Set(PET_ROWS.map((r) => r[0]));
  const byKey = new Map(PET_MAP_REGIONS.map((r) => [r.key, r]));

  it('has the world maps and every Abyss map, under the names the game uses (never a letter)', () => {
    expect(PET_MAP_REGIONS.filter((r) => r.group === 'world').map((r) => r.name)).toEqual(['Verteron', 'Altgard', 'Eltnen', 'Morheim']);
    expect(PET_MAP_REGIONS.filter((r) => r.group === 'abyss').map((r) => r.name)).toEqual(['Chaotic Lower Reshanta', 'Chaotic Middle Reshanta', 'Chaotic Outer Reshanta']);
    expect(new Set(PET_MAP_REGIONS.map((r) => r.key)).size).toBe(PET_MAP_REGIONS.length);
  });

  it('has a picture for every map and spawns on each', () => {
    for (const key of ['verteron', 'altgard', 'eltnen', 'morheim', 'reshanta-lower']) expect(byKey.get(key)?.tiles, key).toHaveLength(16); // 4 x 4
    for (const key of ['reshanta-middle', 'reshanta-outer']) expect(byKey.get(key)?.tiles, key).toHaveLength(1);
    for (const region of PET_MAP_REGIONS) expect(region.points.length, region.key).toBeGreaterThan(400);
  });

  it('keeps every spawn inside the area its tiles cover (or on the map at all when a map has no picture)', () => {
    for (const region of PET_MAP_REGIONS) {
      const cols = region.tiles.map((t) => t[0]);
      const rows = region.tiles.map((t) => t[1]);
      const blank = region.tiles.length === 0;
      const left = blank ? 0 : Math.min(...cols) / region.grid;
      const right = blank ? 1 : (Math.max(...cols) + 1) / region.grid;
      const top = blank ? 0 : Math.min(...rows) / region.grid;
      const bottom = blank ? 1 : (Math.max(...rows) + 1) / region.grid;
      for (const [, , x, y] of region.points) {
        expect(x, region.key).toBeGreaterThanOrEqual(left);
        expect(x, region.key).toBeLessThanOrEqual(right);
        expect(y, region.key).toBeGreaterThanOrEqual(top);
        expect(y, region.key).toBeLessThanOrEqual(bottom);
      }
    }
  });

  it('points at monsters it can name, and at pets the app knows (apart from the few it deliberately leaves out)', () => {
    const unknownPets = new Set<number>();
    for (const region of PET_MAP_REGIONS) {
      for (const [pet, npc] of region.points) {
        expect(PET_MAP_NPC_NAMES[npc], `npc ${npc}`).toBeTruthy();
        if (!known.has(pet)) unknownPets.add(pet);
      }
    }
    // a pet missing from the app's table is one that is not offered (e.g. bought only for real money): at most a handful
    expect(unknownPets.size).toBeLessThan(15);
  });

  it('agrees with the monster -> pet table the pet book already uses', () => {
    // two independent sources (the game client's spawn tables and PetTracker's drop table) must name the same pet for a monster
    let compared = 0;
    for (const region of PET_MAP_REGIONS) {
      for (const [pet, npc] of region.points) {
        const own = NPC_PETS[npc];
        if (!own) continue;
        compared++;
        expect(own[0], `npc ${npc}`).toBe(pet);
      }
    }
    expect(compared).toBeGreaterThan(10000);
  });
});
