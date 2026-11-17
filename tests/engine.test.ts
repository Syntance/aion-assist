import { describe, expect, it } from 'vitest';
import { DemoSource } from '@core/demo';
import { PacketDecoder } from '@core/protocol/decoders';
import { DEFAULT_OPCODES } from '@core/protocol/opcodes';
import { W } from './helpers';
import { dayKey, Engine, type EngineStore } from '@core/engine/engine';
import type { GameEvent } from '@core/protocol/events';
import { classFromCode, factionFromServer, type EncounterRecord } from '@shared/types';

const SELF = 1001;
const ALLY = 1002;
const ENEMY = 2001;
const MOB = 50_001;
const T0 = new Date(2026, 10, 12, 20, 0, 0).getTime();

function setup(lookups: string[] = []) {
  const store: EngineStore = { rivals: {}, daily: {} };
  const engine = new Engine({
    store,
    fightIdleMs: () => 8000,
    requestLookup: (name) => {
      lookups.push(name);
      return true;
    },
  });
  const intro: GameEvent[] = [
    { t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 },
    { t: 'player', id: ALLY, name: 'Ken', classCode: 25, server: 1301, legion: null },
    { t: 'player', id: ENEMY, name: 'Milenium', classCode: 5, server: 2301, legion: null },
    { t: 'party', title: null, leaderId: null, members: [{ name: 'Ken', server: 1301, characterId: 1, classCode: 25, level: 45, gearScore: 3118, combatPower: 214_500, ready: false, slot: 1 }] },
  ];
  for (const ev of intro) engine.apply(ev, T0);
  return { engine, store };
}

const hit = (actor: number, target: number, amount: number, crit = false): GameEvent => ({
  t: 'damage',
  actor,
  target,
  skill: 1,
  amount,
  crit,
  back: false,
  dot: false,
});

describe('class and faction mapping', () => {
  it('maps class codes and server ids', () => {
    expect(classFromCode(5)).toBe('gladiator');
    expect(classFromCode(17)).toBe('assassin');
    expect(classFromCode(36)).toBe('chanter');
    expect(classFromCode(99)).toBeNull();
    expect(factionFromServer(1301)).toBe('elyos');
    expect(factionFromServer(2301)).toBe('asmodian');
    expect(factionFromServer(null)).toBeNull();
  });
});

describe('DPS meter', () => {
  it('ranks party damage with DPS, share and roster gear data', () => {
    const { engine } = setup();
    engine.apply(hit(SELF, MOB, 1000), T0);
    engine.apply(hit(ALLY, MOB, 3000, true), T0 + 1000);
    engine.apply(hit(SELF, MOB, 2000), T0 + 4000);
    const snap = engine.meterSnapshot(T0 + 4000);
    expect(snap.active).toBe(true);
    expect(snap.total).toBe(6000);
    expect(snap.rows.map((r) => r.card.name)).toEqual(['SilentDeath', 'Ken']);
    expect(snap.rows[0]).toMatchObject({ isSelf: true, damage: 3000, dps: 750, share: 0.5 });
    expect(snap.rows[1].card).toMatchObject({ gearScore: 3118, combatPower: 214_500, className: 'sorcerer' });
    expect(snap.rows[1].critRate).toBe(1);
  });

  it('never guesses the local character from a teleport (47 36 can carry another player)', () => {
    const store: EngineStore = { rivals: {}, daily: {} };
    const engine = new Engine({ store, fightIdleMs: () => 8000 });
    const decoder = new PacketDecoder(DEFAULT_OPCODES);
    // Abyss Logs debug capture 2026-11-12 18:14:24: 47 36 with id 11077 while the local char was 1560
    const placed = decoder.decode(new W().hex('47 36 c5 56 02 00').done());
    const load = decoder.decode(new W().hex('21 36 09 00 00 00 f2 03 00 00 81 44 da 00').done());
    expect(load).toEqual({ t: 'mapLoad', mapId: 1010 });
    if (placed) engine.apply(placed, T0);
    if (load) engine.apply(load, T0);
    engine.apply(hit(11_077, MOB, 900), T0 + 500);
    expect(engine.meterSnapshot(T0 + 500).rows).toEqual([]);
  });

  it('does not count anyone before the local player is known', () => {
    const store: EngineStore = { rivals: {}, daily: {} };
    const engine = new Engine({ store, fightIdleMs: () => 8000 });
    engine.apply({ t: 'player', id: 444, name: 'Stranger', classCode: 34, server: null, legion: null }, T0);
    engine.apply(hit(444, MOB, 5000), T0);
    expect(engine.meterSnapshot(T0).rows).toEqual([]);
    engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0 + 1000);
    engine.apply(hit(444, MOB, 5000), T0 + 1100); // still not on our side
    engine.apply(hit(SELF, MOB, 700), T0 + 1200);
    expect(engine.meterSnapshot(T0 + 1200).rows.map((r) => r.card.name)).toEqual(['SilentDeath']);
  });

  it('ignores strangers and mobs, and starts a new fight after the idle gap', () => {
    const { engine } = setup();
    engine.apply({ t: 'player', id: 3000, name: 'Stranger', classCode: 9, server: 1301, legion: null }, T0);
    engine.apply(hit(3000, MOB, 9999), T0);
    engine.apply(hit(MOB, SELF, 500), T0);
    expect(engine.meterSnapshot(T0).rows).toEqual([]);

    engine.apply(hit(SELF, MOB, 100), T0);
    expect(engine.meterSnapshot(T0 + 9000).active).toBe(false);
    engine.apply(hit(SELF, MOB, 40), T0 + 20_000);
    expect(engine.meterSnapshot(T0 + 20_000).total).toBe(40);
  });
});

