import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WHOLE_MAP, fitPoints, nearestPoint, panBy, span, toScreen, zoomAt, type MapPoint, type MapView } from '@shared/mapView';
import { compareToMax, soulsToMax, toMaxKey, type PetRow } from '@shared/pets';
import type { SpawnRegion } from '../data/petMaps';
import { FAMILIES, FamilyChip, PetPortrait, familyColor } from './PetIcon';

/**
 * Spawn map of pets on every map the game has pets on (the four world maps and the Abyss maps), drawn on the game's own world map
 * pictures: pan with the mouse, zoom with the wheel, hover a dot for the mob and the pet. Dots are coloured by pet family and can be
 * filtered by family (and hidden for pets already at MAX), or narrowed to one pet. They are static spawn points, not live mobs and not
 * your position.
 */

interface SpawnData {
  regions: SpawnRegion[];
  npcNames: Record<number, string>;
}
let spawnData: Promise<SpawnData> | null = null;
/** The spawn tables are big, so they load the first time a map or the finder needs them. */
export const loadSpawns = (): Promise<SpawnData> => (spawnData ??= import('../data/petMaps').then((m) => ({ regions: m.PET_MAP_REGIONS, npcNames: m.PET_MAP_NPC_NAMES })));

/** The "whole map" framing of a region: the box around all its spawns (its tiles when it has none), since the pictures have wide margins. */
function homeCorners(r: SpawnRegion): MapPoint[] {
  if (r.points.length > 0) {
    let left = 1;
    let top = 1;
    let right = 0;
    let bottom = 0;
    for (const p of r.points) {
      left = Math.min(left, p[2]);
      right = Math.max(right, p[2]);
      top = Math.min(top, p[3]);
      bottom = Math.max(bottom, p[3]);
    }
    return [
      { x: left, y: top },
      { x: right, y: bottom },
    ];
  }
  if (r.tiles.length === 0) return [];
  const cols = r.tiles.map((t) => t[0]);
  const rows = r.tiles.map((t) => t[1]);
  return [
    { x: Math.min(...cols) / r.grid, y: Math.min(...rows) / r.grid },
    { x: (Math.max(...cols) + 1) / r.grid, y: (Math.max(...rows) + 1) / r.grid },
  ];
}

const tileUrls = import.meta.glob<string>('../assets/maps/*/*.webp', { eager: true, query: '?url', import: 'default' });
const tileUrl = (region: string, col: number, row: number): string | undefined => tileUrls[`../assets/maps/${region}/${col}_${row}.webp`];

/** Pet ids that have at least one spawn point on a bundled map. */
export function petsWithMap(data: SpawnData): Set<number> {
  const ids = new Set<number>();
  for (const r of data.regions) for (const p of r.points) ids.add(p[0]);
  return ids;
}

const GROUPS: { id: SpawnRegion['group']; label: string }[] = [
  { id: 'world', label: 'Świat' },
  { id: 'abyss', label: 'Abyss' },
];

/** The paper colour of the map pictures' edges, so the space around a zoomed-out map blends into it. */
const PAPER = '#d8cfbd';
const INK = 'rgba(32,22,12,0.92)';

interface Dot {
  x: number;
  y: number;
  npc: number;
  pet: number;
  color: string;
}

/** How many pets the "closest to MAX" list of a map shows. */
const CLOSEST_LIST = 60;

const STORE_KEY = 'aion-assist.petmap';
interface Saved {
  families: string[];
  onlyOpen: boolean;
}
function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Saved>;
      return {
        families: Array.isArray(v.families) ? v.families.filter((f): f is string => typeof f === 'string') : [...FAMILIES],
        onlyOpen: v.onlyOpen !== false,
      };
    }
  } catch {
    /* storage can be unavailable */
  }
  return { families: [...FAMILIES], onlyOpen: true };
}

const progress = (p: PetRow): string => (p.rank === 3 ? 'MAX' : p.souls !== null && p.goal !== null ? `${p.souls} / ${p.goal}` : '—');

