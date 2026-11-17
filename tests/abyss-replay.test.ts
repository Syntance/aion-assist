import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { PacketDecoder } from '../src/core/protocol/decoders';
import { DEFAULT_OPCODES } from '../src/core/protocol/opcodes';
import { Engine } from '../src/core/engine/engine';
import type { GameEvent } from '../src/core/protocol/events';

// Temporary analysis: replays an Abyss Logs session.log through our decoder + engine.
const file = process.env.ABYSS_SESSION;
const outFile = process.env.ABYSS_OUT ?? 'abyss-analysis.txt';

describe.skipIf(!file)('abyss session replay', () => {
  it('replays', () => {
    const lines = readFileSync(file as string, 'utf8').split('\n');
    const decoder = new PacketDecoder(DEFAULT_OPCODES);
    const engine = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000 });
    const out: string[] = [];
    let lastSnap = 0;
    let prevTotal = 0;
    const counts: Record<string, number> = {};
    for (const line of lines) {
      const m = /^\[(\d+)\] opcode=0x([0-9A-F]+) known=\w+ len=(\d+) raw=([0-9A-F]+)/.exec(line);
      if (!m) continue;
      const ts = Number(m[1]);
      const raw = Buffer.from(m[4], 'hex');
      let off = 0;
      while (raw[off] & 0x80) off++;
      const payload = raw.subarray(off + 1);
      const evs: GameEvent[] = [];
      const ev = decoder.decode(payload);
      if (ev) evs.push(ev);
      evs.push(...decoder.embeddedPlayers(payload));
      for (const e of evs) {
        counts[e.t] = (counts[e.t] ?? 0) + 1;
        engine.apply(e, ts);
        if (e.t === 'death' || e.t === 'zone' || e.t === 'party' || e.t === 'partyLeft' || e.t === 'self') {
          out.push(`${new Date(ts).toISOString().slice(11, 23)} EVENT ${JSON.stringify(e, (_k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 160)}`);
        }
        if (e.t === 'death' && [9947, 5896, 15991, 3752, 16325, 40713].includes(e.id)) {
          const priv = engine as unknown as { playerName(id: number): string | null; selfId: number | null; party: Set<string> };
          out.push(`${new Date(ts).toISOString().slice(11, 23)} DEATHEV id=${e.id} flag=${e.flag} name=${priv.playerName(e.id)} self=${priv.selfId} party=${[...priv.party].join('|')}`);
        }
        if (e.t === 'kill') out.push(`${new Date(ts).toISOString().slice(11, 23)} KILLEV ${JSON.stringify(e, (_k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 200)}`);
        if (e.t === 'mapLoad') out.push(`${new Date(ts).toISOString().slice(11, 23)} MAPLOAD ${e.mapId}`);
        if (e.t === 'party') out.push(`${new Date(ts).toISOString().slice(11, 23)} PARTY dungeonId=${e.dungeonId} title=${e.title}`);
        if (e.t === 'npc' && ts > 0) out.push(`${new Date(ts).toISOString().slice(11, 23)} NPC id=${e.id} code=${e.code}`);
        if (e.t === 'hp') {
          out.push(`${new Date(ts).toISOString().slice(11, 23)} HP id=${e.id} cur=${e.cur} max=${e.max}`);
        }
      }
      if (ts - lastSnap >= 1000) {
        lastSnap = ts;
        const s = engine.meterSnapshot(ts);
        const flag = s.total < prevTotal ? '  <-- RESET' : '';
        const priv = engine as unknown as {
          meter: { targets: Map<number, number> } | null;
          hp: Map<number, { cur: number | null; max: number | null }>;
          hpPeak: Map<number, number>;
          deadIds: Set<number>;
          heldBoss(f: unknown): number | null;
        };
        if (priv.meter && (s.total > 0 || prevTotal > 0)) {
          const top = [...priv.meter.targets.entries()].sort((a, b) => b[1] - a[1])[0];
          if (top) {
            const h = priv.hp.get(top[0]);
            out.push(`${new Date(ts).toISOString().slice(11, 23)} TOP id=${top[0]} dmg=${top[1]} hpCur=${h?.cur} peak=${priv.hpPeak.get(top[0])} dead=${priv.deadIds.has(top[0])} held=${priv.heldBoss(priv.meter)}`);
          }
        }
        if (s.total > 0 || prevTotal > 0) out.push(`${new Date(ts).toISOString().slice(11, 23)} METER active=${s.active} total=${s.total} dur=${Math.round(s.durationMs / 1000)}s rows=${s.rows.length} deaths=${s.deaths}${flag}`);
        prevTotal = s.total;
      }
    }
    out.push(`COUNTS ${JSON.stringify(counts)}`);
    writeFileSync(outFile, out.join('\n'));
  });
});
