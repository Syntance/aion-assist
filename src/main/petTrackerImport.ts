import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Reads the saved pet profiles of the standalone PetTracker app (%LOCALAPPDATA%\PetTracker\profiles), if installed. */

export interface ImportedProfile {
  character: string;
  pets: { id: number; rank: number; souls: number | null }[];
}

interface RawPet {
  Id?: unknown;
  Level?: unknown;
  Souls?: unknown;
  EstimatedSouls?: unknown;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export function readPetTrackerProfiles(localAppData: string | undefined): ImportedProfile[] {
  if (!localAppData) return [];
  const dir = join(localAppData, 'PetTracker', 'profiles');
  if (!existsSync(dir)) return [];
  const out: ImportedProfile[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const text = readFileSync(join(dir, file), 'utf8');
      const raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as { CharacterName?: unknown; Pets?: Record<string, RawPet> };
      if (typeof raw.CharacterName !== 'string' || !raw.CharacterName || !raw.Pets || typeof raw.Pets !== 'object') continue;
      const pets: ImportedProfile['pets'] = [];
      for (const p of Object.values(raw.Pets)) {
        if (!isInt(p.Id) || !isInt(p.Level) || p.Level < 0 || p.Level > 3) continue;
        const souls = isInt(p.EstimatedSouls) ? p.EstimatedSouls : isInt(p.Souls) ? p.Souls : null;
        pets.push({ id: p.Id, rank: p.Level, souls });
      }
      if (pets.length > 0) out.push({ character: raw.CharacterName, pets });
    } catch {
      // an unreadable or foreign file is simply not a profile
    }
  }
  return out;
}
