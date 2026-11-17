import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Optional local catalog of NPC and dungeon names (`npc-catalog.json` in the user-data folder).
 * The game itself only sends numeric NPC codes, never names, so without this file bosses show up
 * as "NPC #code" until you name them by hand. The file is data you supply; the app never
 * downloads one and does not ship one.
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

export type NpcInfo = z.infer<typeof npcEntry>;
export type DungeonInfo = z.infer<typeof dungeonEntry>;

export class NpcCatalog {
  private data: z.infer<typeof catalogSchema> = { npcs: {}, dungeons: {} };

  constructor(private readonly dir: string) {
    this.reload();
  }

  /** Re-reads the file (after an import). */
  reload(): void {
    const file = join(this.dir, 'npc-catalog.json');
    this.data = { npcs: {}, dungeons: {} };
    if (!existsSync(file)) return;
    try {
      this.data = catalogSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
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
