import { appendFileSync, writeFileSync } from 'node:fs';
import { CapturePipeline } from '@core/capture/pipeline';
import type { GameEvent } from '@core/protocol/events';
import { Discovery } from '@core/discovery';
import { framingStats } from '@core/protocol/framing';
import { mergeOpcodes } from '@core/protocol/opcodes';
import type { CaptureToMain, MainToCapture } from '@shared/captureMessages';
import { listDevices, PcapHandle } from './pcap';

/**
 * Capture utility process: Npcap -> TCP reassembly -> frames -> GameEvents.
 * Raw packets never leave this process; only decoded events are posted to main.
 */

const WIDE_FILTER = 'ip and tcp and not port 80 and not port 443';
const FLUSH_MS = 50;
const RESCAN_MS = 15_000;

const post = (message: CaptureToMain): void => process.parentPort.postMessage(message);

interface Device {
  handle: PcapHandle;
  appliedFilter: string;
}

let wantedFilter = WIDE_FILTER;
let pipeline: CapturePipeline | null = null;
let queue: GameEvent[] = [];
let discovery: Discovery | null = null;
let discoveryLines: string[] = [];
const SUMMARY_MS = 10_000;
const devices = new Map<string, Device>();
const DRAIN_MS = 10;
const MAX_PER_DRAIN = 20_000;

/**
 * Non-blocking drain of every adapter, on the JS thread. The previous design kept one
 * blocking pcap_next_ex (100 ms timeout) per adapter on libuv's 4-thread pool: with 13
 * adapters the game's adapter got a turn every few hundred ms and fell minutes behind
 * (measured against Abyss Logs: 8 KB read vs 107 KB sent in the same 38 s).
 */
function drainAll(): void {
  for (const [name, device] of devices) {
    try {
      if (device.appliedFilter !== wantedFilter) {
        device.handle.setFilter(wantedFilter);
        device.appliedFilter = wantedFilter;
      }
      for (let i = 0; i < MAX_PER_DRAIN; i++) {
        const packet = device.handle.readNow();
        if (!packet) break;
        pipeline?.feed(packet, device.handle.linkType, Date.now());
      }
    } catch {
      // adapter went away (VPN closed, Wi-Fi off) — the periodic rescan reopens it
      devices.delete(name);
      device.handle.close();
    }
  }
}

