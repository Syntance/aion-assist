/**
 * Frames per second from the times at which the game presented frames (ETW DXGI Present events).
 * Events are delivered in batches about once a second, so the rate is taken from their own timestamps,
 * not from when they arrived.
 */

const WINDOW_MS = 1_000;
const KEEP_MS = 3_000;
const STALE_MS = 3_500;

export class FpsCounter {
  private stamps: number[] = [];
  private lastArrival = 0;

  /** `stampMs` is the event's own time in ms (any monotonic clock), `arrivalMs` the local time it reached us. */
  add(stampMs: number, arrivalMs: number): void {
    this.stamps.push(stampMs);
    this.lastArrival = arrivalMs;
    const newest = this.stamps[this.stamps.length - 1] ?? stampMs;
    let drop = 0;
    while (drop < this.stamps.length && newest - (this.stamps[drop] ?? newest) > KEEP_MS) drop++;
    if (drop > 0) this.stamps.splice(0, drop);
  }

  reset(): void {
    this.stamps = [];
    this.lastArrival = 0;
  }

  /** Frames per second over the newest second of events, null when the game stopped presenting. */
  value(nowMs: number): number | null {
    if (this.stamps.length < 2 || nowMs - this.lastArrival > STALE_MS) return null;
    const newest = this.stamps[this.stamps.length - 1] ?? 0;
    let first = this.stamps.length - 1;
    while (first > 0 && newest - (this.stamps[first - 1] ?? newest) <= WINDOW_MS) first--;
    const count = this.stamps.length - first;
    const span = newest - (this.stamps[first] ?? newest);
    if (count < 2 || span <= 0) return null;
    return Math.round(((count - 1) * 1000) / span);
  }
}
