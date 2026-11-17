/**
 * One-direction TCP stream reassembly: orders segments by sequence number, trims
 * retransmitted overlap, and after a bounded wait skips a hole (reporting it as a gap).
 */

const MAX_HELD = 64;
const MAX_HOLD_MS = 500;

interface Held {
  data: Uint8Array;
  at: number;
}

export class TcpReassembler {
  private next: number | null = null;
  private readonly held = new Map<number, Held>();

  constructor(
    private readonly onData: (data: Uint8Array) => void,
    private readonly onGap: () => void,
  ) {}

  push(seq: number, payload: Uint8Array, nowMs: number): void {
    if (payload.length === 0) return;
    if (this.next === null) this.next = seq;

    const diff = (seq - this.next) | 0;
    if (diff > 0) {
      // copy: the capture buffer behind `payload` is reused by the next packet
      this.held.set(seq, { data: payload.slice(), at: nowMs });
      if (this.held.size > MAX_HELD || this.oldestAge(nowMs) > MAX_HOLD_MS) this.skipGap();
      return;
    }
    this.deliver(seq, payload);
    this.flush();
  }

  private deliver(seq: number, payload: Uint8Array): void {
    const next = this.next as number;
    const overlap = (next - seq) | 0;
    if (overlap >= payload.length) return; // pure retransmit
    const fresh = overlap > 0 ? payload.subarray(overlap) : payload;
    this.onData(fresh);
    this.next = (next + fresh.length) >>> 0;
  }

  private flush(): void {
    let progressed = true;
    while (progressed && this.held.size > 0) {
      progressed = false;
      for (const [seq, held] of this.held) {
        if (((seq - (this.next as number)) | 0) <= 0) {
          this.held.delete(seq);
          this.deliver(seq, held.data);
          progressed = true;
        }
      }
    }
  }

  private oldestAge(nowMs: number): number {
    let oldest = nowMs;
    for (const held of this.held.values()) if (held.at < oldest) oldest = held.at;
    return nowMs - oldest;
  }

  private skipGap(): void {
    let nearest: number | null = null;
    let best = Infinity;
    for (const seq of this.held.keys()) {
      const d = (seq - (this.next as number)) | 0;
      if (d < best) {
        best = d;
        nearest = seq;
      }
    }
    if (nearest === null) return;
    this.onGap();
    this.next = nearest;
    this.flush();
  }
}