describe('PvP tracking', () => {
  it('records damage both ways, the target and a lookup request', () => {
    const lookups: string[] = [];
    const { engine, store } = setup(lookups);
    engine.apply(hit(SELF, ENEMY, 1200), T0);
    engine.apply(hit(ENEMY, SELF, 3000), T0 + 500);
    const pvp = engine.pvpSnapshot(T0 + 500);
    expect(pvp.mineTotal).toBe(1200);
    expect(pvp.theirsTotal).toBe(3000);
    expect(pvp.theirs[0].card).toMatchObject({ name: 'Milenium', faction: 'asmodian', className: 'gladiator' });
    expect(store.rivals.Milenium).toMatchObject({ dealt: 1200, taken: 3000, encounters: 1 });
    expect(engine.targetSnapshot()).toMatchObject({ card: { name: 'Milenium' }, source: 'attacked' });
    expect(lookups).toEqual(['SilentDeath', 'Milenium']);
    // PvP damage never leaks into the PvE meter
    expect(engine.meterSnapshot(T0 + 500).rows).toEqual([]);
  });

  const kill = (target: number, killerId: number, killerName: string, killerServer: number): GameEvent => ({
    t: 'kill',
    target,
    killerId,
    killerName,
    killerServer,
    skill: 13_010_240,
  });

  it('counts a kill from the kill record when the local player is the killer', () => {
    const { engine, store } = setup();
    engine.apply(hit(SELF, ENEMY, 1200), T0);
    engine.apply(kill(ENEMY, SELF, 'SilentDeath', 1318), T0 + 1000);
    expect(engine.pvpSnapshot(T0 + 1000)).toMatchObject({ kills: 1, deaths: 0, assists: 0 });
    expect(store.rivals.Milenium.wins).toBe(1);
    expect(engine.dailySnapshot(T0 + 1000).kills).toBe(1);
  });

  it('does not count a mob kill (victim is not a known player)', () => {
    const { engine } = setup();
    engine.apply(kill(MOB, SELF, 'SilentDeath', 1318), T0);
    expect(engine.pvpSnapshot(T0)).toMatchObject({ kills: 0, deaths: 0, assists: 0 });
  });

  it('counts an assist when I hit the victim and an ally got the kill', () => {
    const { engine, store } = setup();
    engine.apply(hit(SELF, ENEMY, 1200), T0);
    engine.apply(kill(ENEMY, ALLY, 'Ken', 1301), T0 + 1000);
    expect(engine.pvpSnapshot(T0 + 1000)).toMatchObject({ kills: 0, assists: 1 });
    expect(store.rivals.Milenium?.wins ?? 0).toBe(0);
  });

  it('counts a death and a loss against the player who killed me (live record: Bebeow, server 1315)', () => {
    const decoder = new PacketDecoder(DEFAULT_OPCODES);
    const { engine, store } = setup();
    const ev = decoder.decode(
      new W().hex('04 8d 9b cf 01 74 68 e6 00 fa 4f 23 05 06 42 65 62 65 6f 77 03 42 53 46 01 00 00 00 00 00 00 01 01').done(),
    );
    expect(ev).toMatchObject({ t: 'kill', killerName: 'Bebeow', killerServer: 1315 });
    // my id in this fixture is SELF: rewrite the target to it
    if (ev && ev.t === 'kill') engine.apply({ ...ev, target: SELF }, T0);
    expect(engine.pvpSnapshot(T0)).toMatchObject({ deaths: 1, kills: 0 });
    expect(store.rivals.Bebeow.losses).toBe(1);
    expect(engine.dailySnapshot(T0).deaths).toBe(1);
  });

  it('ignores combat deaths without a kill record and the despawn variant', () => {
    const { engine } = setup();
    engine.apply(hit(SELF, ENEMY, 1200), T0);
    engine.apply({ t: 'death', id: ENEMY, flag: 3 }, T0 + 1000);
    engine.apply({ t: 'death', id: SELF, flag: 3 }, T0 + 1100);
    expect(engine.pvpSnapshot(T0 + 1100)).toMatchObject({ kills: 0, deaths: 0, assists: 0 });
    const decoder = new PacketDecoder(DEFAULT_OPCODES);
    // despawn record: killer 0, all zeros
    expect(decoder.decode(new W().hex('04 8d 9b cf 01').zeros(18).done())).toBeNull();
  });

  it('forgets entity ids on zone change', () => {
    const { engine } = setup();
    engine.apply({ t: 'zone' }, T0);
    engine.apply(hit(SELF, ENEMY, 1200), T0 + 100);
    // ENEMY's id is unknown now, so this is treated as PvE damage, not PvP
    expect(engine.pvpSnapshot(T0 + 100).mineTotal).toBe(0);
  });
});