const ctl = 'grid size-[30px] place-items-center text-ink-dim transition-colors hover:bg-row hover:text-ink focus-visible:bg-row focus-visible:text-ink';

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function PetMapWindow({
  pet,
  onPick,
  onClose,
}: {
  pet: { id: number; name: string } | null;
  onPick: (pet: { id: number; name: string } | null) => void;
  onClose: () => void;
}) {
  const [allPets, setAllPets] = useState<PetRow[]>([]);
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const families = useMemo(() => new Set(saved.families), [saved.families]);
  const update = (next: Saved): void => {
    setSaved(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* storage can be unavailable */
    }
  };
  const [data, setData] = useState<SpawnData | null>(null);
  const [regionKey, setRegionKey] = useState<string | null>(null);
  const [view, setView] = useState<MapView>(WHOLE_MAP);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(0); // bumps when a tile image finishes loading
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const images = useRef(new Map<string, HTMLImageElement>());

  useEffect(() => {
    let alive = true;
    void loadSpawns().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  // the collection (ranks change as souls come in), for filtering, colouring and the picker
  useEffect(() => {
    let alive = true;
    const load = (): void => void window.overlay.getPets().then((all) => alive && setAllPets(all));
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const byId = useMemo(() => new Map(allPets.map((p) => [p.id, p])), [allPets]);
  const mapIds = useMemo(() => (data ? petsWithMap(data) : new Set<number>()), [data]);
  /** Pets that have a spawn on a map, the ones closest to MAX first (the picker lists them by family in this order). */
  const choices = useMemo(() => allPets.filter((p) => mapIds.has(p.id)).sort((a, b) => compareToMax(a, b) || a.name.localeCompare(b.name)), [allPets, mapIds]);

  /** Does this pet's spawn get a dot: the one chosen pet, or any pet of a shown family (not MAX when those are hidden). */
  const wanted = useCallback(
    (id: number): boolean => {
      if (pet) return id === pet.id;
      const p = byId.get(id);
      return p !== undefined && families.has(p.family) && !(saved.onlyOpen && p.rank === 3);
    },
    [pet, byId, families, saved.onlyOpen],
  );

  const regions = useMemo(() => (data ? data.regions : []), [data]);
  const countIn = useCallback((r: { points: readonly (readonly number[])[] }): number => r.points.filter((p) => wanted(p[0])).length, [wanted]);
  const region = regions.find((r) => r.key === regionKey) ?? regions.slice().sort((a, b) => countIn(b) - countIn(a))[0] ?? null;
  // drawn from the farthest from MAX to the closest, so where dots overlap the pets nearest to MAX end up on top
  const dots = useMemo<Dot[]>(() => {
    if (!region) return [];
    const key = (id: number): number => {
      const p = byId.get(id);
      return p ? toMaxKey(p) : 3_000_000;
    };
    return region.points
      .filter((p) => wanted(p[0]))
      .map((p) => ({ pet: p[0], npc: p[1], x: p[2], y: p[3], color: familyColor(byId.get(p[0])?.family ?? '') }))
      .sort((a, b) => key(b.pet) - key(a.pet));
  }, [region, wanted, byId]);
  /** The pets with spawns on this map that the filters leave in, closest to MAX first (independent of the one chosen pet, so you can switch). */
  const closest = useMemo<PetRow[]>(() => {
    if (!region) return [];
    const ids = new Set(region.points.map((p) => p[0]));
    return [...ids]
      .map((id) => byId.get(id))
      .filter((p): p is PetRow => p !== undefined && families.has(p.family) && !(saved.onlyOpen && p.rank === 3))
      .sort((a, b) => compareToMax(a, b) || a.name.localeCompare(b.name));
  }, [region, byId, families, saved.onlyOpen]);
  /** Dots per family over all maps, for the legend (MAX pets left out when hidden). */
  const perFamily = useMemo(() => {
    const out: Record<string, number> = {};
    if (!data) return out;
    for (const r of data.regions) {
      for (const p of r.points) {
        const info = byId.get(p[0]);
        if (!info || (saved.onlyOpen && info.rank === 3)) continue;
        out[info.family] = (out[info.family] ?? 0) + 1;
      }
    }
    return out;
  }, [data, byId, saved.onlyOpen]);

  // keep the canvas sized to its box
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }));
    ro.observe(el);
    setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  // frame the spawns when the pet, the filters or the region change
  const regionId = region?.key ?? '';
  const sized = size.w > 0;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dotsRef = useRef(dots);
  dotsRef.current = dots;
  const home = useMemo(() => (region ? homeCorners(region) : []), [region]);
  const homeRef = useRef(home);
  homeRef.current = home;
  const frameKey = `${pet?.id ?? 0}|${saved.families.join(',')}|${saved.onlyOpen}|${dots.length > 0}`;
  useEffect(() => {
    // the spawns when there are any, else the whole map
    if (sized) setView(fitPoints(sizeRef.current.w, sizeRef.current.h, dotsRef.current.length > 0 ? dotsRef.current : homeRef.current));
  }, [regionId, frameKey, sized]);

  // tile images of the shown region
  const hasTiles = region ? region.tiles.some(([c, r]) => tileUrl(region.key, c, r) !== undefined) : false;
  /** A map the data has no picture for: its spawns are drawn as plain points. */
  const blank = region ? region.tiles.length === 0 : false;
  const drawable = hasTiles || blank; // no meaningful-looking dots over a map whose files are missing
  useEffect(() => {
    if (!region) return;
    for (const [c, r] of region.tiles) {
      const url = tileUrl(region.key, c, r);
      const key = `${region.key}/${c}_${r}`;
      if (!url || images.current.has(key)) continue;
      const img = new Image();
      img.onload = () => setLoaded((n) => n + 1);
      img.src = url;
      images.current.set(key, img);
    }
  }, [region]);

  // draw: the picture as it is (no tint, it is the game's own art), then the dots with a dark rim so they read on the paper
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || size.w <= 0 || size.h <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (!region) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const s = span(size.w, size.h, view.zoom);
    const tile = s / region.grid;
    for (const [c, r] of region.tiles) {
      const img = images.current.get(`${region.key}/${c}_${r}`);
      if (!img?.complete || img.naturalWidth === 0) continue;
      const at = toScreen(view, size.w, size.h, c / region.grid, r / region.grid);
      if (at.x > size.w || at.y > size.h || at.x + tile < 0 || at.y + tile < 0) continue;
      ctx.drawImage(img, at.x, at.y, tile + 0.3, tile + 0.3);
    }
    if (!drawable) return;
    // a bit larger when zoomed in; many dots (whole families) stay small so they do not hide the map
    const base = dots.length > 1500 ? 2.6 : dots.length > 250 ? 3.2 : 3.8;
    const radius = Math.min(6, base + (view.zoom - 1) * 0.35);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK;
    dots.forEach((d, i) => {
      if (hover?.index === i) return; // drawn last, on top
      const p = toScreen(view, size.w, size.h, d.x, d.y);
      if (p.x < -8 || p.y < -8 || p.x > size.w + 8 || p.y > size.h + 8) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.stroke();
    });
    const hot = hover ? dots[hover.index] : undefined;
    if (hot) {
      const p = toScreen(view, size.w, size.h, hot.x, hot.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = hot.color;
      ctx.fill();
      ctx.stroke();
    }
  }, [view, size, region, dots, loaded, hover, drawable]);

  // wheel zoom (a native listener, so the page does not scroll)
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((v) => zoomAt(v, size.w, size.h, e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - rect.left, e.clientY - rect.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [size.w, size.h]);

  const zoomButton = useCallback((factor: number) => setView((v) => zoomAt(v, size.w, size.h, factor, size.w / 2, size.h / 2)), [size.w, size.h]);

  const noSpawns = region !== null && region.points.length === 0;
  const hoveredDot = hover ? dots[hover.index] : undefined;
  const npcName = hoveredDot && data ? (data.npcNames[hoveredDot.npc] ?? `NPC #${hoveredDot.npc}`) : null;
  const hoveredPet = hoveredDot ? byId.get(hoveredDot.pet) : undefined;
  const toggleFamily = (f: string): void => update({ ...saved, families: families.has(f) ? saved.families.filter((x) => x !== f) : [...saved.families, f] });
  const note = 'pointer-events-none absolute left-3 top-[52px] m-0 max-w-[330px] rounded-[8px] bg-panel/90 px-3 py-2 text-[12px] text-ink-dim shadow-[0_4px_14px_oklch(0.1_0.02_255/0.45)] ring-1 ring-line';
  // tooltip stays inside the canvas: flipped below the dot near the top, pushed in from the sides
  const tipLeft = hover ? Math.min(Math.max(hover.x, 90), Math.max(90, size.w - 90)) : 0;
  const tipBelow = hover ? hover.y < 64 : false;

  return (
    <section
      data-hit="petmap"
      aria-label={`Mapa: ${pet?.name ?? 'petów'}`}
      className="flex w-[716px] shrink-0 flex-col overflow-hidden rounded-[10px] bg-panel shadow-[0_14px_44px_oklch(0.1_0.02_255/0.65)] ring-1 ring-line"
    >
      <header className="flex items-center gap-2 bg-panel-head px-3 py-2">
        <h2 className="m-0 shrink-0 text-[14px] font-bold">Mapa petów</h2>
        <select
          aria-label="Wybierz peta"
          value={pet?.id ?? ''}
          onChange={(e) => {
            const chosen = choices.find((c) => c.id === Number(e.target.value));
            onPick(chosen ? { id: chosen.id, name: chosen.name } : null);
          }}
          className="min-w-0 max-w-[280px] flex-1 rounded-[6px] border border-line bg-panel px-1.5 py-1 text-[12px] text-ink"
        >
          <option value="">Wszystkie (wg rodzin poniżej)</option>
          {pet && !choices.some((c) => c.id === pet.id) && <option value={pet.id}>{pet.name}</option>}
          {FAMILIES.map((f) => {
            const list = choices.filter((c) => c.family === f);
            return list.length === 0 ? null : (
              <optgroup key={f} label={f}>
                {list.map((c) => {
                  const toMax = soulsToMax(c.rank, c.souls);
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.rank === 3 ? ' · MAX' : toMax !== null ? ` · do MAX ${toMax}` : ''}
                    </option>
                  );
                })}
              </optgroup>
            );
          })}
        </select>
        <button type="button" aria-label="Zamknij mapę" onClick={onClose} className="ml-auto grid size-6 place-items-center rounded-[5px] text-ink-dim hover:bg-row hover:text-ink">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        {pet ? (
          <>
            <span className="flex items-center gap-1.5 rounded-[6px] bg-panel-head py-0.5 pl-2 pr-1 text-[12px] font-semibold ring-1 ring-line">
              {byId.get(pet.id) && <FamilyChip family={byId.get(pet.id)?.family ?? ''} compact />}
              <span className="max-w-[260px] truncate">{pet.name}</span>
              <button type="button" aria-label="Pokaż wszystkie pety" title="Pokaż wszystkie pety wybranych rodzin" onClick={() => onPick(null)} className="grid size-5 place-items-center rounded-[4px] text-ink-dim hover:bg-line hover:text-ink">
                <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </span>
            <span className="text-[11px] text-ink-mute">tylko ten pet</span>
          </>
        ) : (
          <>
            {FAMILIES.map((f) => {
              const on = families.has(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  title={on ? `Ukryj rodzinę ${f}` : `Pokaż rodzinę ${f}`}
                  onClick={() => toggleFamily(f)}
                  className={`flex h-[24px] shrink-0 items-center gap-1.5 rounded-[6px] px-1.5 text-[12px] font-semibold ring-1 transition-colors ${on ? 'bg-panel-head text-ink ring-line' : 'bg-transparent text-ink-mute ring-line/50 hover:text-ink'}`}
                >
                  <span className="size-2.5 rounded-full ring-1 ring-black/50" style={{ background: on ? familyColor(f) : 'transparent', boxShadow: on ? 'none' : `inset 0 0 0 1.5px ${familyColor(f)}` }} aria-hidden="true" />
                  {f}
                  <span className="num text-[10px] font-normal text-ink-mute">{perFamily[f] ?? 0}</span>
                </button>
              );
            })}
            <button type="button" className="h-[24px] shrink-0 whitespace-nowrap rounded-[6px] px-1.5 text-[11px] font-semibold text-ink-dim hover:text-ink" onClick={() => update({ ...saved, families: families.size === FAMILIES.length ? [] : [...FAMILIES] })}>
              {families.size === FAMILIES.length ? 'Żadna' : 'Wszystkie'}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={saved.onlyOpen}
              title="Ukryj pety, które masz już na maksymalnej randze"
              onClick={() => update({ ...saved, onlyOpen: !saved.onlyOpen })}
              className="ml-auto flex h-[24px] shrink-0 items-center gap-2 rounded-[6px] px-1.5 text-[11px] font-semibold text-ink-dim hover:text-ink"
            >
              <span className={`relative h-[14px] w-[26px] rounded-full transition-colors ${saved.onlyOpen ? 'bg-accent/80' : 'bg-line'}`} aria-hidden="true">
                <span className={`absolute top-[2px] size-[10px] rounded-full bg-white shadow transition-[left] ${saved.onlyOpen ? 'left-[14px]' : 'left-[2px]'}`} />
              </span>
              Bez MAX
            </button>
          </>
        )}
      </div>
      <div className="flex h-[520px]">
        <aside className="flex w-[216px] shrink-0 flex-col border-r border-line bg-panel-head/45">
          <nav aria-label="Mapy" className="flex shrink-0 flex-col gap-2 p-2">
            {GROUPS.map((g) => {
              const list = regions.filter((r) => r.group === g.id);
              if (list.length === 0) return null;
              return (
                <div key={g.id} className="flex flex-col gap-0.5">
                  <h3 className="m-0 px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.09em] text-ink-mute">{g.label}</h3>
                  {list.map((r) => {
                    const n = countIn(r);
                    const active = region?.key === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        aria-current={active ? 'true' : undefined}
                        onClick={() => setRegionKey(r.key)}
                        className={`flex items-center gap-2 rounded-[8px] px-2 py-[7px] text-left text-[11.5px] font-semibold transition-colors ${active ? 'bg-accent/15 text-accent ring-1 ring-accent/40' : 'text-ink-dim hover:bg-row hover:text-ink'}`}
                      >
                        <span className="min-w-0 flex-1 truncate" title={r.name}>
                          {r.name}
                        </span>
                        <span className={`num shrink-0 rounded-full px-1.5 text-[10px] font-semibold ${active ? 'bg-accent/20 text-accent' : 'bg-line/60 text-ink-mute'} ${n === 0 ? 'opacity-50' : ''}`}>{n}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
          <section aria-label="Najbliżej MAX na tej mapie" className="flex min-h-0 flex-1 flex-col border-t border-line">
            <h3 className="m-0 flex items-baseline justify-between px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.09em] text-ink-mute">
              <span title="Pety z tej mapy, którym brakuje najmniej dusz do maksymalnej rangi (reszta etapu i kolejne etapy)">Najbliżej MAX</span>
              <span className="num font-semibold normal-case tracking-normal">dusz</span>
            </h3>
            {closest.length === 0 ? (
              <p className="m-0 px-4 py-2 text-[11px] text-ink-mute">{allPets.length === 0 ? 'Wczytuję…' : 'Żaden pet z wybranych rodzin nie ma spawnów na tej mapie.'}</p>
            ) : (
              <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-px overflow-y-auto px-2 pb-2">
                {closest.slice(0, CLOSEST_LIST).map((p) => {
                  const toMax = soulsToMax(p.rank, p.souls);
                  const chosen = pet?.id === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        aria-pressed={chosen}
                        title={chosen ? 'Pokaż znów wszystkie pety wybranych rodzin' : `Pokaż tylko ${p.name} na mapie`}
                        onClick={() => onPick(chosen ? null : { id: p.id, name: p.name })}
                        className={`flex w-full items-center gap-2 rounded-[7px] px-1.5 py-[3px] text-left transition-colors ${chosen ? 'bg-accent/15 ring-1 ring-accent/40' : 'hover:bg-row'}`}
                      >
                        <PetPortrait id={p.id} size={24} />
                        <span className={`min-w-0 flex-1 truncate text-[11.5px] font-semibold ${chosen ? 'text-accent' : 'text-ink'}`}>{p.name}</span>
                        <span className={`num shrink-0 text-[11px] font-bold ${toMax === null ? 'text-ink-mute' : toMax <= 25 ? 'text-warm' : 'text-ink-dim'}`} title={toMax === null ? 'Brak danych o duszach' : `Brakuje ${toMax} dusz do maksymalnej rangi`}>
                          {p.rank === 3 ? 'MAX' : (toMax ?? '—')}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
        <div ref={box} className="relative min-w-0 flex-1" style={{ background: blank || !drawable ? 'oklch(0.2 0.02 250)' : PAPER }}>
          <canvas
            ref={canvas}
            className="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing"
            style={{ width: size.w, height: size.h }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (drag.current) {
                const dx = e.clientX - drag.current.x;
                const dy = e.clientY - drag.current.y;
                drag.current = { x: e.clientX, y: e.clientY };
                setView((v) => panBy(v, size.w, size.h, dx, dy));
                setHover(null);
                return;
              }
              const px = e.clientX - rect.left;
              const py = e.clientY - rect.top;
              const index = drawable ? nearestPoint(view, size.w, size.h, dots, px, py, 10) : -1;
              setHover((h) => (index < 0 ? (h ? null : h) : h && h.index === index ? h : { index, x: px, y: py }));
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onPointerLeave={() => setHover(null)}
          />
          {/* the edges of the picture fade into the window */}
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_46px_oklch(0.18_0.03_70/0.38)]" aria-hidden="true" />
          {region && (
            <div className="pointer-events-none absolute left-3 top-3 flex items-baseline gap-2 rounded-[8px] bg-panel/90 px-2.5 py-1.5 shadow-[0_4px_14px_oklch(0.1_0.02_255/0.45)] ring-1 ring-line">
              <span className="text-[13px] font-bold text-ink">{region.name}</span>
              <span className="num text-[11px] text-ink-mute" title="Punkty spawnu widoczne na tej mapie">
                {dots.length} pkt
              </span>
            </div>
          )}
          <div role="group" aria-label="Widok mapy" className="absolute bottom-3 right-3 flex flex-col divide-y divide-line overflow-hidden rounded-[9px] bg-panel/90 shadow-[0_4px_14px_oklch(0.1_0.02_255/0.45)] ring-1 ring-line">
            <button type="button" className={ctl} title="Przybliż" aria-label="Przybliż" onClick={() => zoomButton(1.4)}>
              <Icon>
                <path d="M8 3v10M3 8h10" />
              </Icon>
            </button>
            <button type="button" className={ctl} title="Oddal" aria-label="Oddal" onClick={() => zoomButton(1 / 1.4)}>
              <Icon>
                <path d="M3 8h10" />
              </Icon>
            </button>
            <button type="button" className={ctl} title="Pokaż wszystkie widoczne punkty" aria-label="Dopasuj do punktów" onClick={() => setView(fitPoints(size.w, size.h, dots))}>
              <Icon>
                <circle cx="8" cy="8" r="2.2" />
                <path d="M8 1.5v2.3M8 12.2v2.3M1.5 8h2.3M12.2 8h2.3" />
              </Icon>
            </button>
            <button type="button" className={ctl} title="Cała mapa" aria-label="Cała mapa" onClick={() => setView(fitPoints(size.w, size.h, home))}>
              <Icon>
                <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
              </Icon>
            </button>
          </div>
          {hover && npcName && (
            <span
              className="pointer-events-none absolute z-10 flex min-w-[140px] -translate-x-1/2 flex-col gap-0.5 rounded-[7px] bg-panel-head px-2.5 py-1.5 text-[11px] shadow-[0_6px_18px_oklch(0.08_0.02_255/0.6)] ring-1 ring-line"
              style={{ left: tipLeft, top: tipBelow ? hover.y + 14 : hover.y - 10, transform: `translate(-50%, ${tipBelow ? '0' : '-100%'})` }}
            >
              {hoveredPet ? (
                <span className="flex items-center gap-1.5 font-bold text-ink">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: hoveredDot?.color }} aria-hidden="true" />
                  <span className="truncate">{hoveredPet.name}</span>
                  <span className="num ml-auto shrink-0 text-[10px] font-semibold text-ink-dim">{progress(hoveredPet)}</span>
                  {hoveredPet.rank !== null && hoveredPet.rank < 3 && soulsToMax(hoveredPet.rank, hoveredPet.souls) !== null && (
                    <span className="num shrink-0 text-[10px] font-semibold text-warm" title="Dusz do maksymalnej rangi">
                      do MAX {soulsToMax(hoveredPet.rank, hoveredPet.souls)}
                    </span>
                  )}
                </span>
              ) : null}
              <span className="font-semibold text-ink-dim">{npcName}</span>
            </span>
          )}
          {noSpawns && <p className={note}>Na tej mapie nie ma spawnów petów w danych gry.</p>}
          {!noSpawns && data && allPets.length > 0 && !pet && families.size === 0 && <p className={note}>Zaznacz przynajmniej jedną rodzinę, żeby zobaczyć jej spawny.</p>}
          {!noSpawns && data && allPets.length > 0 && !pet && families.size > 0 && dots.length === 0 && drawable && (
            <p className={note}>Brak spawnów dla wybranych rodzin na tej mapie{saved.onlyOpen ? ' (pety na MAX są ukryte)' : ''}. Spróbuj innej mapy albo więcej rodzin.</p>
          )}
          {pet && data && !countIn({ points: data.regions.flatMap((r) => r.points) }) && <p className={note}>Ten pet nie ma znanych spawnów na wbudowanych mapach.</p>}
          {region && !drawable && <p className={note}>Brak plików mapy. Wygeneruj je skryptem tools/gen-pet-maps.py albo zainstaluj aplikację z instalatora.</p>}
          {blank && !noSpawns && <p className="pointer-events-none absolute bottom-3 left-3 m-0 max-w-[300px] rounded-[8px] bg-panel/90 px-3 py-1.5 text-[11px] text-ink-dim ring-1 ring-line">Brak obrazu tej mapy, więc widać same punkty spawnu.</p>}
        </div>
      </div>
      <footer className="border-t border-line px-3 py-1.5 text-[10px] text-ink-mute">
        Kolor kropki to rodzina peta; najedź na kropkę, żeby zobaczyć peta, jego postęp i moba. Pety najbliższe MAX leżą na wierzchu, a lista po lewej zaczyna się od nich (kliknij, żeby pokazać tylko jednego). To stałe miejsca spawnu (nie żywe moby ani twoja pozycja). Przeciągaj, żeby przesunąć, kółko myszy przybliża.
      </footer>
    </section>
  );
}
