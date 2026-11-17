import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TcpReassembler } from '@core/capture/reassembler';
import { PacketDecoder } from '@core/protocol/decoders';
import { StreamFramer } from '@core/protocol/framing';
import { DEFAULT_OPCODES } from '@core/protocol/opcodes';

/**
 * Replays a raw server->client TCP log (`[ts] src=.. dst=.. seq=N len=N hex=..` lines)
 * through reassembly, framing and decoding. Point REPLAY_RAW_TCP at such a file to run it.
 */
const file = process.env.REPLAY_RAW_TCP;

describe.skipIf(!file || !existsSync(file))('replay of a raw TCP capture', () => {
  it('frames and decodes the stream', () => {
    const lines = readFileSync(file as string, 'utf8').split(/\r?\n/);
    const decoder = new PacketDecoder(DEFAULT_OPCODES);
    const perOpcode = new Map<string, number>();
    let frames = 0;
    let gaps = 0;
    const servers = new Map<string, number>();
    const gearScores: number[] = [];
    let noGs = 0;
    const kills: string[] = [];
    const notePlayer = (ev: ReturnType<PacketDecoder['decode']>): void => {
      if (ev?.t === 'kill') kills.push(`${ev.killerName}(${ev.killerId})->${ev.target}`);
      if (ev?.t !== 'player') return;
      if (ev.gearScore !== undefined) gearScores.push(ev.gearScore);
      else noGs++;
      const key = ev.server === null ? 'none' : String(ev.server);
      servers.set(key, (servers.get(key) ?? 0) + 1);
    };
    const framer = new StreamFramer((p) => {
      frames++;
      const op = `${p[1].toString(16).padStart(2, '0')}${p[0].toString(16).padStart(2, '0')}`;
      perOpcode.set(op, (perOpcode.get(op) ?? 0) + 1);
      notePlayer(decoder.decode(p));
      for (const ev of decoder.embeddedPlayers(p)) notePlayer(ev);
    });
    const re = new TcpReassembler(
      (d) => framer.push(d),
      () => {
        gaps++;
        framer.markGap();
      },
    );
    let segments = 0;
    for (const line of lines) {
      const m = /^\[(\d+)\] src=13328 .*?seq=(\d+) .*?hex=([0-9A-Fa-f]+)/.exec(line);
      if (!m) continue;
      segments++;
      re.push(Number(m[2]) >>> 0, Uint8Array.from(Buffer.from(m[3], 'hex')), Number(m[1]));
    }
    const top = [...perOpcode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.warn(JSON.stringify({ segments, frames, gaps, top, damageSeen: decoder.seen.get(0x0438), damageOk: decoder.accepted.get(0x0438), selfOk: decoder.accepted.get(0x3336), playerServers: [...servers.entries()], kills, gs: { n: gearScores.length, none: noGs, min: Math.min(...gearScores), max: Math.max(...gearScores), below1000: gearScores.filter((g) => g < 1000) } }));
    expect(frames).toBeGreaterThan(0);
  });
});
