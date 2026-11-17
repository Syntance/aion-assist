import type { GameEvent } from './protocol/events';
import { walkFrames } from './protocol/framing';
import { encodeVarInt } from './protocol/varint';

/**
 * Discovery mode (`--discover`): finds the packet that carries "target selected".
 *
 * No open-source meter documents it, so the app has to learn it from a live session.
 * While enabled, packets that mention a known player's entity id — and everything in the
 * few seconds after the user presses the marker hotkey — are summarised into a local log.
 * Only the first bytes of each packet are kept; nothing is uploaded.
 */

export type Direction = 'c2s' | 's2c';

const MARK_WINDOW_MS = 3000;
const HEX_BYTES = 160;
const IDENTITY_HEX_BYTES = 480;
const MAX_DUMPS_PER_OPCODE = 80;
const RING_MS = 4000;
const RING_MAX = 700;
const AUTODUMP_GAP_MS = 6000;
const AUTODUMP_MAX = 14;
const MAX_LOGGED_LEN = 400;
const MAX_WATCH_LINES = 1500;
const NAME_EXAMPLES_PER_OPCODE = 10;

/**
 * Server opcodes seen right after the user selected a target (session 2026-11-12):
 * `44 37`, `41 37`, `03 8d` carry the entity id and zeros; `00 8d` then streams that
 * entity's HP; `1c 37` / `1d 37` showed up around earlier selections. Logged always,
 * so their timing can be matched against marks, damage and deaths.
 */
const WATCH_OPCODES = new Set([0x4437, 0x4137, 0x038d, 0x008d, 0x1c37, 0x1d37]);

