import type { GameEvent } from '../protocol/events';
import type { PetRow, PetsSnapshot } from '@shared/pets';
import { NPC_PETS, PET_ROWS, PET_SOURCES } from './petData';

/**
 * Pet collection tracker: ranks and soul counters from the game's own pet packets (read-only, from the same
 * passive capture as everything else), recent soul gains and the pet mobs currently in view.
 * Packet layouts and the soul bookkeeping follow the open-source PetTracker (GPL-3.0, 0Fox2Give).
 */

/** Souls needed in the stage you are in: unlock 5, rank 1 -> 2: 25, rank 2 -> 3: 75. */
export const stageGoal = (rank: number): number | null => (rank === 0 ? 5 : rank === 1 ? 25 : rank === 2 ? 75 : null);

export const NEARBY_STALE_MS = 90_000;
const RECENT_MAX = 50;
const NEARBY_CAP = 2048;
const PIN_MAX = 5;

interface PetState {
  /** 0 = not owned, 1..3; null = not known yet (no collection snapshot). */
  rank: number | null;
  /** Souls in the current stage (null: max rank or unknown). */
  souls: number | null;
  /** A reward or a spend suggests a rank change the game has not confirmed yet. */
  pending: boolean;
  /** The counter was not confirmed by a snapshot since a change we could not follow. */
  stale: boolean;
}

export interface PetProfile {
  pets: Record<number, { rank: number | null; souls: number | null }>;
  pins: number[];
  /** Unix ms of the last collection snapshot. */
  syncedAt: number | null;
}

export interface PetStoreData {
  version: 1;
  profiles: Record<string, PetProfile>;
}

export const emptyPetStore = (): PetStoreData => ({ version: 1, profiles: {} });

const META = new Map(PET_ROWS.map(([id, name, family, paid]) => [id, { id, name, family, paid: paid === 1 }]));

export interface PetBookOptions {
  store: PetStoreData;
  /** Pet rows the HUD shows at most (pins count). */
  rowLimit?: () => number;
  hideMaxed?: () => boolean;
}

export class PetBook {
  /** Set whenever persisted data changed; the host clears it after saving. */
  dirty = false;
  private character: string | null = null;
  private readonly state = new Map<number, PetState>();
  private pins: number[] = [];
  private syncedAt: number | null = null;
  private snapshotSeenThisLogin = false;
  /** A snapshot that arrived before we knew who is logged in. */
  private pendingSnapshot: Extract<GameEvent, { t: 'petSnapshot' }> | null = null;
  private recent: { pet: number; at: number; gained: number }[] = [];
  private readonly session = new Map<number, number>();
  private sessionRankUps = 0;
  private sessionSouls = 0;
  private readonly nearby = new Map<number, { pet: number; npc: number; seen: number }>();

  constructor(private readonly opts: PetBookOptions) {}

  /** The logged-in character changed (or became known): switch to its saved collection. */
  setCharacter(name: string | null, now: number): void {
    if (name === this.character) return;
    this.saveProfile();
    this.character = name;
    this.state.clear();
    this.recent = [];
    this.session.clear();
    this.sessionRankUps = 0;
    this.sessionSouls = 0;
    this.snapshotSeenThisLogin = false;
    this.nearby.clear();
    this.pins = [];
    this.syncedAt = null;
    if (!name) return;
    const saved = this.opts.store.profiles[name];
    if (saved) {
      for (const [key, v] of Object.entries(saved.pets)) {
        const id = Number(key);
        if (META.has(id)) this.state.set(id, { rank: v.rank, souls: v.souls, pending: false, stale: true });
      }
      this.pins = saved.pins.filter((id) => META.has(id));
      this.syncedAt = saved.syncedAt;
    }
    const pending = this.pendingSnapshot;
    this.pendingSnapshot = null;
    if (pending) this.importSnapshot(pending, now);
  }

  private pet(id: number): PetState {
    let s = this.state.get(id);
    if (!s) this.state.set(id, (s = { rank: null, souls: null, pending: false, stale: false }));
    return s;
  }

  private saveProfile(): void {
    if (!this.character) return;
    const pets: PetProfile['pets'] = {};
    for (const [id, s] of this.state) if (s.rank !== null) pets[id] = { rank: s.rank, souls: s.souls };
    this.opts.store.profiles[this.character] = { pets, pins: this.pins, syncedAt: this.syncedAt };
    this.dirty = true;
  }

