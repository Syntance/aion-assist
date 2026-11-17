import { z } from 'zod';
import type { LookupResult } from '@core/engine/engine';
import { classFromCode, type Settings } from '@shared/types';

/**
 * Character lookup on the official AION 2 site (the same public JSON the character
 * page itself loads). Read-only GETs, no login, throttled to one request per second and
 * cached, so the traffic looks like a person opening a few character pages.
 * Can be switched off entirely in settings ("armoryLookup").
 */

const SEARCH_URL = 'https://api-search.plaync.com/aion2global/search/v2/character';
const INFO_URL = 'https://aion2.plaync.com/api/character/info';
const EQUIPMENT_URL = 'https://aion2.plaync.com/api/character/equipment';
const TIMEOUT_MS = 10_000;
const SPACING_MS = 1_000;
const CACHE_MS = 30 * 60_000;
const MAX_QUEUE = 20;

const searchSchema = z.object({
  list: z
    .array(
      z.object({
        characterId: z.string(),
        name: z.string(),
        serverId: z.coerce.number(),
        race: z.coerce.number().nullish().catch(null),
      }),
    )
    .default([]),
});

const numberish = z.coerce.number().nullish().catch(null);

const infoSchema = z.object({
  profile: z.object({
    combatPower: numberish,
    itemLevel: numberish,
    characterLevel: numberish,
    pcId: numberish,
    guildName: z.string().nullish().catch(null),
    legionName: z.string().nullish().catch(null),
  }),
  // The gear score shown in game ("i" window) is stat "ItemLevel"; profile.itemLevel is empty
  // (verified 2026-11-12: Aeryn @ Kasaka -> ItemLevel 2873, CP 187184, same as in game).
  stat: z
    .object({
      statList: z
        .array(z.object({ type: z.string().nullish().catch(null), value: numberish }))
        .default([]),
    })
    .nullish()
    .catch(null),
  ranking: z
    .object({
      rankingList: z
        .array(
          z.object({
            rankingContentsName: z.string().nullish().catch(null),
            rank: numberish,
            point: numberish,
          }),
        )
        .default([]),
    })
    .nullish()
    .catch(null),
});

type Outcome = LookupResult | 'notfound' | 'error' | 'busy';

interface Job {
  name: string;
  server: number | null;
  region: Settings['region'];
  done: (outcome: Outcome) => void;
}

const stripTags = (text: string): string => text.replace(/<[^>]*>/g, '');

async function getJson(url: URL): Promise<unknown | 'notfound'> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'AionAssist/0.1 (personal overlay; character lookup)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  });
  if (res.status === 404) return 'notfound';
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

interface Found {
  characterId: string;
  serverId: number;
  race?: number | null | undefined;
}

async function findCharacter(job: { name: string; server: number | null; region: Settings['region'] }): Promise<Found | 'notfound'> {
  const search = new URL(SEARCH_URL);
  search.searchParams.set('keyword', job.name);
  if (job.server !== null) search.searchParams.set('serverId', String(job.server));
  search.searchParams.set('page', '1');
  search.searchParams.set('size', '40');
  search.searchParams.set('region', job.region);
  search.searchParams.set('localeInfo', 'en-US');
  const found = await getJson(search);
  if (found === 'notfound') return 'notfound';
  const hits = searchSchema.parse(found).list.filter((c) => stripTags(c.name) === job.name);
  const hit = hits.find((c) => c.serverId === job.server) ?? (hits.length === 1 ? hits[0] : undefined);
  return hit ?? 'notfound';
}

const equipmentSchema = z.object({
  skill: z
    .object({ skillList: z.array(z.object({ id: z.coerce.number(), name: z.string() })).default([]) })
    .nullish()
    .catch(null),
});

