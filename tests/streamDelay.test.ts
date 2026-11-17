import { describe, expect, it } from 'vitest';
import { StreamDelay } from '../src/core/capture/streamDelay';

/** Heartbeats every 50 ms on a server clock that is 1166 ms off the local one. */
const OFFSET = 1166;
const beat = (d: StreamDelay, serverMs: number, lateBy = 0): void => d.onHeartbeat(serverMs, serverMs + OFFSET + lateBy);
const steady = (d: StreamDelay, from: number, to: number, lateBy = 0): number => {
  let t = from;
  for (; t < to; t += 50) beat(d, t, lateBy);
  return t;
};
const late = (d: StreamDelay, now: number): number | undefined => d.value(now)?.late;

describe('StreamDelay', () => {
  it('is near zero while heartbeats arrive on time, whatever the clock offset', () => {
    const d = new StreamDelay();
    const t = steady(d, 1_000_000, 1_002_000);
    expect(late(d, t + OFFSET)).toBeLessThanOrEqual(1);
    expect(d.value(t + OFFSET)?.peak).toBeLessThanOrEqual(1);
  });

  it('one late heartbeat barely moves the smoothed number but shows as the peak', () => {
    const d = new StreamDelay();
    let t = steady(d, 1_000_000, 1_020_000);
    beat(d, t, 640);
    t += 50;
    const reading = d.value(t + OFFSET);
    expect(reading?.late).toBeLessThan(25);
    expect(reading?.peak).toBe(640);
  });

  it('the peak is forgotten after ten seconds', () => {
    const d = new StreamDelay();
    let t = steady(d, 1_000_000, 1_020_000);
    beat(d, t, 640);
    t = steady(d, t + 50, t + 12_000);
    expect(d.value(t + OFFSET)?.peak).toBeLessThanOrEqual(1);
  });

  it('sustained lag shows up in full', () => {
    const d = new StreamDelay();
    let t = steady(d, 1_000_000, 1_010_000);
    t = steady(d, t, t + 8_000, 600); // 8 s of heartbeats arriving 600 ms late
    const value = late(d, t + OFFSET + 600);
    expect(value).toBeGreaterThan(500);
    expect(value).toBeLessThanOrEqual(600);
  });

  it('recovers after the lag ends', () => {
    const d = new StreamDelay();
    let t = steady(d, 1_000_000, 1_010_000);
    t = steady(d, t, t + 5_000, 600);
    t = steady(d, t, t + 15_000);
    expect(late(d, t + OFFSET)).toBeLessThan(10);
  });

  it('counts a silent stream as delay: no heartbeat for a second reads as about a second', () => {
    const d = new StreamDelay();
    const t = steady(d, 1_000_000, 1_002_000);
    const last = t - 50 + OFFSET;
    const reading = d.value(last + 1_000);
    expect(reading?.late).toBeGreaterThanOrEqual(850);
    expect(reading?.late).toBeLessThanOrEqual(1_000);
    expect(reading?.peak).toBeGreaterThanOrEqual(850);
  });

  it('is null before any heartbeat and after a long silence (not connected)', () => {
    const d = new StreamDelay();
    expect(d.value(5_000)).toBeNull();
    beat(d, 1_000_000);
    expect(d.value(1_000_000 + OFFSET + 20_000)).toBeNull();
  });

  it('a clock that drifts slowly does not look like lag (the baseline follows the two-minute minimum)', () => {
    const d = new StreamDelay();
    // the offset creeps up 1 ms every 30 s (about 33 ppm, a poorly synced clock) for 4 minutes
    for (let i = 0; i < 4800; i++) {
      const t = 1_000_000 + i * 50;
      d.onHeartbeat(t, t + OFFSET + Math.floor(i / 600));
    }
    const t = 1_000_000 + 4800 * 50;
    expect(late(d, t + OFFSET + 8)).toBeLessThanOrEqual(5);
  });
});