describe('live capture end to end', () => {
  it('turns real dummy hits (decoded from raw bytes) into a DPS row for the local player', () => {
    const decoder = new PacketDecoder(DEFAULT_OPCODES);
    const store: EngineStore = { rivals: {}, daily: {} };
    const engine = new Engine({ store, fightIdleMs: () => 8000 });
    const self = decoder.decode(
      new W().hex('33 36 a5 5c 5f 81 eb 2a 37 0b 53 69 6c 65 6e 74 44 65 61 74 68 26 05 12 00 00 00 01 2d 00 00 00 f3 0a 00 00 f5 0a 00 00 2d 00 00 00').done(),
    );
    expect(self).toMatchObject({ t: 'self', id: 11_813, name: 'SilentDeath' });
    if (self) engine.apply(self, T0);
    const packets = [
      '04 38 90 9f 01 04 00 a5 5c c8 59 d1 00 52 02 c7 11 c7 51 01 00 00 00 90 4e c0 05 01 00',
      '04 38 90 9f 01 04 04 a5 5c 40 85 c6 00 4e 02 0b 0d 8c 4d 01 00 00 00 c9 64 c6 0e 01 00 c8 01',
      '04 38 90 9f 01 26 04 a5 5c 40 85 c6 00 4e 03 04 00 00 25 b7 8b 4d 02 00 00 00 c9 64 f4 23 04 66 66 66 66 02 00 db 01',
    ];
    packets.forEach((p, i) => {
      const ev = decoder.decode(new W().hex(p).done());
      expect(ev).not.toBeNull();
      if (ev) engine.apply(ev, T0 + 1000 * (i + 1));
    });
    const snap = engine.meterSnapshot(T0 + 3500);
    expect(snap.rows).toHaveLength(1);
    expect(snap.rows[0]).toMatchObject({ isSelf: true, damage: 704 + 1862 + 4596 });
  });
});

describe('lobby', () => {
  const member = (name: string, characterId: number, slot: number, ready: boolean) => ({
    name,
    server: 1318,
    characterId,
    classCode: 17,
    level: 45,
    gearScore: 2700,
    combatPower: 150_000,
    ready,
    slot,
  });

  it('lists members in slot order with leader, ready flags and counts; clears when the party is left', () => {
    const { engine } = setup();
    engine.apply(
      { t: 'party', title: 'Leaving now.', leaderId: 7001, members: [member('Almaren', 7003, 3, true), member('SilentDeath', 7001, 1, false), member('Artemide', 7004, 4, false)] },
      T0,
    );
    const lobby = engine.lobbySnapshot();
    expect(lobby?.title).toBe('Leaving now.');
    expect(lobby?.members.map((m) => [m.card.name, m.leader, m.ready, m.isSelf])).toEqual([
      ['SilentDeath', true, false, true],
      ['Almaren', false, true, false],
      ['Artemide', false, false, false],
    ]);
    // the leader counts as ready: 1 leader + 1 ready of 3
    expect(lobby?.readyCount).toBe(2);
    expect(lobby?.members[1].card).toMatchObject({ gearScore: 2700, combatPower: 150_000 });
    engine.apply({ t: 'partyLeft' }, T0 + 1000);
    expect(engine.lobbySnapshot()).toBeNull();
  });
});

describe('restart in the middle of a run', () => {
  const mate = (name: string, characterId: number, slot: number) => ({
    name, server: 1318, characterId, classCode: 25, level: 45, gearScore: 3000, combatPower: 200_000, ready: true, slot,
  });

  it('a new engine restored from the saved context counts the whole party again', () => {
    const first = setup().engine;
    first.apply({ t: 'player', id: ALLY, name: 'Ken', classCode: 25, server: 1301, legion: null }, T0);
    first.apply({ t: 'party', title: null, leaderId: null, members: [mate('SilentDeath', 7001, 1), mate('Ken', 7002, 2)] }, T0);
    const saved = JSON.parse(JSON.stringify(first.exportContext())); // what context.json round-trips

    // a fresh app: it only knows who it is (identity.json), nothing else
    const second = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000 });
    second.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0 + 1000);
    second.apply(hit(ALLY, MOB, 900), T0 + 1100);
    expect(second.meterSnapshot(T0 + 1100).rows).toEqual([]); // without the context Ken is a stranger

    const third = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000 });
    third.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0 + 1000);
    third.restoreContext(saved, T0 + 1000);
    third.apply(hit(SELF, MOB, 700), T0 + 1100);
    third.apply(hit(ALLY, MOB, 900), T0 + 1200);
    expect(third.meterSnapshot(T0 + 1300).rows.map((r) => [r.card.name, r.damage])).toEqual([['Ken', 900], ['SilentDeath', 700]]);
  });

  it('a zone change drops the saved player records from the exported context', () => {
    const e = setup().engine;
    e.apply({ t: 'player', id: ALLY, name: 'Ken', classCode: 25, server: 1301, legion: null }, T0);
    expect(e.exportContext().players.map((p) => p.name)).toContain('Ken');
    e.apply({ t: 'zone' }, T0 + 100);
    expect(e.exportContext().players).toEqual([]);
  });
});

