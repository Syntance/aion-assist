/** Minimal link-layer / IPv4 / TCP header parsing for captured frames. */

export interface TcpSegment {
  srcIp: number;
  dstIp: number;
  srcPort: number;
  dstPort: number;
  seq: number;
  /** Acknowledgement number and whether the ACK flag is set (used for the round-trip estimate). */
  ack: number;
  hasAck: boolean;
  syn: boolean;
  fin: boolean;
  rst: boolean;
  payload: Uint8Array;
}

// pcap DLT_* link types
export const DLT_NULL = 0;
export const DLT_EN10MB = 1;
export const DLT_RAW = 12;
export const DLT_RAW_ALT = 14;
export const DLT_RAW_IP = 101;
export const DLT_IPV4 = 228;

function ipOffset(data: Uint8Array, linkType: number): number {
  switch (linkType) {
    case DLT_EN10MB: {
      let off = 12;
      // up to two 802.1Q / 802.1ad VLAN tags
      for (let i = 0; i < 2; i++) {
        if (off + 2 > data.length) return -1;
        const type = (data[off] << 8) | data[off + 1];
        if (type === 0x8100 || type === 0x88a8) off += 4;
        else break;
      }
      if (off + 2 > data.length) return -1;
      const etherType = (data[off] << 8) | data[off + 1];
      return etherType === 0x0800 ? off + 2 : -1;
    }
    case DLT_NULL:
      // 4-byte address family in host order; AF_INET = 2
      return data.length >= 4 && data[0] === 2 ? 4 : -1;
    case DLT_RAW:
    case DLT_RAW_ALT:
    case DLT_RAW_IP:
    case DLT_IPV4:
      return 0;
    default:
      return -1;
  }
}

function u32be(data: Uint8Array, off: number): number {
  return ((data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3]) >>> 0;
}

export function parseTcpSegment(data: Uint8Array, linkType: number): TcpSegment | null {
  const ip = ipOffset(data, linkType);
  if (ip < 0 || ip + 20 > data.length) return null;
  if (data[ip] >> 4 !== 4) return null;
  const ihl = (data[ip] & 0x0f) * 4;
  if (ihl < 20 || data[ip + 9] !== 6) return null;
  // The IP total length cuts Ethernet padding; 0 means TSO, so fall back to the frame end.
  const totalLen = (data[ip + 2] << 8) | data[ip + 3];
  const end = totalLen === 0 ? data.length : Math.min(data.length, ip + totalLen);
  const tcp = ip + ihl;
  if (tcp + 20 > end) return null;
  const dataOffset = (data[tcp + 12] >> 4) * 4;
  if (dataOffset < 20 || tcp + dataOffset > end) return null;
  const flags = data[tcp + 13];
  return {
    srcIp: u32be(data, ip + 12),
    dstIp: u32be(data, ip + 16),
    srcPort: (data[tcp] << 8) | data[tcp + 1],
    dstPort: (data[tcp + 2] << 8) | data[tcp + 3],
    seq: u32be(data, tcp + 4),
    ack: u32be(data, tcp + 8),
    hasAck: (flags & 0x10) !== 0,
    fin: (flags & 0x01) !== 0,
    syn: (flags & 0x02) !== 0,
    rst: (flags & 0x04) !== 0,
    payload: data.subarray(tcp + dataOffset, end),
  };
}
