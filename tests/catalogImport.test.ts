import { describe, expect, it } from 'vitest';
import { extractCatalog } from '../src/main/catalogImport';

/** What the table looks like inside the program file: a pretty-printed JSON object per language. */
const table = (entries: string): string => `\u0000junk{\n${entries}\n}\u0000`;

describe('extractCatalog', () => {
  it('reads NPCs (with boss flag, dungeon, tier) and dungeons', () => {
    const text = table(`  "2300910": {
    "name": "Ferocious Horn Nuakum",
    "isBoss": true,
    "category": "Dungeon",
    "tier": "Conquest [Normal]",
    "dungeonId": 600092
  },
  "2300911": {
    "name": "Mutated Shulak Laborer",
    "isBoss": false
  },
  "600092": {
    "name": "Ferocious Horn Den",
    "tier": "Conquest [Normal]",
    "category": "Dungeon",
    "requiredItemLevel": 2100
  }`);
    const c = extractCatalog(text);
    expect(c.npcs['2300910']).toEqual({ name: 'Ferocious Horn Nuakum', boss: true, dungeonId: 600092, tier: 'Conquest [Normal]', category: 'Dungeon' });
    expect(c.npcs['2300911']).toEqual({ name: 'Mutated Shulak Laborer', boss: false });
    expect(c.dungeons['600092']).toEqual({ name: 'Ferocious Horn Den', tier: 'Conquest [Normal]', category: 'Dungeon' });
    expect(c.npcs['600092']).toBeUndefined();
  });

  it('keeps the first plain-ASCII (English) table and skips mangled and non-Latin names', () => {
    const korean = Buffer.from('"2300910": {\n "name": "누아쿰",\n "isBoss": true\n}', 'utf8').toString('latin1');
    const mangled = '"2300910": {\n "name": "?????????",\n "isBoss": true\n}';
    const english = '"2300910": {\n "name": "Ferocious Horn Nuakum",\n "isBoss": true\n}';
    const german = '"2300910": {\n "name": "Nuakum vom Wilden Horn",\n "isBoss": true\n}';
    const c = extractCatalog([korean, mangled, english, german].join('\n'));
    expect(c.npcs['2300910']?.name).toBe('Ferocious Horn Nuakum');
  });

  it('returns nothing for data without tables', () => {
    expect(extractCatalog('MZ\u0000\u0000no json here')).toEqual({ npcs: {}, dungeons: {} });
  });
});