describe('skills, run deaths and the encounter archive', () => {
  const dmg = (actor: number, target: number, amount: number, skill: number, extra: Record<string, boolean> = {}): GameEvent => ({
    t: 'damage',
    actor,
    target,
    skill,
    amount,
    crit: false,
    back: false,
    dot: false,
    ...extra,
  });

  it('groups hits by base skill with casts, crit rate, max, average and hit angles', () => {
    const { engine } = setup();
    engine.apply(dmg(SELF, MOB, 100, 13_010_240, { crit: true, back: true }), T0);
    engine.apply(dmg(SELF, MOB, 200, 13_010_000, { parry: true }), T0 + 500);
    engine.apply(dmg(SELF, MOB, 50, 13_350_020), T0 + 900);
    engine.apply({ t: 'cast', actor: SELF, skill: 13_010_240 }, T0 + 1000);
    engine.apply({ t: 'cast', actor: SELF, skill: 13_010_000 }, T0 + 1100);
    const d = engine.liveDetail('SilentDeath', T0 + 2000);
    expect(d).toMatchObject({ total: 350, hits: 3, casts: 2 });
    expect(d?.crit).toBeCloseTo(1 / 3);
    expect(d?.back).toBeCloseTo(1 / 3);
    expect(d?.parry).toBeCloseTo(1 / 3);
    const quick = d?.skills.find((s) => s.skill === 13_010_000);
    expect(quick).toMatchObject({ damage: 300, hits: 2, casts: 2, max: 200, avg: 150 });
    expect(quick?.pct).toBeCloseTo(300 / 350);
    expect(quick?.critPct).toBeCloseTo(0.5);
  });

  it('counts deaths of me and my party since the last loading screen, ignoring arrival records and repeats', () => {
    const { engine } = setup();
    engine.apply({ t: 'zone' }, T0);
    // the game announces the zone's players after the zone event
    engine.apply({ t: 'player', id: ALLY, name: 'Ken', classCode: 25, server: 1301, legion: null }, T0 + 500);
    engine.apply({ t: 'death', id: ALLY, flag: 1 }, T0 + 1000); // dead-on-arrival record
    engine.apply({ t: 'death', id: ALLY, flag: 3 }, T0 + 5000);
    engine.apply({ t: 'death', id: ALLY, flag: 3 }, T0 + 6000); // repeat
    engine.apply({ t: 'death', id: SELF, flag: 3 }, T0 + 9000);
    engine.apply({ t: 'death', id: MOB, flag: 3 }, T0 + 9500); // a mob
    expect(engine.meterSnapshot(T0 + 10_000).deaths).toBe(2);
    engine.apply({ t: 'mapLoad', mapId: 1010 }, T0 + 20_000); // a new run
    expect(engine.meterSnapshot(T0 + 20_001).deaths).toBe(0);
  });

  it('archives a finished fight once, with its boss, map and per-player rows; skips tiny fights', () => {
    const saved: EncounterRecord[] = [];
    const store: EngineStore = { rivals: {}, daily: {} };
    const engine = new Engine({ store, fightIdleMs: () => 8000, onEncounter: (r) => saved.push(r) });
    engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
    engine.apply({ t: 'mapLoad', mapId: 1010 }, T0);
    engine.apply({ t: 'npc', id: MOB, code: 2_400_032 }, T0);
    engine.apply({ t: 'hp', id: MOB, cur: 900, max: 4_000_000 }, T0);
    engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
    engine.apply(dmg(SELF, MOB, 7000, 13_010_240), T0 + 6000);
    engine.pollHistory(T0 + 7000); // still fighting
    expect(saved).toEqual([]);
    engine.pollHistory(T0 + 20_000); // the boss is alive: the fight is held open through the pause
    expect(saved).toEqual([]);
    engine.pollHistory(T0 + 1_000_000); // beyond the safety limit
    engine.pollHistory(T0 + 1_001_000); // not archived twice
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ total: 12_000, npcCode: 2_400_032, npcMaxHp: 4_000_000, mapId: 1010, durationMs: 5000 });
    expect(saved[0].rows[0]).toMatchObject({ name: 'SilentDeath', isSelf: true, damage: 12_000 });
    engine.apply(dmg(SELF, MOB, 100, 13_010_240), T0 + 1_100_000); // a 0 s, 100 damage fight
    engine.pollHistory(T0 + 1_300_000);
    expect(saved).toHaveLength(1);
  });

  describe('boss fights with long pauses', () => {
    const setup = () => {
      const engine = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000 });
      engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
      engine.apply({ t: 'npc', id: MOB, code: 2_400_032 }, T0);
      engine.apply({ t: 'hp', id: MOB, cur: 9_000_000, max: 10_000_000 }, T0);
      engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
      return engine;
    };

    it('keeps counting through a pause of tens of seconds while the boss is alive', () => {
      const engine = setup();
      expect(engine.meterSnapshot(T0 + 60_000).active).toBe(true); // 59 s of silence, boss alive
      engine.apply(dmg(SELF, MOB, 7000, 13_010_240), T0 + 60_000);
      const snap = engine.meterSnapshot(T0 + 61_000);
      expect(snap.total).toBe(12_000); // one fight, not two
      expect(snap.rows).toHaveLength(1);
    });

    it('HP frames that carry only the current value still mark a big boss (the highest seen stands in for the max)', () => {
      const engine = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000 });
      engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
      engine.apply({ t: 'hp', id: MOB, cur: 8_000_000, max: null }, T0);
      engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
      engine.apply({ t: 'hp', id: MOB, cur: 2_800_000, max: null }, T0 + 2000);
      expect(engine.meterSnapshot(T0 + 40_000).active).toBe(true); // a 38 s mechanic at 35% HP
      engine.apply(dmg(SELF, MOB, 7000, 13_010_240), T0 + 40_000);
      expect(engine.meterSnapshot(T0 + 41_000).total).toBe(12_000);
    });

    it('the boss returning to full HP (a wipe / reset) ends the attempt; the next hit starts a new fight', () => {
      const engine = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000 });
      engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
      engine.apply({ t: 'hp', id: MOB, cur: 10_000_000, max: null }, T0);
      engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
      engine.apply({ t: 'hp', id: MOB, cur: 3_000_000, max: null }, T0 + 2000);
      engine.apply({ t: 'hp', id: MOB, cur: 10_000_000, max: null }, T0 + 20_000); // reset
      expect(engine.meterSnapshot(T0 + 21_000).active).toBe(false);
      engine.apply(dmg(SELF, MOB, 300, 13_010_240), T0 + 30_000);
      expect(engine.meterSnapshot(T0 + 31_000).total).toBe(300);
    });

    it('a small heal does not end the attempt', () => {
      const engine = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000 });
      engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
      engine.apply({ t: 'hp', id: MOB, cur: 10_000_000, max: null }, T0);
      engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
      engine.apply({ t: 'hp', id: MOB, cur: 6_000_000, max: null }, T0 + 2000);
      engine.apply({ t: 'hp', id: MOB, cur: 7_500_000, max: null }, T0 + 20_000); // heals 15%
      engine.apply(dmg(SELF, MOB, 300, 13_010_240), T0 + 30_000);
      expect(engine.meterSnapshot(T0 + 31_000).total).toBe(5300);
    });

    describe('world bosses and dungeons', () => {
      const run = (code: number, mapId: number, known: boolean | null, rosterDungeon: number | null) => {
        const saved: EncounterRecord[] = [];
        const engine = new Engine({
          store: { rivals: {}, daily: {} },
          fightIdleMs: () => 8000,
          knownDungeon: () => known,
          npcBoss: () => true,
          onEncounter: (r) => saved.push(r),
        });
        engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
        if (rosterDungeon !== null) {
          engine.apply({ t: 'party', members: [], title: 'x', leaderId: SELF, dungeonId: rosterDungeon }, T0);
        }
        engine.apply({ t: 'mapLoad', mapId }, T0);
        engine.apply({ t: 'npc', id: MOB, code }, T0);
        engine.apply({ t: 'hp', id: MOB, cur: 5_000_000, max: null }, T0);
        engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
        engine.apply(dmg(SELF, MOB, 7000, 13_010_240), T0 + 6000);
        engine.apply({ t: 'death', id: MOB, flag: 3 }, T0 + 6500);
        engine.pollHistory(T0 + 30_000);
        return saved[0];
      };

      it('a world boss is not filed under the dungeon left over from the last party roster', () => {
        expect(run(2_100_661, 500_043, false, 600_033)?.dungeonId).toBeNull();
      });

      it('a dungeon boss on a dungeon map belongs to that dungeon', () => {
        expect(run(2_340_709, 600_033, true, null)?.dungeonId).toBe(600_033);
      });

      it('without a catalog the roster dungeon is still used', () => {
        expect(run(2_340_709, 600_033, null, 600_033)?.dungeonId).toBe(600_033);
      });
    });

    describe('with an NPC catalog', () => {
      const BOSS = 2_300_910;
      const make = (flag: boolean | null) => {
        const saved: EncounterRecord[] = [];
        const engine = new Engine({
          store: { rivals: {}, daily: {} },
          fightIdleMs: () => 8000,
          bossOnly: () => true,
          npcBoss: (code) => (code === BOSS || code === 2_400_032 ? flag : null),
          npcName: (code) => (code === BOSS ? 'Ferocious Horn Nuakum' : null),
          onEncounter: (r) => saved.push(r),
        });
        engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
        return { engine, saved };
      };

      it('the boss bar carries the catalog name and the HP read from frames without a max', () => {
        const { engine } = make(true);
        engine.apply({ t: 'npc', id: MOB, code: BOSS }, T0);
        engine.apply({ t: 'hp', id: MOB, cur: 8_000_000, max: null }, T0);
        engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
        const focus = engine.meterSnapshot(T0 + 2000).focus;
        expect(focus).toMatchObject({ code: BOSS, name: 'Ferocious Horn Nuakum', hpCur: 8_000_000 });
      });

      it('a catalog boss with a small HP pool is still held and saved', () => {
        const { engine, saved } = make(true);
        engine.apply({ t: 'npc', id: MOB, code: BOSS }, T0);
        engine.apply({ t: 'hp', id: MOB, cur: 40_000, max: null }, T0);
        engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
        engine.apply(dmg(SELF, MOB, 7000, 13_010_240), T0 + 5000);
        expect(engine.meterSnapshot(T0 + 60_000).active).toBe(true);
        engine.pollHistory(T0 + 2_000_000);
        expect(saved).toHaveLength(1);
      });

      it('an NPC the catalog calls a non-boss is not held or saved even with a big HP pool', () => {
        const { engine, saved } = make(false);
        engine.apply({ t: 'npc', id: MOB, code: 2_400_032 }, T0);
        engine.apply({ t: 'hp', id: MOB, cur: 9_000_000, max: null }, T0);
        engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
        engine.apply(dmg(SELF, MOB, 7000, 13_010_240), T0 + 5000);
        expect(engine.meterSnapshot(T0 + 60_000).active).toBe(false);
        engine.pollHistory(T0 + 60_000);
        expect(saved).toEqual([]);
      });
    });

    it('a mechanic of several minutes does not split the fight', () => {
      const engine = setup();
      expect(engine.meterSnapshot(T0 + 400_000).active).toBe(true); // 6+ minutes of silence, boss alive
      engine.apply(dmg(SELF, MOB, 7000, 13_010_240), T0 + 400_000);
      expect(engine.meterSnapshot(T0 + 401_000).total).toBe(12_000);
    });

    it('closes the fight at the safety limit, and at once after the normal idle time once the boss is dead', () => {
      const engine = setup();
      expect(engine.meterSnapshot(T0 + 1_000_000).active).toBe(false); // beyond the safety limit
      const dead = setup();
      dead.apply({ t: 'death', id: MOB, flag: 3 }, T0 + 2000);
      expect(dead.meterSnapshot(T0 + 20_000).active).toBe(false);
    });

    it('hitting a different mob after the normal idle time starts a new fight', () => {
      const engine = setup();
      engine.apply(dmg(SELF, MOB + 1, 300, 13_010_240), T0 + 30_000);
      const snap = engine.meterSnapshot(T0 + 31_000);
      expect(snap.total).toBe(300);
    });

    it('a low-HP mob still closes after the normal idle time', () => {
      const engine = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000 });
      engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
      engine.apply({ t: 'hp', id: MOB, cur: 900, max: 40_000 }, T0);
      engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
      expect(engine.meterSnapshot(T0 + 20_000).active).toBe(false);
    });
  });

  it('boss-only mode drops fights against low-HP mobs', () => {
    const saved: EncounterRecord[] = [];
    const engine = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000, bossOnly: () => true, onEncounter: (r) => saved.push(r) });
    engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
    engine.apply({ t: 'npc', id: MOB, code: 2_400_032 }, T0);
    engine.apply({ t: 'hp', id: MOB, cur: 900, max: 40_000 }, T0);
    engine.apply(dmg(SELF, MOB, 5000, 13_010_240), T0 + 1000);
    engine.apply(dmg(SELF, MOB, 7000, 13_010_240), T0 + 6000);
    engine.pollHistory(T0 + 30_000);
    expect(saved).toEqual([]);
  });

  it('archives a finished player fight as a PvP record with both sides', () => {
    const saved: EncounterRecord[] = [];
    const engine = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000, onEncounter: (r) => saved.push(r) });
    engine.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
    engine.apply({ t: 'player', id: ENEMY, name: 'Milenium', classCode: 5, server: 2301, legion: null }, T0);
    engine.apply(dmg(SELF, ENEMY, 4000, 13_010_240), T0 + 1000);
    engine.apply(dmg(ENEMY, SELF, 3000, 13_010_240), T0 + 3000);
    engine.apply(dmg(SELF, ENEMY, 4000, 13_010_240), T0 + 5000);
    engine.pollHistory(T0 + 6000); // still fighting
    expect(saved).toEqual([]);
    engine.pollHistory(T0 + 60_000);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ kind: 'pvp', total: 8000, theirsTotal: 3000 });
    expect(saved[0].rows.map((r) => [r.name, r.side])).toEqual([
      ['SilentDeath', 'mine'],
      ['Milenium', 'theirs'],
    ]);
  });
});

