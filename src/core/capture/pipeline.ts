import { PacketDecoder } from '../protocol/decoders';
import type { GameEvent } from '../protocol/events';
import { StreamFramer } from '../protocol/framing';
import type { OpcodeTable } from '../protocol/opcodes';
import { TcpReassembler } from './reassembler';
import { RttTracker } from './rtt';
import { StreamDelay } from './streamDelay';
import { parseTcpSegment, type TcpSegment } from './tcp';

/**
 * Captured frame -> game events.
 *
 * The game connection is found passively by its heartbeat: the server sends
 * `0E 00 36 <u64 LE unix-ms clock>` every few seconds. A flow that shows it is locked
 * and only its server->client half is ever decoded.
 */

export const DEFAULT_GAME_PORT = 13328;
const CLOCK_MIN = 1_577_836_800_000; // 2020-01-01
const CLOCK_MAX = 4_102_444_800_000; // 2100-01-01
const CANDIDATE_WINDOW_MS = 30_000;
const STALE_MS = 30_000;
const TAKEOVER_IDLE_MS = 5_000;
const PING_EVERY_MS = 1_000;

export interface PipelineStatus {
  locked: boolean;
  port: number | null;
  /** Identifies the TCP connection; stable for as long as the game keeps it open. */
  flow: string | null;
}

interface Candidate {
  hits: number;
  last: number;
}

interface LockedFlow {
  key: string;
  /** The client->server half of the same connection (only read in discovery mode). */
  reverseKey: string;
  port: number;
  lastSeen: number;
  reassembler: TcpReassembler;
  rtt: RttTracker;
  delay: StreamDelay;
  lastPing: number;
}

function looksLikeTls(p: Uint8Array): boolean {
  return p.length >= 3 && p[0] >= 0x14 && p[0] <= 0x17 && p[1] === 0x03 && p[2] <= 0x04;
}

export function hasHeartbeat(p: Uint8Array): boolean {
  for (let i = 0; i + 11 <= p.length; i++) {
    if (p[i] !== 0x0e || p[i + 1] !== 0x00 || p[i + 2] !== 0x36) continue;
    const lo = (p[i + 3] | (p[i + 4] << 8) | (p[i + 5] << 16) | (p[i + 6] << 24)) >>> 0;
    const hi = (p[i + 7] | (p[i + 8] << 8) | (p[i + 9] << 16) | (p[i + 10] << 24)) >>> 0;
    const clock = hi * 0x1_0000_0000 + lo;
    if (clock >= CLOCK_MIN && clock <= CLOCK_MAX) return true;
  }
  return false;
}

const flowKey = (s: TcpSegment): string => `${s.srcIp}:${s.srcPort}>${s.dstIp}:${s.dstPort}`;

export class CapturePipeline {
  private readonly decoder: PacketDecoder;
  private readonly candidates = new Map<string, Candidate>();
  private flow: LockedFlow | null = null;
  /** Time of the packet being processed: when the data it completes is handed to the decoder. */
  private now = 0;
  /** TCP holes skipped by the reassembler (each one can drop a whole packet). */
  gaps = 0;

  constructor(
    opcodes: OpcodeTable,
    private readonly onEvent: (event: GameEvent) => void,
    private readonly onStatus: (status: PipelineStatus) => void,
    /** Discovery tap: client TCP payloads and decoded server frame payloads. */
    private readonly onRaw?: (dir: 'c2s' | 's2c', data: Uint8Array) => void,
    /** Discovery tap: every server->client TCP segment of the locked flow, before reassembly. */
    private readonly onSegment?: (seg: TcpSegment, nowMs: number) => void,
  ) {
    this.decoder = new PacketDecoder(opcodes);
  }

  get opcodeStats(): Map<number, number> {
    return this.decoder.seen;
  }

  get opcodeAccepted(): Map<number, number> {
    return this.decoder.accepted;
  }

