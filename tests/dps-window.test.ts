import { describe, expect, it } from 'vitest';
import { buildDetail, Engine, type EngineStore } from '@core/engine/engine';
import type { GameEvent } from '@core/protocol/events';
import { dpsSeconds } from '@shared/dps';
import type { EncounterRecord, EncounterRow } from '@shared/types';

const SELF = 1001;
const ALLY = 1002;
const MOB = 50_001;
const T0 = new Date(2026, 10, 12, 20, 0, 0).getTime();

const hit = (actor: number, amount: number): GameEvent => ({ t: 'damage', actor, target: MOB, skill: 1, amount, crit: false, back: false, dot: false });

function setup(saved: EncounterRecord[] = []) {
  const store: EngineStore = { rivals: {}, daily: {} };
  const engine = new Engine({ store, fightIdleMs: () => 8000, onEncounter: (rec) => saved.push(rec) });
  const intro: GameEvent[] = [
    { t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 },
    { t: 'player', id: ALLY, name: 'Ken', classCode: 25, server: 1301, legion: null },
    { t: 'party', title: null, leaderId: null, members: [{ name: 'Ken', server: 1301, characterId: 1, classCode: 25, level: 45, gearScore: 3118, combatPower: 214_500, ready: false, slot: 1 }] },
  ];
  for (const ev of intro) engine.apply(ev, T0);
  return engine;
}

/** SilentDeath hits every 5 s from the start; Ken joins at 20 s and hits at 20, 25 and 30 s. */
function lateJoiner(engine: Engine): void {
  for (let s = 0; s <= 30; s += 5) {
    engine.apply(hit(SELF, 1000), T0 + s * 1000);
    if (s >= 20) engine.apply(hit(ALLY, 3000), T0 + s * 1000);
  }
}

describe('DPS window of a player', () => {
  it('starts at his own first hit, ends at his last hit once the fight is over, and never gets shorter than 3 s', () => {
    expect(dpsSeconds(30_000, 0)).toBe(30);
    expect(dpsSeconds(30_000, 20_000)).toBe(10);
    expect(dpsSeconds(30_000, undefined)).toBe(30); // an older save: from the start
    expect(dpsSeconds(30_000, 29_000)).toBe(3); // one hit right before the end
    expect(dpsSeconds(2000, 1500)).toBe(2); // a fight shorter than the floor keeps its own length
    expect(dpsSeconds(500, 0)).toBe(1); // the fight is never read as shorter than a second
    expect(dpsSeconds(30_000, 5000, 10_000)).toBe(5); // a finished fight: first to last hit
    expect(dpsSeconds(30_000, 20_000, 20_000)).toBe(3); // a single hit
    expect(dpsSeconds(30_000, 0, 99_999)).toBe(30); // never longer than the fight
  });

  it('does not divide a late joiner by the time before he started hitting', () => {
    const engine = setup();
    lateJoiner(engine);
    const snap = engine.meterSnapshot(T0 + 30_000);
    const self = snap.rows.find((r) => r.card.name === 'SilentDeath');
    const ally = snap.rows.find((r) => r.card.name === 'Ken');
    expect(snap.durationMs).toBe(30_000);
    expect(self).toMatchObject({ damage: 7000 });
    expect(self?.dps).toBeCloseTo(7000 / 30, 5); // there from the start: the whole fight
    expect(ally).toMatchObject({ damage: 9000 });
    expect(ally?.dps).toBeCloseTo(9000 / 10, 5); // 10 s of his own, not 30 (which would show 300/s)
  });

  it('does not turn a single late hit into a huge DPS', () => {
    const engine = setup();
    for (let s = 0; s <= 30; s += 5) engine.apply(hit(SELF, 1000), T0 + s * 1000);
    engine.apply(hit(ALLY, 90_000), T0 + 30_000);
    const ally = engine.meterSnapshot(T0 + 30_000).rows.find((r) => r.card.name === 'Ken');
    expect(ally?.dps).toBeCloseTo(90_000 / 3, 5);
  });

  it('is kept in the saved fight, so the detail and the history show the same DPS', () => {
    const saved: EncounterRecord[] = [];
    const engine = setup(saved);
    lateJoiner(engine);
    engine.pollHistory(T0 + 60_000); // the fight is long over
    expect(saved).toHaveLength(1);
    const rec = saved[0] as EncounterRecord;
    const self = rec.rows.find((r) => r.name === 'SilentDeath');
    const ally = rec.rows.find((r) => r.name === 'Ken');
    expect(self?.joinedMs).toBe(0);
    expect(ally?.joinedMs).toBe(20_000);
    expect(ally?.lastMs).toBe(30_000);
    expect(self?.lastMs).toBe(30_000);
    expect(rec.durationMs).toBe(30_000);
    expect(buildDetail(ally as NonNullable<typeof ally>, rec.durationMs, 'test').dps).toBeCloseTo(900, 5);
    // a save from before this change has no joinedMs: counted from the start of the fight, as it always was
    const old: EncounterRow = { ...(ally as EncounterRow) };
    delete old.joinedMs;
    expect(buildDetail(old, rec.durationMs, 'test').dps).toBeCloseTo(300, 5);
  });

  it('stops counting at his last hit once the fight is over, but not while it is still on', () => {
    const engine = setup();
    // in the order they happen: SilentDeath every 5 s, Ken at 5 s and 10 s and then he is dead
    for (let s = 0; s <= 30; s += 5) {
      engine.apply(hit(SELF, 1000), T0 + s * 1000);
      if (s === 5 || s === 10) engine.apply(hit(ALLY, 3000), T0 + s * 1000);
    }
    const ken = (at: number) => engine.meterSnapshot(at).rows.find((r) => r.card.name === 'Ken');
    // the fight goes on (SilentDeath hit at 30 s): the window of somebody who stopped keeps running, so his DPS falls
    expect(ken(T0 + 30_000)?.dps).toBeCloseTo(6000 / 25, 5);
    // 20 s later the fight is over: Ken's window is his own 5 s (5 s to 10 s), not the 25 s since he began
    const over = ken(T0 + 50_000);
    expect(engine.meterSnapshot(T0 + 50_000).active).toBe(false);
    expect(over?.dps).toBeCloseTo(6000 / 5, 5);
    const self = engine.meterSnapshot(T0 + 50_000).rows.find((r) => r.card.name === 'SilentDeath');
    expect(self?.dps).toBeCloseTo(7000 / 30, 5); // he hit from the first to the last second of the fight
  });

  it('adds up the party DPS from the players own DPS, so a late joiner does not drag it down', () => {
    const engine = setup();
    lateJoiner(engine);
    const snap = engine.meterSnapshot(T0 + 30_000);
    const sum = snap.rows.reduce((n, r) => n + r.dps, 0);
    expect(sum).toBeCloseTo(7000 / 30 + 9000 / 10, 5);
    expect(snap.focus?.partyDps).toBeCloseTo(sum, 5); // not 16000 / 30
  });
});
