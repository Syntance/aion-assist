import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, WHOLE_MAP, fitPoints, nearestPoint, panBy, toScreen, zoomAt } from '../src/shared/mapView';

describe('map view', () => {
  it('puts the view centre in the middle of the screen', () => {
    expect(toScreen(WHOLE_MAP, 400, 300, 0.5, 0.5)).toEqual({ x: 200, y: 150 });
    // the map is a 300 px square at zoom 1 (the short side), so its corners sit 150 px from the centre
    expect(toScreen(WHOLE_MAP, 400, 300, 0, 0)).toEqual({ x: 50, y: 0 });
  });

  it('frames a group of points and shows the whole map when there are none', () => {
    expect(fitPoints(400, 300, [])).toEqual(WHOLE_MAP);
    const v = fitPoints(400, 300, [
      { x: 0.4, y: 0.4 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(v.cx).toBeCloseTo(0.45);
    expect(v.cy).toBeCloseTo(0.45);
    expect(v.zoom).toBeGreaterThan(1);
    expect(v.zoom).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it('zooms around the pointer without moving the map point under it', () => {
    const view = { zoom: 2, cx: 0.4, cy: 0.6 };
    const anchor = { x: 120, y: 80 };
    const before = { x: (anchor.x - 200) / (300 * 2) + view.cx, y: (anchor.y - 150) / (300 * 2) + view.cy };
    const next = zoomAt(view, 400, 300, 1.5, anchor.x, anchor.y);
    const after = { x: (anchor.x - 200) / (300 * next.zoom) + next.cx, y: (anchor.y - 150) / (300 * next.zoom) + next.cy };
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomAt(view, 400, 300, 100, 200, 150).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(view, 400, 300, 0.001, 200, 150).zoom).toBe(MIN_ZOOM);
  });

  it('pans with the mouse and stays inside the map', () => {
    const panned = panBy({ zoom: 2, cx: 0.5, cy: 0.5 }, 400, 300, -60, 0); // drag left: the view moves right
    expect(panned.cx).toBeCloseTo(0.6);
    expect(panBy(WHOLE_MAP, 400, 300, -100_000, 0).cx).toBe(1);
  });

  it('finds the point under the pointer', () => {
    const points = [
      { x: 0.5, y: 0.5 },
      { x: 0.2, y: 0.2 },
    ];
    expect(nearestPoint(WHOLE_MAP, 400, 300, points, 203, 152, 10)).toBe(0);
    expect(nearestPoint(WHOLE_MAP, 400, 300, points, 380, 280, 10)).toBe(-1);
  });
});
