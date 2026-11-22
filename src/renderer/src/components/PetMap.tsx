import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WHOLE_MAP, fitPoints, nearestPoint, panBy, span, toScreen, zoomAt, type MapView } from '@shared/mapView';
import type { PetRow } from '@shared/pets';
import { FAMILIES, FamilyChip, familyColor } from './PetIcon';

/**
 * Spawn map of pets (Verteron and Altgard), like PetTracker's: pan with the mouse, zoom with the wheel, hover a dot for
 * the mob and the pet. Dots are coloured by pet family and can be filtered by family (and hidden for pets already at
 * MAX), or narrowed to one pet. They are approximate static spawn points, not live mobs and not your position.
 */

type SpawnData = typeof import('../data/petSpawns');
let spawnData: Promise<SpawnData> | null = null;
/** The spawn tables are big, so they load the first time a map or the finder needs them. */
export const loadSpawns = (): Promise<SpawnData> => (spawnData ??= import('../data/petSpawns'));

const tileUrls = import.meta.glob<string>('../assets/maps/*/*.webp', { eager: true, query: '?url', import: 'default' });
const tileUrl = (region: string, col: number, row: number): string | undefined => tileUrls[`../assets/maps/${region}/${col}_${row}.webp`];

/** Pet ids that have at least one spawn point on a bundled map. */
export function petsWithMap(data: SpawnData): Set<number> {
  const ids = new Set<number>();
  for (const r of data.SPAWN_REGIONS) for (const p of r.points) ids.add(p[0]);
  return ids;
}

const button = 'grid h-[24px] min-w-[24px] place-items-center rounded-[6px] bg-panel-head px-2 text-[12px] font-semibold text-ink ring-1 ring-line hover:bg-line';

