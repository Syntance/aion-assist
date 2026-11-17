/** Pet tracker data shared by the engine, the main process and the overlay. */

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
