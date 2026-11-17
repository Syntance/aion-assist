/**
 * View maths of the pet map (the same behaviour as PetTracker's map): the whole map is a square of side
 * `min(width, height) * zoom` pixels, `cx` / `cy` (0..1) is the map point shown in the middle of the view.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

export interface MapView {
  zoom: number;
  cx: number;
  cy: number;
}

export interface MapPoint {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const WHOLE_MAP: MapView = { zoom: 1, cx: 0.5, cy: 0.5 };

export function span(w: number, h: number, zoom: number): number {
  return Math.max(1, Math.min(w, h)) * zoom;
}

export function toScreen(view: MapView, w: number, h: number, x: number, y: number): MapPoint {
  const s = span(w, h, view.zoom);
  return { x: (x - view.cx) * s + w / 2, y: (y - view.cy) * s + h / 2 };
}

/** A view that frames all the given points with some margin (the whole map when there are none). */
export function fitPoints(w: number, h: number, points: readonly MapPoint[]): MapView {
  if (points.length === 0 || w <= 0 || h <= 0) return WHOLE_MAP;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const fit = Math.min(w / Math.max(0.08, right - left), h / Math.max(0.08, bottom - top));
  return { zoom: clamp((0.8 * fit) / Math.max(1, Math.min(w, h)), MIN_ZOOM, MAX_ZOOM), cx: (left + right) / 2, cy: (top + bottom) / 2 };
}

/** Zooms by `factor` keeping the map point under (ax, ay) where it is. */
export function zoomAt(view: MapView, w: number, h: number, factor: number, ax: number, ay: number): MapView {
  const before = span(w, h, view.zoom);
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const after = span(w, h, zoom);
  return {
    zoom,
    cx: clamp(view.cx + (ax - w / 2) * (1 / before - 1 / after), 0, 1),
    cy: clamp(view.cy + (ay - h / 2) * (1 / before - 1 / after), 0, 1),
  };
}

/** Drags the map by (dx, dy) screen pixels. */
export function panBy(view: MapView, w: number, h: number, dx: number, dy: number): MapView {
  const s = span(w, h, view.zoom);
  return { ...view, cx: clamp(view.cx - dx / s, 0, 1), cy: clamp(view.cy - dy / s, 0, 1) };
}

/** Index of the point closest to the screen position within `radius` pixels, or -1. */
export function nearestPoint(view: MapView, w: number, h: number, points: readonly MapPoint[], px: number, py: number, radius: number): number {
  let best = -1;
  let bestD = radius * radius;
  points.forEach((p, i) => {
    const s = toScreen(view, w, h, p.x, p.y);
    const d = (s.x - px) ** 2 + (s.y - py) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