describe('lobby visibility', () => {
  const m = (name: string, characterId: number, slot: number, ready: boolean) => ({
    name, server: 1318, characterId, classCode: 17, level: 45, gearScore: 2700, combatPower: 150_000, ready, slot,
  });
  const roster = (...ready: boolean[]): GameEvent => ({
    t: 'party',
    title: 'Run',
    leaderId: 7001,
    members: [m('SilentDeath', 7001, 1, true), ...ready.map((r, i) => m(`Mate${i}`, 7100 + i, i + 2, r))],
  });

  it('hides after the loading screen, stays hidden on roster resends, returns when someone readies', () => {
    const { engine } = setup();
    engine.apply(roster(true, false), T0);
    expect(engine.lobbySnapshot()).not.toBeNull();
    engine.apply({ t: 'mapLoad', mapId: 1010 }, T0 + 1000);
    expect(engine.lobbySnapshot()).toBeNull();
    engine.apply(roster(true, false), T0 + 2000); // resent inside the dungeon: same ready flags
    expect(engine.lobbySnapshot()).toBeNull();
    engine.apply(roster(true, true), T0 + 3000); // a ready flag flipped: lobby again
    expect(engine.lobbySnapshot()).not.toBeNull();
  });

  it('hides when a fight starts, and a different party shows it again', () => {
    const { engine } = setup();
    engine.apply(roster(true, true), T0);
    engine.apply(hit(SELF, MOB, 100), T0 + 500);
    expect(engine.lobbySnapshot()).toBeNull();
    engine.apply({ t: 'party', title: 'Other', leaderId: 1, members: [m('Stranger', 9001, 1, false), m('Other', 9002, 2, false)] }, T0 + 5000);
    expect(engine.lobbySnapshot()?.title).toBe('Other');
  });
});

