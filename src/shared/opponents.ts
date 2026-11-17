import type { EncounterSummary, KillEntry } from './types';

/** A round's kill record can land a moment before the first / after the last damage packet. */
const KILL_SLACK_BEFORE_MS = 3_000;
const KILL_SLACK_AFTER_MS = 10_000;

/** Rival record kept for fights against players whose nick was not seen (so they can still get a manual K/D). */
export const UNKNOWN_RIVAL = 'Nieznany gracz';

/** Damage that hit you during a player fight from someone we have no name for (a player whose record we missed, a monster). */
export const UNKNOWN_SOURCE = 'Nieznane źródło';

export type FightResult = 'win' | 'loss' | 'unknown';

export interface OpponentFight {
  fight: EncounterSummary;
  result: FightResult;
  /** How many players the fight was against (1 = a duel). */
  opponents: number;
}

export interface OpponentGroup {
  /** Stable key: the sorted opponent names, or '' when unknown. */
  key: string;
  /** Display label ("Beb0p", "A, B", or null when no name was seen). */
  label: string | null;
  /** Newest first. */
  fights: OpponentFight[];
  wins: number;
  losses: number;
  dealt: number;
  taken: number;
  lastAt: number;
}

/**
 * Who won a fight: the kill / death record inside it; without one, unknown. With `who` set, only that player counts:
 * a win is a kill of them, a loss is a death to them (so a group fight does not credit everyone in it).
 */
export function fightResult(fight: EncounterSummary, kills: readonly KillEntry[], who: string | null = null): FightResult {
  const from = fight.startedAt - KILL_SLACK_BEFORE_MS;
  const to = fight.startedAt + fight.durationMs + KILL_SLACK_AFTER_MS;
  let won = 0;
  let lost = 0;
  for (const k of kills) {
    if (k.at < from || k.at > to) continue;
    if (k.kind === 'kill' && (who === null || k.victim === who)) won++;
    else if (k.kind === 'death' && (who === null || k.killer === who)) lost++;
  }
  if (won === lost) return 'unknown';
  return won > lost ? 'win' : 'loss';
}

/** Groups fights by player, however far apart they were. A fight against several players is listed under each of them. Newest group first. */
export function groupByOpponent(fights: readonly EncounterSummary[], kills: readonly KillEntry[]): OpponentGroup[] {
  const groups = new Map<string, OpponentGroup>();
  for (const fight of fights) {
    const names = [...new Set(fight.opponents ?? [])];
    for (const name of names.length > 0 ? names : [null]) {
      const result = fightResult(fight, kills, name);
      const key = name ?? '';
      let g = groups.get(key);
      if (!g) {
        g = { key, label: name, fights: [], wins: 0, losses: 0, dealt: 0, taken: 0, lastAt: 0 };
        groups.set(key, g);
      }
      g.fights.push({ fight, result, opponents: names.length });
      if (result === 'win') g.wins++;
      else if (result === 'loss') g.losses++;
      g.dealt += fight.total;
      g.taken += fight.theirsTotal ?? 0;
      g.lastAt = Math.max(g.lastAt, fight.startedAt);
    }
  }
  const out = [...groups.values()];
  for (const g of out) g.fights.sort((a, b) => b.fight.startedAt - a.fight.startedAt);
  return out.sort((a, b) => b.lastAt - a.lastAt);
}