interface Dot {
  x: number;
  y: number;
  npc: number;
  pet: number;
  color: string;
}

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
  const choices = useMemo(() => allPets.filter((p) => mapIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name)), [allPets, mapIds]);

  /** Does this pet's spawn get a dot: the one chosen pet, or any pet of a shown family (not MAX when those are hidden). */
  const wanted = useCallback(
    (id: number): boolean => {
      if (pet) return id === pet.id;
      const p = byId.get(id);
      return p !== undefined && families.has(p.family) && !(saved.onlyOpen && p.rank === 3);
    },
    [pet, byId, families, saved.onlyOpen],
  );

  const regions = useMemo(() => (data ? data.SPAWN_REGIONS : []), [data]);
  const countIn = useCallback((r: { points: readonly (readonly number[])[] }): number => r.points.filter((p) => wanted(p[0])).length, [wanted]);
  const region = regions.find((r) => r.key === regionKey) ?? regions.slice().sort((a, b) => countIn(b) - countIn(a))[0] ?? null;
  const dots = useMemo<Dot[]>(
    () => (region ? region.points.filter((p) => wanted(p[0])).map((p) => ({ pet: p[0], npc: p[1], x: p[2], y: p[3], color: familyColor(byId.get(p[0])?.family ?? '') })) : []),
    [region, wanted, byId],
  );
  /** Dots per family over both maps, for the legend (MAX pets left out when hidden). */
  const perFamily = useMemo(() => {
    const out: Record<string, number> = {};
    if (!data) return out;
    for (const r of data.SPAWN_REGIONS) {
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
  const frameKey = `${pet?.id ?? 0}|${saved.families.join(',')}|${saved.onlyOpen}|${dots.length > 0}`;
  useEffect(() => {
    if (sized) setView(fitPoints(sizeRef.current.w, sizeRef.current.h, dotsRef.current));
  }, [regionId, frameKey, sized]);

  // tile images of the shown region
  const hasTiles = region ? region.tiles.some(([c, r]) => tileUrl(region.key, c, r) !== undefined) : false;
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

  // draw
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || size.w <= 0 || size.h <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgb(30,40,44)';
    ctx.fillRect(0, 0, size.w, size.h);
    if (!region) return;
    const s = span(size.w, size.h, view.zoom);
    const tile = s / region.grid;
    for (const [c, r] of region.tiles) {
      const img = images.current.get(`${region.key}/${c}_${r}`);
      if (!img?.complete || img.naturalWidth === 0) continue;
      const at = toScreen(view, size.w, size.h, c / region.grid, r / region.grid);
      if (at.x > size.w || at.y > size.h || at.x + tile < 0 || at.y + tile < 0) continue;
      ctx.drawImage(img, at.x, at.y, tile + 0.3, tile + 0.3);
    }
    if (!hasTiles) return; // no meaningful-looking dots over a missing map
    // a little darker under the dots so the colours stand out from the terrain
    ctx.fillStyle = 'rgba(8,12,18,0.28)';
    ctx.fillRect(0, 0, size.w, size.h);
    // a bit larger when zoomed in; many dots (whole families) stay small so they do not hide the map
    const base = dots.length > 1500 ? 2.6 : dots.length > 250 ? 3.2 : 3.8;
    const radius = Math.min(6, base + (view.zoom - 1) * 0.35);
    dots.forEach((d, i) => {
      if (hover?.index === i) return; // drawn last, on top
      const p = toScreen(view, size.w, size.h, d.x, d.y);
      if (p.x < -8 || p.y < -8 || p.x > size.w + 8 || p.y > size.h + 8) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = 'rgba(8,10,14,0.85)';
      ctx.stroke();
    });
    const hot = hover ? dots[hover.index] : undefined;
    if (hot) {
      const p = toScreen(view, size.w, size.h, hot.x, hot.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = hot.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'white';
      ctx.stroke();
    }
  }, [view, size, region, dots, loaded, hover, hasTiles]);

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

  const hoveredDot = hover ? dots[hover.index] : undefined;
  const npcName = hoveredDot && data ? (data.SPAWN_NPC_NAMES[hoveredDot.npc] ?? `NPC #${hoveredDot.npc}`) : null;
  const hoveredPet = hoveredDot ? byId.get(hoveredDot.pet) : undefined;
  const toggleFamily = (f: string): void => update({ ...saved, families: families.has(f) ? saved.families.filter((x) => x !== f) : [...saved.families, f] });
  const note = 'pointer-events-none absolute left-4 top-4 m-0 max-w-[330px] rounded-[6px] bg-panel-head/90 px-3 py-2 text-[12px] text-ink-dim';
  // tooltip stays inside the canvas: flipped below the dot near the top, pushed in from the sides
  const tipLeft = hover ? Math.min(Math.max(hover.x, 90), Math.max(90, size.w - 90)) : 0;
  const tipBelow = hover ? hover.y < 64 : false;

  return (
    <section
      data-hit="petmap"
      aria-label={`Mapa: ${pet?.name ?? 'petów'}`}
      className="flex w-[560px] shrink-0 flex-col overflow-hidden rounded-[10px] bg-panel shadow-[0_14px_44px_oklch(0.1_0.02_255/0.65)] ring-1 ring-line"
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
          className="min-w-0 max-w-[230px] flex-1 rounded-[6px] border border-line bg-panel px-1.5 py-1 text-[12px] text-ink"
        >
          <option value="">Wszystkie (wg rodzin poniżej)</option>
          {pet && !choices.some((c) => c.id === pet.id) && <option value={pet.id}>{pet.name}</option>}
          {FAMILIES.map((f) => {
            const list = choices.filter((c) => c.family === f);
            return list.length === 0 ? null : (
              <optgroup key={f} label={f}>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <span className="num text-[11px] text-ink-mute" title="Punkty spawnu widoczne na tej mapie">
          {dots.length} pkt
        </span>
        <button type="button" aria-label="Zamknij mapę" onClick={onClose} className="ml-auto grid size-6 place-items-center rounded-[5px] text-ink-dim hover:bg-row hover:text-ink">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
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
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        {regions.map((r) => {
          const n = countIn(r);
          return (
            <button key={r.key} type="button" aria-pressed={region?.key === r.key} onClick={() => setRegionKey(r.key)} className={`${button} ${region?.key === r.key ? 'bg-accent/25 text-accent' : ''}`}>
              {r.name}
              <span className="num ml-1 text-[10px] font-normal text-ink-mute">{n}</span>
            </button>
          );
        })}
        {!pet && (
          <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-dim" title="Ukryj pety, które masz już na maksymalnej randze">
            <input type="checkbox" checked={saved.onlyOpen} onChange={(e) => update({ ...saved, onlyOpen: e.target.checked })} className="size-3.5 accent-[var(--color-accent)]" />
            Bez MAX
          </label>
        )}
        <span className="ml-auto flex gap-1">
          <button type="button" className={button} title="Przybliż" aria-label="Przybliż" onClick={() => zoomButton(1.4)}>
            +
          </button>
          <button type="button" className={button} title="Oddal" aria-label="Oddal" onClick={() => zoomButton(1 / 1.4)}>
            −
          </button>
          <button type="button" className={button} title="Pokaż wszystkie widoczne punkty" onClick={() => setView(fitPoints(size.w, size.h, dots))}>
            Dopasuj
          </button>
          <button type="button" className={button} title="Cała mapa" onClick={() => setView(WHOLE_MAP)}>
            Reset
          </button>
        </span>
      </div>
      <div ref={box} className="relative h-[440px] w-full">
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
            const index = hasTiles ? nearestPoint(view, size.w, size.h, dots, px, py, 10) : -1;
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
              </span>
            ) : null}
            <span className="font-semibold text-ink-dim">{npcName}</span>
          </span>
        )}
        {data && allPets.length > 0 && !pet && families.size === 0 && <p className={note}>Zaznacz przynajmniej jedną rodzinę, żeby zobaczyć jej spawny.</p>}
        {data && allPets.length > 0 && !pet && families.size > 0 && dots.length === 0 && hasTiles && (
          <p className={note}>Brak spawnów dla wybranych rodzin na tej mapie{saved.onlyOpen ? ' (pety na MAX są ukryte)' : ''}. Spróbuj drugiej mapy albo więcej rodzin.</p>
        )}
        {pet && data && !countIn({ points: data.SPAWN_REGIONS.flatMap((r) => r.points) }) && <p className={note}>Ten pet nie ma znanych spawnów na wbudowanych mapach (Verteron, Altgard).</p>}
        {region && !hasTiles && <p className={note}>Brak plików mapy. Wygeneruj je skryptem tools/gen-pet-assets.py albo zainstaluj aplikację z instalatora.</p>}
      </div>
      <footer className="border-t border-line px-3 py-1.5 text-[10px] text-ink-mute">
        Kolor kropki to rodzina peta; najedź na kropkę, żeby zobaczyć peta, jego postęp i moba. To przybliżone, stałe miejsca spawnu (nie żywe moby ani twoja pozycja). Przeciągaj, żeby przesunąć, kółko myszy przybliża.
      </footer>
    </section>
  );
}