function scanDevices(): void {
  let found;
  try {
    found = listDevices();
  } catch (err) {
    post({ type: 'status', state: 'error', detail: `Npcap: ${(err as Error).message}`, port: null });
    return;
  }
  let lastError: string | null = null;
  for (const dev of found) {
    if (devices.has(dev.name)) continue;
    try {
      const device: Device = { handle: PcapHandle.open(dev.name), appliedFilter: '' };
      devices.set(dev.name, device);
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  if (devices.size === 0) {
    post({
      type: 'status',
      state: 'error',
      detail: lastError ?? 'Nie znaleziono żadnej karty sieciowej do nasłuchu.',
      port: null,
    });
  }
}

let rawLines: string[] = [];
/** Stop recording raw packets after this many characters so a long session cannot fill the disk. */
const RAW_LIMIT_CHARS = 400_000_000;
let rawChars = 0;

function start(
  opcodeOverrides: Record<string, string> | null,
  discover: boolean,
  watchNames: string[],
  rawPath: string | null,
): void {
  const opcodes = mergeOpcodes(opcodeOverrides);
  if (discover) {
    discovery = new Discovery(
      (line) => discoveryLines.push(line),
      new Set(Object.values(opcodes)),
      // identity packets plus the combat ones, so their live layout can be checked
      // 0x048d: kill record (target, skill, killer id, server, killer name)
      new Set([opcodes.selfInfo, opcodes.playerInfo, opcodes.damage, opcodes.dotTick, opcodes.death, 0x048d, opcodes.stagger, opcodes.partyRoster, opcodes.partyLeftWorld, opcodes.partyLeftInstance]),
    );
    discovery.watchNames(watchNames);
    if (watchNames.length > 0) discovery.note(`WATCHNAMES ${watchNames.join(', ')}`);
  }
  pipeline = new CapturePipeline(
    opcodes,
    (event) => {
      queue.push(event);
      discovery?.onEvent(event);
    },
    (status) => {
      wantedFilter = status.port !== null ? `ip and tcp port ${status.port}` : WIDE_FILTER;
      post({ type: 'status', state: status.locked ? 'locked' : 'searching', detail: null, port: status.port, flow: status.flow });
      discovery?.note(status.locked ? `LOCK port=${status.port}` : 'UNLOCK');
    },
    discovery ? (dir, data) => discovery?.onRaw(dir, data, Date.now()) : undefined,
    rawPath
      ? (seg, now) => {
          // same line format as Abyss Logs' raw_tcp.log, so both can be replayed and compared
          if (rawChars > RAW_LIMIT_CHARS) return;
          const line = `[${now}] src=${seg.srcPort} dst=${seg.dstPort} seq=${seg.seq} len=${seg.payload.length} hex=${Buffer.from(seg.payload).toString('hex').toUpperCase()}`;
          rawChars += line.length + 1;
          rawLines.push(line);
        }
      : undefined,
  );
  if (rawPath) {
    writeFileSync(rawPath, '', 'utf8');
    setInterval(() => {
      if (rawLines.length === 0) return;
      appendFileSync(rawPath, `${rawLines.join('\n')}\n`, 'utf8');
      rawLines = [];
    }, 1000);
  }
  if (discovery) {
    setInterval(() => discoveryLines.push(...(discovery?.summary(Date.now()) ?? [])), SUMMARY_MS);
    // seen vs. decoded per known opcode: a big gap means the packet layout changed
    const tracked = Object.entries(opcodes).filter(([name]) => name !== 'heartbeat');
    setInterval(() => {
      const parts = tracked
        .map(([name, code]) => {
          const seen = pipeline?.opcodeStats.get(code) ?? 0;
          return seen > 0 ? `${name}=${pipeline?.opcodeAccepted.get(code) ?? 0}/${seen}` : null;
        })
        .filter((p): p is string => p !== null);
      if (parts.length > 0) discovery?.note(`DECODED ${parts.join(' ')}`);
      const drops = [...devices.entries()]
        .map(([name, d]) => ({ name, st: d.handle.stats() }))
        .filter((x) => x.st && x.st.recv > 0)
        .map((x) => `${x.name.slice(-12)} recv=${x.st?.recv} drop=${x.st?.drop}`);
      discovery?.note(`CAPTURE gaps=${pipeline?.gaps ?? 0} ${drops.join(' | ')}`);
      const s = framingStats;
      discovery?.note(
        `BUNDLES ok=${s.bundlesOk} fail=${s.bundlesFailed} tooDeep=${s.bundlesTooDeep} innerFrames=${s.innerFrames}` +
          (s.lastFailed ? ` lastFailed: ${s.lastFailed}` : ''),
      );
    }, SUMMARY_MS);
  }
  post({ type: 'status', state: 'searching', detail: null, port: null });
  scanDevices();
  setInterval(drainAll, DRAIN_MS);

  setInterval(() => {
    pipeline?.tick(Date.now());
    if (queue.length > 0) {
      post({ type: 'events', events: queue });
      queue = [];
    }
    if (discoveryLines.length > 0) {
      post({ type: 'discovery', lines: discoveryLines });
      discoveryLines = [];
    }
  }, FLUSH_MS);
  setInterval(scanDevices, RESCAN_MS);
}

process.parentPort.on('message', (e: { data: MainToCapture }) => {
  const message = e.data;
  if (message.type === 'mark') {
    discovery?.mark(Date.now());
    return;
  }
  if (message.type === 'note') {
    discovery?.note(message.line);
    return;
  }
  if (message.type === 'init' && !pipeline) {
    try {
      start(message.opcodes, message.discover, message.watchNames ?? [], message.rawTcpPath ?? null);
    } catch (err) {
      post({ type: 'status', state: 'error', detail: (err as Error).message, port: null });
    }
  }
});
