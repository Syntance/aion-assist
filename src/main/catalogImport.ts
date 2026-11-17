import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Builds `npc-catalog.json` from the NPC / dungeon tables that the Abyss Logs app has embedded in its
 * own program file. It is a read-only file read on the user's request (Settings -> Data and privacy);
 * nothing is downloaded, nothing touches the game, and the result stays in the user-data folder.
 */

export interface CatalogNpc {
  name: string;
  boss?: boolean;
  dungeonId?: number;
  tier?: string;
  category?: string;
}
export interface CatalogDungeon {
  name: string;
  tier?: string;
  category?: string;
}
export interface CatalogFile {
  npcs: Record<string, CatalogNpc>;
  dungeons: Record<string, CatalogDungeon>;
}

const ENTRY = /"(\d{5,9})":\s*\{\s*("name":\s*"(?:[^"\\]|\\.)*"[^{}]*)\}/gs;

/**
 * `text` is the program file read as latin1 (one char per byte), so UTF-8 sequences survive. The app
 * embeds one table per language; the first plain-ASCII name per code (English) is kept and the
 * mangled '?' names of other scripts are skipped.
 */
export function extractCatalog(text: string): CatalogFile {
  const npcs: Record<string, CatalogNpc> = {};
  const dungeons: Record<string, CatalogDungeon> = {};
  for (const m of text.matchAll(ENTRY)) {
    const code = m[1];
    const body = m[2];
    if (code === undefined || body === undefined) continue;
    let parsed: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(`{${Buffer.from(body, 'latin1').toString('utf8')}}`);
      if (typeof value !== 'object' || value === null) continue;
      parsed = Object.fromEntries(Object.entries(value));
    } catch {
      continue;
    }
    const name = parsed.name;
    if (typeof name !== 'string' || name.includes('?') || !/^[\x20-\x7E]+$/.test(name)) continue;
    const tier = typeof parsed.tier === 'string' && parsed.tier ? parsed.tier : undefined;
    const category = typeof parsed.category === 'string' && parsed.category ? parsed.category : undefined;
    if ('requiredItemLevel' in parsed) {
      if (dungeons[code] === undefined) dungeons[code] = { name, ...(tier ? { tier } : {}), ...(category ? { category } : {}) };
      continue;
    }
    if (npcs[code] !== undefined) continue;
    npcs[code] = {
      name,
      ...(typeof parsed.isBoss === 'boolean' ? { boss: parsed.isBoss } : {}),
      ...(typeof parsed.dungeonId === 'number' ? { dungeonId: parsed.dungeonId } : {}),
      ...(tier ? { tier } : {}),
      ...(category ? { category } : {}),
    };
  }
  return { npcs, dungeons };
}

export interface ImportResult {
  ok: boolean;
  message: string;
}

/** Where the Abyss Logs program normally lives. */
function abyssProgramPath(): string | null {
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  const file = join(local, 'Programs', 'Abyss DPS Meter', 'AbyssDPSMeter.exe');
  return existsSync(file) ? file : null;
}

export function importCatalogFromAbyss(userDataDir: string): ImportResult {
  const program = abyssProgramPath();
  if (!program) return { ok: false, message: 'Nie znaleziono zainstalowanego Abyss Logs (…\\Programs\\Abyss DPS Meter).' };
  try {
    const catalog = extractCatalog(readFileSync(program).toString('latin1'));
    const npcCount = Object.keys(catalog.npcs).length;
    if (npcCount === 0) return { ok: false, message: 'W pliku Abyss Logs nie znalazłem tabeli NPC (inna wersja programu?).' };
    const target = join(userDataDir, 'npc-catalog.json');
    writeFileSync(`${target}.tmp`, JSON.stringify(catalog), 'utf8');
    renameSync(`${target}.tmp`, target);
    const bosses = Object.values(catalog.npcs).filter((n) => n.boss === true).length;
    return { ok: true, message: `Zaimportowano ${npcCount} NPC (w tym ${bosses} bossów) i ${Object.keys(catalog.dungeons).length} instancji.` };
  } catch (err) {
    return { ok: false, message: `Import nie powiódł się: ${(err as Error).message}` };
  }
}