  private importSnapshot(ev: Extract<GameEvent, { t: 'petSnapshot' }>, now: number): void {
    for (const id of META.keys()) {
      const rank = ev.ranks[id] ?? 0;
      const s = this.pet(id);
      s.rank = rank;
      s.souls = rank === 3 ? null : (ev.souls[id] ?? 0);
      s.pending = false;
      s.stale = false;
    }
    this.syncedAt = now;
    this.snapshotSeenThisLogin = true;
    this.saveProfile();
  }

  /** Feeds one decoded event; returns true when something the HUD shows changed. */
  apply(ev: GameEvent, now: number): boolean {
    switch (ev.t) {
      case 'self':
        if (ev.name) this.setCharacter(ev.name, now);
        return false;
      case 'zone':
      case 'mapLoad':
        this.nearby.clear();
        return true;
      case 'petSnapshot':
        if (!this.character) {
          this.pendingSnapshot = ev;
          return false;
        }
        this.importSnapshot(ev, now);
        return true;
      case 'petSouls':
        for (const e of ev.entries) this.gain(e.pet, e.amount, now);
        this.saveProfile();
        return true;
      case 'petSpent':
        for (const e of ev.entries) this.spend(e.pet, e.amount);
        this.saveProfile();
        return true;
      case 'petRank':
        this.rankReached(ev.pet, ev.rank, now);
        this.saveProfile();
        return true;
      case 'npc': {
        const match = NPC_PETS[ev.code];
        if (!match) {
          this.nearby.delete(ev.id);
          return false;
        }
        if (!this.nearby.has(ev.id) && this.nearby.size >= NEARBY_CAP) {
          const oldest = [...this.nearby].sort((a, b) => a[1].seen - b[1].seen)[0];
          if (oldest) this.nearby.delete(oldest[0]);
        }
        this.nearby.set(ev.id, { pet: match[0], npc: ev.code, seen: now });
        return true;
      }
      case 'death':
        // the same frame shape as the game's "entity removed" message: any reason takes it out of view
        return this.nearby.delete(ev.id);
      default:
        return false;
    }
  }

  private gain(id: number, amount: number, now: number): void {
    if (!META.has(id)) return;
    const s = this.pet(id);
    this.sessionSouls += amount;
    this.session.set(id, (this.session.get(id) ?? 0) + amount);
    this.recent = this.recent.filter((r) => r.pet !== id);
    this.recent.unshift({ pet: id, at: now, gained: amount });
    if (this.recent.length > RECENT_MAX) this.recent.length = RECENT_MAX;
    if (s.rank === null || s.souls === null) {
      if (s.rank !== 3) s.stale = true;
      return;
    }
    const goal = stageGoal(s.rank) ?? 0;
    s.souls += amount;
    if (s.souls >= goal) {
      if (s.rank === 2) {
        // the last reward maxes the pet by itself (confirmed by PetTracker's author)
        this.rankReached(id, 3, now);
      } else {
        s.souls = goal;
        s.pending = true; // the game confirms the new rank with its own message
      }
    }
  }

  private spend(id: number, amount: number): void {
    const s = this.state.get(id);
    if (!s || s.rank === null || s.rank === 3 || s.souls === null) return;
    if (s.souls < amount) {
      s.stale = true;
      return;
    }
    s.souls -= amount; // soul points are spent when a stage is completed
    s.pending = true;
  }

  private rankReached(id: number, rank: number, now: number): void {
    if (!META.has(id)) return;
    const s = this.pet(id);
    if (s.rank !== null && rank > s.rank) {
      this.sessionRankUps++;
      this.recent = this.recent.filter((r) => r.pet !== id);
      this.recent.unshift({ pet: id, at: now, gained: 0 });
    }
    s.rank = rank;
    s.pending = false;
    if (rank === 3) s.souls = null;
    else if (s.souls !== null) s.souls = Math.min(s.souls, stageGoal(rank) ?? s.souls);
    else s.stale = true;
  }

  /** Any collection data for the current character (saved or synced)? */
  hasCollection(): boolean {
    return [...this.state.values()].some((s) => s.rank !== null);
  }

  get currentCharacter(): string | null {
    return this.character;
  }

