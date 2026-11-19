import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine/engine';
import type { GameEvent } from '../src/core/protocol/events';
import { PacketDecoder } from '../src/core/protocol/decoders';
import { DEFAULT_OPCODES } from '../src/core/protocol/opcodes';

/**
 * Compares what our DPS window shows with what Abyss Logs saved, fight by fight and player by player.
 * Run: ABYSS_SESSION=<unzipped debug export>/session.log pnpm vitest run tests/abyss-compare.test.ts
 * Abyss keeps every fight in ~/.abyss-dps-meter/segments/<id>.abyss (override with ABYSS_SEGMENTS_DIR); the ones that
 * fall inside the session are picked from summaries.json. Optional FIGHT_IDLE_SEC = our idle setting (default 8).
 */
const session = process.env.ABYSS_SESSION;
const dir = process.env.ABYSS_SEGMENTS_DIR ?? join(homedir(), '.abyss-dps-meter', 'segments');
const idleSec = Number(process.env.FIGHT_IDLE_SEC ?? 8);

type Field = [number, number | Buffer];
function varint(b: Buffer, at: number): [number, number] {
  let value = 0;
  let shift = 0;
  let i = at;
  for (;;) {
    const c = b[i++];
    value += (c & 0x7f) * 2 ** shift;
    shift += 7;
    if ((c & 0x80) === 0) return [value, i];
  }
}
/** A flat protobuf reader: enough for the .abyss segment files. */
function fields(b: Buffer): Field[] {
  const out: Field[] = [];
  let i = 0;
  while (i < b.length) {
    const [key, j] = varint(b, i);
    i = j;
    const wire = key % 8;
    const field = Math.floor(key / 8);
    if (wire === 0) {
      const [v, k] = varint(b, i);
      out.push([field, v]);
      i = k;
    } else if (wire === 1) {
      out.push([field, b.readDoubleLE(i)]);
      i += 8;
    } else if (wire === 5) {
      out.push([field, b.readFloatLE(i)]);
      i += 4;
    } else if (wire === 2) {
      const [len, k] = varint(b, i);
      out.push([field, b.subarray(k, k + len)]);
      i = k + len;
    } else throw new Error(`wire type ${wire}`);
  }
  return out;
}
const get = (fs: Field[], n: number): number | Buffer | undefined => fs.find((f) => f[0] === n)?.[1];

/** `ABYS` + version, a length-prefixed header (label, start/end in ns), then 2 bytes and a length-prefixed body (players). */
function readSegment(file: string): { label: string; start: number; end: number; players: Map<string, number> } {
  const b = readFileSync(file);
  const [headLen, h] = varint(b, 8);
  const head = fields(b.subarray(h, h + headLen));
  const [bodyLen, s] = varint(b, h + headLen + 2);
  const players = new Map<string, number>();
  for (const [n, v] of fields(b.subarray(s, s + bodyLen))) {
    if (n !== 1 || !Buffer.isBuffer(v)) continue;
    const inner = get(fields(v), 2);
    if (!Buffer.isBuffer(inner)) continue;
    const p = fields(inner);
    const name = get(p, 2);
    const total = get(p, 6);
    if (Buffer.isBuffer(name) && typeof total === 'number') players.set(name.toString('utf8'), total);
  }
  return { label: String(get(head, 2)), start: Number(get(head, 3)) / 1e6, end: Number(get(head, 4)) / 1e6, players };
}

describe.skipIf(!session)('our meter against Abyss Logs', () => {
  it('shows the same damage per player in every fight', () => {
    const lines = readFileSync(session as string, 'utf8').split('\n');
    const stamps = lines.map((l) => /^\[(\d+)\]/.exec(l)?.[1]).filter((x): x is string => x !== undefined).map(Number);
    const from = stamps[0];
    const to = stamps[stamps.length - 1];
    const summaries = JSON.parse(readFileSync(join(dir, 'summaries.json'), 'utf8')) as { id: string; startTime: string }[];
    const segs = summaries
      .filter((x) => Date.parse(x.startTime) >= from && Date.parse(x.startTime) <= to)
      .map((x) => readSegment(join(dir, `${x.id}.abyss`)))
      .sort((a, b) => a.start - b.start);

    const decoder = new PacketDecoder(DEFAULT_OPCODES);
    const engine = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => idleSec * 1000 });
    type FightView = { start: number; rows: Map<string, { damage: number }> };
    const view = engine as unknown as { meter: FightView | null };
    const fights: FightView[] = [];
    for (const line of lines) {
      const m = /^\[(\d+)\] opcode=0x[0-9A-F]+ known=\w+ len=\d+ raw=([0-9A-F]+)/.exec(line);
      if (!m) continue;
      const raw = Buffer.from(m[2], 'hex');
      let off = 0;
      while (raw[off] & 0x80) off++;
      const payload = raw.subarray(off + 1);
      const events: GameEvent[] = [];
      const ev = decoder.decode(payload);
      if (ev) events.push(ev);
      events.push(...decoder.embeddedPlayers(payload));
      for (const e of events) engine.apply(e, Number(m[1]));
      if (view.meter && fights[fights.length - 1] !== view.meter) fights.push(view.meter);
    }

    const report: string[] = [];
    let worst = 0;
    for (const seg of segs) {
      // our fights that started inside this Abyss fight (a shorter idle setting can split one in two)
      const ours = new Map<string, number>();
      for (const f of fights.filter((x) => x.start >= seg.start - 50 && x.start < seg.end)) {
        for (const [name, t] of f.rows) ours.set(name, (ours.get(name) ?? 0) + t.damage);
      }
      report.push(`${seg.label} ${new Date(seg.start).toISOString().slice(11, 19)}`);
      for (const [name, total] of seg.players) {
        const mine = ours.get(name) ?? 0;
        const diff = total > 0 ? mine / total - 1 : 0;
        worst = Math.max(worst, Math.abs(diff));
        report.push(`  ${name.padEnd(16)} abyss ${String(total).padStart(9)}  ours ${String(mine).padStart(9)}  ${(diff * 100).toFixed(2)}%`);
      }
    }
    process.stdout.write(`${report.join('\n')}\nworst ${(worst * 100).toFixed(2)}% over ${segs.length} fights\n`);
    expect(segs.length).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.005);
  });
});