describe('focus target', () => {
  it('follows the NPC I hit, with HP, TTK from group DPS and stagger', () => {
    const { engine } = setup();
    engine.apply({ t: 'hp', id: MOB, cur: 1_000_000, max: 2_000_000 }, T0);
    engine.apply({ t: 'stagger', id: MOB, max: 100, rest: 40, broken: false }, T0);
    engine.apply(hit(SELF, MOB, 10_000), T0 + 1000);
    engine.apply(hit(ALLY, MOB, 10_000), T0 + 2000);
    const focus = engine.meterSnapshot(T0 + 3000).focus;
    // 20 000 damage over the 2 s since the first hit = 10K/s -> 1M HP takes 100 s
    expect(focus).toMatchObject({ id: MOB, hpCur: 1_000_000, hpMax: 2_000_000, hpPct: 0.5, stagger: { pct: 0.4, broken: false } });
    expect(focus?.ttkSec).toBeCloseTo(100, 0);
  });

  it('drops the focus after 12 s, on its death and on zone change; ignores other players hits', () => {
    const { engine } = setup();
    engine.apply({ t: 'hp', id: MOB, cur: 500, max: 1000 }, T0);
    engine.apply(hit(ALLY, MOB, 100), T0); // an ally's hit does not set MY focus
    expect(engine.meterSnapshot(T0).focus).toBeNull();
    engine.apply(hit(SELF, MOB, 100), T0 + 100);
    expect(engine.meterSnapshot(T0 + 200).focus).not.toBeNull();
    expect(engine.meterSnapshot(T0 + 13_000).focus).toBeNull();
    engine.apply(hit(SELF, MOB, 100), T0 + 14_000);
    engine.apply({ t: 'death', id: MOB, flag: 3 }, T0 + 14_100);
    expect(engine.meterSnapshot(T0 + 14_200).focus).toBeNull();
  });
});

