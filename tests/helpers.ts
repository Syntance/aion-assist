import { encodeVarInt } from '@core/protocol/varint';

/** Byte builder for synthetic packets. */
export class W {
  private readonly parts: number[] = [];

  hex(text: string): this {
    for (const b of text.trim().split(/\s+/)) this.parts.push(parseInt(b, 16));
    return this;
  }
  u8(v: number): this {
    this.parts.push(v & 0xff);
    return this;
  }
  u16(v: number): this {
    return this.u8(v).u8(v >> 8);
  }
  u32(v: number): this {
    return this.u16(v & 0xffff).u16(v >>> 16);
  }
  u64(v: number): this {
    return this.u32(v % 0x1_0000_0000).u32(Math.floor(v / 0x1_0000_0000));
  }
  varint(v: number): this {
    this.parts.push(...encodeVarInt(v));
    return this;
  }
  zeros(n: number): this {
    for (let i = 0; i < n; i++) this.parts.push(0);
    return this;
  }
  name(text: string): this {
    const bytes = new TextEncoder().encode(text);
    this.u8(bytes.length);
    this.parts.push(...bytes);
    return this;
  }
  bytes(data: Uint8Array): this {
    this.parts.push(...data);
    return this;
  }
  done(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

/** Wraps a payload in a frame: varint(payload + 4) + payload. */
export function frame(payload: Uint8Array): Uint8Array {
  return new W().varint(payload.length + 4).bytes(payload).done();
}

export function concat(...chunks: Uint8Array[]): Uint8Array {
  return new W().bytes(Uint8Array.from(chunks.flatMap((c) => [...c]))).done();
}

/** Literal-only LZ4 block (valid, just uncompressed). */
export function lz4Literal(data: Uint8Array): Uint8Array {
  const w = new W();
  if (data.length < 15) w.u8(data.length << 4);
  else {
    w.u8(0xf0);
    let rest = data.length - 15;
    while (rest >= 255) {
      w.u8(255);
      rest -= 255;
    }
    w.u8(rest);
  }
  return w.bytes(data).done();
}

export function bundle(inner: Uint8Array): Uint8Array {
  return frame(new W().hex('ff ff').u32(inner.length).bytes(lz4Literal(inner)).done());
}

export const heartbeat = (clock = 1_794_000_000_000): Uint8Array => frame(new W().hex('00 36').u64(clock).done());

export function damagePayload(o: { target: number; actor: number; amount: number; crit?: boolean; skill?: number }): Uint8Array {
  return new W()
    .hex('04 38')
    .varint(o.target)
    .varint(0x04) // hit kind 4 -> 8-byte block
    .varint(0)
    .varint(o.actor)
    .u32(o.skill ?? 1_100_000)
    .u8(0)
    .varint(o.crit ? 3 : 0)
    .zeros(8)
    .varint(5000) // actor power scalar
    .varint(o.amount)
    .done();
}

/** Ethernet + IPv4 + TCP frame around a payload. */
export function tcpFrame(o: { srcPort: number; dstPort: number; seq: number; payload: Uint8Array; flags?: number }): Uint8Array {
  const total = 20 + 20 + o.payload.length;
  return new W()
    .zeros(12)
    .hex('08 00')
    .hex('45 00')
    .u8(total >> 8)
    .u8(total)
    .zeros(5)
    .u8(6) // protocol TCP
    .zeros(2)
    .hex('0a 00 00 01 0a 00 00 02')
    .u8(o.srcPort >> 8)
    .u8(o.srcPort)
    .u8(o.dstPort >> 8)
    .u8(o.dstPort)
    .u8(o.seq >>> 24)
    .u8(o.seq >>> 16)
    .u8(o.seq >>> 8)
    .u8(o.seq)
    .zeros(4)
    .u8(0x50)
    .u8(o.flags ?? 0x18)
    .zeros(6)
    .bytes(o.payload)
    .done();
}
