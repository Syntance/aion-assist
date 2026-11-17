import { UNKNOWN_SOURCE } from '@shared/opponents';
import { dayKey } from '@shared/day';
import type { GameEvent } from '../protocol/events';
import {
  classFromCode,
  factionFromServer,
  type DailySnapshot,
  type EncounterRecord,
  type EncounterRow,
  type PlayerDetail,
  type Faction,
  type LookupState,
  type FocusSnapshot,
  type LobbySnapshot,
  type MeterSnapshot,
  type NearbyRow,
  type PlayerCard,
  type PvpRow,
  type DeathSnapshot,
  type KdaAction,
  type KillEntry,
  type PingSnapshot,
  type PvpSnapshot,
  type RivalRecord,
  type TargetSnapshot,
} from '../../shared/types';

/** Turns decoded game events into meter / PvP / target / daily state. Pure: no I/O. */

const KILL_WINDOW_MS = 10_000;
/** How long a final death of yours waits for its kill record before it is counted from the last attacker. */
const DEATH_FALLBACK_MS = 2_500;
/** How long the death pop-up stays up. */
const DEATH_SHOW_MS = 30_000;
const PVP_IDLE_MS = 20_000;
/** A fight that ended with your kill or death is saved about a second after its last hit, not after the full idle time. */
const PVP_DONE_MS = 1_000;
const ENCOUNTER_GAP_MS = 5 * 60_000;
const TARGET_HOLD_MS = 10_000;
const DAILY_KEEP_DAYS = 120;
const SELF_FALLBACK_NAME = 'Ty';
const ATTACKING_MS = 15_000;
const FOE_ACTIVE_MS = 60_000;
const FOCUS_MS = 12_000;
const HP_KEEP = 400;
const NEARBY_SHOWN = 12;

export interface DailyRecord {
  apStart: number | null;
  apLast: number | null;
  apBanked: number;
  apLimit: number | null;
  rpStart: number | null;
  rpLast: number | null;
  kills: number;
  deaths: number;
  assists: number;
}

export interface EngineStore {
  rivals: Record<string, RivalRecord>;
  daily: Record<string, DailyRecord>;
  /** Who killed whom (only kills involving you), oldest first, capped; saved with the other statistics. */
  killLog?: KillEntry[];
}

const KILL_LOG_MAX = 400;
const PVP_FEED_SHOWN = 12;

export interface LookupResult {
  combatPower: number | null;
  itemLevel: number | null;
  abyssRank: number | null;
  abyssPoints: number | null;
  className: PlayerCard['className'];
  level: number | null;
  legion: string | null;
  /** From the profile search (race); used when the server id never arrived in packets. */
  faction?: Faction | null;
  /** Home server from the profile search; fills in a server the packets did not carry. */
  server?: number | null;
}

/** What the game announced at zone load and the app cannot rebuild after a restart. */
export interface EngineContext {
  players: Extract<GameEvent, { t: 'player' }>[];
  party: Extract<GameEvent, { t: 'party' }> | null;
}

export interface EngineOptions {
  store: EngineStore;
  fightIdleMs: () => number;
  /** History keeps only boss fights (high-HP targets), never regular mobs. */
  bossOnly?: () => boolean;
  /** User-given name of an NPC code (shown on the boss bar). */
  npcName?: (code: number) => string | null;
  /** Whether a map id is a dungeon (true), an open-world map (false) or unknown (null, no catalog). */
  knownDungeon?: (mapId: number) => boolean | null;
  /** Whether a catalog says an NPC code is a boss (true), not one (false) or is unknown (null); beats the HP guess. */
  npcBoss?: (code: number) => boolean | null;
  /** Called once for every finished fight (saved to the history). */
  onEncounter?: (record: EncounterRecord) => void;
  /** Whether same-faction players are listed as nearby. Absent: they are. */
  showAllies?: () => boolean;
  /** Starts a character lookup; returns false when lookups are switched off. */
  requestLookup?: (name: string, server: number | null) => boolean;
}

interface Profile {
  name: string;
  server: number | null;
  faction: Faction | null;
  className: PlayerCard['className'];
  level: number | null;
  legion: string | null;
  gearScore: number | null;
  combatPower: number | null;
  itemLevel: number | null;
  abyssRank: number | null;
  abyssPoints: number | null;
  lookup: LookupState;
}

interface SkillTally {
  damage: number;
  hits: number;
  crits: number;
  max: number;
  casts: number;
  parry: number;
}

class PlayerTally {
  damage = 0;
  hits = 0;
  crits = 0;
  casts = 0;
  back = 0;
  front = 0;
  parry = 0;
  perfect = 0;
  double = 0;
  readonly skills = new Map<number, SkillTally>();
}

interface HitInfo {
  skill?: number;
  targetId?: number;
  back?: boolean;
  front?: boolean;
  parry?: boolean;
  perfect?: boolean;
  double?: boolean;
}

/** Packet skill codes carry a variant in the last four digits (13010240 -> 13010000 = Quick Slice). */
export const skillBase = (skill: number): number => skill - (skill % 10_000);

const newSkill = (): SkillTally => ({ damage: 0, hits: 0, crits: 0, max: 0, casts: 0, parry: 0 });

class Fight {
  readonly rows = new Map<string, PlayerTally>();
  /** Damage dealt per target entity: the biggest one is the encounter's boss. */
  readonly targets = new Map<number, number>();
  last: number;
  /** The boss went back to full HP (a wipe / reset): this attempt is over, the next hit starts a new fight. */
  closed = false;
  constructor(readonly start: number) {
    this.last = start;
  }
  private tally(name: string): PlayerTally {
    let t = this.rows.get(name);
    if (!t) this.rows.set(name, (t = new PlayerTally()));
    return t;
  }
  /** Lists a player in this fight without damage (a foe you hit who never hit back). */
  touch(name: string): void {
    this.tally(name);
  }
  add(name: string, amount: number, crit: boolean, now: number, info: HitInfo = {}): void {
    const t = this.tally(name);
    t.damage += amount;
    t.hits += 1;
    if (crit) t.crits += 1;
    if (info.back) t.back += 1;
    if (info.front) t.front += 1;
    if (info.parry) t.parry += 1;
    if (info.perfect) t.perfect += 1;
    if (info.double) t.double += 1;
    if (info.skill !== undefined) {
      const key = skillBase(info.skill);
      let sk = t.skills.get(key);
      if (!sk) t.skills.set(key, (sk = newSkill()));
      sk.damage += amount;
      sk.hits += 1;
      if (crit) sk.crits += 1;
      if (info.parry) sk.parry += 1;
      if (amount > sk.max) sk.max = amount;
    }
    if (info.targetId !== undefined) this.targets.set(info.targetId, (this.targets.get(info.targetId) ?? 0) + amount);
    this.last = now;
  }
  cast(name: string, skill: number): void {
    const t = this.tally(name);
    t.casts += 1;
    const key = skillBase(skill);
    let sk = t.skills.get(key);
    if (!sk) t.skills.set(key, (sk = newSkill()));
    sk.casts += 1;
  }
  total(): number {
    let sum = 0;
    for (const tally of this.rows.values()) sum += tally.damage;
    return sum;
  }
}

