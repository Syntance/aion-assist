import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine/engine';

const T0 = 1_800_000_000_000;
const ME = 9020;
const BOSS = 19832;

const setup = (boss = false): Engine => {
  const e = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000, npcBoss: () => boss });
  e.apply({ t: 'self', id: ME, name: 'SilentDeath', server: 1318, classCode: 17, level: 45 }, T0);
  return e;
};
const hit = (e: Engine, target: number, amount: number, at: number): void =>
  e.apply({ t: 'damage', actor: ME, target, amount, crit: false, back: false, dot: false, skill: 13_010_240 }, at);
const total = (e: Engine, at: number): number => e.meterSnapshot(at).total;

describe('where a fight ends (as in Abyss Logs)', () => {
  it('starts a new fight on the next pull once every monster of the last one is dead, even a second later', () => {
    const e = setup();
    hit(e, 501, 1000, T0 + 100);
    hit(e, 502, 2000, T0 + 200);
    e.apply({ t: 'death', id: 501, flag: 3 }, T0 + 300);
    hit(e, 502, 500, T0 + 400); // one still alive: same fight
    expect(total(e, T0 + 400)).toBe(3500);
    e.apply({ t: 'death', id: 502, flag: 1 }, T0 + 500); // flag 1 also ends an ordinary monster
    hit(e, 601, 700, T0 + 1500); // the next pack, well inside the idle time
    expect(total(e, T0 + 1500)).toBe(700);
  });

  it('keeps a boss fight open on a flag 1 death (a phase)', () => {
    const e = setup(true);
    e.apply({ t: 'npc', id: BOSS, code: 2346601, owner: null }, T0);
    hit(e, BOSS, 1000, T0 + 100);
    e.apply({ t: 'death', id: BOSS, flag: 1 }, T0 + 200);
    hit(e, BOSS, 1000, T0 + 300);
    expect(total(e, T0 + 300)).toBe(2000);
  });

  it("does not count hits that land after a boss's HP read 0, but does for an ordinary monster", () => {
    const boss = setup(true);
    boss.apply({ t: 'npc', id: BOSS, code: 2346601, owner: null }, T0);
    hit(boss, BOSS, 5000, T0 + 100);
    boss.apply({ t: 'hp', id: BOSS, cur: 0, max: null }, T0 + 150);
    hit(boss, BOSS, 3000, T0 + 200); // in flight when it died
    expect(total(boss, T0 + 200)).toBe(5000);

    const mob = setup(false);
    hit(mob, 501, 5000, T0 + 100);
    mob.apply({ t: 'hp', id: 501, cur: 0, max: null }, T0 + 150);
    hit(mob, 501, 3000, T0 + 200);
    expect(total(mob, T0 + 200)).toBe(8000);
  });
});
