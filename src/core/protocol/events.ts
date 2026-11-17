/** Decoded game events — the only thing that leaves the capture process. */

export interface RosterMember {
  name: string;
  server: number;
  characterId: number;
  classCode: number;
  level: number;
  gearScore: number | null;
  combatPower: number | null;
  /** Bit 0x02 of the member header byte (0x0c -> 0x0e when the player clicks ready; live 2026-11-12). */
  ready: boolean;
  slot: number;
}

export type GameEvent =
  | { t: 'heartbeat'; clock: number }
  /** ms: the real delay (net + late); net: TCP round trip to the server; late: how late the server's stream runs (smoothed); peak: worst single heartbeat of the last 10 s. Null: unknown. */
  | { t: 'ping'; ms: number; net: number | null; late: number | null; peak: number | null }
  | {
      t: 'damage';
      actor: number;
      target: number;
      skill: number;
      amount: number;
      crit: boolean;
      back: boolean;
      dot: boolean;
      front?: boolean;
      parry?: boolean;
      perfect?: boolean;
      double?: boolean;
    }
  | {
      t: 'self';
      id: number;
      name: string | null;
      server: number | null;
      classCode: number | null;
      level: number | null;
      gearScore?: number;
    }
  | {
      t: 'player';
      id: number;
      name: string;
      classCode: number | null;
      server: number | null;
      legion: string | null;
      /** Present only when the record carried two identical, plausible gear-score fields. */
      gearScore?: number;
    }
  | { t: 'death'; id: number; flag: number }
  | { t: 'zone' }
  | { t: 'party'; members: RosterMember[]; title: string | null; leaderId: number | null; dungeonId?: number | null }
  | { t: 'cast'; actor: number; skill: number }
  | { t: 'npc'; id: number; code: number }
  | { t: 'petSnapshot'; equipped: number; ranks: Record<number, number>; souls: Record<number, number> }
  | { t: 'petSouls'; entries: { pet: number; amount: number }[] }
  | { t: 'petSpent'; entries: { pet: number; amount: number }[] }
  | { t: 'petRank'; pet: number; rank: number }
  /** Odyle energy: basic and charged (bonus) balance; `snapshot` = the full list at login, so a missing pool means 0. */
  | { t: 'odyle'; snapshot: boolean; basic: number | null; charged: number | null }
  | { t: 'partyLeft' }
  | { t: 'abyssPoints'; points: number; limit: number }
  | { t: 'mapLoad'; mapId: number }
  | { t: 'entityPlaced'; id: number }
  | { t: 'hp'; id: number; cur: number | null; max: number | null }
  | { t: 'stagger'; id: number; max: number; rest: number; broken: boolean }
  | { t: 'kill'; target: number; killerId: number; killerName: string; killerServer: number; skill: number }
  /** An entity was killed by a monster (target is usually a player: a death in a dungeon or the world). */
  | { t: 'mobKill'; target: number; killerId: number; skill: number };
