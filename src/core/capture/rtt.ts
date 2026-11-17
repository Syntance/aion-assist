/**
 * Round-trip time to the game server, estimated passively from the TCP traffic that is captured anyway:
 * the time between a client->server data segment and the server's acknowledgement covering it.
 * Nothing is sent. Retransmitted segments are skipped (their ACK is ambiguous, Karn's rule), and
 * the lower quartile of the recent samples is reported, because a delayed ACK only ever adds time.
 */

const SAMPLE_WINDOW_MS = 30_000;
const MAX_PENDING = 48;
const MAX_SAMPLES = 24;
const MAX_RTT_MS = 5_000;

interface Pending {
  /** Sequence number just past the segment's last byte. */
  end: number;
  at: number;
}

/** True when sequence number `a` is at or after `b` (32-bit wrap-around aware). */
const seqAtOrAfter = (a: number, b: number): boolean => ((a - b) >>> 0) < 0x8000_0000;

export class RttTracker {
  private pending: Pending[] = [];
  private samples: { ms: number; at: number }[] = [];

  /** A client->server segment carrying data was seen. */
  sent(seq: number, length: number, now: number): void {
    if (length <= 0) return;
    const end = (seq + length) >>> 0;
    if (this.pending.some((p) => p.end === end)) {
      // same segment again: a retransmission, its ACK says nothing about the round trip
      this.pending = this.pending.filter((p) => p.end !== end);
      return;
    }
    this.pending.push({ end, at: now });
    if (this.pending.length > MAX_PENDING) this.pending.shift();
  }

  /** A server->client segment acknowledging everything before `ack` was seen. */
  acked(ack: number, now: number): void {
    let newest: Pending | null = null;
    const rest: Pending[] = [];
    for (const p of this.pending) {
      if (seqAtOrAfter(ack, p.end)) {
        if (newest === null || p.at > newest.at) newest = p;
      } else {
        rest.push(p);
      }
    }
    this.pending = rest;
    if (newest === null) return;
    const ms = now - newest.at;
    if (ms < 0 || ms > MAX_RTT_MS) return;
    this.samples.push({ ms, at: now });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  /** Current estimate in milliseconds, null when there are no recent samples. */
  value(now: number): number | null {
    const recent = this.samples.filter((s) => now - s.at <= SAMPLE_WINDOW_MS).map((s) => s.ms);
    if (recent.length === 0) return null;
    recent.sort((a, b) => a - b);
    return Math.round(recent[Math.floor((recent.length - 1) * 0.25)] ?? 0);
  }
}
