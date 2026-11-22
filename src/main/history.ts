import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { dayKey } from '@shared/day';
import { dpsSeconds } from '@shared/dps';
import { UNKNOWN_SOURCE } from '@shared/opponents';
import type { EncounterRecord, EncounterSummary, HistoryData, NameKind, NamesData, RunSummary } from '@shared/types';

/**
 * Saved dungeon / boss history and the user-editable name dictionary, both plain JSON files
 * in the user-data folder. Nothing is uploaded.
 */

const MAX_RUNS = 25;
const MAX_ENCOUNTERS = 60;
const MAX_PVP = 400;
const RUN_GAP_MS = 45 * 60_000;

interface Run {
  id: string;
  startedAt: number;
  endedAt: number;
  mapId: number | null;
  dungeonId: number | null;
  encounters: EncounterRecord[];
}

function writeJson(file: string, data: unknown): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data), 'utf8');
    renameSync(tmp, file); // atomic replace
  } catch (err) {
    console.error(`[history] save failed (${file}): ${(err as Error).message}`);
  }
}

const dict = z.record(z.string(), z.string()).default({});
const namesSchema = z.object({ skills: dict, npcs: dict, maps: dict, dungeons: dict });

export class NamesStore {
  private data: NamesData = { skills: {}, npcs: {}, maps: {}, dungeons: {} };
  private readonly file: string;
  dirty = false;

  constructor(
    dir: string,
    private readonly persist = true,
  ) {
    this.file = join(dir, 'names.json');
    if (persist && existsSync(this.file)) {
      try {
        this.data = namesSchema.parse(JSON.parse(readFileSync(this.file, 'utf8')));
      } catch (err) {
        console.warn(`[history] names.json is unreadable, starting empty: ${(err as Error).message}`);
      }
    }
  }

  get(): NamesData {
    return this.data;
  }

  set(kind: NameKind, key: string, name: string): void {
    const clean = name.trim().slice(0, 60);
    if (clean) this.data[kind][key] = clean;
    else delete this.data[kind][key];
    this.dirty = true;
  }

  /** Adds names without overwriting ones the user typed. */
  merge(kind: NameKind, names: Map<number, string>): void {
    for (const [id, name] of names) {
      const key = String(id);
      if (this.data[kind][key] === undefined) {
        this.data[kind][key] = name;
        this.dirty = true;
      }
    }
  }

  save(): void {
    if (!this.persist || !this.dirty) return;
    this.dirty = false;
    writeJson(this.file, this.data);
  }
}

export class HistoryStore {
  private runs: Run[] = [];
  private pvp: EncounterRecord[] = [];
  private readonly file: string;
  dirty = false;

  constructor(
    dir: string,
    private readonly persist = true,
  ) {
    this.file = join(dir, 'history.json');
    if (persist && existsSync(this.file)) {
      try {
        const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
        const pvp = (raw as { pvp?: unknown }).pvp;
        if (Array.isArray(pvp)) {
          this.pvp = pvp.filter((r): r is EncounterRecord => typeof r === 'object' && r !== null && Array.isArray((r as EncounterRecord).rows) && typeof (r as EncounterRecord).id === 'string');
        }
        const runs = (raw as { runs?: unknown }).runs;
        if (Array.isArray(runs)) {
          this.runs = runs.filter(
            (r): r is Run => typeof r === 'object' && r !== null && Array.isArray((r as Run).encounters) && typeof (r as Run).id === 'string',
          );
        }
      } catch (err) {
        console.warn(`[history] history.json is unreadable, starting empty: ${(err as Error).message}`);
      }
    }
  }

  add(rec: EncounterRecord): void {
    if (rec.kind === 'pvp') {
      this.pvp.push(rec);
      if (this.pvp.length > MAX_PVP) this.pvp.shift();
      this.dirty = true;
      return;
    }
    const last = this.runs.at(-1);
    const sameRun =
      last !== undefined &&
      last.mapId === rec.mapId &&
      last.dungeonId === rec.dungeonId &&
      rec.startedAt - last.endedAt < RUN_GAP_MS;
    const end = rec.startedAt + rec.durationMs;
    if (sameRun && last) {
      last.encounters.push(rec);
      last.endedAt = end;
      if (last.encounters.length > MAX_ENCOUNTERS) last.encounters.shift();
    } else {
      this.runs.push({ id: `run-${rec.startedAt}`, startedAt: rec.startedAt, endedAt: end, mapId: rec.mapId, dungeonId: rec.dungeonId, encounters: [rec] });
      if (this.runs.length > MAX_RUNS) this.runs.shift();
    }
    this.dirty = true;
  }

