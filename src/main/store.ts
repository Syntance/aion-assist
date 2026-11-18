import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { EngineStore } from '@core/engine/engine';
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@shared/types';

/** Everything the app persists: one local JSON file in the user-data folder. Nothing is uploaded. */

const rivalSchema = z.object({
  wins: z.number(),
  losses: z.number(),
  dealt: z.number(),
  taken: z.number(),
  encounters: z.number(),
  lastSeen: z.number(),
  assists: z.number().optional(),
});

const dailySchema = z.object({
  apStart: z.number().nullable(),
  apLast: z.number().nullable(),
  apBanked: z.number(),
  apLimit: z.number().nullable(),
  rpStart: z.number().nullable(),
  rpLast: z.number().nullable(),
  kills: z.number(),
  deaths: z.number(),
  assists: z.number(),
});

const killSchema = z.object({
  at: z.number(),
  kind: z.enum(['kill', 'death', 'assist']),
  killer: z.string(),
  victim: z.string(),
  skill: z.number().nullable(),
  manual: z.boolean().optional(),
});

/**
 * Keeps every setting that is still valid. A single bad or missing value (after an update changed a setting's shape)
 * must not reset all the others to their defaults.
 */
export function salvageSettings(raw: unknown): Settings {
  const full = settingsSchema.safeParse(raw);
  if (full.success) return full.data;
  const src = typeof raw === 'object' && raw !== null ? new Map(Object.entries(raw)) : new Map<string, unknown>();
  const out: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const schema = settingsSchema.shape[key as keyof typeof settingsSchema.shape];
    const parsed = schema.safeParse(src.get(key));
    out[key] = parsed.success ? parsed.data : fallback;
    if (key === 'panels' && !parsed.success) {
      // one broken window layout keeps the others
      const savedPanels = src.get('panels');
      const panelMap = typeof savedPanels === 'object' && savedPanels !== null ? new Map(Object.entries(savedPanels)) : new Map<string, unknown>();
      const panels: Record<string, unknown> = {};
      for (const [id, def] of Object.entries(DEFAULT_SETTINGS.panels)) {
        const one = settingsSchema.shape.panels.shape[id as keyof typeof settingsSchema.shape.panels.shape].safeParse(panelMap.get(id));
        panels[id] = one.success ? one.data : def;
      }
      out[key] = panels;
    }
  }
  const merged = settingsSchema.safeParse(out);
  return merged.success ? merged.data : structuredClone(DEFAULT_SETTINGS);
}

const fileSchema = z.object({
  settings: z.unknown().transform((v) => salvageSettings(v)),
  rivals: z.record(z.string(), rivalSchema).catch({}),
  daily: z.record(z.string(), dailySchema).catch({}),
  killLog: z.array(killSchema).catch([]),
  odyle: z.record(z.string(), z.object({ basic: z.number(), charged: z.number(), at: z.number() })).catch({}),
  maxHp: z.record(z.string(), z.number()).catch({}),
  lastSelf: z.string().optional().catch(undefined),
});

export interface AppData extends EngineStore {
  settings: Settings;
}

export class Store {
  readonly data: AppData;
  private readonly file: string;

  /** `persist: false` (demo mode) keeps everything in memory so fake data never reaches disk. */
  constructor(
    userDataDir: string,
    private readonly persist = true,
  ) {
    this.file = join(userDataDir, 'aion-assist.json');
    this.data = this.read();
  }

  private read(): AppData {
    const fresh = (): AppData => ({ settings: structuredClone(DEFAULT_SETTINGS), rivals: {}, daily: {}, killLog: [], odyle: {}, maxHp: {} });
    if (!this.persist || !existsSync(this.file)) return fresh();
    try {
      const data = fileSchema.parse(JSON.parse(readFileSync(this.file, 'utf8')));
      this.lastSaved = JSON.stringify(data);
      return data;
    } catch (err) {
      console.warn(`[store] ${this.file} is unreadable, starting fresh: ${(err as Error).message}`);
      try {
        renameSync(this.file, `${this.file}.corrupt-${Date.now()}`); // keep the old file instead of overwriting it
      } catch {
        // nothing to keep
      }
      return fresh();
    }
  }