/** Turns one saved/live player row into the numbers shown in the detail window. */
export function buildDetail(row: EncounterRow, durationMs: number, title: string): PlayerDetail {
  const seconds = Math.max(1, durationMs / 1000);
  const frac = (n: number): number => (row.hits > 0 ? n / row.hits : 0);
  return {
    name: row.name,
    title,
    className: row.className,
    level: row.level,
    gearScore: row.gearScore,
    combatPower: row.combatPower,
    durationMs,
    total: row.damage,
    dps: row.damage / seconds,
    casts: row.casts,
    hits: row.hits,
    crit: frac(row.crits),
    back: frac(row.back),
    front: frac(row.front),
    parry: frac(row.parry),
    perfect: frac(row.perfect),
    double: frac(row.double),
    deaths: row.deaths,
    skills: row.skills
      .filter((sk) => sk.damage > 0 || sk.casts > 0)
      .sort((a, b) => b.damage - a.damage)
      .map((sk) => ({
        skill: sk.skill,
        name: null,
        damage: sk.damage,
        pct: row.damage > 0 ? sk.damage / row.damage : 0,
        casts: sk.casts,
        hits: sk.hits,
        critPct: sk.hits > 0 ? sk.crits / sk.hits : 0,
        max: sk.max,
        avg: sk.hits > 0 ? sk.damage / sk.hits : 0,
        parryPct: sk.hits > 0 ? sk.parry / sk.hits : 0,
      })),
  };
}

export { dayKey };

const emptyDaily = (): DailyRecord => ({
  apStart: null,
  apLast: null,
  apBanked: 0,
  apLimit: null,
  rpStart: null,
  rpLast: null,
  kills: 0,
  deaths: 0,
  assists: 0,
});

/** A map reload within this long of the last real event continues the same dungeon run. */
const RUN_GAP_MS = 45 * 60_000;

/** A target with at least this much HP counts as a boss for the history (regular mobs are far below). */
const BOSS_MIN_HP = 1_500_000;

/** Open-world NPCs (world bosses and mobs) have codes 21xxxxx; dungeon NPCs are 23xxxxx and up. */
export const isWorldNpc = (code: number): boolean => code >= 2_100_000 && code < 2_200_000;
/**
 * A fight against a living boss stays open while the boss lives, however long its mechanics last;
 * this is only a safety net for a boss that vanished without a death record (reset, left the zone).
 */
const BOSS_HOLD_MS = 15 * 60_000;

export class Engine {
  /** Set whenever persisted data (rivals, daily) changed; the host clears it after saving. */
  dirty = false;

  private selfId: number | null = null;
  private selfName: string | null = null;
  private readonly entities = new Map<number, string>();
  private readonly profiles = new Map<string, Profile>();
  private party = new Set<string>();
  /** Player records and the roster as received, kept so a restart can restore them (see EngineContext). */
  private readonly playerRecords = new Map<number, Extract<GameEvent, { t: 'player' }>>();
  private lastParty: Extract<GameEvent, { t: 'party' }> | null = null;
  /** Context changed since the host last saved it. */
  contextDirty = false;
  /** The latest party / expedition-lobby roster with ready flags. */
  private lobby: {
    title: string | null;
    leaderId: number | null;
    members: Extract<GameEvent, { t: 'party' }>['members'];
    /** Hidden once the expedition started (map load / first fight); a ready flip or a new party shows it again. */
    dismissed: boolean;
  } | null = null;
  /** Players currently in view (entity id -> name), minus self. */
  private readonly nearby = new Map<number, string>();
  /** Players who exchanged damage with my side this session: certainly enemies. */
  private readonly foes = new Set<string>();
  /** NPC code by entity id (from the spawn record), for naming bosses in the history. */
  private readonly npcCodes = new Map<number, number>();
  private mapId: number | null = null;
  private dungeonId: number | null = null;
  /** Deaths of me and my party since the last loading screen, per player. */
  private readonly runDeaths = new Map<string, number>();
  private readonly lastDeathAt = new Map<number, number>();
  private lastZoneAt = -Infinity;
  /** Map of the current run and the time of the latest event (a long silence also ends a run). */
  private runMapId: number | null = null;
  private lastEventAt = 0;
  private archived: Fight | null = null;
  private encounterSeq = 0;
  /** Latest HP / stagger of NPCs and players by entity id (from the game's HP and stagger packets). */
  private readonly hp = new Map<number, { cur: number | null; max: number | null; at: number }>();
  /** Highest HP value ever seen per entity (survives its death record; cleared on zone change). */
  private readonly hpPeak = new Map<number, number>();
  private readonly stagger = new Map<number, { max: number; rest: number; broken: boolean; at: number }>();
  /** The NPC I hit last: the closest observable thing to "my target". */
  private focus: { id: number; at: number } | null = null;
  /** Foe name -> last time they traded damage with my side; keeps them listed as nearby. */
  private readonly foeActive = new Map<string, number>();
  /** target entity id -> attacker entity id -> last hit time */
  private readonly lastHits = new Map<number, Map<number, number>>();

  private meter: Fight | null = null;
  private pvpMine: Fight | null = null;
  private pvpTheirs: Fight | null = null;
  private archivedPvp: Fight | null = null;
  private ping: { ms: number; net: number | null; late: number | null; peak: number | null; at: number } | null = null;
  /** Entities that died (players and NPCs): a dead boss no longer holds its fight open. */
  private readonly deadIds = new Set<number>();

  private target: { name: string; source: TargetSnapshot['source']; at: number } | null = null;
  /** Teleport pairing: `entityPlaced` + `mapLoad` within a few ms identify the local character. */
  private lastPlaced: { id: number; at: number } | null = null;
  private lastMapLoad = -Infinity;

  /** Your own final death, waiting for the kill record that normally names the killer. */
  private pendingDeath: { at: number; killer: string } | null = null;
  /** Player deaths I took part in, waiting for their kill record (victim entity id -> what to count if none comes). */
  private readonly pendingKills = new Map<number, { at: number; victim: string; kind: 'kill' | 'assist'; killer: string }>();
  private lastDeathLoggedAt = 0;
  private lastDeath: { at: number; killer: string | null; registered: boolean } | null = null;
  private deathDismissed = false;
  /** Last time you killed or were killed by a player: a short fight that ended this way is still worth saving. */
  private lastDuelEndAt = 0;

  constructor(private readonly opts: EngineOptions) {}

  /**
   * Some deaths arrive without a kill record we can read (seen live in the Abyss: died to a player, K/D/A stayed).
   * When the final death of yours is not followed by a record, count it against the player who hit you last.
   */
  private setLastDeath(at: number, killer: string | null, registered: boolean): void {
    // a kill record for the same death replaces the provisional entry without bringing the pop-up back
    const same = this.lastDeath !== null && at - this.lastDeath.at <= DEATH_FALLBACK_MS + 1_000;
    this.lastDeath = { at: same && this.lastDeath ? this.lastDeath.at : at, killer, registered };
    if (!same) this.deathDismissed = false;
  }