describe('nearby players', () => {
  it('lists enemies first, flags the attacked one, and skips party members', () => {
    const lookups: string[] = [];
    const { engine } = setup(lookups);
    engine.apply({ t: 'player', id: 3001, name: 'FriendlyGuy', classCode: 9, server: 1301, legion: null }, T0);
    engine.apply({ t: 'player', id: 3002, name: 'Vexari', classCode: 13, server: 2304, legion: null }, T0);
    const rows = engine.nearbySnapshot(T0);
    // Ken is in the party, so he is not listed; enemies sort before friendlies
    expect(rows.map((r) => r.card.name)).toEqual(['Milenium', 'Vexari', 'FriendlyGuy']);
    expect(rows.map((r) => r.enemy)).toEqual([true, true, false]);

    engine.apply(hit(SELF, ENEMY, 500), T0 + 100);
    const after = engine.nearbySnapshot(T0 + 200);
    expect(after[0]).toMatchObject({ attacking: true, card: { name: 'Milenium' } });
    expect(engine.nearbySnapshot(T0 + 60_000)[0].attacking).toBe(false);
    // friendly players are never looked up
    expect(lookups).not.toContain('FriendlyGuy');
    expect(lookups).toContain('Vexari');
  });

  it('hides allies when the option is off, except the one being attacked', () => {
    const store: EngineStore = { rivals: {}, daily: {} };
    const engine = new Engine({ store, fightIdleMs: () => 8000, showAllies: () => false });
    const intro: GameEvent[] = [
      { t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 },
      { t: 'player', id: 3001, name: 'FriendlyGuy', classCode: 9, server: 1301, legion: null },
      { t: 'player', id: 3003, name: 'Stranger', classCode: 9, server: null, legion: null },
      { t: 'player', id: ENEMY, name: 'Milenium', classCode: 5, server: 2301, legion: null },
    ];
    for (const ev of intro) engine.apply(ev, T0);
    // only confirmed enemies: unknown-faction players are hidden too
    expect(engine.nearbySnapshot(T0).map((r) => r.card.name)).toEqual(['Milenium']);
    engine.apply(hit(SELF, 3001, 300), T0 + 50); // same-faction duel / flagged ally
    expect(engine.nearbySnapshot(T0 + 100).map((r) => r.card.name)).toContain('FriendlyGuy');
  });

  it('treats a same-faction player from another server as an enemy (mixed servers, Elyos vs Elyos)', () => {
    const { engine } = setup();
    engine.apply({ t: 'player', id: 4002, name: 'Quesare', classCode: 9, server: 1305, legion: null }, T0);
    const row = engine.nearbySnapshot(T0).find((r) => r.card.name === 'Quesare');
    expect(row).toMatchObject({ enemy: true, card: { faction: 'elyos' } });
  });

  it('treats an unknown-server player as an enemy once damage is exchanged, and looks unknowns up', () => {
    const lookups: string[] = [];
    const { engine } = setup(lookups);
    engine.apply({ t: 'player', id: 4001, name: 'Onuris', classCode: 13, server: null, legion: null }, T0);
    // unknown server: not an enemy yet, and a profile lookup is requested to learn it
    expect(engine.nearbySnapshot(T0).find((r) => r.card.name === 'Onuris')).toMatchObject({ enemy: null });
    expect(lookups).toContain('Onuris');
    engine.apply(hit(4001, SELF, 700), T0 + 100);
    const rows = engine.nearbySnapshot(T0 + 200);
    expect(rows.find((r) => r.card.name === 'Onuris')).toMatchObject({ enemy: true });
  });

  it("shows another player's GS from the official profile, never from the record's stat pair", () => {
    const { engine } = setup();
    engine.apply({ t: 'player', id: 5001, name: 'Aeryn', classCode: 13, server: 1315, legion: 'Nemesis', gearScore: 3783 }, T0);
    expect(engine.nearbySnapshot(T0).find((r) => r.card.name === 'Aeryn')?.card.gearScore).toBeNull();
    const profile = { combatPower: 187_184, itemLevel: 2873, abyssRank: null, abyssPoints: null, className: null, level: 45, legion: null };
    engine.applyLookup('Aeryn', profile, T0 + 100);
    expect(engine.nearbySnapshot(T0 + 100).find((r) => r.card.name === 'Aeryn')?.card).toMatchObject({ gearScore: 2873, combatPower: 187_184 });
  });

  it('keeps a foe listed for a minute after trading damage, even after they left view', () => {
    const { engine } = setup();
    engine.apply(hit(ENEMY, SELF, 500), T0);
    engine.apply({ t: 'death', id: ENEMY, flag: 7 }, T0 + 100); // left view
    expect(engine.nearbySnapshot(T0 + 30_000).map((r) => r.card.name)).toContain('Milenium');
    expect(engine.nearbySnapshot(T0 + 61_000).map((r) => r.card.name)).not.toContain('Milenium');
  });

  it('forgets players on zone change and when they leave view', () => {
    const { engine } = setup();
    engine.apply({ t: 'death', id: ENEMY, flag: 7 }, T0);
    expect(engine.nearbySnapshot(T0)).toEqual([]);
    engine.apply({ t: 'player', id: 3002, name: 'Vexari', classCode: 13, server: 2304, legion: null }, T0);
    engine.apply({ t: 'zone' }, T0);
    expect(engine.nearbySnapshot(T0)).toEqual([]);
  });
});

