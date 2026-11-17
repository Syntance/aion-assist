import { describe, expect, it } from 'vitest';
import { dayKey } from '../src/shared/day';
import { Engine, type EngineStore } from '../src/core/engine/engine';
import { HistoryStore } from '../src/main/history';
import type { EncounterRecord } from '../src/shared/types';

const T0 = 1_800_000_000_000;
const SELF = 1001;
const ENEMY = 2001;
const DAY = 86_400_000;

const engineOn = (store: EngineStore): Engine => {
  const e = new Engine({ store, fightIdleMs: () => 8000 });
  e.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
  e.apply({ t: 'player', id: ENEMY, name: 'Milenium', classCode: 5, server: 2301, legion: null }, T0);
  return e;
};
const kill = (e: Engine, at: number): void =>
  e.apply({ t: 'kill', target: ENEMY, killerId: SELF, killerName: 'SilentDeath', killerServer: 1301, skill: 1 }, at);

describe('K/D/A per day', () => {
  it('is kept across a restart (it lives in the saved daily statistics)', () => {
    const store: EngineStore = { rivals: {}, daily: {} };
    const first = engineOn(store);
    kill(first, T0 + 1000);
    kill(first, T0 + 2000);
    expect(first.pvpSnapshot(T0 + 3000)).toMatchObject({ kills: 2, deaths: 0, assists: 0 });
    // "restart": a new engine on the same stored data
    const second = engineOn(store);
    expect(second.pvpSnapshot(T0 + 60_000)).toMatchObject({ kills: 2 });
  });

  it('starts over on the next day and keeps the earlier days', () => {
    const store: EngineStore = { rivals: {}, daily: {} };
    const e = engineOn(store);
    kill(e, T0 + 1000);
    expect(e.pvpSnapshot(T0 + DAY + 5000).kills).toBe(0); // the next day
    kill(e, T0 + DAY + 6000);
    expect(e.pvpSnapshot(T0 + DAY + 7000).kills).toBe(1);
    expect(store.daily[dayKey(T0)]?.kills).toBe(1);
    expect(store.daily[dayKey(T0 + DAY)]?.kills).toBe(1);
  });

  it('the reset button clears the current fight but not the day\'s K/D/A', () => {
    const store: EngineStore = { rivals: {}, daily: {} };
    const e = engineOn(store);
    kill(e, T0 + 1000);
    e.resetPvp();
    expect(e.pvpSnapshot(T0 + 2000).kills).toBe(1);
  });
});

describe('PvP history by day', () => {
  const fight = (id: string, startedAt: number): EncounterRecord => ({
    id, kind: 'pvp', startedAt, durationMs: 30_000, total: 1000, theirsTotal: 900, npcCode: null, npcMaxHp: null, mapId: null, dungeonId: null,
    rows: [{ name: 'Ana', side: 'mine', className: null, level: 45, gearScore: null, combatPower: null, isSelf: true, damage: 1000, hits: 1, crits: 0, casts: 1, back: 0, front: 0, parry: 0, perfect: 0, double: 0, deaths: 0, skills: [] }],
  });

  it('deletes all PvP fights of one day and nothing else', () => {
    const store = new HistoryStore('unused', false);
    store.add(fight('a', T0));
    store.add(fight('b', T0 + 60_000));
    store.add(fight('c', T0 + DAY));
    store.deletePvpDay(dayKey(T0));
    const ids = store.data({ skills: {}, npcs: {}, maps: {}, dungeons: {} }).pvp.map((f) => f.id);
    expect(ids).toEqual(['c']);
  });

  it('data() carries the per-day statistics it is given', () => {
    const store = new HistoryStore('unused', false);
    const data = store.data({ skills: {}, npcs: {}, maps: {}, dungeons: {} }, { '2026-11-16': { kills: 3, deaths: 1, assists: 2, ap: 500 } });
    expect(data.daily['2026-11-16']).toEqual({ kills: 3, deaths: 1, assists: 2, ap: 500 });
  });
});
