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

const fileSchema = z.object({
  settings: settingsSchema.catch(DEFAULT_SETTINGS),
  rivals: z.record(z.string(), rivalSchema).catch({}),
  daily: z.record(z.string(), dailySchema).catch({}),
  killLog: z.array(killSchema).catch([]),
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
    const fresh = (): AppData => ({ settings: structuredClone(DEFAULT_SETTINGS), rivals: {}, daily: {}, killLog: [] });
    if (!this.persist || !existsSync(this.file)) return fresh();
    try {
      return fileSchema.parse(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch (err) {
      console.warn(`[store] ${this.file} is unreadable, starting fresh: ${(err as Error).message}`);
      return fresh();
    }
  }

  save(): void {
    if (!this.persist) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data), 'utf8');
      renameSync(tmp, this.file); // atomic replace: a crash never leaves a half-written file
    } catch (err) {
      console.error(`[store] save failed: ${(err as Error).message}`);
    }
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