  private summarize(rec: EncounterRecord): EncounterSummary {
    const top = rec.rows[0];
    return {
      id: rec.id,
      startedAt: rec.startedAt,
      durationMs: rec.durationMs,
      total: rec.total,
      npcCode: rec.npcCode,
      npcMaxHp: rec.npcMaxHp,
      players: rec.rows.length,
      top: top ? { name: top.name, dps: top.damage / dpsSeconds(rec.durationMs, top.joinedMs, top.lastMs) } : null,
      ...(rec.kind === 'pvp'
        ? { theirsTotal: rec.theirsTotal ?? 0, opponents: rec.rows.filter((r) => r.side === 'theirs' && r.name !== UNKNOWN_SOURCE).map((r) => r.name) }
        : {}),
    };
  }

  /**
   * Fixes fights saved with a stale dungeon id (world bosses filed under the last dungeon): a fight whose
   * boss is an open-world NPC, or whose map the catalog says is no dungeon, has no dungeon.
   * Returns whether anything changed.
   */
  normalize(isWorldNpc: (code: number) => boolean, knownDungeon: (mapId: number) => boolean | null): boolean {
    let changed = false;
    for (const run of this.runs) {
      for (const enc of run.encounters) {
        const world = (enc.npcCode !== null && isWorldNpc(enc.npcCode)) || (enc.mapId !== null && knownDungeon(enc.mapId) === false);
        if (world && enc.dungeonId !== null) {
          enc.dungeonId = null;
          changed = true;
        }
      }
      if (run.encounters.length > 0 && run.encounters.every((e) => e.dungeonId === null) && run.dungeonId !== null) {
        run.dungeonId = null;
        changed = true;
      }
    }
    if (changed) this.dirty = true;
    return changed;
  }

  deleteEncounter(id: string): void {
    this.pvp = this.pvp.filter((e) => e.id !== id);
    for (const run of this.runs) run.encounters = run.encounters.filter((e) => e.id !== id);
    this.runs = this.runs.filter((r) => r.encounters.length > 0);
    this.dirty = true;
  }

  /** Removes every PvP fight that started on the given local day ("2026-11-16"). */
  deletePvpDay(day: string): void {
    this.pvp = this.pvp.filter((e) => dayKey(e.startedAt) !== day);
    this.dirty = true;
  }

  deleteRun(id: string): void {
    this.runs = this.runs.filter((r) => r.id !== id);
    this.dirty = true;
  }

  data(names: NamesData, daily: HistoryData['daily'] = {}, kills: HistoryData['kills'] = [], rivals: HistoryData['rivals'] = {}): HistoryData {
    const runs: RunSummary[] = this.runs
      .map((r) => ({
        id: r.id,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        mapId: r.mapId,
        dungeonId: r.dungeonId,
        total: r.encounters.reduce((n, e) => n + e.total, 0),
        durationMs: r.encounters.reduce((n, e) => n + e.durationMs, 0),
        players: new Set(r.encounters.flatMap((e) => e.rows.map((row) => row.name))).size,
        encounters: r.encounters.map((e) => this.summarize(e)).reverse(),
      }))
      .reverse();
    return { daily, kills, runs, pvp: this.pvp.map((e) => this.summarize(e)).reverse(), names, rivals };
  }

  encounter(id: string): EncounterRecord | null {
    const pvp = this.pvp.find((e) => e.id === id);
    if (pvp) return pvp;
    for (const run of this.runs) {
      const found = run.encounters.find((e) => e.id === id);
      if (found) return found;
    }
    return null;
  }

  save(): void {
    if (!this.persist || !this.dirty) return;
    this.dirty = false;
    writeJson(this.file, { runs: this.runs, pvp: this.pvp });
  }
}