/** Skill id -> name of one character (the official site lists them with the same base ids the packets carry). */
async function fetchSkillNames(job: { name: string; server: number | null; region: Settings['region'] }): Promise<Map<number, string> | null> {
  const hit = await findCharacter(job);
  if (hit === 'notfound') return null;
  const url = new URL(EQUIPMENT_URL);
  url.searchParams.set('region', job.region);
  url.searchParams.set('lang', 'en-US');
  url.searchParams.set('characterId', decodeURIComponent(hit.characterId));
  url.searchParams.set('serverId', String(hit.serverId));
  const raw = await getJson(url);
  if (raw === 'notfound') return null;
  const list = equipmentSchema.parse(raw).skill?.skillList ?? [];
  return new Map(list.map((sk) => [sk.id, stripTags(sk.name)]));
}

async function fetchCharacter(job: Job): Promise<Outcome> {
  const hit = await findCharacter(job);
  if (hit === 'notfound') return 'notfound';

  const info = new URL(INFO_URL);
  info.searchParams.set('region', job.region);
  info.searchParams.set('lang', 'en-US');
  info.searchParams.set('characterId', decodeURIComponent(hit.characterId));
  info.searchParams.set('serverId', String(hit.serverId));
  const raw = await getJson(info);
  if (raw === 'notfound') return 'notfound';
  const data = infoSchema.parse(raw);
  const abyss = data.ranking?.rankingList.find((r) => /abyss|어비스/i.test(r.rankingContentsName ?? ''));
  return {
    combatPower: data.profile.combatPower ?? null,
    itemLevel: data.profile.itemLevel ?? data.stat?.statList.find((s) => s.type === 'ItemLevel')?.value ?? null,
    abyssRank: abyss?.rank ?? null,
    abyssPoints: abyss?.point ?? null,
    className: classFromCode(data.profile.pcId),
    level: data.profile.characterLevel ?? null,
    legion: data.profile.legionName ?? data.profile.guildName ?? null,
    faction: hit.race === 1 ? 'elyos' : hit.race === 2 ? 'asmodian' : null,
    server: hit.serverId,
  };
}

export class Armory {
  private readonly queue: (() => Promise<void>)[] = [];
  private readonly cache = new Map<string, { at: number; outcome: Outcome }>();
  private readonly skillsAsked = new Set<string>();
  private running = false;

  lookup(
    name: string,
    server: number | null,
    region: Settings['region'],
    done: (outcome: Outcome) => void,
    force = false,
  ): void {
    const cached = this.cache.get(name);
    if (!force && cached && Date.now() - cached.at < CACHE_MS) {
      done(cached.outcome);
      return;
    }
    if (this.queue.length >= MAX_QUEUE) {
      done('busy'); // not cached: the engine retries later
      return;
    }
    const job: Job = { name, server, region, done };
    this.queue.push(async () => {
      let outcome: Outcome;
      try {
        outcome = await fetchCharacter(job);
      } catch (err) {
        console.warn(`[armory] ${job.name}: ${(err as Error).message}`);
        outcome = 'error';
      }
      // failures are cached too, so a blocked endpoint is not hammered
      this.cache.set(job.name, { at: Date.now(), outcome });
      job.done(outcome);
    });
    void this.drain();
  }

  /** Skill names of a character, fetched once per character per session. */
  skills(name: string, server: number | null, region: Settings['region'], done: (names: Map<number, string>) => void): void {
    const key = `${name}@${server ?? '?'}`;
    if (this.skillsAsked.has(key) || this.queue.length >= MAX_QUEUE) return;
    this.skillsAsked.add(key);
    this.queue.push(async () => {
      try {
        const names = await fetchSkillNames({ name, server, region });
        if (names && names.size > 0) done(names);
      } catch (err) {
        console.warn(`[armory] skills ${name}: ${(err as Error).message}`);
      }
    });
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    for (let job = this.queue.shift(); job; job = this.queue.shift()) {
      await job();
      await new Promise((resolve) => setTimeout(resolve, SPACING_MS));
    }
    this.running = false;
  }
}
