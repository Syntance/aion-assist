/** Unsigned LEB128 (little-endian base-128), max 5 bytes. */

export const VARINT_INCOMPLETE = -1;
export const VARINT_INVALID = -2;

export interface VarIntResult {
  /** Decoded value, or 0 when `size` is negative. */
  value: number;
  /** Bytes consumed, or VARINT_INCOMPLETE / VARINT_INVALID. */
  size: number;
}

export function readVarInt(buf: Uint8Array, offset: number): VarIntResult {
  let value = 0;
  let mul = 1;
  for (let i = 0; i < 5; i++) {
    const pos = offset + i;
    if (pos >= buf.length) return { value: 0, size: VARINT_INCOMPLETE };
    const b = buf[pos];
    value += (b & 0x7f) * mul;
    if ((b & 0x80) === 0) return { value, size: i + 1 };
    mul *= 128;
  }
  return { value: 0, size: VARINT_INVALID };
}

export function encodeVarInt(value: number): Uint8Array {
  const out: number[] = [];
  let v = Math.floor(value);
  do {
    let b = v % 128;
    v = Math.floor(v / 128);
    if (v > 0) b |= 0x80;
    out.push(b);
  } while (v > 0);
  return Uint8Array.from(out);
}