  /** Respawned (a loading screen, or you act / have HP again): the "who killed me" pop-up has done its job. */
  private checkRespawn(ev: GameEvent, now: number): void {
    const d = this.lastDeath;
    if (!d || this.deathDismissed || now - d.at < 2_000) return;
    const alive =
      ev.t === 'zone' ||
      ev.t === 'mapLoad' ||
      ev.t === 'self' ||
      (ev.t === 'cast' && ev.actor === this.selfId) ||
      (ev.t === 'damage' && ev.actor === this.selfId) ||
      (ev.t === 'hp' && ev.id === this.selfId && ev.cur !== null && ev.cur > 0);
    if (alive) this.deathDismissed = true;
  }

  dismissDeath(): void {
    this.deathDismissed = true;
  }

  deathSnapshot(now: number): DeathSnapshot | null {
    const d = this.lastDeath;
    if (!d || this.deathDismissed || now - d.at > DEATH_SHOW_MS) return null;
    const candidates =
      d.killer === null
        ? [...this.foeActive].filter(([, t]) => d.at - t <= FOE_ACTIVE_MS).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name)
        : [];
    if (d.killer === null && candidates.length === 0) return null; // a death with no player behind it (a monster, a fall)
    return { at: d.at, killer: d.killer, killerCard: d.killer ? this.card(d.killer) : null, registered: d.registered, candidates };
  }

  /** Hand-entered correction against one player: +1 kill, +1 death, or undo the last manual entry of that kind. */
  manualKda(name: string, action: KdaAction, now: number): void {
    const me = this.selfName ?? SELF_FALLBACK_NAME;
    if (action === 'undo') {
      const log = (this.opts.store.killLog ??= []);
      for (let i = log.length - 1; i >= 0; i--) {
        const k = log[i];
        if (!k || !k.manual || (k.kind === 'kill' ? k.victim : k.killer) !== name) continue;
        log.splice(i, 1);
        const day = this.opts.store.daily[dayKey(k.at)];
        const rival = this.opts.store.rivals[name];
        if (k.kind === 'kill') {
          if (day) day.kills = Math.max(0, day.kills - 1);
          if (rival) rival.wins = Math.max(0, rival.wins - 1);
        } else {
          if (day) day.deaths = Math.max(0, day.deaths - 1);
          if (rival) rival.losses = Math.max(0, rival.losses - 1);
        }
        this.dirty = true;
        return;
      }
      return;
    }
    const rival = this.rival(name, now);
    if (action === 'kill') {
      this.day(now).kills++;
      rival.wins++;
      this.logKill({ at: now, kind: 'kill', killer: me, victim: name, skill: null, manual: true });
    } else {
      this.day(now).deaths++;
      rival.losses++;
      this.logKill({ at: now, kind: 'death', killer: name, victim: me, skill: null, manual: true });
    }
    this.dirty = true;
  }

  private settlePendingKills(now: number): void {
    for (const [id, p] of this.pendingKills) {
      if (now - p.at < DEATH_FALLBACK_MS) continue;
      this.pendingKills.delete(id);
      const rival = this.rival(p.victim, p.at);
      if (p.kind === 'kill') {
        this.day(p.at).kills++;
        this.lastDuelEndAt = p.at;
        rival.wins++;
      } else {
        this.day(p.at).assists++;
        rival.assists = (rival.assists ?? 0) + 1;
      }
      this.logKill({ at: p.at, kind: p.kind, killer: p.killer, victim: p.victim, skill: null });
      this.dirty = true;
    }
  }

  private settlePendingDeath(now: number): void {
    this.settlePendingKills(now);
    const p = this.pendingDeath;
    if (!p || now - p.at < DEATH_FALLBACK_MS) return;
    this.pendingDeath = null;
    this.day(p.at).deaths++;
    this.lastDeathLoggedAt = p.at;
    this.lastDuelEndAt = p.at;
    this.setLastDeath(p.at, p.killer, true);
    this.logKill({ at: p.at, kind: 'death', killer: p.killer, victim: this.selfName ?? SELF_FALLBACK_NAME, skill: null });
    this.rival(p.killer, p.at).losses++;
    this.dirty = true;
  }

  apply(ev: GameEvent, now: number): void {
    this.settlePendingDeath(now);
    this.checkRespawn(ev, now);
    const idleBefore = now - this.lastEventAt; // how long nothing but heartbeats happened before this event
    if (ev.t !== 'heartbeat' && ev.t !== 'ping') this.lastEventAt = now;
    switch (ev.t) {
      case 'self':
        this.selfId = ev.id;
        if (ev.name) {
          this.selfName = ev.name;
          const profile = this.profile(ev.name);
          profile.server = ev.server ?? profile.server;
          profile.className = classFromCode(ev.classCode) ?? profile.className;
          profile.level = ev.level ?? profile.level;
          profile.gearScore = ev.gearScore ?? profile.gearScore;
          this.lookup(profile);
        }
        break;
      case 'player': {
        this.entities.set(ev.id, ev.name);
        this.playerRecords.set(ev.id, { t: 'player', id: ev.id, name: ev.name, classCode: ev.classCode, server: ev.server, legion: ev.legion });
        if (this.playerRecords.size > 600) this.playerRecords.delete(this.playerRecords.keys().next().value as number);
        this.contextDirty = true;
        const profile = this.profile(ev.name);
        profile.server = ev.server ?? profile.server;
        profile.className = classFromCode(ev.classCode) ?? profile.className;
        profile.legion = ev.legion ?? profile.legion;
        // ev.gearScore is NOT used: compared with the game it is another stat (Aeryn: 3783 in
        // the record vs 2873 in game). Other players' GS comes from their official profile.
        if (ev.id !== this.selfId && ev.name !== this.selfName) this.nearby.set(ev.id, ev.name);
        break;
      }
      case 'party':
        this.party = new Set(ev.members.map((m) => m.name));
        this.lastParty = ev;
        this.dungeonId = ev.dungeonId ?? this.dungeonId;
        this.contextDirty = true;
        {
          const prev = this.lobby?.members;
          let reset = !prev;
          if (prev) {
            const was = new Map(prev.map((m) => [m.name, m.ready]));
            let overlap = 0;
            for (const m of ev.members) {
              const before = was.get(m.name);
              if (before === undefined) continue;
              overlap++;
              if (before !== m.ready) reset = true; // someone (un)readied: we are in a lobby again
            }
            if (overlap === 0) reset = true; // a different party
          }
          this.lobby = {
            title: ev.title,
            leaderId: ev.leaderId,
            members: ev.members,
            dismissed: reset ? false : (this.lobby?.dismissed ?? false),
          };
        }
        for (const m of ev.members) {
          const profile = this.profile(m.name);
          profile.server = m.server;
          profile.className = classFromCode(m.classCode) ?? profile.className;
          profile.level = m.level;
          profile.gearScore = m.gearScore ?? profile.gearScore;
          profile.combatPower = m.combatPower ?? profile.combatPower;
        }
        break;
      case 'partyLeft':
        this.party.clear();
        this.lastParty = null;
        this.contextDirty = true;
        this.lobby = null;
        break;
      case 'zone':
        // entity ids are only meaningful inside one zone
        this.entities.clear();
        this.playerRecords.clear();
        this.contextDirty = true;
        this.lastHits.clear();
        this.nearby.clear();
        this.hp.clear();
        this.hpPeak.clear();
        this.stagger.clear();
        this.npcCodes.clear();
        this.deadIds.clear();
        this.focus = null;
        this.markZoneLoad(now); // a teleport: the run (and its death count) continues until the map changes
        break;
      case 'damage':
        this.onDamage(ev, now);
        break;
      case 'death':
        // K/D/A comes from the kill record; a death only cleans up the hit history
        this.countRunDeath(ev.id, ev.flag, now);
        if (ev.flag === 3) {
          // final death only: flag 1 can be a temporary state (a player down, a boss phase)
          this.deadIds.add(ev.id);
          if (this.deadIds.size > 500) this.deadIds.delete(this.deadIds.values().next().value as number);
        }
        if (ev.flag === 3 && ev.id === this.selfId && now - this.lastDeathLoggedAt > DEATH_FALLBACK_MS) {
          // the foe who hit me last (within the kill window), if any: this is a PvP death
          let killer: string | null = null;
          let at = 0;
          for (const [actorId, t] of this.lastHits.get(ev.id) ?? []) {
            const name = this.playerName(actorId);
            if (name && t > at && now - t <= KILL_WINDOW_MS) {
              killer = name;
              at = t;
            }
          }
          if (killer) this.pendingDeath = { at: now, killer };
          this.setLastDeath(now, killer, false);
        }
        if (ev.flag === 3 && ev.id !== this.selfId && this.selfId !== null) {
          // a player I hit died: count it as my kill (or assist) unless a kill record names the killer
          const victim = this.playerName(ev.id);
          const hits = this.lastHits.get(ev.id);
          const mine = hits?.get(this.selfId);
          if (victim && hits && mine !== undefined && now - mine <= KILL_WINDOW_MS && !this.isMySide(victim, ev.id)) {
            let lastId = this.selfId;
            let lastAt = mine;
            for (const [actorId, t] of hits) {
              if (t > lastAt) {
                lastAt = t;
                lastId = actorId;
              }
            }
            const iKilled = lastId === this.selfId;
            this.pendingKills.set(ev.id, {
              at: now,
              victim,
              kind: iKilled ? 'kill' : 'assist',
              killer: iKilled ? (this.selfName ?? SELF_FALLBACK_NAME) : (this.playerName(lastId) ?? '?'),
            });
          }
        }
        if (ev.flag === 3) {
          this.lastHits.delete(ev.id);
          if (this.focus?.id === ev.id) this.focus = null;
          this.hp.delete(ev.id);
          this.stagger.delete(ev.id);
        }
        else if (ev.flag === 7) this.nearby.delete(ev.id); // left view / the world
        break;
      case 'kill':
        this.onKill(ev, now);
        break;
      case 'mobKill':
        this.countRunDeath(ev.target, 1, now); // a monster killed one of ours (or a stranger: filtered by side)
        break;
      case 'hp': {
        const prev = this.hp.get(ev.id);
        const nextCur = ev.cur ?? prev?.cur ?? null;
        // A boss that was hurt and is suddenly back at full HP has reset (wipe): that attempt is finished.
        const peak = Math.max(this.hpPeak.get(ev.id) ?? 0, ev.max ?? 0);
        if (
          this.meter &&
          !this.meter.closed &&
          this.meter.targets.has(ev.id) &&
          this.isBossEntity(ev.id, peak) &&
          peak > 0 &&
          prev?.cur != null &&
          nextCur !== null &&
          prev.cur <= peak * 0.9 &&
          nextCur >= peak * 0.98
        ) {
          this.meter.closed = true;
        }
        this.hp.set(ev.id, { cur: nextCur, max: ev.max ?? prev?.max ?? null, at: now });
        // Most HP frames carry only the current value: the highest one seen stands in for the max.
        const seen = Math.max(ev.cur ?? 0, ev.max ?? 0);
        if (seen > (this.hpPeak.get(ev.id) ?? 0)) {
          this.hpPeak.set(ev.id, seen);
          if (this.hpPeak.size > HP_KEEP * 4) this.hpPeak.delete(this.hpPeak.keys().next().value as number);
        }
        if (this.hp.size > HP_KEEP) this.pruneHp(now);
        break;
      }
      case 'stagger':
        this.stagger.set(ev.id, { max: ev.max, rest: ev.rest, broken: ev.broken, at: now });
        break;
      case 'abyssPoints':
        this.onAbyssPoints(ev.points, ev.limit, now);
        break;
      // Recorded for diagnostics only. Pairing `entityPlaced` with a map load to guess the local
      // character proved wrong: Abyss Logs' capture of a teleport shows `47 36` carrying another
      // player's id. Only the identity packet (33 36) sets the local character.
      case 'mapLoad':
        this.lastMapLoad = now;
        this.mapId = ev.mapId;
        // A dungeon reloads its map after a wipe and between bosses: that is still the same run, so the
        // death count carries on. Only a different map, or a long gap, starts a new run.
        if (this.runMapId !== ev.mapId || idleBefore > RUN_GAP_MS) this.startRun(now);
        else this.markZoneLoad(now);
        this.runMapId = ev.mapId;
        if (this.lobby) this.lobby.dismissed = true; // loading screen: the expedition is starting
        break;
      case 'npc':
        this.npcCodes.set(ev.id, ev.code);
        if (this.npcCodes.size > 800) this.npcCodes.delete(this.npcCodes.keys().next().value as number);
        break;
      case 'cast': {
        // my side's casts feed the per-skill Casts column
        const name = this.playerName(ev.actor);
        if (name && this.meter && this.isMySide(name, ev.actor)) this.meter.cast(name, ev.skill);
        break;
      }
      case 'entityPlaced':
        this.lastPlaced = { id: ev.id, at: now };
        break;
      case 'heartbeat':
        break;
      case 'ping':
        this.ping = { ms: ev.ms, net: ev.net, late: ev.late, peak: ev.peak, at: now };
        break;
    }
  }

  /** The real delay and its parts in ms; all null when no estimate arrived recently. */
  pingSnapshot(now: number): PingSnapshot {
    if (!this.ping || now - this.ping.at > 10_000) return { ms: null, net: null, late: null, peak: null };
    return { ms: this.ping.ms, net: this.ping.net, late: this.ping.late, peak: this.ping.peak };
  }


  applyLookup(name: string, result: LookupResult | 'notfound' | 'error' | 'busy', now: number): void {
    const profile = this.profile(name);
    if (result === 'busy') {
      profile.lookup = 'idle'; // queue was full: retried on a later snapshot
      return;
    }
    if (result === 'notfound' || result === 'error') {
      profile.lookup = result;
      return;
    }
    profile.lookup = 'ok';
    profile.faction = result.faction ?? profile.faction;
    profile.server = profile.server ?? result.server ?? null;
    profile.combatPower = result.combatPower ?? profile.combatPower;
    profile.itemLevel = result.itemLevel ?? profile.itemLevel;
    // The game's "GS" is the profile's item level; own GS stays the identity packet's value.
    if (name !== this.selfName && result.itemLevel != null) profile.gearScore = result.itemLevel;
    profile.abyssRank = result.abyssRank;
    profile.abyssPoints = result.abyssPoints;
    profile.className = profile.className ?? result.className;
    profile.level = profile.level ?? result.level;
    profile.legion = profile.legion ?? result.legion;
    if (name === this.selfName && result.abyssPoints !== null) {
      const day = this.day(now);
      day.rpStart ??= result.abyssPoints;
      day.rpLast = result.abyssPoints;
      this.dirty = true;
    }
  }

  get selfCharacter(): { name: string; server: number | null } | null {
    return this.selfName ? { name: this.selfName, server: this.profile(this.selfName).server } : null;
  }

  /** Diagnostics for the discovery log: what the engine believes right now. */
  debugState(now: number): string {
    const meter = this.meterSnapshot(now);
    return [
      `selfId=${this.selfId ?? '-'}`,
      `selfName=${this.selfName ?? '-'}`,
      `knownPlayers=${this.entities.size}`,
      `party=${this.party.size}`,
      `meterRows=${meter.rows.length}`,
      `meterTotal=${meter.total}`,
      `nearby=${this.nearby.size}`,
    ].join(' ');
  }

  exportContext(): EngineContext {
    return { players: [...this.playerRecords.values()], party: this.lastParty };
  }

  /** Replays saved records as if they had just arrived (same connection, app restarted). */
  restoreContext(ctx: EngineContext, now: number): void {
    for (const rec of ctx.players) this.apply(rec, now);
    if (ctx.party) this.apply(ctx.party, now);
    this.contextDirty = false;
  }

  resetMeter(): void {
    this.meter = null;
  }

  /** Clears the current player fight. Today's K/D/A is kept: it only starts over on a new day. */
  resetPvp(): void {
    this.pvpMine = null;
    this.pvpTheirs = null;
  }

  // --- event handlers -------------------------------------------------------------

  private playerName(id: number): string | null {
    if (id === this.selfId) return this.selfName ?? SELF_FALLBACK_NAME;
    return this.entities.get(id) ?? null;
  }

  private isMySide(name: string, id: number): boolean {
    return id === this.selfId || this.party.has(name);
  }

  private onDamage(ev: Extract<GameEvent, { t: 'damage' }>, now: number): void {
    const { actor: actorId, target: targetId, amount, crit } = ev;
    const info: HitInfo = { skill: ev.skill, targetId, back: ev.back, front: ev.front, parry: ev.parry, perfect: ev.perfect, double: ev.double };
    // Until the local player is known, "my side" is unknown: counting would present
    // strangers' damage as ours (seen live when the app started after the world was loaded).
    if (this.selfId === null) return;
    const actor = this.playerName(actorId);
    if (!actor) {
      // Mobs' damage is not tracked, except what lands on you while a player fight is on: someone we never got a
      // record for may be hitting you, and leaving it out makes the fight look one-sided.
      const mine = this.pvpMine;
      const theirs = this.pvpTheirs;
      if (targetId === this.selfId && mine && theirs && now - Math.max(mine.last, theirs.last) <= PVP_IDLE_MS) {
        theirs.add(UNKNOWN_SOURCE, amount, crit, now, info);
      }
      return;
    }
    const target = this.playerName(targetId);

    if (!target) {
      const include = this.selfId === null || this.isMySide(actor, actorId);
      if (!include) return;
      const held = this.meter ? this.heldBoss(this.meter) : null;
      const idle = this.meter ? now - this.meter.last : Infinity;
      // A fight against a living boss survives long pauses (phases, untargetable moments); hitting a
      // different target after the normal idle time starts a new fight instead of merging into it.
      if (!this.meter || idle > this.idleLimit(this.meter) || (held !== null && idle > this.opts.fightIdleMs() && targetId !== held)) {
        this.meter = new Fight(now);
        if (this.lobby) this.lobby.dismissed = true; // a fight means the lobby phase is over
      }
      this.meter.add(actor, amount, crit, now, info);
      if (actorId === this.selfId) this.focus = { id: targetId, at: now };
      return;
    }

    if (this.selfId === null) return; // sides are unknown until we know who we are
    const actorMine = this.isMySide(actor, actorId);
    const targetMine = this.isMySide(target, targetId);
    if (actorMine === targetMine) return; // duel inside the party, or two strangers
    const foe = actorMine ? target : actor;
    this.foes.add(foe);
    this.foeActive.set(foe, now);

    let hits = this.lastHits.get(targetId);
    if (!hits) this.lastHits.set(targetId, (hits = new Map()));
    hits.set(actorId, now);

    const pvpIdle = !this.pvpMine || !this.pvpTheirs || this.pvpMine === this.archivedPvp || now - Math.max(this.pvpMine.last, this.pvpTheirs.last) > PVP_IDLE_MS;
    if (pvpIdle) {
      this.pvpMine = new Fight(now);
      this.pvpTheirs = new Fight(now);
    }

    if (actorMine) {
      (this.pvpMine as Fight).add(actor, amount, crit, now, info);
      (this.pvpTheirs as Fight).touch(target); // the opponent shows up (and is saved) even if they never hit back
      if (actorId === this.selfId) {
        this.rival(target, now).dealt += amount;
        this.target = { name: target, source: 'attacked', at: now };
        this.lookup(this.profile(target));
      }
    } else {
      (this.pvpTheirs as Fight).add(actor, amount, crit, now, info);
      if (targetId === this.selfId) {
        this.rival(actor, now).taken += amount;
        if (!this.target || this.target.source === 'attackedBy' || now - this.target.at > TARGET_HOLD_MS) {
          this.target = { name: actor, source: 'attackedBy', at: now };
        }
        this.lookup(this.profile(actor));
      }
    }
  }

  /** K/D/A from the kill record (who killed whom), not from guessing the last hit. */
  private onKill(ev: Extract<GameEvent, { t: 'kill' }>, now: number): void {
    if (this.selfId === null) return;
    const hits = this.lastHits.get(ev.target);
    this.lastHits.delete(ev.target);
    this.pendingKills.delete(ev.target);

    if (ev.target === this.selfId) {
      // I died to another player
      if (ev.killerId === this.selfId) return;
      const killer = this.profile(ev.killerName);
      killer.server = ev.killerServer;
      this.foes.add(ev.killerName);
      this.foeActive.set(ev.killerName, now);
      this.pendingDeath = null;
      this.lastDeathLoggedAt = now;
      this.setLastDeath(now, ev.killerName, true);
      this.lastDuelEndAt = now;
      this.day(now).deaths++;
      this.logKill({ at: now, kind: 'death', killer: ev.killerName, victim: this.selfName ?? SELF_FALLBACK_NAME, skill: ev.skill > 0 ? ev.skill : null });
      this.rival(ev.killerName, now).losses++;
      this.dirty = true;
      return;
    }

    // Is the victim a player? Known from its record, or from PvP damage seen on it.
    const victim = this.playerName(ev.target);
    if (!victim) return;
    const iKilled = ev.killerId === this.selfId;
    const myHitAt = hits?.get(this.selfId);
    if (iKilled) {
      this.day(now).kills++;
      this.lastDuelEndAt = now;
      this.logKill({ at: now, kind: 'kill', killer: this.selfName ?? SELF_FALLBACK_NAME, victim, skill: ev.skill > 0 ? ev.skill : null });
      this.rival(victim, now).wins++;
    } else if (myHitAt !== undefined && now - myHitAt <= KILL_WINDOW_MS && !this.isMySide(victim, ev.target)) {
      this.day(now).assists++;
      const rival = this.rival(victim, now);
      rival.assists = (rival.assists ?? 0) + 1;
      this.logKill({ at: now, kind: 'assist', killer: ev.killerName, victim, skill: ev.skill > 0 ? ev.skill : null });
    } else {
      return;
    }
    this.dirty = true;
  }

  private onAbyssPoints(points: number, limit: number, now: number): void {
    const day = this.day(now);
    if (day.apStart === null || day.apLast === null) {
      day.apStart = points;
    } else if (points < day.apLast) {
      // weekly counter reset: bank what was earned before it
      day.apBanked += day.apLast - day.apStart;
      day.apStart = points;
    }
    day.apLast = points;
    day.apLimit = limit;
    this.dirty = true;
  }

  // --- state helpers --------------------------------------------------------------

  private profile(name: string): Profile {
    let profile = this.profiles.get(name);
    if (!profile) {
      profile = {
        name,
        server: null,
        faction: null,
        className: null,
        level: null,
        legion: null,
        gearScore: null,
        combatPower: null,
        itemLevel: null,
        abyssRank: null,
        abyssPoints: null,
        lookup: this.opts.requestLookup ? 'idle' : 'off',
      };
      this.profiles.set(name, profile);
    }
    return profile;
  }

  private lookup(profile: Profile): void {
    if (!this.opts.requestLookup || profile.lookup !== 'idle') return;
    // set first: the host may answer synchronously from its cache
    profile.lookup = 'loading';
    if (!this.opts.requestLookup(profile.name, profile.server)) profile.lookup = 'off';
  }

  private rival(name: string, now: number): RivalRecord {
    const rivals = this.opts.store.rivals;
    let record = rivals[name];
    if (!record) record = rivals[name] = { wins: 0, losses: 0, dealt: 0, taken: 0, encounters: 0, lastSeen: 0 };
    if (now - record.lastSeen > ENCOUNTER_GAP_MS) record.encounters++;
    record.lastSeen = now;
    this.dirty = true;
    return record;
  }

  private logKill(entry: KillEntry): void {
    const log = (this.opts.store.killLog ??= []);
    log.push(entry);
    if (log.length > KILL_LOG_MAX) log.splice(0, log.length - KILL_LOG_MAX);
    this.dirty = true;
  }

  private day(now: number): DailyRecord {
    const key = dayKey(now);
    const daily = this.opts.store.daily;
    let record = daily[key];
    if (!record) {
      record = daily[key] = emptyDaily();
      const keys = Object.keys(daily).sort();
      for (const old of keys.slice(0, Math.max(0, keys.length - DAILY_KEEP_DAYS))) delete daily[old];
    }
    return record;
  }

  private card(name: string): PlayerCard {
    const p = this.profile(name);
    return {
      name: p.name,
      server: p.server,
      faction: factionFromServer(p.server) ?? p.faction,
      className: p.className,
      level: p.level,
      legion: p.legion,
      gearScore: p.gearScore,
      combatPower: p.combatPower,
      itemLevel: p.itemLevel,
      abyssRank: p.abyssRank,
      abyssPoints: p.abyssPoints,
      lookup: p.lookup,
    };
  }

  // --- snapshots ------------------------------------------------------------------

  private isSelfName(name: string): boolean {
    return name === (this.selfName ?? SELF_FALLBACK_NAME) && this.selfId !== null;
  }

  private rows(fight: Fight, seconds: number, withRecord: boolean): PvpRow[] {
    const total = fight.total();
    return [...fight.rows.entries()]
      .sort((a, b) => b[1].damage - a[1].damage)
      .map(([name, tally]) => ({
        card: this.card(name),
        isSelf: this.isSelfName(name),
        damage: tally.damage,
        dps: tally.damage / seconds,
        share: total > 0 ? tally.damage / total : 0,
        record: withRecord ? (this.opts.store.rivals[name] ?? null) : null,
      }));
  }

  private startRun(now: number): void {
    this.runDeaths.clear();
    this.markZoneLoad(now);
  }

  /** A loading screen: the "dead on arrival" records it sends must not count as deaths. */
  private markZoneLoad(now: number): void {
    this.lastDeathAt.clear();
    this.lastZoneAt = now;
  }

  /** Counts a death of me or a party member (not mobs); loading-screen leftovers and repeats are ignored. */
  private countRunDeath(id: number, flag: number, now: number): void {
    if (flag !== 1 && flag !== 3) return;
    if (now - this.lastZoneAt < 3000) return; // "dead on arrival" records sent at zone load
    const name = this.playerName(id);
    if (!name || !this.isMySide(name, id)) return;
    if (now - (this.lastDeathAt.get(id) ?? -Infinity) < 5000) return;
    this.lastDeathAt.set(id, now);
    this.runDeaths.set(name, (this.runDeaths.get(name) ?? 0) + 1);
  }

  /** The boss a fight is held open for: its top target while that target is a living, big-HP NPC. */
  private heldBoss(fight: Fight): number | null {
    let top: number | null = null;
    let best = -1;
    for (const [id, dmg] of fight.targets) {
      if (dmg > best) {
        top = id;
        best = dmg;
      }
    }
    if (top === null || this.deadIds.has(top)) return null;
    const hp = this.hp.get(top);
    if (!hp || !this.isBossEntity(top, this.hpPeak.get(top) ?? hp.max ?? 0)) return null;
    return hp.cur === null || hp.cur > 0 ? top : null;
  }

  /** A boss by the catalog when it knows the NPC, otherwise by its HP pool. */
  private isBossEntity(id: number, hpPeak: number): boolean {
    const code = this.npcCodes.get(id);
    const known = code !== undefined ? (this.opts.npcBoss?.(code) ?? null) : null;
    return known ?? hpPeak >= BOSS_MIN_HP;
  }

  /** How long a fight may go without damage before it counts as finished. */
  private idleLimit(fight: Fight): number {
    if (fight.closed) return 0;
    const base = this.opts.fightIdleMs();
    return this.heldBoss(fight) !== null ? Math.max(base, BOSS_HOLD_MS) : base;
  }

  private deathsTotal(): number {
    let n = 0;
    for (const v of this.runDeaths.values()) n += v;
    return n;
  }

  /** Archives a finished fight once (call about once a second). */
  pollHistory(now: number): void {
    this.pollBossHistory(now);
    this.pollPvpHistory(now);
  }

  private pollPvpHistory(now: number): void {
    const mine = this.pvpMine;
    const theirs = this.pvpTheirs;
    if (!mine || !theirs || mine === this.archivedPvp) return;
    const last = Math.max(mine.last, theirs.last);
    const ended = this.lastDuelEndAt >= mine.start;
    if (now - last <= (ended ? PVP_DONE_MS : PVP_IDLE_MS)) return;
    this.archivedPvp = mine;
    const durationMs = Math.max(1, last - mine.start);
    const total = mine.total();
    const theirsTotal = theirs.total();
    if (total + theirsTotal < 500 || (durationMs < 3000 && this.lastDuelEndAt < mine.start) || !this.opts.onEncounter) return;
    this.encounterSeq++;
    this.opts.onEncounter({
      id: `${mine.start}-pvp-${this.encounterSeq}`,
      kind: 'pvp',
      startedAt: mine.start,
      durationMs,
      total,
      theirsTotal,
      npcCode: null,
      npcMaxHp: null,
      mapId: this.mapId,
      dungeonId: this.dungeonId,
      rows: [...this.encounterRows(mine, 'mine'), ...this.encounterRows(theirs, 'theirs')],
    });
  }

  private pollBossHistory(now: number): void {
    const fight = this.meter;
    if (!fight || fight === this.archived) return;
    if (now - fight.last <= this.idleLimit(fight)) return;
    this.archived = fight;
    const durationMs = Math.max(1, fight.last - fight.start);
    const total = fight.total();
    if (total < 500 || durationMs < 3000 || !this.opts.onEncounter) return;
    let bossId: number | null = null;
    let best = -1;
    for (const [id, dmg] of fight.targets) {
      if (dmg > best) {
        bossId = id;
        best = dmg;
      }
    }
    const maxHp = bossId !== null ? (this.hp.get(bossId)?.max ?? this.hpPeak.get(bossId) ?? null) : null;
    if (this.opts.bossOnly?.() === true) {
      // bosses only: by the catalog when it knows the NPC, otherwise the top target has a large HP pool
      // (when the HP frame was never seen, a big fight stands in)
      const code = bossId !== null ? this.npcCodes.get(bossId) : undefined;
      const known = code !== undefined ? (this.opts.npcBoss?.(code) ?? null) : null;
      const isBoss = known ?? (maxHp !== null ? maxHp >= BOSS_MIN_HP : total >= BOSS_MIN_HP);
      if (!isBoss) return;
    }
    this.encounterSeq++;
    this.opts.onEncounter({
      id: `${fight.start}-${this.encounterSeq}`,
      startedAt: fight.start,
      durationMs,
      total,
      npcCode: bossId !== null ? (this.npcCodes.get(bossId) ?? null) : null,
      npcMaxHp: maxHp,
      mapId: this.mapId,
      dungeonId: this.fightDungeon(bossId !== null ? this.npcCodes.get(bossId) : undefined),
      rows: this.encounterRows(fight),
    });
  }

  /**
   * The dungeon a fight belongs to. The roster's dungeon id goes stale once the party is outside an
   * instance (world bosses were filed under the last dungeon), so: an open-world NPC (code 21xxxxx)
   * or a map the catalog knows is not a dungeon means "none"; a dungeon map is the dungeon itself.
   */
  private fightDungeon(npcCode: number | undefined): number | null {
    if (npcCode !== undefined && isWorldNpc(npcCode)) return null;
    if (this.mapId !== null) {
      const known = this.opts.knownDungeon?.(this.mapId) ?? null;
      if (known === true) return this.mapId;
      if (known === false) return null;
    }
    return this.dungeonId;
  }

  private encounterRows(fight: Fight, side?: 'mine' | 'theirs'): EncounterRow[] {
    return [...fight.rows.entries()]
      .sort((a, b) => b[1].damage - a[1].damage)
      .map(([name, t]) => {
        const card = this.card(name);
        return {
          name,
          ...(side ? { side } : {}),
          className: card.className,
          level: card.level,
          gearScore: card.gearScore,
          combatPower: card.combatPower,
          isSelf: this.isSelfName(name),
          damage: t.damage,
          hits: t.hits,
          crits: t.crits,
          casts: t.casts,
          back: t.back,
          front: t.front,
          parry: t.parry,
          perfect: t.perfect,
          double: t.double,
          deaths: this.runDeaths.get(name) ?? 0,
          skills: [...t.skills.entries()].map(([skill, sk]) => ({ skill, ...sk })),
        };
      });
  }

  /** Live per-skill detail of one player in the current fight. */
  livePvpDetail(name: string, now: number): PlayerDetail | null {
    const mine = this.pvpMine;
    const theirs = this.pvpTheirs;
    if (!mine || !theirs) return null;
    const last = Math.max(mine.last, theirs.last);
    const active = now - last <= PVP_IDLE_MS;
    const durationMs = Math.max(1000, (active ? now : last) - mine.start);
    const row = [...this.encounterRows(mine, 'mine'), ...this.encounterRows(theirs, 'theirs')].find((r) => r.name === name);
    return row ? buildDetail(row, durationMs, 'PvP') : null;
  }

  liveDetail(name: string, now: number): PlayerDetail | null {
    const fight = this.meter;
    if (!fight || !fight.rows.has(name)) return null;
    const active = now - fight.last <= this.idleLimit(fight);
    const durationMs = Math.max(1000, (active ? now : fight.last) - fight.start);
    const row = this.encounterRows(fight).find((r) => r.name === name);
    return row ? buildDetail(row, durationMs, 'Obecna walka') : null;
  }

  private pruneHp(now: number): void {
    const held = this.meter ? this.heldBoss(this.meter) : null; // a boss in a long mechanic sends no HP frames
    for (const [id, v] of this.hp) if (now - v.at > 5 * 60_000 && this.focus?.id !== id && held !== id) this.hp.delete(id);
    for (const [id, v] of this.stagger) if (now - v.at > 5 * 60_000) this.stagger.delete(id);
  }

  private focusSnapshot(now: number, groupDps: number, partyDps = 0): FocusSnapshot | null {
    // The NPC you hit last; while a boss fight runs, the boss itself even through a long mechanic.
    const fresh = this.focus && now - this.focus.at <= FOCUS_MS ? this.focus.id : null;
    const held = this.meter && now - this.meter.last <= this.idleLimit(this.meter) ? this.heldBoss(this.meter) : null;
    const id = held ?? fresh;
    if (id === null) return null;
    const hp = this.hp.get(id);
    const cur = hp?.cur ?? null;
    // most HP frames carry only the current value: the highest seen stands in for the max
    const peak = this.hpPeak.get(id) ?? null;
    const max = hp?.max ?? (peak !== null && peak > 0 ? peak : null);
    const st = this.stagger.get(id);
    const code = this.npcCodes.get(id) ?? null;
    return {
      id,
      code,
      name: code !== null ? (this.opts.npcName?.(code) ?? null) : null,
      partyDps,
      hpCur: cur,
      hpMax: max,
      hpPct: cur !== null && max !== null && max > 0 ? Math.min(1, cur / max) : null,
      ttkSec: cur !== null && cur > 0 && groupDps > 0 ? cur / groupDps : null,
      stagger: st ? { pct: st.max > 0 ? st.rest / st.max : 0, broken: st.broken } : null,
    };
  }

  meterSnapshot(now: number): MeterSnapshot {
    const fight = this.meter;
    if (!fight) return { active: false, durationMs: 0, total: 0, rows: [], focus: this.focusSnapshot(now, 0), deaths: this.deathsTotal() };
    const active = now - fight.last <= this.idleLimit(fight);
    const durationMs = Math.max(1000, (active ? now : fight.last) - fight.start);
    const seconds = durationMs / 1000;
    const total = fight.total();
    const rows = [...fight.rows.entries()]
      .sort((a, b) => b[1].damage - a[1].damage)
      .map(([name, tally]) => ({
        card: this.card(name),
        isSelf: this.isSelfName(name),
        damage: tally.damage,
        dps: tally.damage / seconds,
        share: total > 0 ? tally.damage / total : 0,
        critRate: tally.hits > 0 ? tally.crits / tally.hits : 0,
        deaths: this.runDeaths.get(name) ?? 0,
      }));
    const groupDps = active ? total / seconds : 0;
    return { active, durationMs, total, rows, focus: this.focusSnapshot(now, groupDps, total / seconds), deaths: this.deathsTotal() };
  }

  pvpSnapshot(now: number): PvpSnapshot {
    // K/D/A of today, saved with the daily statistics: survives restarts and starts over on a new day
    const today = this.opts.store.daily[dayKey(now)] ?? emptyDaily();
    const todayKey = dayKey(now);
    const feed = (this.opts.store.killLog ?? []).filter((k) => dayKey(k.at) === todayKey).slice(-PVP_FEED_SHOWN).reverse();
    const base = { kills: today.kills, deaths: today.deaths, assists: today.assists, feed };
    const mine = this.pvpMine;
    const theirs = this.pvpTheirs;
    if (!mine || !theirs) {
      return { ...base, active: false, durationMs: 0, mine: [], theirs: [], mineTotal: 0, theirsTotal: 0 };
    }
    const last = Math.max(mine.last, theirs.last);
    const active = now - last <= PVP_IDLE_MS;
    const durationMs = Math.max(1000, (active ? now : last) - mine.start);
    const seconds = durationMs / 1000;
    return {
      ...base,
      active,
      durationMs,
      mine: this.rows(mine, seconds, false),
      theirs: this.rows(theirs, seconds, true),
      mineTotal: mine.total(),
      theirsTotal: theirs.total(),
    };
  }

  targetSnapshot(): TargetSnapshot | null {
    if (!this.target) return null;
    return {
      card: this.card(this.target.name),
      record: this.opts.store.rivals[this.target.name] ?? null,
      source: this.target.source,
    };
  }

  nearbySnapshot(now: number): NearbyRow[] {
    const selfServer = this.selfName ? this.profile(this.selfName).server : null;
    const attackingName =
      this.target && this.target.source === 'attacked' && now - this.target.at <= ATTACKING_MS ? this.target.name : null;
    const showAllies = this.opts.showAllies?.() ?? true;
    const rows: NearbyRow[] = [];
    // In view (spawn records) plus foes active in the last minute: a player who left view and
    // came back is not always re-announced, but they are clearly still around if fighting us.
    const names = new Set(this.nearby.values());
    for (const [name, at] of this.foeActive) {
      if (now - at <= FOE_ACTIVE_MS) names.add(name);
      else this.foeActive.delete(name);
    }
    for (const name of names) {
      if (this.party.has(name)) continue;
      const card = this.card(name);
      const fought = this.foes.has(name) || this.opts.store.rivals[name] !== undefined;
      // Servers are mixed (Elyos fight Elyos), so the home server decides, not the faction:
      // another server = enemy. Faction is only the fallback when a server is unknown.
      const enemy = fought
        ? true
        : card.server !== null && selfServer !== null
          ? card.server !== selfServer
          : null;
      // unknown server: the profile lookup returns it, which settles it
      if (enemy === null) this.lookup(this.profile(name));
      // only confirmed enemies, unless allies are switched on (the attacked player always shows)
      if (enemy !== true && !showAllies && name !== attackingName) continue;
      rows.push({ card, enemy, attacking: name === attackingName, record: this.opts.store.rivals[name] ?? null });
    }
    const rank = (r: NearbyRow): number => (r.attacking ? 0 : r.enemy === true ? 1 : r.enemy === null ? 2 : 3);
    rows.sort((a, b) => rank(a) - rank(b) || (b.card.combatPower ?? 0) - (a.card.combatPower ?? 0));
    const shown = rows.slice(0, NEARBY_SHOWN);
    // only players worth knowing about are looked up (friendly ones are skipped)
    for (const row of shown) if (row.enemy !== false) this.lookup(this.profile(row.card.name));
    return shown.map((row) => ({ ...row, card: this.card(row.card.name) }));
  }

  lobbySnapshot(): LobbySnapshot | null {
    if (!this.lobby || this.lobby.dismissed || this.lobby.members.length === 0) return null;
    const { title, leaderId, members } = this.lobby;
    const rows = members.map((m) => ({
      card: this.card(m.name),
      isSelf: this.isSelfName(m.name),
      leader: leaderId !== null ? m.characterId === leaderId : m.slot === 1,
      ready: m.ready,
      slot: m.slot,
    }));
    rows.sort((a, b) => a.slot - b.slot);
    return { title, members: rows, readyCount: rows.filter((r) => r.ready || r.leader).length };
  }

  /** The card of a player the engine knows (null when it has never seen the name). */
  cardFor(name: string): PlayerCard | null {
    return this.profiles.has(name) ? this.card(name) : null;
  }

  selfSnapshot(): PlayerCard | null {
    return this.selfName ? this.card(this.selfName) : null;
  }

  dailySnapshot(now: number): DailySnapshot {
    const date = dayKey(now);
    const day = this.opts.store.daily[date] ?? emptyDaily();
    const self = this.selfName ? this.profile(this.selfName) : null;
    return {
      date,
      apGained: day.apStart !== null && day.apLast !== null ? day.apBanked + day.apLast - day.apStart : null,
      apWeek: day.apLast !== null && day.apLimit !== null ? { points: day.apLast, limit: day.apLimit } : null,
      rankPointsGained: day.rpStart !== null && day.rpLast !== null ? day.rpLast - day.rpStart : null,
      rankPoints: day.rpLast,
      abyssRank: self?.abyssRank ?? null,
      kills: day.kills,
      deaths: day.deaths,
      assists: day.assists,
    };
  }
}
