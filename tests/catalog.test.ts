import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NpcCatalog } from '../src/main/catalog';

describe('npc catalog', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'aion-catalog-'));

  it('is empty when there is no file', () => {
    const c = new NpcCatalog(dir());
    expect(c.size).toBe(0);
    expect(c.npc(2_300_910)).toBeNull();
    expect(c.dungeon(600_092)).toBeNull();
  });

  it('reads names, boss flags and dungeons', () => {
    const d = dir();
    writeFileSync(
      join(d, 'npc-catalog.json'),
      JSON.stringify({
        npcs: { '2300910': { name: 'Ferocious Horn Nuakum', boss: true, dungeonId: 600092 }, '2400032': { name: 'Training Scarecrow', boss: false } },
        dungeons: { '600092': { name: 'Ferocious Horn Den', tier: 'Conquest [Normal]', category: 'Dungeon' } },
      }),
    );
    const c = new NpcCatalog(d);
    expect(c.size).toBe(2);
    expect(c.npc(2_300_910)).toMatchObject({ name: 'Ferocious Horn Nuakum', boss: true });
    expect(c.npc(2_400_032)?.boss).toBe(false);
    expect(c.dungeon(600_092)).toMatchObject({ name: 'Ferocious Horn Den', tier: 'Conquest [Normal]' });
    expect(c.npc(1)).toBeNull();
  });

  it('uses the built-in table and lets the local file add to it and override it', () => {
    const d = dir();
    const seed = { npcs: { '1': { name: 'Seed Boss', boss: true }, '2': { name: 'Seed Mob' } }, dungeons: { '600001': { name: 'Krao Cave' } } };
    expect(new NpcCatalog(d, seed).npc(1)).toMatchObject({ name: 'Seed Boss', boss: true });
    writeFileSync(join(d, 'npc-catalog.json'), JSON.stringify({ npcs: { '2': { name: 'Local Mob' }, '3': { name: 'Local Only' } }, dungeons: { '600001': { name: 'Krao Cave', tier: 'Conquest [Normal]' } } }));
    const c = new NpcCatalog(d, seed);
    expect(c.npc(1)?.name).toBe('Seed Boss');
    expect(c.npc(2)?.name).toBe('Local Mob');
    expect(c.npc(3)?.name).toBe('Local Only');
    expect(c.dungeon(600001)).toMatchObject({ tier: 'Conquest [Normal]' });
  });

  it('ignores a corrupt file instead of failing', () => {
    const d = dir();
    writeFileSync(join(d, 'npc-catalog.json'), '{ not json');
    expect(new NpcCatalog(d).size).toBe(0);
  });
});
