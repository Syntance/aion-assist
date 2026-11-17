import type { LookupResult } from './engine/engine';
import type { GameEvent } from './protocol/events';

/**
 * Synthetic event source for `--demo`: lets the overlay be designed and tested without
 * the game running. It feeds the same GameEvent stream the capture process produces.
 */

const SELF_ID = 1001;
const MOB_ID = 50_001;

const PARTY = [
  { id: 1002, name: 'Ken', classCode: 25, gearScore: 3118, combatPower: 214_500, power: 1.9 },
  { id: 1003, name: 'BeGe', classCode: 17, gearScore: 2971, combatPower: 206_300, power: 1.15 },
  { id: 1004, name: 'MeNTaLIST', classCode: 17, gearScore: 2970, combatPower: 193_100, power: 1.0 },
  { id: 1005, name: 'superOK', classCode: 33, gearScore: 2933, combatPower: 182_000, power: 0.62 },
  { id: SELF_ID, name: 'SilentDeath', classCode: 17, gearScore: 2748, combatPower: 146_200, power: 0.6 },
];

const ENEMIES = [
  { id: 2001, name: 'Milenium', classCode: 5, server: 2301, power: 1.6 },
  { id: 2002, name: 'Vexari', classCode: 13, server: 2304, power: 0.9 },
];

const DEMO_LOOKUPS: Record<string, LookupResult> = {
  SilentDeath: { combatPower: 146_200, itemLevel: 2748, abyssRank: 412, abyssPoints: 18_240, className: 'assassin', level: 45, legion: 'Nocturne' },
  Milenium: { combatPower: 231_900, itemLevel: 3204, abyssRank: 37, abyssPoints: 96_410, className: 'gladiator', level: 45, legion: 'Ragnarok' },
  Vexari: { combatPower: 171_300, itemLevel: 2861, abyssRank: 268, abyssPoints: 24_775, className: 'ranger', level: 45, legion: null },
};

export function demoLookup(name: string): LookupResult | 'notfound' {
  return DEMO_LOOKUPS[name] ?? 'notfound';
}

export class DemoSource {
  private started = false;
  private tickNo = 0;
  private ap = 132_456;
  private seed = 0x2f6e2b1;

  private random(): number {
    // xorshift32 — deterministic, so screenshots are reproducible
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 0x1_0000_0000;
  }

  /** Call every ~200 ms. */
  step(): GameEvent[] {
    const out: GameEvent[] = [];
    if (!this.started) {
      this.started = true;
      out.push({ t: 'self', id: SELF_ID, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 });
      for (const p of PARTY) {
        if (p.id !== SELF_ID) out.push({ t: 'player', id: p.id, name: p.name, classCode: p.classCode, server: 1301, legion: null });
      }
      for (const e of ENEMIES) {
        out.push({ t: 'player', id: e.id, name: e.name, classCode: e.classCode, server: e.server, legion: null });
      }
      out.push({
        t: 'party',
        title: 'Szybki bieg',
        leaderId: 7004,
        members: PARTY.map((p, i) => ({
          name: p.name,
          server: 1301,
          characterId: 7000 + i,
          classCode: p.classCode,
          level: 45,
          gearScore: p.gearScore,
          combatPower: p.combatPower,
          ready: i % 2 === 0,
          slot: i + 1,
        })),
      });
      out.push({ t: 'abyssPoints', points: this.ap, limit: 2_500_000 });
    }
    this.tickNo++;
    // boss HP drains with the party's hits; stagger fills and breaks
    const bossMax = 4_000_000;
    const hp = Math.max(0, bossMax - ((this.tickNo * 9_500) % bossMax));
    out.push({ t: 'hp', id: MOB_ID, cur: hp, max: bossMax });
    out.push({ t: 'stagger', id: MOB_ID, max: 100, rest: 100 - (this.tickNo % 100), broken: false });

    for (const p of PARTY) {
      if (this.random() < 0.55) {
        const crit = this.random() < 0.3;
        const amount = Math.round((6000 + this.random() * 9000) * p.power * (crit ? 1.8 : 1));
        out.push({ t: 'damage', actor: p.id, target: MOB_ID, skill: 1_100_000, amount, crit, back: false, dot: false });
      }
    }

    // a PvP skirmish that repeats every ~40 s
    const phase = this.tickNo % 200;
    if (phase >= 20 && phase < 140) {
      const enemy = ENEMIES[Math.floor(this.tickNo / 200) % ENEMIES.length];
      if (this.random() < 0.5) {
        out.push({ t: 'damage', actor: SELF_ID, target: enemy.id, skill: 1_700_000, amount: Math.round(900 + this.random() * 2600), crit: this.random() < 0.3, back: true, dot: false });
      }
      if (this.random() < 0.45) {
        out.push({ t: 'damage', actor: enemy.id, target: SELF_ID, skill: 500_000, amount: Math.round((1200 + this.random() * 3800) * enemy.power), crit: false, back: false, dot: false });
      }
      if (phase === 139) {
        const won = Math.floor(this.tickNo / 200) % 3 !== 0;
        if (won) {
          out.push({ t: 'damage', actor: SELF_ID, target: enemy.id, skill: 1_700_000, amount: 4200, crit: true, back: true, dot: false });
          out.push({ t: 'kill', target: enemy.id, killerId: SELF_ID, killerName: 'SilentDeath', killerServer: 1301, skill: 1_700_000 });
          this.ap += 913;
          out.push({ t: 'abyssPoints', points: this.ap, limit: 2_500_000 });
        } else {
          out.push({ t: 'damage', actor: enemy.id, target: SELF_ID, skill: 500_000, amount: 6100, crit: true, back: false, dot: false });
          out.push({ t: 'kill', target: SELF_ID, killerId: enemy.id, killerName: enemy.name, killerServer: enemy.server, skill: 500_000 });
        }
      }
    }
    return out;
  }
}
