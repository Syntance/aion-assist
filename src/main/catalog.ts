import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Catalog of NPC and dungeon names. The game itself only sends numeric NPC codes, never names, so the app carries a
 * built-in table (from the open-source Aion2DPSMeter, GPL-3.0) and lets a local `npc-catalog.json` in the user-data folder
 * (the optional import from Abyss Logs) add to it or override it. Nothing is downloaded.
 */

const npcEntry = z.object({
  name: z.string(),
  boss: z.boolean().optional(),
  dungeonId: z.number().optional(),
  tier: z.string().optional(),
  category: z.string().optional(),
});
const dungeonEntry = z.object({ name: z.string(), tier: z.string().optional(), category: z.string().optional() });
const catalogSchema = z.object({
  npcs: z.record(z.string(), npcEntry).default({}),
  dungeons: z.record(z.string(), dungeonEntry).default({}),
});

export type CatalogData = z.infer<typeof catalogSchema>;
export type NpcInfo = z.infer<typeof npcEntry>;
export type DungeonInfo = z.infer<typeof dungeonEntry>;

export class NpcCatalog {
  private data: z.infer<typeof catalogSchema> = { npcs: {}, dungeons: {} };

  constructor(
    private readonly dir: string,
    private readonly seed: CatalogData = { npcs: {}, dungeons: {} },
  ) {
    this.reload();
  }

  /** Re-reads the file (after an import). */
  reload(): void {
    const file = join(this.dir, 'npc-catalog.json');
    this.data = { npcs: { ...this.seed.npcs }, dungeons: { ...this.seed.dungeons } };
    if (!existsSync(file)) return;
    try {
      const local = catalogSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      // the user's file adds to the built-in table and wins where both have an entry (it carries instance difficulty tiers)
      this.data = { npcs: { ...this.data.npcs, ...local.npcs }, dungeons: { ...this.data.dungeons, ...local.dungeons } };
    } catch (err) {
      console.warn(`[catalog] npc-catalog.json is unreadable, ignoring it: ${(err as Error).message}`);
    }
  }

  get size(): number {
    return Object.keys(this.data.npcs).length;
  }

  npc(code: number): NpcInfo | null {
    return this.data.npcs[String(code)] ?? null;
  }

  dungeon(id: number): DungeonInfo | null {
    return this.data.dungeons[String(id)] ?? null;
  }
}