/** Finds `<len u8 3..16><letters/digits>`: a character-name-shaped field. */
export function findNameField(p: Uint8Array, from = 2): string | null {
  for (let i = from; i + 4 <= p.length; i++) {
    const len = p[i];
    if (len < 3 || len > 16 || i + 1 + len > p.length) continue;
    let ok = true;
    let letters = 0;
    for (let k = 1; k <= len; k++) {
      const c = p[i + k];
      const letter = (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
      if (letter) letters++;
      else if (!(c >= 0x30 && c <= 0x39)) {
        ok = false;
        break;
      }
    }
    if (ok && letters >= 2) return new TextDecoder().decode(p.subarray(i + 1, i + 1 + len));
  }
  return null;
}

interface Stat {
  packets: number;
  withPlayerId: number;
}

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');

function contains(haystack: Uint8Array, needle: Uint8Array, from: number): boolean {
  outer: for (let i = from; i + needle.length <= haystack.length; i++) {
    for (let k = 0; k < needle.length; k++) if (haystack[i + k] !== needle[k]) continue outer;
    return true;
  }
  return false;
}

function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export class Discovery {
  private readonly players = new Map<number, { name: string; needle: Uint8Array }>();
  private readonly stats = new Map<string, Stat>();
  private verboseUntil = -Infinity;
  private marks = 0;
  private statsDirty = false;
  private readonly dumpCounts = new Map<number, number>();
  private watchLines = 0;
  private selfNeedle: Uint8Array | null = null;
  private selfId: number | null = null;
  /** Name bytes to hunt for in every server packet (finds the packets that bind name -> id). */
  private nameNeedles: { name: string; bytes: Uint8Array }[] = [];
  private nameHits = 0;

  watchNames(names: string[]): void {
    this.nameNeedles = names.filter((n) => n.length >= 3).map((name) => ({ name, bytes: new TextEncoder().encode(name) }));
  }
  /** Last few seconds of every server packet; dumped automatically when something dies. */
  private readonly ring: { at: number; line: string }[] = [];
  private lastAutoDump = -Infinity;
  private autoDumps = 0;
  private readonly nameExamples = new Map<number, number>();

  constructor(
    private readonly emit: (line: string) => void,
    /** Server opcodes the app already decodes; they are noise here. */
    private readonly knownServerOpcodes: ReadonlySet<number>,
    /** Self / player identity opcodes: always dumped (capped), to debug their decoders. */
    private readonly identityOpcodes: ReadonlySet<number> = new Set(),
  ) {}

  onEvent(ev: GameEvent, now = Date.now()): void {
    if (ev.t === 'self') {
      this.selfNeedle = encodeVarInt(ev.id);
      this.selfId = ev.id;
      this.emit(`${stamp(now)} SELF id=${ev.id} name=${ev.name ?? '?'} server=${ev.server ?? '?'} class=${ev.classCode ?? '?'}`);
    } else if (ev.t === 'player') {
      if (!this.players.has(ev.id)) {
        this.emit(`${stamp(now)} PLAYER id=${ev.id} name=${ev.name} server=${ev.server ?? '?'} class=${ev.classCode ?? '?'}`);
      }
      this.players.set(ev.id, { name: ev.name, needle: encodeVarInt(ev.id) });
    } else if (ev.t === 'zone') {
      this.players.clear();
      this.emit(`${stamp(now)} ZONE`);
    } else if (ev.t === 'death' && (ev.flag !== 1 || this.players.has(ev.id) || ev.id === this.selfId)) {
      // any combat/player/self death (live: mob despawns are flag 1; player deaths unknown)
      const who = ev.id === this.selfId ? 'SELF' : this.players.has(ev.id) ? `player ${this.players.get(ev.id)?.name}` : 'other';
      this.emit(`${stamp(now)} DEATH id=${ev.id} flag=${ev.flag} who=${who}`);
      this.autoDump(`death id=${ev.id} flag=${ev.flag} ${who}`, now);
    }
  }

  private record(now: number, payload: Uint8Array): void {
    this.ring.push({
      at: now,
      line: `${stamp(now)} RING ${hex(payload.subarray(0, 2))} len=${payload.length} hex=${hex(payload.subarray(2, 34))}`,
    });
    while (this.ring.length > RING_MAX || (this.ring.length > 0 && now - this.ring[0].at > RING_MS)) this.ring.shift();
  }

  private autoDump(reason: string, now: number): void {
    if (this.autoDumps >= AUTODUMP_MAX || now - this.lastAutoDump < AUTODUMP_GAP_MS) return;
    this.lastAutoDump = now;
    this.autoDumps++;
    this.emit(`${stamp(now)} AUTODUMP ${reason} (ostatnie ${RING_MS / 1000}s ruchu serwera: ${this.ring.length} pakietów)`);
    for (const entry of this.ring) this.emit(entry.line);
  }

  note(line: string, now = Date.now()): void {
    this.emit(`${stamp(now)} ${line}`);
  }

  /** The user is about to click a player: log everything for a few seconds. */
  mark(now: number): void {
    this.marks++;
    this.verboseUntil = now + MARK_WINDOW_MS;
    this.emit(`${stamp(now)} MARK ${this.marks} (znani gracze w pobliżu: ${this.players.size})`);
  }

  /** `data` is one TCP payload (c2s) or one decoded frame payload (s2c). */
  onRaw(dir: Direction, data: Uint8Array, now: number): void {
    if (dir === 's2c') {
      this.inspect(dir, data, now);
      return;
    }
    // The client stream most likely uses the server's framing; fall back to the raw segment.
    const frames: Uint8Array[] = [];
    walkFrames(data, (p) => frames.push(p));
    if (frames.length === 0) frames.push(data);
    for (const frame of frames) this.inspect(dir, frame, now);
  }

  private inspect(dir: Direction, payload: Uint8Array, now: number): void {
    if (payload.length < 2) return;
    const opcode = (payload[0] << 8) | payload[1];
    if (dir === 's2c') {
      this.record(now, payload);
      for (const needle of this.nameNeedles) {
        if (this.nameHits < 120 && contains(payload, needle.bytes, 2)) {
          this.nameHits++;
          this.emit(`${stamp(now)} NAMEHIT ${needle.name} ${hex(payload.subarray(0, 2))} len=${payload.length} hex=${hex(payload.subarray(0, 220))}`);
        }
      }
    }
    if (dir === 's2c' && this.identityOpcodes.has(opcode)) {
      const dumped = this.dumpCounts.get(opcode) ?? 0;
      this.dumpCounts.set(opcode, dumped + 1);
      if (dumped < MAX_DUMPS_PER_OPCODE) {
        this.emit(`${stamp(now)} IDENT ${hex(payload.subarray(0, 2))} len=${payload.length} hex=${hex(payload.subarray(0, IDENTITY_HEX_BYTES))}`);
      }
      return;
    }
    if (dir === 's2c' && WATCH_OPCODES.has(opcode)) {
      if (this.watchLines++ < MAX_WATCH_LINES) {
        this.emit(`${stamp(now)} WATCH ${hex(payload.subarray(0, 2))} len=${payload.length} hex=${hex(payload.subarray(0, HEX_BYTES))}`);
      }
      return;
    }
    if (dir === 's2c' && !this.knownServerOpcodes.has(opcode)) {
      // Unknown packets that contain a name: the player-spawn opcode may have moved.
      const seen = this.nameExamples.get(opcode) ?? 0;
      if (seen < NAME_EXAMPLES_PER_OPCODE) {
        const name = findNameField(payload);
        if (name !== null) {
          this.nameExamples.set(opcode, seen + 1);
          this.emit(`${stamp(now)} NAMEPKT ${hex(payload.subarray(0, 2))} name=${name} len=${payload.length} hex=${hex(payload.subarray(0, IDENTITY_HEX_BYTES))}`);
        }
      }
    }
    if (dir === 's2c' && this.knownServerOpcodes.has(opcode)) return;
    // Client->server traffic turned out to be encrypted; keep only what the mark window catches.
    if (dir === 'c2s' && now > this.verboseUntil) return;

    const names: string[] = [];
    // own id: reveals which unknown packets carry the local player's own actions
    if (this.selfNeedle && contains(payload, this.selfNeedle, 2)) names.push('<JA>');
    for (const player of this.players.values()) {
      if (contains(payload, player.needle, 2)) names.push(player.name);
    }
    const key = `${dir} ${hex(payload.subarray(0, 2))}`;
    const stat = this.stats.get(key) ?? { packets: 0, withPlayerId: 0 };
    stat.packets++;
    if (names.length > 0) stat.withPlayerId++;
    this.stats.set(key, stat);
    this.statsDirty = true;

    const verbose = now <= this.verboseUntil;
    if (payload.length > MAX_LOGGED_LEN || (!verbose && names.length === 0)) return;
    const ids = names.length > 0 ? ` gracze=[${names.join(',')}]` : '';
    this.emit(`${stamp(now)} ${key} len=${payload.length}${ids} hex=${hex(payload.subarray(0, HEX_BYTES))}`);
  }

  /** Per-opcode totals, emitted periodically; empty when nothing changed. */
  summary(now: number): string[] {
    if (!this.statsDirty) return [];
    this.statsDirty = false;
    const rows = [...this.stats.entries()]
      .filter(([, s]) => s.withPlayerId > 0)
      .sort((a, b) => b[1].withPlayerId / b[1].packets - a[1].withPlayerId / a[1].packets)
      .slice(0, 20)
      .map(([key, s]) => `  ${key}: ${s.withPlayerId}/${s.packets} z id gracza`);
    return rows.length > 0 ? [`${stamp(now)} SUMMARY`, ...rows] : [];
  }
}
