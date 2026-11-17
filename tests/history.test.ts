import { describe, expect, it } from 'vitest';
import { HistoryStore } from '../src/main/history';
import type { EncounterRecord, EncounterRow } from '../src/shared/types';

const row = (name: string, damage: number, side?: 'mine' | 'theirs'): EncounterRow => ({
  name, className: null, level: 45, gearScore: null, combatPower: null, isSelf: false, damage, hits: 1, crits: 0, casts: 1,
  back: 0, front: 0, parry: 0, perfect: 0, double: 0, deaths: 0, skills: [], ...(side ? { side } : {}),
});

const boss = (id: string, startedAt: number, durationMs: number, rows: EncounterRow[], mapId = 600092): EncounterRecord => ({
  id, startedAt, durationMs, total: rows.reduce((n, r) => n + r.damage, 0), npcCode: 2_300_910, npcMaxHp: 15_500_000, mapId, dungeonId: mapId, rows,
});

describe('history store', () => {
  const T = 1_800_000_000_000;

  it('groups the bosses of one expedition into a run with summed damage and time and the number of different players', () => {
    const store = new HistoryStore('unused', false);
    store.add(boss('a', T, 93_000, [row('Ana', 5_000_000), row('Bob', 3_000_000)]));
    store.add(boss('b', T + 200_000, 140_000, [row('Ana', 6_000_000), row('Cid', 4_000_000)]));
    store.add(boss('c', T + 400_000, 139_000, [row('Ana', 9_000_000)]));
    const { runs } = store.data({ skills: {}, npcs: {}, maps: {}, dungeons: {} });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ total: 27_000_000, durationMs: 372_000, players: 3 });
    expect(runs[0].encounters.map((e) => e.id)).toEqual(['c', 'b', 'a']); // newest first
  });

  it('a different map starts a new run', () => {
    const store = new HistoryStore('unused', false);
    store.add(boss('a', T, 60_000, [row('Ana', 1_000_000)], 600092));
    store.add(boss('b', T + 100_000, 60_000, [row('Ana', 1_000_000)], 1010));
    expect(store.data({ skills: {}, npcs: {}, maps: {}, dungeons: {} }).runs).toHaveLength(2);
  });

  it('deleting a fight removes it, and a run left empty disappears; deleting a run removes all its fights', () => {
    const store = new HistoryStore('unused', false);
    store.add(boss('a', T, 60_000, [row('Ana', 1_000_000)]));
    store.add(boss('b', T + 100_000, 60_000, [row('Ana', 2_000_000)]));
    store.deleteEncounter('a');
    expect(store.encounter('a')).toBeNull();
    expect(store.data({ skills: {}, npcs: {}, maps: {}, dungeons: {} }).runs[0].encounters).toHaveLength(1);
    store.deleteEncounter('b');
    expect(store.data({ skills: {}, npcs: {}, maps: {}, dungeons: {} }).runs).toHaveLength(0);
    store.add(boss('c', T + 500_000, 60_000, [row('Ana', 1_000_000)]));
    const runId = store.data({ skills: {}, npcs: {}, maps: {}, dungeons: {} }).runs[0].id;
    store.deleteRun(runId);
    expect(store.encounter('c')).toBeNull();
  });

  it('normalize files world bosses saved under a stale dungeon as open-world runs and leaves real dungeons alone', () => {
    const store = new HistoryStore('unused', false);
    store.add({ ...boss('w1', T, 80_000, [row('Ana', 6_000_000)], 500_043), npcCode: 2_100_661, dungeonId: 600_033 });
    store.add({ ...boss('w2', T + 100_000, 80_000, [row('Ana', 6_000_000)], 500_043), npcCode: 2_100_582, dungeonId: 600_033 });
    store.add({ ...boss('d1', T + 10_000_000, 90_000, [row('Ana', 8_000_000)], 600_033), npcCode: 2_340_709, dungeonId: 600_033 });
    const changed = store.normalize(
      (code) => code >= 2_100_000 && code < 2_200_000,
      (mapId) => mapId >= 600_000,
    );
    expect(changed).toBe(true);
    const { runs } = store.data({ skills: {}, npcs: {}, maps: {}, dungeons: {} });
    const world = runs.find((r) => r.encounters.some((e) => e.id === 'w1'));
    const dungeon = runs.find((r) => r.encounters.some((e) => e.id === 'd1'));
    expect(world?.dungeonId).toBeNull();
    expect(dungeon?.dungeonId).toBe(600_033);
    expect(store.normalize((code) => code >= 2_100_000 && code < 2_200_000, (mapId) => mapId >= 600_000)).toBe(false); // idempotent
  });

  it('keeps PvP fights apart from boss runs and can delete them', () => {
    const store = new HistoryStore('unused', false);
    store.add({ ...boss('p', T, 20_000, [row('Ana', 100_000, 'mine'), row('Foe', 90_000, 'theirs')]), kind: 'pvp', theirsTotal: 90_000, npcCode: null, npcMaxHp: null });
    const data = store.data({ skills: {}, npcs: {}, maps: {}, dungeons: {} });
    expect(data.runs).toHaveLength(0);
    expect(data.pvp[0]).toMatchObject({ id: 'p', theirsTotal: 90_000, opponents: ['Foe'] });
    store.deleteEncounter('p');
    expect(store.data({ skills: {}, npcs: {}, maps: {}, dungeons: {} }).pvp).toHaveLength(0);
  });
});
