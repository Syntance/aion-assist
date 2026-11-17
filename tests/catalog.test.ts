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

  it('ignores a corrupt file instead of failing', () => {
    const d = dir();
    writeFileSync(join(d, 'npc-catalog.json'), '{ not json');
    expect(new NpcCatalog(d).size).toBe(0);
  });
});