describe('daily counters', () => {
  it('tracks AP gained today, across a weekly reset', () => {
    const { engine } = setup();
    engine.apply({ t: 'abyssPoints', points: 132_456, limit: 2_500_000 }, T0);
    expect(engine.dailySnapshot(T0).apGained).toBe(0);
    engine.apply({ t: 'abyssPoints', points: 133_369, limit: 2_500_000 }, T0 + 1000);
    expect(engine.dailySnapshot(T0 + 1000)).toMatchObject({ date: dayKey(T0), apGained: 913, apWeek: { points: 133_369, limit: 2_500_000 } });
    engine.apply({ t: 'abyssPoints', points: 200, limit: 2_500_000 }, T0 + 2000); // weekly reset
    engine.apply({ t: 'abyssPoints', points: 500, limit: 2_500_000 }, T0 + 3000);
    expect(engine.dailySnapshot(T0 + 3000).apGained).toBe(913 + 300);
  });

  it('starts a fresh record the next day', () => {
    const { engine } = setup();
    engine.apply({ t: 'abyssPoints', points: 1000, limit: 2_500_000 }, T0);
    engine.apply({ t: 'abyssPoints', points: 1500, limit: 2_500_000 }, T0 + 1000);
    const tomorrow = T0 + 24 * 3_600_000;
    engine.apply({ t: 'abyssPoints', points: 1700, limit: 2_500_000 }, tomorrow);
    expect(engine.dailySnapshot(tomorrow).apGained).toBe(0);
  });

  it('tracks ranking points from own profile lookups', () => {
    const { engine } = setup();
    const base = { combatPower: 146_200, itemLevel: 2748, abyssRank: 412, className: null, level: 45, legion: null };
    engine.applyLookup('SilentDeath', { ...base, abyssPoints: 18_000 }, T0);
    engine.applyLookup('SilentDeath', { ...base, abyssRank: 400, abyssPoints: 18_240 }, T0 + 600_000);
    expect(engine.dailySnapshot(T0 + 600_000)).toMatchObject({ rankPointsGained: 240, rankPoints: 18_240, abyssRank: 400 });
  });
});

describe('demo source', () => {
  it('drives every panel', () => {
    const { engine } = setup();
    const demo = new DemoSource();
    let now = T0;
    for (let i = 0; i < 450; i++) {
      for (const ev of demo.step()) engine.apply(ev, now);
      now += 200;
    }
    expect(engine.meterSnapshot(now).rows.length).toBe(5);
    const pvp = engine.pvpSnapshot(now);
    expect(pvp.kills + pvp.deaths).toBeGreaterThan(0);
    expect(engine.targetSnapshot()).not.toBeNull();
    expect(engine.dailySnapshot(now).apGained).toBeGreaterThan(0);
  });
});


describe('context restore', () => {
  it('keeps the NPC codes of entities in view across a restart', () => {
    const a = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000, npcName: (c) => (c === 2_400_035 ? 'Melee Training Scarecrow' : null) });
    a.apply({ t: 'npc', id: 777, code: 2_400_035 }, 1000);
    const ctx = a.exportContext();
    expect(ctx.npcs).toEqual([{ id: 777, code: 2_400_035 }]);
    const b = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000, npcName: (c) => (c === 2_400_035 ? 'Melee Training Scarecrow' : null) });
    b.restoreContext(ctx, 2000);
    b.apply({ t: 'self', id: 1, name: 'Me', server: 1318, classCode: 18, level: 45 }, 2001);
    b.apply({ t: 'damage', actor: 1, target: 777, skill: 13_010_240, amount: 500, crit: false, back: false, dot: false }, 2100);
    expect(b.meterSnapshot(2200).focus).toMatchObject({ id: 777, code: 2_400_035, name: 'Melee Training Scarecrow' });
  });
});
