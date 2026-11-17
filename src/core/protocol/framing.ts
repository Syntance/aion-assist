import { lz4DecompressBlock } from './lz4';
import { readVarInt, VARINT_INCOMPLETE, VARINT_INVALID } from './varint';

/**
 * AION 2 stream framing (server -> client):
 *   frame   = <varint L> <payload>, where L = payload length + 4
 *   payload = <opcode: 2 bytes> <body>
 *   bundle  = payload starting FF FF, <u32 LE decompressed size>, <raw LZ4 block>;
 *             the decompressed data is again a sequence of frames (bundles nest).
 *   0x00 bytes between frames are padding; TLS records sharing the port are skipped.
 */

const MAX_FRAME = 65535;
const FRAGMENT_WAIT = 16384;
const MAX_DECOMPRESSED = 1_000_000;
const MAX_BUNDLE_DEPTH = 4;
const RESYNC_WINDOW = 8192;

/** Second opcode byte of the packet families seen on the game stream. */
const COMMON_OPCODE_HI = new Set([0x36, 0x37, 0x38, 0x56, 0x61, 0x8d, 0x91, 0x92, 0x96, 0x97, 0xe0, 0xe3, 0xff]);

export type PacketSink = (payload: Uint8Array) => void;

/** Diagnostics: a failing bundle silently drops every packet inside it. */
export const framingStats = {
  bundlesOk: 0,
  bundlesFailed: 0,
  bundlesTooDeep: 0,
  innerFrames: 0,
  lastFailed: '' as string,
};

const hexOf = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');

function tlsRecordLength(buf: Uint8Array, off: number): number {
  // returns total record size, 0 when not a TLS record, -1 when more bytes are needed to decide
  const b0 = buf[off];
  if (b0 < 0x14 || b0 > 0x17) return 0;
  if (off + 5 > buf.length) return off + 1 < buf.length && buf[off + 1] !== 0x03 ? 0 : -1;
  if (buf[off + 1] !== 0x03 || buf[off + 2] < 0x01 || buf[off + 2] > 0x04) return 0;
  const len = (buf[off + 3] << 8) | buf[off + 4];
  if (len === 0 || len > 16640) return 0;
  return 5 + len;
}

function isBundleHeader(buf: Uint8Array, off: number, available: number): boolean {
  if (available < 6 || buf[off] !== 0xff || buf[off + 1] !== 0xff) return false;
  const size = readU32(buf, off + 2);
  return size >= 1 && size <= MAX_DECOMPRESSED;
}

function readU32(buf: Uint8Array, off: number): number {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function handlePayload(payload: Uint8Array, sink: PacketSink, depth: number): void {
  if (isBundleHeader(payload, 0, payload.length)) {
    if (depth >= MAX_BUNDLE_DEPTH) {
      framingStats.bundlesTooDeep++;
      return;
    }
    const inner = lz4DecompressBlock(payload.subarray(6), readU32(payload, 2));
    if (inner) {
      framingStats.bundlesOk++;
      walk(inner, (p) => {
        framingStats.innerFrames++;
        sink(p);
      }, false, depth + 1);
    } else {
      framingStats.bundlesFailed++;
      framingStats.lastFailed = `len=${payload.length} size=${readU32(payload, 2)} head=${hexOf(payload.subarray(0, 40))}`;
    }
    return;
  }
  sink(payload);
}

/**
 * Walks frames in `buf`. Returns the number of bytes consumed. In streaming mode
 * (top level) an incomplete trailing frame is left unconsumed; inner (bundle) data is
 * always complete, so walking simply stops at the first unparseable length.
 */
function walk(buf: Uint8Array, sink: PacketSink, streaming: boolean, depth: number): number {
  let off = 0;
  while (off < buf.length) {
    if (buf[off] === 0x00) {
      off++;
      continue;
    }
    if (streaming) {
      const tls = tlsRecordLength(buf, off);
      if (tls === -1) break;
      if (tls > 0) {
        if (off + tls > buf.length) break;
        off += tls;
        continue;
      }
    }
    const v = readVarInt(buf, off);
    if (v.size === VARINT_INCOMPLETE) {
      if (streaming) break;
      return buf.length;
    }
    const payloadLen = v.value - 4;
    const total = v.size + payloadLen;
    if (v.size === VARINT_INVALID || payloadLen < 0 || total > MAX_FRAME) {
      if (!streaming) return buf.length;
      off++; // resync one byte at a time
      continue;
    }
    if (off + total > buf.length) {
      if (!streaming) return buf.length;
      const available = buf.length - off - v.size;
      if (total <= FRAGMENT_WAIT || isBundleHeader(buf, off + v.size, available)) break;
      off++;
      continue;
    }
    if (payloadLen >= 2) handlePayload(buf.subarray(off + v.size, off + total), sink, depth);
    off += total;
  }
  return off;
}

/** Finds an offset where several whole, plausible frames follow each other. -1 if none. */
export function findFrameStart(buf: Uint8Array): number {
  const limit = Math.min(buf.length, RESYNC_WINDOW);
  for (let start = 0; start < limit; start++) {
    if (buf[start] === 0x00) continue;
    let off = start;
    let frames = 0;
    let sawBundle = false;
    let ok = true;
    while (frames < 3 && off < buf.length) {
      if (buf[off] === 0x00) {
        off++;
        continue;
      }
      const v = readVarInt(buf, off);
      const payloadLen = v.value - 4;
      const total = v.size + payloadLen;
      if (v.size < 0 || payloadLen < 2 || total > MAX_FRAME || off + total > buf.length) {
        ok = false;
        break;
      }
      const p = off + v.size;
      const bundle = isBundleHeader(buf, p, payloadLen);
      if (!bundle && !COMMON_OPCODE_HI.has(buf[p + 1])) {
        ok = false;
        break;
      }
      sawBundle ||= bundle;
      frames++;
      off += total;
    }
    if (!ok) continue;
    if (frames >= 3 || (frames === 2 && off === buf.length) || (frames >= 1 && sawBundle)) return start;
  }
  return -1;
}

/** Incremental frame decoder for one direction of the game TCP stream. */
export class StreamFramer {
  private buf: Uint8Array = new Uint8Array(0);
  private synced: boolean;

  constructor(
    private readonly sink: PacketSink,
    opts: { assumeSynced?: boolean } = {},
  ) {
    this.synced = opts.assumeSynced ?? false;
  }

  /** Call after lost bytes: drops buffered data and searches for a frame boundary again. */
  markGap(): void {
    this.buf = new Uint8Array(0);
    this.synced = false;
  }

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    if (!this.synced) {
      const start = findFrameStart(this.buf);
      if (start < 0) {
        if (this.buf.length > 4 * RESYNC_WINDOW) this.buf = this.buf.slice(this.buf.length - RESYNC_WINDOW);
        return;
      }
      this.buf = this.buf.subarray(start);
      this.synced = true;
    }
    const consumed = walk(this.buf, this.sink, true, 0);
    this.buf = this.buf.slice(consumed);
  }
}

/** Decodes a complete buffer of frames (used for tests and bundles). */
export function walkFrames(buf: Uint8Array, sink: PacketSink): void {
  walk(buf, sink, false, 0);
}
