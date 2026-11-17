import { describe, expect, it } from 'vitest';
import { Engine, type EngineStore } from '../src/core/engine/engine';

const T0 = 1_800_000_000_000;
const SELF = 1001;
const FOE = 2001;
const FOE2 = 2002;
const ALLY = 3001;

const setup = (): { e: Engine; store: EngineStore } => {
  const store: EngineStore = { rivals: {}, daily: {} };
  const e = new Engine({ store, fightIdleMs: () => 8000 });
  e.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
  e.apply({ t: 'player', id: FOE, name: 'Milenium', classCode: 5, server: 2301, legion: null }, T0);
  e.apply({ t: 'player', id: FOE2, name: 'Kraken', classCode: 9, server: 2301, legion: null }, T0);
  e.apply({ t: 'player', id: ALLY, name: 'Ken', classCode: 25, server: 1301, legion: null }, T0);
  return { e, store };
};
const dmg = (actor: number, target: number, at: number, e: Engine): void =>
  e.apply({ t: 'damage', actor, target, amount: 1000, crit: false, back: false, dot: false, skill: 13_010_240 }, at);

describe('who killed whom', () => {
  it('records a kill of yours with both names', () => {
    const { e } = setup();
    e.apply({ t: 'kill', target: FOE, killerId: SELF, killerName: 'SilentDeath', killerServer: 1301, skill: 13_010_240 }, T0 + 1000);
    expect(e.pvpSnapshot(T0 + 2000).feed).toEqual([{ at: T0 + 1000, kind: 'kill', killer: 'SilentDeath', victim: 'Milenium', skill: 13_010_240 }]);
  });

  it('records who killed you', () => {
    const { e } = setup();
    e.apply({ t: 'kill', target: SELF, killerId: FOE, killerName: 'Milenium', killerServer: 2301, skill: 5_000_000 }, T0 + 1000);
    expect(e.pvpSnapshot(T0 + 2000).feed[0]).toMatchObject({ kind: 'death', killer: 'Milenium', victim: 'SilentDeath' });
  });

  it('records an assist (you hit the victim, an ally got the kill)', () => {
    const { e } = setup();
    dmg(SELF, FOE2, T0 + 500, e);
    e.apply({ t: 'kill', target: FOE2, killerId: ALLY, killerName: 'Ken', killerServer: 1301, skill: 1 }, T0 + 1000);
    expect(e.pvpSnapshot(T0 + 2000).feed[0]).toMatchObject({ kind: 'assist', killer: 'Ken', victim: 'Kraken' });
  });

  it('keeps a lifetime kill / death / assist record per player', () => {
    const { e, store } = setup();
    e.apply({ t: 'kill', target: FOE, killerId: SELF, killerName: 'SilentDeath', killerServer: 1301, skill: 1 }, T0 + 1000);
    e.apply({ t: 'kill', target: SELF, killerId: FOE, killerName: 'Milenium', killerServer: 2301, skill: 1 }, T0 + 2000);
    dmg(SELF, FOE2, T0 + 3000, e);
    e.apply({ t: 'kill', target: FOE2, killerId: ALLY, killerName: 'Ken', killerServer: 1301, skill: 1 }, T0 + 3500);
    expect(store.rivals['Milenium']).toMatchObject({ wins: 1, losses: 1 });
    expect(store.rivals['Kraken']?.assists).toBe(1);
  });

  it('counts a final death from the last attacker when no kill record arrives', () => {
    const { e, store } = setup();
    dmg(FOE, SELF, T0 + 500, e);
    e.apply({ t: 'death', id: SELF, flag: 3 }, T0 + 1000);
    e.apply({ t: 'heartbeat', clock: 1 }, T0 + 4000);
    expect(e.pvpSnapshot(T0 + 4100)).toMatchObject({ deaths: 1 });
    expect(store.rivals['Milenium']?.losses).toBe(1);
  });

  it('does not count the death twice when the kill record arrives too', () => {
    const { e } = setup();
    dmg(FOE, SELF, T0 + 500, e);
    e.apply({ t: 'death', id: SELF, flag: 3 }, T0 + 1000);
    e.apply({ t: 'kill', target: SELF, killerId: FOE, killerName: 'Milenium', killerServer: 2301, skill: 1 }, T0 + 1200);
    e.apply({ t: 'heartbeat', clock: 1 }, T0 + 5000);
    expect(e.pvpSnapshot(T0 + 5100)).toMatchObject({ deaths: 1 });
  });

  it('counts my kill from the death alone when no kill record arrives', () => {
    const { e, store } = setup();
    dmg(SELF, FOE, T0 + 500, e);
    e.apply({ t: 'death', id: FOE, flag: 3 }, T0 + 800);
    dmg(SELF, FOE2, T0 + 1000, e);
    e.apply({ t: 'death', id: FOE2, flag: 3 }, T0 + 1300);
    e.apply({ t: 'heartbeat', clock: 1 }, T0 + 5000);
    expect(e.pvpSnapshot(T0 + 5100)).toMatchObject({ kills: 2 });
    expect(store.rivals['Milenium']?.wins).toBe(1);
    expect(store.rivals['Kraken']?.wins).toBe(1);
  });

  it('does not double-count a kill that has its record', () => {
    const { e } = setup();
    dmg(SELF, FOE, T0 + 500, e);
    e.apply({ t: 'death', id: FOE, flag: 3 }, T0 + 800);
    e.apply({ t: 'kill', target: FOE, killerId: SELF, killerName: 'SilentDeath', killerServer: 1301, skill: 1 }, T0 + 900);
    e.apply({ t: 'heartbeat', clock: 1 }, T0 + 5000);
    expect(e.pvpSnapshot(T0 + 5100)).toMatchObject({ kills: 1 });
  });

  it('lets you add a kill or death by hand and undo it', () => {
    const { e, store } = setup();
    e.manualKda('Milenium', 'kill', T0);
    e.manualKda('Milenium', 'death', T0 + 1000);
    expect(e.pvpSnapshot(T0 + 2000)).toMatchObject({ kills: 1, deaths: 1 });
    expect(store.rivals['Milenium']).toMatchObject({ wins: 1, losses: 1 });
    expect(store.killLog?.every((k) => k.manual)).toBe(true);
    e.manualKda('Milenium', 'undo', T0 + 2000); // removes the last manual entry (the death)
    expect(e.pvpSnapshot(T0 + 3000)).toMatchObject({ kills: 1, deaths: 0 });
    expect(store.rivals['Milenium']).toMatchObject({ wins: 1, losses: 0 });
  });

  it('shows a death pop-up with the killer, and none for a death without a player', () => {
    const { e } = setup();
    e.apply({ t: 'kill', target: SELF, killerId: FOE, killerName: 'Milenium', killerServer: 2301, skill: 1 }, T0 + 1000);
    expect(e.pvpSnapshot(T0 + 1100)).toMatchObject({ deaths: 1 });
    expect(e.deathSnapshot(T0 + 1500)).toMatchObject({ killer: 'Milenium', registered: true });
    e.dismissDeath();
    expect(e.deathSnapshot(T0 + 1600)).toBeNull();
    const other = setup().e;
    other.apply({ t: 'death', id: SELF, flag: 3 }, T0 + 1000);
    expect(other.deathSnapshot(T0 + 1500)).toBeNull();
  });

  it('lists a foe you hit who never hit back', () => {
    const { e } = setup();
    dmg(SELF, FOE, T0 + 500, e);
    const snap = e.pvpSnapshot(T0 + 1000);
    expect(snap.theirs.map((r) => r.card.name)).toEqual(['Milenium']);
    expect(snap.theirs[0]?.damage).toBe(0);
  });

  it('saves a duel soon after your kill, and a later fight separately', () => {
    const saved: { opponents: string[] }[] = [];
    const store: EngineStore = { rivals: {}, daily: {} };
    const e = new Engine({
      store,
      fightIdleMs: () => 8000,
      onEncounter: (r) => saved.push({ opponents: r.rows.filter((x) => x.side === 'theirs').map((x) => x.name) }),
    });
    e.apply({ t: 'self', id: SELF, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 }, T0);
    e.apply({ t: 'player', id: FOE, name: 'Milenium', classCode: 5, server: 2301, legion: null }, T0);
    e.apply({ t: 'player', id: FOE2, name: 'Kraken', classCode: 9, server: 2301, legion: null }, T0);
    for (let i = 0; i < 6; i++) dmg(SELF, FOE, T0 + 500 + i * 1000, e);
    e.apply({ t: 'kill', target: FOE, killerId: SELF, killerName: 'SilentDeath', killerServer: 1301, skill: 1 }, T0 + 6000);
    e.pollHistory(T0 + 6200);
    expect(saved).toHaveLength(0);
    e.pollHistory(T0 + 7000); // about a second after the last hit, long before the 20 s idle time
    expect(saved).toEqual([{ opponents: ['Milenium'] }]);
    for (let i = 0; i < 6; i++) dmg(SELF, FOE2, T0 + 15_000 + i * 1000, e);
    e.pollHistory(T0 + 60_000);
    expect(saved).toHaveLength(2);
    expect(saved[1]).toEqual({ opponents: ['Kraken'] });
  });

  it('hides the death pop-up once you are back in action', () => {
    const { e } = setup();
    e.apply({ t: 'kill', target: SELF, killerId: FOE, killerName: 'Milenium', killerServer: 2301, skill: 1 }, T0 + 1000);
    e.apply({ t: 'hp', id: SELF, cur: 0, max: 26815 }, T0 + 1500);
    expect(e.deathSnapshot(T0 + 1600)).not.toBeNull();
    e.apply({ t: 'hp', id: SELF, cur: 26815, max: 26815 }, T0 + 6000); // revived
    expect(e.deathSnapshot(T0 + 6100)).toBeNull();
  });

  it('counts damage from an unnamed source that hits you during a player fight', () => {
    const { e } = setup();
    dmg(SELF, FOE, T0 + 500, e);
    dmg(777_777, SELF, T0 + 800, e); // an attacker we have no record for
    const snap = e.pvpSnapshot(T0 + 1000);
    expect(snap.theirsTotal).toBe(1000);
    expect(snap.theirs.map((r) => r.card.name)).toContain('Nieznane źródło');
    const quiet = setup().e;
    dmg(777_777, SELF, T0 + 800, quiet); // no player fight: a monster hitting you is not tracked
    expect(quiet.pvpSnapshot(T0 + 1000).theirsTotal).toBe(0);
  });

  it('ignores kills that do not involve you', () => {
    const { e } = setup();
    e.apply({ t: 'kill', target: FOE2, killerId: ALLY, killerName: 'Ken', killerServer: 1301, skill: 1 }, T0 + 1000);
    expect(e.pvpSnapshot(T0 + 2000).feed).toEqual([]);
  });

  it('lists newest first, only today, and keeps the log in the saved store (survives a restart)', () => {
    const { e, store } = setup();
    e.apply({ t: 'kill', target: FOE, killerId: SELF, killerName: 'SilentDeath', killerServer: 1301, skill: 0 }, T0 + 1000);
    e.apply({ t: 'kill', target: SELF, killerId: FOE2, killerName: 'Kraken', killerServer: 2301, skill: 0 }, T0 + 20_000);
    const feed = e.pvpSnapshot(T0 + 30_000).feed;
    expect(feed.map((k) => k.kind)).toEqual(['death', 'kill']);
    expect(feed[0]?.skill).toBeNull(); // skill 0 = unknown
    expect(store.killLog).toHaveLength(2);
    expect(e.pvpSnapshot(T0 + 3 * 86_400_000).feed).toEqual([]); // a later day: nothing from today
    // "restart" on the same store
    const again = new Engine({ store, fightIdleMs: () => 8000 });
    expect(again.pvpSnapshot(T0 + 30_000).feed).toHaveLength(2);
  });

  it('keeps only the most recent 400 entries', () => {
    const { e, store } = setup();
    for (let i = 0; i < 450; i++) {
      e.apply({ t: 'kill', target: SELF, killerId: FOE, killerName: 'Milenium', killerServer: 2301, skill: 0 }, T0 + i * 6000);
    }
    expect(store.killLog).toHaveLength(400);
  });
});
