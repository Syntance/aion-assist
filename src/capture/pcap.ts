import koffi, { type TypeObject } from 'koffi';

/**
 * Thin binding to Npcap's wpcap.dll (libpcap API) through koffi — no native build step.
 * Capture is strictly passive: the handle is opened non-promiscuous and nothing is ever
 * injected (pcap_sendpacket / pcap_inject are deliberately not bound).
 */

type Ptr = bigint;

export interface PcapDevice {
  name: string;
  description: string;
}

export interface CapturedPacket {
  data: Uint8Array;
}

interface Bindings {
  findalldevs(out: [Ptr | null], errbuf: Buffer): number;
  freealldevs(devs: Ptr): void;
  openLive(device: string, snaplen: number, promisc: number, toMs: number, errbuf: Buffer): Ptr | null;
  datalink(handle: Ptr): number;
  nextEx: (handle: Ptr, hdr: [Ptr | null], data: [Ptr | null]) => number;
  compile(handle: Ptr, program: object, filter: string, optimize: number, netmask: number): number;
  setfilter(handle: Ptr, program: object): number;
  freecode(program: object): void;
  geterr(handle: Ptr): string;
  close(handle: Ptr): void;
  setbuff(handle: Ptr, bytes: number): number;
  setnonblock(handle: Ptr, nonblock: number, errbuf: Buffer): number;
  setmintocopy(handle: Ptr, size: number): number;
  stats(handle: Ptr, out: Record<string, number>): number;
  ifType: TypeObject;
  hdrType: TypeObject;
}

let bindings: Bindings | null = null;

