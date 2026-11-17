/**
 * How late the game's data stream arrives, measured on the server's heartbeats.
 *
 * The server sends a heartbeat every 50 ms carrying its own clock. Local receive time minus that clock is a
 * constant (clock offset + base latency) plus however late this heartbeat is. The smallest value seen over the
 * last two minutes is the baseline; how far a heartbeat is above it is its lateness (server stalls, packet
 * loss waiting for a retransmission, queues). That, added to the network round trip, is the delay the player
 * actually experiences: an ICMP ping of 10 ms can sit next to a game that is 1000 ms behind.
 *
 * `late` is smoothed (time constant ~2 s) and, when heartbeats stop arriving, becomes how long they have been
 * missing; `peak` is the worst single heartbeat of the last 10 s.
 */

const BASELINE_WINDOW_MS = 120_000;
const PEAK_WINDOW_MS = 10_000;
/** Heartbeats arrive every 50 ms, so 0.025 per beat is a time constant of about 2 s. */
const SMOOTHING_ALPHA = 0.025;
const SILENCE_GRACE_MS = 100;
const NO_DATA_MS = 15_000;

export interface StreamDelayReading {
  late: number;
  peak: number;
}

export class StreamDelay {
  private offsets: { at: number; off: number }[] = [];
  private recent: { at: number; excess: number }[] = [];
  private smoothed = 0;
  private lastAt: number | null = null;

  /** `clock` is the server clock from the heartbeat (ms), `now` the local time it was delivered (ms). */
  onHeartbeat(clock: number, now: number): void {
    const off = now - clock;
    this.offsets.push({ at: now, off });
    while (this.offsets.length > 0 && now - (this.offsets[0]?.at ?? now) > BASELINE_WINDOW_MS) this.offsets.shift();
    let base = off;
    for (const o of this.offsets) if (o.off < base) base = o.off;
    const excess = off - base;
    // one step per heartbeat, not per elapsed time: a single late beat must not outweigh the 39 on time
    this.smoothed = this.lastAt === null ? excess : this.smoothed + SMOOTHING_ALPHA * (excess - this.smoothed);
    this.recent.push({ at: now, excess });
    while (this.recent.length > 0 && now - (this.recent[0]?.at ?? now) > PEAK_WINDOW_MS) this.recent.shift();
    this.lastAt = now;
  }

  /** Lateness in ms above the baseline, or null when no heartbeat arrived for a long time (not connected). */
  value(now: number): StreamDelayReading | null {
    if (this.lastAt === null || now - this.lastAt > NO_DATA_MS) return null;
    const silence = Math.max(0, now - this.lastAt - SILENCE_GRACE_MS);
    let peak = silence;
    for (const r of this.recent) if (now - r.at <= PEAK_WINDOW_MS && r.excess > peak) peak = r.excess;
    return { late: Math.round(Math.max(this.smoothed, silence)), peak: Math.round(peak) };
  }
}
