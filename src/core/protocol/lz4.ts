/** Raw LZ4 block decompression. Returns null on any malformed input. */
export function lz4DecompressBlock(src: Uint8Array, dstSize: number): Uint8Array | null {
  const dst = new Uint8Array(dstSize);
  let s = 0;
  let d = 0;
  while (s < src.length) {
    const token = src[s++];
    let litLen = token >> 4;
    if (litLen === 15) {
      let b: number;
      do {
        if (s >= src.length) return null;
        b = src[s++];
        litLen += b;
      } while (b === 255);
    }
    if (s + litLen > src.length || d + litLen > dstSize) return null;
    dst.set(src.subarray(s, s + litLen), d);
    s += litLen;
    d += litLen;
    if (s >= src.length) break; // last sequence carries literals only

    if (s + 2 > src.length) return null;
    const offset = src[s] | (src[s + 1] << 8);
    s += 2;
    if (offset === 0 || offset > d) return null;
    let matchLen = token & 0x0f;
    if (matchLen === 15) {
      let b: number;
      do {
        if (s >= src.length) return null;
        b = src[s++];
        matchLen += b;
      } while (b === 255);
    }
    matchLen += 4;
    if (d + matchLen > dstSize) return null;
    for (let i = 0; i < matchLen; i++, d++) dst[d] = dst[d - offset];
  }
  return d === dstSize ? dst : null;
}
