/** Pet tracker data shared by the engine, the main process and the overlay. */

/** Souls needed in the stage you are in: unlock 5 (rank 0), rank 1 -> 2: 25, rank 2 -> 3: 75. */
const STAGE_GOALS: readonly number[] = [5, 25, 75];
export const stageGoal = (rank: number): number | null => STAGE_GOALS[rank] ?? null;

/**
 * Souls still missing for the MAX rank: what is left in the current stage plus every stage after it (rank 1 at 10/25: 15 + 75).
 * 0 for a pet at MAX; null while the rank or the amount is unknown.
 */
export function soulsToMax(rank: number | null, souls: number | null): number | null {
  if (rank === null) return null;
  if (rank >= 3) return 0;
  const goal = stageGoal(rank);
  if (goal === null || souls === null) return null;
  let left = Math.max(0, goal - Math.min(souls, goal));
  for (let r = rank + 1; r < 3; r++) left += stageGoal(r) ?? 0;
  return left;
}

/**
 * Sort key "closest to MAX first": the souls a pet still misses (a rank-up waiting for its confirmation counts as 0 missing in its
 * stage), then pets whose amount is unknown, and pets already at MAX last.
 */
export function toMaxKey(p: { rank: number | null; souls: number | null }): number {
  if (p.rank !== null && p.rank >= 3) return 2_000_000;
  return soulsToMax(p.rank, p.souls) ?? 1_000_000;
}

export const compareToMax = (a: { rank: number | null; souls: number | null }, b: { rank: number | null; souls: number | null }): number => toMaxKey(a) - toMaxKey(b);

export interface PetRow {
  id: number;
  name: string;
  /** Cogni / Fera / Natura / Varian / Special (the game's pet families). */
  family: string;
  /** 0 = not owned, 1..3; null until the collection was synchronised. */
  rank: number | null;
  /** Souls in the current stage and the stage's goal; null at max rank or when unknown. */
  souls: number | null;
  goal: number | null;
  remaining: number | null;
  /** A rank-up is expected but the game has not confirmed it yet. */
  pending: boolean;
  /** The counter is out of date (a reward we could not place); a relog refreshes it. */
  stale: boolean;
  paid: boolean;
  pinned: boolean;
  /** Last time the pet was seen / rewarded (unix ms). */
  seenAt: number | null;
  sessionSouls: number;
  sourceKind?: string;
  source?: string;
}

export interface PetsSnapshot {
  character: string | null;
  /** A collection snapshot arrived in this login: ranks are real, not remembered. */
  synced: boolean;
  syncedAt: number | null;
  rows: PetRow[];
  nearbyCount: number;
  summary: { total: number; collected: number; maxed: number; unknown: number };
  session: { souls: number; rankUps: number };
}
