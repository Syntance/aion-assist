import { describe, expect, it } from 'vitest';
import { FpsCounter } from '../src/core/capture/fpsCounter';

/** Frames at a steady rate, delivered in one-second batches like real-time ETW does. */
const feed = (c: FpsCounter, fps: number, fromMs: number, seconds: number): number => {
  const step = 1000 / fps;
  let t = fromMs;
  const end = fromMs + seconds * 1000;
  for (; t < end; t += step) c.add(t, Math.ceil(t / 1000) * 1000); // arrives at the end of its second
  return t;
};

describe('FpsCounter', () => {
  it('reads the rate from the event times, not from when they arrived', () => {
    const c = new FpsCounter();
    const t = feed(c, 100, 10_000, 4);
    expect(c.value(t)).toBe(100);
  });

  it('follows a change of rate within about a second', () => {
    const c = new FpsCounter();
    let t = feed(c, 144, 10_000, 3);
    t = feed(c, 30, t, 2);
    expect(c.value(t)).toBe(30);
  });

  it('is null with fewer than two frames and when the game stopped presenting', () => {
    const c = new FpsCounter();
    expect(c.value(1_000)).toBeNull();
    c.add(10_000, 10_000);
    expect(c.value(10_100)).toBeNull();
    const t = feed(c, 60, 10_000, 2);
    expect(c.value(t)).toBe(60);
    expect(c.value(t + 5_000)).toBeNull(); // nothing for 5 s
  });

  it('reset forgets everything (a new game process)', () => {
    const c = new FpsCounter();
    const t = feed(c, 60, 10_000, 2);
    c.reset();
    expect(c.value(t)).toBeNull();
  });

  it('keeps only a few seconds of frames', () => {
    const c = new FpsCounter();
    const t = feed(c, 200, 10_000, 30);
    expect(c.value(t)).toBe(200);
  });
});
