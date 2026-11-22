/**
 * A player's DPS is his damage over HIS OWN window, not over the whole fight: it starts at his first hit (not at the first hit of
 * anyone) and, once the fight is over, ends at his last hit. So somebody who joins late, or only comes for the last phase, is not
 * divided by time he was not hitting, and somebody who died early is not divided by the time after he stopped. While the fight is
 * still on, the window runs to "now", so the number falls when a player stops hitting.
 *
 * `joinedMs` is how long after the fight started the player first dealt damage and `lastMs` how long after it started he last did
 * (both absent in older saves: the whole fight). `lastMs` is passed only for a finished fight; a live one ends at `fightMs`.
 * The window never gets shorter than 3 s (or the fight itself when that is shorter): one hit right before the end must not read as
 * a six-figure DPS. The damage totals are not touched by any of this.
 */
export const MIN_DPS_WINDOW_MS = 3000;

export function dpsSeconds(fightMs: number, joinedMs?: number | null, lastMs?: number | null): number {
  const joined = Math.max(0, joinedMs ?? 0);
  const end = lastMs === null || lastMs === undefined ? fightMs : Math.min(fightMs, Math.max(joined, lastMs));
  const floor = Math.min(MIN_DPS_WINDOW_MS, Math.max(1000, fightMs));
  return Math.max(floor, end - joined) / 1000;
}