function load(): Bindings {
  if (bindings) return bindings;
  const dir = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\Npcap`;
  // wpcap.dll depends on Packet.dll in the same folder
  const kernel32 = koffi.load('kernel32.dll');
  kernel32.func('bool __stdcall SetDllDirectoryW(str16 path)')(dir);
  const lib = koffi.load(`${dir}\\wpcap.dll`);

  const ifType = koffi.struct('pcap_if', {
    next: 'void *',
    name: 'str',
    description: 'str',
    addresses: 'void *',
    flags: 'uint32',
  });
  const hdrType = koffi.struct('pcap_pkthdr', { tv_sec: 'long', tv_usec: 'long', caplen: 'uint32', len: 'uint32' });
  koffi.struct('bpf_program', { bf_len: 'uint32', bf_insns: 'void *' });
  // Windows layout of struct pcap_stat (extra fields are present under _WIN32)
  koffi.struct('pcap_stat', {
    ps_recv: 'uint32',
    ps_drop: 'uint32',
    ps_ifdrop: 'uint32',
    ps_capt: 'uint32',
    ps_sent: 'uint32',
    ps_netdrop: 'uint32',
  });

  bindings = {
    findalldevs: lib.func('int pcap_findalldevs(_Out_ void **alldevs, void *errbuf)'),
    freealldevs: lib.func('void pcap_freealldevs(void *alldevs)'),
    openLive: lib.func('void *pcap_open_live(str device, int snaplen, int promisc, int to_ms, void *errbuf)'),
    datalink: lib.func('int pcap_datalink(void *p)'),
    nextEx: lib.func('int pcap_next_ex(void *p, _Out_ void **hdr, _Out_ void **data)'),
    compile: lib.func('int pcap_compile(void *p, _Out_ bpf_program *fp, str filter, int optimize, uint32 netmask)'),
    setfilter: lib.func('int pcap_setfilter(void *p, bpf_program *fp)'),
    freecode: lib.func('void pcap_freecode(bpf_program *fp)'),
    geterr: lib.func('str pcap_geterr(void *p)'),
    close: lib.func('void pcap_close(void *p)'),
    setbuff: lib.func('int pcap_setbuff(void *p, int dim)'),
    setnonblock: lib.func('int pcap_setnonblock(void *p, int nonblock, void *errbuf)'),
    setmintocopy: lib.func('int pcap_setmintocopy(void *p, int size)'),
    stats: lib.func('int pcap_stats(void *p, _Out_ pcap_stat *ps)'),
    ifType,
    hdrType,
  };
  return bindings;
}

const cString = (buf: Buffer): string => buf.toString('latin1').replace(/\0[\s\S]*$/, '');

/** Capture devices that have an address (i.e. can carry the game's traffic). */
export function listDevices(): PcapDevice[] {
  const b = load();
  const err = Buffer.alloc(256);
  const out: [Ptr | null] = [null];
  if (b.findalldevs(out, err) !== 0) throw new Error(`pcap_findalldevs: ${cString(err)}`);
  const head = out[0];
  const devices: PcapDevice[] = [];
  for (let p = head; p; ) {
    const dev = koffi.decode(p, b.ifType) as { next: Ptr | null; name: string; description: string | null; addresses: Ptr | null };
    if (dev.addresses) devices.push({ name: dev.name, description: dev.description ?? dev.name });
    p = dev.next;
  }
  if (head) b.freealldevs(head);
  return devices;
}

export class PcapHandle {
  readonly linkType: number;
  private closed = false;

  private constructor(
    private readonly b: Bindings,
    private readonly handle: Ptr,
  ) {
    this.linkType = b.datalink(handle);
  }

  static open(device: string): PcapHandle {
    const b = load();
    const err = Buffer.alloc(256);
    // snaplen 65535, promiscuous OFF (only this machine's own traffic), 100 ms read timeout
    const handle = b.openLive(device, 65535, 0, 100, err);
    if (!handle) throw new Error(cString(err) || 'pcap_open_live failed');
    // Npcap's default 1 MB kernel buffer overflows during map-load bursts (the packet
    // carrying the local character is in that burst). 32 MB absorbs it.
    b.setbuff(handle, 32 * 1024 * 1024);
    // Non-blocking reads, drained from a timer: no thread pool, no per-adapter waits.
    if (b.setnonblock(handle, 1, err) !== 0) {
      b.close(handle);
      throw new Error(`pcap_setnonblock: ${cString(err)}`);
    }
    // Hand packets over as soon as they arrive instead of batching 16 KB in the driver.
    b.setmintocopy(handle, 1);
    return new PcapHandle(b, handle);
  }

  /** Next buffered packet, or null when none is waiting (never blocks). Throws on errors. */
  readNow(): Uint8Array | null {
    const hdr: [Ptr | null] = [null];
    const data: [Ptr | null] = [null];
    const res = this.b.nextEx(this.handle, hdr, data);
    if (res === 0) return null;
    if (res !== 1 || !hdr[0] || !data[0]) throw new Error(`pcap_next_ex: ${this.b.geterr(this.handle)}`);
    const header = koffi.decode(hdr[0], this.b.hdrType) as { caplen: number };
    // decode() copies out of the driver buffer, which is reused by the next read
    return koffi.decode(data[0], koffi.array('uint8', header.caplen, 'Typed')) as Uint8Array;
  }

  /** Kernel-side counters: `drop` > 0 means packets were lost before we read them. */
  stats(): { recv: number; drop: number; ifdrop: number } | null {
    if (this.closed) return null;
    const out: Record<string, number> = {};
    if (this.b.stats(this.handle, out) !== 0) return null;
    return { recv: out.ps_recv ?? 0, drop: out.ps_drop ?? 0, ifdrop: out.ps_ifdrop ?? 0 };
  }

  setFilter(filter: string): void {
    const program = {};
    if (this.b.compile(this.handle, program, filter, 1, 0xffffffff) !== 0) {
      throw new Error(`pcap_compile("${filter}"): ${this.b.geterr(this.handle)}`);
    }
    const rc = this.b.setfilter(this.handle, program);
    this.b.freecode(program);
    if (rc !== 0) throw new Error(`pcap_setfilter: ${this.b.geterr(this.handle)}`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.b.close(this.handle);
  }
}