  /** Feed one captured link-layer frame. */
  feed(frame: Uint8Array, linkType: number, nowMs: number): void {
    const seg = parseTcpSegment(frame, linkType);
    if (!seg) return;
    const key = flowKey(seg);

    if (this.flow && key === this.flow.key) {
      this.flow.lastSeen = nowMs;
      if (seg.rst || seg.fin) {
        this.unlock();
        return;
      }
      if (seg.payload.length > 0) this.onSegment?.(seg, nowMs);
      this.now = nowMs; // data delivered by this push reaches the game "now" (late when it waited for a retransmission)
      this.flow.reassembler.push(seg.seq, seg.payload, nowMs);
      if (seg.hasAck) this.flow.rtt.acked(seg.ack, nowMs);
      return;
    }
    if (this.flow && key === this.flow.reverseKey) {
      this.flow.rtt.sent(seg.seq, seg.payload.length, nowMs);
      if (this.onRaw && seg.payload.length > 0) this.onRaw('c2s', seg.payload);
      return;
    }
    if (seg.payload.length === 0 || looksLikeTls(seg.payload) || !hasHeartbeat(seg.payload)) return;

    const prev = this.candidates.get(key);
    const cand: Candidate =
      prev && nowMs - prev.last <= CANDIDATE_WINDOW_MS ? { hits: prev.hits + 1, last: nowMs } : { hits: 1, last: nowMs };
    this.candidates.set(key, cand);
    const needed = seg.srcPort === DEFAULT_GAME_PORT ? 1 : 2;
    if (cand.hits < needed) return;
    if (this.flow && nowMs - this.flow.lastSeen < TAKEOVER_IDLE_MS) return;
    this.lock(key, seg, nowMs);
  }

  /** Call periodically; drops a lock that went silent (logout, server change). */
  tick(nowMs: number): void {
    if (this.flow && nowMs - this.flow.lastSeen > STALE_MS) this.unlock();
    if (this.flow && nowMs - this.flow.lastPing >= PING_EVERY_MS) {
      this.flow.lastPing = nowMs;
      // game = how late the data stream is (what the player feels, and what Abyss Logs shows);
      // net = TCP round trip to the server (what an ICMP ping approximates)
      const net = this.flow.rtt.value(nowMs);
      const lateness = this.flow.delay.value(nowMs);
      // The delay the player really has: the network round trip (measured, not assumed) plus how late the
      // server's stream is running on top of it.
      const total = lateness !== null ? (net ?? 0) + lateness.late : net;
      if (total !== null) this.onEvent({ t: 'ping', ms: total, net, late: lateness?.late ?? null, peak: lateness?.peak ?? null });
    }
    for (const [key, cand] of this.candidates) {
      if (nowMs - cand.last > CANDIDATE_WINDOW_MS) this.candidates.delete(key);
    }
  }

  private lock(key: string, seg: TcpSegment, nowMs: number): void {
    const delay = new StreamDelay();
    const framer = new StreamFramer((payload) => {
      this.onRaw?.('s2c', payload);
      const event = this.decoder.decode(payload);
      if (event?.t === 'heartbeat') delay.onHeartbeat(event.clock, this.now);
      if (event) this.onEvent(event);
      for (const embedded of this.decoder.embeddedPlayers(payload)) this.onEvent(embedded);
      for (const embedded of this.decoder.embeddedNpcs(payload)) this.onEvent(embedded);
    });
    const reassembler = new TcpReassembler(
      (data) => framer.push(data),
      () => {
        this.gaps++;
        framer.markGap();
      },
    );
    const reverseKey = `${seg.dstIp}:${seg.dstPort}>${seg.srcIp}:${seg.srcPort}`;
    this.flow = { key, reverseKey, port: seg.srcPort, lastSeen: nowMs, reassembler, rtt: new RttTracker(), delay, lastPing: 0 };
    this.candidates.clear();
    this.onStatus({ locked: true, port: seg.srcPort, flow: key });
    // The segment that completed the lock is mid-stream; the framer syncs on its own.
    this.now = nowMs;
    reassembler.push(seg.seq, seg.payload, nowMs);
  }

  private unlock(): void {
    this.flow = null;
    this.onStatus({ locked: false, port: null, flow: null });
  }
}
