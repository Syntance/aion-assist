import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine/engine';
import { PacketDecoder } from '../src/core/protocol/decoders';
import { DEFAULT_OPCODES } from '../src/core/protocol/opcodes';

const T0 = 1_800_000_000_000;
const SELF = 5896;
const ALLY = 9947;
const BOSS = 38496;

const fromHex = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);

describe('kill record of a monster killing a player', () => {
  // live 2026-11-14 (Abyss Logs logged it as "entity 15991 killed by npc Ferocious Horn Nuakum, skill 1802141")
  const record = fromHex('048DF77C9D7F1B00E0AC02000000000000EEB78C01000000000102');

  it('decodes the target, the skill and the monster that killed', () => {
    const ev = new PacketDecoder(DEFAULT_OPCODES).decode(record);
    expect(ev).toEqual({ t: 'mobKill', target: 15991, killerId: BOSS, skill: 1_802_141 });
  });
});

describe('deaths in a dungeon run', () => {
  const engine = () => {
    const e = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000 });
    e.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
    e.apply({ t: 'player', id: ALLY, name: 'Ken', classCode: 25, server: 1301, legion: null }, T0);
    e.apply(
      {
        t: 'party',
        title: 'Run',
        leaderId: SELF,
        dungeonId: 600092,
        members: [
          { name: 'SilentDeath', server: 1301, characterId: 1, classCode: 17, level: 45, gearScore: 2800, combatPower: 150_000, ready: true, slot: 0 },
          { name: 'Ken', server: 1301, characterId: 2, classCode: 25, level: 45, gearScore: 2700, combatPower: 140_000, ready: true, slot: 1 },
        ],
      },
      T0,
    );
    e.apply({ t: 'mapLoad', mapId: 600_092 }, T0);
    return e;
  };
  const die = (e: Engine, id: number, at: number) => e.apply({ t: 'mobKill', target: id, killerId: BOSS, skill: 1_802_141 }, at);

  it('counts party members killed by a monster, ignores strangers and monsters', () => {
    const e = engine();
    die(e, SELF, T0 + 10_000);
    die(e, ALLY, T0 + 12_000);
    die(e, 777_777, T0 + 13_000); // not in the party
    die(e, BOSS, T0 + 14_000); // a monster
    expect(e.meterSnapshot(T0 + 15_000).deaths).toBe(2);
  });

  it('the same player dying twice a few seconds apart counts once (one death, two records)', () => {
    const e = engine();
    die(e, SELF, T0 + 10_000);
    die(e, SELF, T0 + 12_000);
    die(e, SELF, T0 + 30_000);
    expect(e.meterSnapshot(T0 + 31_000).deaths).toBe(2);
  });

  it('a map reload inside the dungeon (after a wipe, between bosses) keeps the count', () => {
    const e = engine();
    die(e, SELF, T0 + 10_000);
    die(e, ALLY, T0 + 20_000);
    e.apply({ t: 'mapLoad', mapId: 600_092 }, T0 + 60_000);
    expect(e.meterSnapshot(T0 + 61_000).deaths).toBe(2);
    die(e, ALLY, T0 + 70_000);
    expect(e.meterSnapshot(T0 + 71_000).deaths).toBe(3);
  });

  it('records sent right after a loading screen are not deaths', () => {
    const e = engine();
    e.apply({ t: 'mapLoad', mapId: 600_092 }, T0 + 60_000);
    die(e, ALLY, T0 + 61_000); // "dead on arrival"
    expect(e.meterSnapshot(T0 + 62_000).deaths).toBe(0);
  });

  it('going to another map starts a new run with a fresh count', () => {
    const e = engine();
    die(e, SELF, T0 + 10_000);
    e.apply({ t: 'mapLoad', mapId: 1010 }, T0 + 60_000);
    expect(e.meterSnapshot(T0 + 61_000).deaths).toBe(0);
  });

  it('entering the same map again after a long break is a new run', () => {
    const e = engine();
    die(e, SELF, T0 + 10_000);
    e.apply({ t: 'mapLoad', mapId: 600_092 }, T0 + 10_000 + 50 * 60_000);
    expect(e.meterSnapshot(T0 + 10_000 + 50 * 60_000 + 1000).deaths).toBe(0);
  });
});
