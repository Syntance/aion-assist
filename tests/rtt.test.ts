import { describe, expect, it } from 'vitest';
import { RttTracker } from '../src/core/capture/rtt';

describe('RttTracker', () => {
  it('measures the time from a client data segment to the server ACK covering it', () => {
    const rtt = new RttTracker();
    rtt.sent(1000, 50, 10_000);
    rtt.acked(1050, 10_064);
    expect(rtt.value(10_100)).toBe(64);
  });

  it('a cumulative ACK uses the newest segment it covers', () => {
    const rtt = new RttTracker();
    rtt.sent(1000, 50, 10_000);
    rtt.sent(1050, 50, 10_030);
    rtt.acked(1100, 10_090); // covers both: 60 ms for the newer one
    expect(rtt.value(10_100)).toBe(60);
  });

  it('an ACK that does not cover the data yet gives no sample', () => {
    const rtt = new RttTracker();
    rtt.sent(1000, 50, 10_000);
    rtt.acked(1020, 10_050);
    expect(rtt.value(10_100)).toBeNull();
    rtt.acked(1050, 10_080);
    expect(rtt.value(10_100)).toBe(80);
  });

  it('ignores retransmissions (their ACK is ambiguous)', () => {
    const rtt = new RttTracker();
    rtt.sent(1000, 50, 10_000);
    rtt.sent(1000, 50, 10_400); // retransmitted
    rtt.acked(1050, 10_450);
    expect(rtt.value(10_500)).toBeNull();
  });

  it('works across the 32-bit sequence wrap-around', () => {
    const rtt = new RttTracker();
    rtt.sent(0xffff_fff0, 32, 10_000); // ends at 0x10 after the wrap
    rtt.acked(0x10, 10_045);
    expect(rtt.value(10_100)).toBe(45);
  });

  it('reports the lower quartile, so delayed ACKs do not inflate the ping', () => {
    const rtt = new RttTracker();
    const delays = [60, 62, 61, 200, 63, 180, 64, 59];
    let seq = 1000;
    let t = 10_000;
    for (const d of delays) {
      rtt.sent(seq, 10, t);
      rtt.acked(seq + 10, t + d);
      seq += 10;
      t += 500;
    }
    const value = rtt.value(t);
    expect(value).toBeGreaterThanOrEqual(59);
    expect(value).toBeLessThanOrEqual(62);
  });

  it('forgets old samples and rejects absurd ones', () => {
    const rtt = new RttTracker();
    rtt.sent(1000, 10, 10_000);
    rtt.acked(1010, 10_050);
    expect(rtt.value(10_100)).toBe(50);
    expect(rtt.value(60_000)).toBeNull(); // 50 s later: stale
    rtt.sent(2000, 10, 70_000);
    rtt.acked(2010, 77_000); // 7 s: not a round trip
    expect(rtt.value(77_100)).toBeNull();
  });

  it('ignores empty segments', () => {
    const rtt = new RttTracker();
    rtt.sent(1000, 0, 10_000);
    rtt.acked(1000, 10_010);
    expect(rtt.value(10_100)).toBeNull();
  });
});
