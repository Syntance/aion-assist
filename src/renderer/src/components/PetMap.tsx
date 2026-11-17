import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WHOLE_MAP, fitPoints, nearestPoint, panBy, span, toScreen, zoomAt, type MapView } from '@shared/mapView';

/**
 * Spawn map of a pet (Verteron and Altgard), like PetTracker's: pan with the mouse, zoom with the wheel, hover a dot for
 * the mob's name. The dots are approximate static spawn points, not live mobs and not your position.
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
}

export function PetMapWindow({ pet, onPick, onClose }: { pet: { id: number; name: string } | null; onPick: (pet: { id: number; name: string }) => void; onClose: () => void }) {
  const petId = pet?.id ?? 0;
  const [choices, setChoices] = useState<{ id: number; name: string }[]>([]);
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

  // the pets that have spawns on a bundled map, for the picker
  useEffect(() => {
    if (!data) return;
    let alive = true;
    const ids = petsWithMap(data);
    void window.overlay.getPets().then((all) => {
      if (alive) setChoices(all.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => {
      alive = false;
    };
  }, [data]);

  // without a pet both maps are offered (no dots); with one, only the regions where it spawns
  const regions = useMemo(() => (data ? (pet ? data.SPAWN_REGIONS.filter((r) => r.points.some((p) => p[0] === petId)) : data.SPAWN_REGIONS) : []), [data, pet, petId]);
  const region = regions.find((r) => r.key === regionKey) ?? regions.slice().sort((a, b) => b.points.filter((p) => p[0] === petId).length - a.points.filter((p) => p[0] === petId).length)[0] ?? null;
  const dots = useMemo<Dot[]>(() => (region ? region.points.filter((p) => p[0] === petId).map((p) => ({ npc: p[1], x: p[2], y: p[3] })) : []), [region, petId]);

  // keep the canvas sized to its box
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }));
    ro.observe(el);
    setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  // frame the spawns when the pet or the region changes
  const regionId = region?.key ?? '';
  const sized = size.w > 0;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dotsRef = useRef(dots);
  dotsRef.current = dots;
  useEffect(() => {
    if (sized) setView(fitPoints(sizeRef.current.w, sizeRef.current.h, dotsRef.current));
  }, [regionId, petId, sized]);

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
    dots.forEach((d, i) => {
      const p = toScreen(view, size.w, size.h, d.x, d.y);
      if (p.x < -6 || p.y < -6 || p.x > size.w + 6 || p.y > size.h + 6) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, hover?.index === i ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(255,215,0)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'black';
      ctx.stroke();
    });
  }, [view, size, region, dots, loaded, hover, hasTiles]);

  // wheel zoom (a native listener, so the page does not scroll)
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
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
            if (chosen) onPick(chosen);
          }}
          className="min-w-0 max-w-[220px] flex-1 rounded-[6px] border border-line bg-panel px-1.5 py-1 text-[12px] text-ink"
        >
          {!pet && <option value="">Wybierz peta…</option>}
          {pet && !choices.some((c) => c.id === pet.id) && <option value={pet.id}>{pet.name}</option>}
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {dots.length > 0 && <span className="num text-[11px] text-ink-mute">{dots.length} punktów</span>}
        <button type="button" aria-label="Zamknij mapę" onClick={onClose} className="ml-auto grid size-6 place-items-center rounded-[5px] text-ink-dim hover:bg-row hover:text-ink">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        {regions.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={region?.key === r.key}
            onClick={() => setRegionKey(r.key)}
            className={`${button} ${region?.key === r.key ? 'bg-accent/25 text-accent' : ''}`}
          >
            {r.name}
            {pet && <span className="num ml-1 text-[10px] font-normal text-ink-mute">{r.points.filter((p) => p[0] === petId).length}</span>}
          </button>
        ))}
        <span className="ml-auto flex gap-1">
          <button type="button" className={button} title="Przybliż" aria-label="Przybliż" onClick={() => zoomButton(1.4)}>
            +
          </button>
          <button type="button" className={button} title="Oddal" aria-label="Oddal" onClick={() => zoomButton(1 / 1.4)}>
            −
          </button>
          <button type="button" className={button} title="Pokaż wszystkie spawny tego peta" onClick={() => setView(fitPoints(size.w, size.h, dots))}>
            Dopasuj
          </button>
          <button type="button" className={button} title="Cała mapa" onClick={() => setView(WHOLE_MAP)}>
            Reset
          </button>
        </span>
      </div>
      <div ref={box} className="relative h-[420px] w-full">
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
          <span className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[5px] bg-panel-head px-2 py-1 text-[11px] font-semibold text-ink shadow ring-1 ring-line" style={{ left: hover.x, top: hover.y - 8 }}>
            {npcName}
          </span>
        )}
        {!pet && <p className="absolute left-4 top-4 m-0 rounded-[6px] bg-panel-head/90 px-3 py-2 text-[12px] text-ink-dim">Wybierz peta z listy u góry, żeby zobaczyć jego spawny.</p>}
        {pet && data && regions.length === 0 && <p className="absolute left-4 top-4 m-0 rounded-[6px] bg-panel-head/90 px-3 py-2 text-[12px] text-ink-dim">Ten pet nie ma znanych spawnów na wbudowanych mapach (Verteron, Altgard).</p>}
        {region && !hasTiles && <p className="absolute left-4 top-4 m-0 rounded-[6px] bg-panel-head/90 px-3 py-2 text-[12px] text-ink-dim">Brak plików mapy. Wygeneruj je skryptem tools/gen-pet-assets.py albo zainstaluj aplikację z instalatora.</p>}
      </div>
      <footer className="border-t border-line px-3 py-1.5 text-[10px] text-ink-mute">
        Złote kropki to przybliżone, stałe miejsca spawnu (nie pokazują żywych mobów ani twojej pozycji). Przeciągaj, żeby przesunąć, kółko myszy przybliża.
      </footer>
    </section>
  );
}
