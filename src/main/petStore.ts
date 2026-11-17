import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { emptyPetStore, type PetStoreData } from '@core/pets/petBook';

/** The pet collection per character, saved next to the other app data (pets.json). Nothing is uploaded. */

const profileSchema = z.object({
  pets: z.record(z.string(), z.object({ rank: z.number().int().min(0).max(3).nullable(), souls: z.number().int().min(0).nullable() })),
  pins: z.array(z.number().int()).max(8),
  syncedAt: z.number().nullable(),
});

const fileSchema = z.object({ version: z.literal(1), profiles: z.record(z.string(), profileSchema) });

export function loadPetStore(userData: string, persist: boolean): { data: PetStoreData; file: string } {
  const file = join(userData, 'pets.json');
  if (!persist || !existsSync(file)) return { data: emptyPetStore(), file };
  try {
    const parsed = fileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    const profiles: PetStoreData['profiles'] = {};
    for (const [name, p] of Object.entries(parsed.profiles)) {
      profiles[name] = {
        pets: Object.fromEntries(Object.entries(p.pets).map(([id, v]) => [Number(id), v])),
        pins: p.pins,
        syncedAt: p.syncedAt,
      };
    }
    return { data: { version: 1, profiles }, file };
  } catch (err) {
    console.error(`[pets] could not read ${file}: ${(err as Error).message}`);
    return { data: emptyPetStore(), file };
  }
}

export function savePetStore(file: string, data: PetStoreData): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data), 'utf8');
    renameSync(tmp, file); // atomic replace
  } catch (err) {
    console.error(`[pets] save failed (${file}): ${(err as Error).message}`);
  }
}
