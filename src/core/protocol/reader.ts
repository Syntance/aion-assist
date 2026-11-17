import { readVarInt } from './varint';

export class DecodeError extends Error {}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const NAME_RE = /^[\p{L}\p{N}]+$/u;
const HAS_LETTER_RE = /\p{L}/u;

/** Strictly decodes a character / legion name; null when the bytes are not a plausible name. */
export function decodeName(bytes: Uint8Array, maxCodePoints = 16): string | null {
  let text: string;
  try {
    text = utf8.decode(bytes);
  } catch {
    return null;
  }
  const count = [...text].length;
  if (count < 1 || count > maxCodePoints) return null;
  if (!NAME_RE.test(text) || !HAS_LETTER_RE.test(text)) return null;
  return text;
}

/** Bounds-checked little-endian cursor. Throws DecodeError past the end. */
export class Reader {
  pos: number;

  constructor(
    readonly buf: Uint8Array,
    start = 0,
  ) {
    this.pos = start;
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  private need(n: number): void {
    if (n < 0 || this.pos + n > this.buf.length) throw new DecodeError('out of bounds');
  }

  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }

  u8(): number {
    this.need(1);
    return this.buf[this.pos++];
  }

  u16(): number {
    this.need(2);
    const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.need(4);
    const b = this.buf;
    const p = this.pos;
    this.pos += 4;
    return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
  }

  /** u64 LE as a JS number (precise up to 2^53, plenty for game values). */
  u64(): number {
    const lo = this.u32();
    const hi = this.u32();
    return hi * 0x1_0000_0000 + lo;
  }

  varint(): number {
    const v = readVarInt(this.buf, this.pos);
    if (v.size < 0) throw new DecodeError('bad varint');
    this.pos += v.size;
    return v.value;
  }

  bytes(n: number): Uint8Array {
    this.need(n);
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  /** u8 length-prefixed name. Throws when it is not a plausible name. */
  name(maxBytes = 48): string {
    const len = this.u8();
    if (len < 1 || len > maxBytes) throw new DecodeError('bad name length');
    const name = decodeName(this.bytes(len));
    if (name === null) throw new DecodeError('bad name');
    return name;
  }
}

export function peekU16(buf: Uint8Array, off: number): number {
  return off + 2 <= buf.length ? buf[off] | (buf[off + 1] << 8) : -1;
}

export function peekU32(buf: Uint8Array, off: number): number {
  if (off + 4 > buf.length) return -1;
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}