  /** The JSON last written (or read), to tell whether anything changed since. */
  private lastSaved = '';
  private timer: NodeJS.Timeout | null = null;

  save(): void {
    if (!this.persist) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const text = JSON.stringify(this.data);
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, text, 'utf8');
      renameSync(tmp, this.file); // atomic replace: a crash never leaves a half-written file
      this.lastSaved = text;
    } catch (err) {
      console.error(`[store] save failed: ${(err as Error).message}`);
    }
  }

  /** Saves a moment from now (a burst of changes, e.g. dragging a slider, becomes one write). */
  saveSoon(delayMs = 400): void {
    if (!this.persist || this.timer) return;
    this.timer = setTimeout(() => this.save(), delayMs);
  }

  /** Saves only when something changed since the last write: a safety net for changes nobody flagged. */
  saveIfChanged(): void {
    if (!this.persist) return;
    if (JSON.stringify(this.data) !== this.lastSaved) this.save();
  }
}

const identitySchema = z.object({
  flow: z.string().min(1),
  id: z.number().int().min(1),
  name: z.string().min(1).max(32),
  server: z.number().nullable(),
  classCode: z.number().nullable(),
  level: z.number().nullable(),
  gearScore: z.number().optional(),
});
export type SavedIdentity = z.infer<typeof identitySchema>;

/**
 * The game only announces the local character on world entry / map load. Entity ids stay
 * valid for as long as the same TCP connection lives, so the last identity is saved with
 * that connection and restored when the app restarts mid-session.
 */
export function readIdentity(userDataDir: string): SavedIdentity | null {
  const file = join(userDataDir, 'identity.json');
  if (!existsSync(file)) return null;
  try {
    return identitySchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

export function writeIdentity(userDataDir: string, identity: SavedIdentity): void {
  try {
    writeFileSync(join(userDataDir, 'identity.json'), JSON.stringify(identity), 'utf8');
  } catch (err) {
    console.error(`[store] identity save failed: ${(err as Error).message}`);
  }
}

const memberSchema = z.object({
  name: z.string(),
  server: z.number(),
  characterId: z.number(),
  classCode: z.number(),
  level: z.number(),
  gearScore: z.number().nullable(),
  combatPower: z.number().nullable(),
  ready: z.boolean(),
  slot: z.number(),
});
const contextSchema = z.object({
  flow: z.string().min(1),
  players: z
    .array(
      z.object({
        t: z.literal('player'),
        id: z.number(),
        name: z.string(),
        classCode: z.number().nullable(),
        server: z.number().nullable(),
        legion: z.string().nullable(),
      }),
    )
    .max(700),
  party: z
    .object({
      t: z.literal('party'),
      title: z.string().nullable(),
      leaderId: z.number().nullable(),
      members: z.array(memberSchema).max(24),
    })
    .nullable(),
  npcs: z.array(z.object({ id: z.number(), code: z.number() })).max(800).default([]),
});
export type SavedContext = z.infer<typeof contextSchema>;

/** Player records and the roster, saved with the game connection so a restart keeps DPS attribution. */
export function readContext(userDataDir: string): SavedContext | null {
  const file = join(userDataDir, 'context.json');
  if (!existsSync(file)) return null;
  try {
    return contextSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

export function writeContext(userDataDir: string, ctx: SavedContext): void {
  try {
    writeFileSync(join(userDataDir, 'context.json'), JSON.stringify(ctx), 'utf8');
  } catch (err) {
    console.error(`[store] context save failed: ${(err as Error).message}`);
  }
}

const opcodeFileSchema = z.record(z.string(), z.string());

/** Optional `opcodes.json` next to the data file: { "damage": "04 38", ... }. */
export function readOpcodeOverrides(userDataDir: string): Record<string, string> | null {
  const file = join(userDataDir, 'opcodes.json');
  if (!existsSync(file)) return null;
  try {
    return opcodeFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch (err) {
    console.warn(`[store] ignoring invalid opcodes.json: ${(err as Error).message}`);
    return null;
  }
}