  /**
   * Takes ranks and counters from another source (the PetTracker app's saved profile) for the current character.
   * They are as old as that file, so they count as remembered, not synced; live rewards keep adding to them.
   */
  importPets(pets: { id: number; rank: number; souls: number | null }[], now: number): number {
    if (!this.character) return 0;
    let n = 0;
    for (const p of pets) {
      if (!META.has(p.id) || p.rank < 0 || p.rank > 3) continue;
      const s = this.pet(p.id);
      s.rank = p.rank;
      s.souls = p.rank === 3 ? null : Math.min(p.souls ?? 0, stageGoal(p.rank) ?? 0);
      s.pending = false;
      s.stale = true;
      n++;
    }
    if (n > 0) {
      this.syncedAt = this.syncedAt ?? now;
      this.saveProfile();
    }
    return n;
  }

  // --- user actions ----------------------------------------------------------------

  togglePin(id: number): void {
    if (!META.has(id)) return;
    this.pins = this.pins.includes(id) ? this.pins.filter((p) => p !== id) : [...this.pins, id].slice(-PIN_MAX);
    this.saveProfile();
  }

  newSession(): void {
    this.recent = [];
    this.session.clear();
    this.sessionRankUps = 0;
    this.sessionSouls = 0;
  }

  // --- views -----------------------------------------------------------------------

  private row(id: number, seenAt: number | null, withSource = false): PetRow {
    const meta = META.get(id);
    const s = this.state.get(id);
    const rank = s?.rank ?? null;
    const goal = rank === null ? null : stageGoal(rank);
    const souls = s?.souls ?? null;
    const source = withSource ? PET_SOURCES[id] : undefined;
    return {
      id,
      name: meta?.name ?? `Pet #${id}`,
      family: meta?.family ?? '',
      rank,
      souls,
      goal,
      remaining: goal !== null && souls !== null && !s?.stale ? Math.max(0, goal - souls) : null,
      pending: s?.pending ?? false,
      stale: s?.stale ?? false,
      paid: meta?.paid ?? false,
      pinned: this.pins.includes(id),
      seenAt,
      sessionSouls: this.session.get(id) ?? 0,
      ...(source ? { sourceKind: source[0], source: source[1] } : {}),
    };
  }

  private nearbyByPet(now: number): Map<number, number> {
    const out = new Map<number, number>();
    for (const e of this.nearby.values()) {
      if (now - e.seen < NEARBY_STALE_MS) out.set(e.pet, Math.max(out.get(e.pet) ?? 0, e.seen));
    }
    return out;
  }

  /** What the HUD shows: pins first, then the recent rewards or the pets in view, trimmed to the row limit. */
  snapshot(now: number, mode: 'recent' | 'nearby'): PetsSnapshot {
    const hideMaxed = this.opts.hideMaxed?.() ?? true;
    const limit = Math.max(1, this.opts.rowLimit?.() ?? 5);
    const visible = (id: number): boolean => {
      const m = META.get(id);
      if (!m || m.paid) return false;
      return !(hideMaxed && this.state.get(id)?.rank === 3);
    };
    const near = this.nearbyByPet(now);
    const base =
      mode === 'nearby'
        ? [...near].sort((a, b) => b[1] - a[1]).map(([id, at]) => ({ id, at }))
        : this.recent.map((r) => ({ id: r.pet, at: r.at }));
    const ids = new Set<number>();
    const rows: PetRow[] = [];
    for (const id of this.pins) {
      const m = META.get(id);
      if (!m || m.paid) continue;
      ids.add(id);
      rows.push(this.row(id, near.get(id) ?? this.recent.find((r) => r.pet === id)?.at ?? null));
    }
    for (const b of base) {
      if (ids.has(b.id) || !visible(b.id)) continue;
      ids.add(b.id);
      rows.push(this.row(b.id, b.at));
    }
    let collected = 0;
    let maxed = 0;
    let unknown = 0;
    let total = 0;
    for (const [id, m] of META) {
      if (m.paid) continue;
      total++;
      const rank = this.state.get(id)?.rank ?? null;
      if (rank === null) unknown++;
      else if (rank > 0) collected++;
      if (rank === 3) maxed++;
    }
    return {
      character: this.character,
      synced: this.snapshotSeenThisLogin,
      syncedAt: this.syncedAt,
      rows: rows.slice(0, Math.max(limit, this.pins.length + 1)),
      nearbyCount: near.size,
      summary: { total, collected, maxed, unknown },
      session: { souls: this.sessionSouls, rankUps: this.sessionRankUps },
    };
  }

  /** Every non-paid pet with its state and how to get it (for the finder window). */
  all(now: number): PetRow[] {
    const near = this.nearbyByPet(now);
    return [...META.values()].filter((m) => !m.paid).map((m) => this.row(m.id, near.get(m.id) ?? null, true));
  }
}
