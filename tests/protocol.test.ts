import { describe, expect, it } from 'vitest';
import { TcpReassembler } from '@core/capture/reassembler';
import { CapturePipeline, hasHeartbeat } from '@core/capture/pipeline';
import { PacketDecoder } from '@core/protocol/decoders';
import type { GameEvent } from '@core/protocol/events';
import { StreamFramer, findFrameStart, walkFrames } from '@core/protocol/framing';
import { lz4DecompressBlock } from '@core/protocol/lz4';
import { DEFAULT_OPCODES, mergeOpcodes, parseOpcode } from '@core/protocol/opcodes';
import { encodeVarInt, readVarInt, VARINT_INCOMPLETE, VARINT_INVALID } from '@core/protocol/varint';
import { W, bundle, concat, damagePayload, frame, heartbeat, tcpFrame } from './helpers';

const decoder = () => new PacketDecoder(DEFAULT_OPCODES);

describe('varint', () => {
  it('round-trips values', () => {
    for (const v of [0, 1, 127, 128, 300, 16_384, 2_097_151, 4_000_000_000]) {
      const enc = encodeVarInt(v);
      expect(readVarInt(enc, 0)).toEqual({ value: v, size: enc.length });
    }
  });
  it('reports incomplete and invalid input', () => {
    expect(readVarInt(Uint8Array.of(0x80), 0).size).toBe(VARINT_INCOMPLETE);
    expect(readVarInt(Uint8Array.of(0x80, 0x80, 0x80, 0x80, 0x80, 0x01), 0).size).toBe(VARINT_INVALID);
  });
});

describe('lz4', () => {
  it('decodes literals and overlapping matches', () => {
    // "ab" literal, then a match of length 6 at offset 2 -> "abababab"
    const block = Uint8Array.of(0x22, 0x61, 0x62, 0x02, 0x00);
    expect(new TextDecoder().decode(lz4DecompressBlock(block, 8) ?? undefined)).toBe('abababab');
  });
  it('rejects malformed blocks', () => {
    expect(lz4DecompressBlock(Uint8Array.of(0x22, 0x61, 0x62, 0x09, 0x00), 8)).toBeNull(); // offset before start
    expect(lz4DecompressBlock(Uint8Array.of(0x20, 0x61, 0x62), 5)).toBeNull(); // size mismatch
  });
});

describe('framing', () => {
  const a = new W().hex('04 38 01 02 03').done();
  const b = new W().hex('42 36 09').done();

  it('walks frames, skipping zero padding', () => {
    const got: Uint8Array[] = [];
    walkFrames(concat(frame(a), Uint8Array.of(0, 0), frame(b)), (p) => got.push(p.slice()));
    expect(got).toEqual([a, b]);
  });

  it('opens LZ4 bundles, including nested ones', () => {
    const got: Uint8Array[] = [];
    walkFrames(bundle(concat(frame(a), bundle(frame(b)))), (p) => got.push(p.slice()));
    expect(got).toEqual([a, b]);
  });

  it('reassembles frames split across pushes', () => {
    const got: Uint8Array[] = [];
    const framer = new StreamFramer((p) => got.push(p.slice()), { assumeSynced: true });
    const stream = concat(frame(a), frame(b), heartbeat());
    for (const byte of stream) framer.push(Uint8Array.of(byte));
    expect(got).toHaveLength(3);
    expect(got[0]).toEqual(a);
  });

  it('skips TLS records sharing the stream', () => {
    const got: Uint8Array[] = [];
    const framer = new StreamFramer((p) => got.push(p.slice()), { assumeSynced: true });
    framer.push(concat(new W().hex('17 03 03 00 03 aa bb cc').done(), frame(a)));
    expect(got).toEqual([a]);
  });

  it('finds a frame boundary when joining mid-stream', () => {
    const junk = new W().hex('9c 41 7e 13 55').done();
    const stream = concat(junk, frame(a), heartbeat(), frame(b), frame(a));
    expect(findFrameStart(stream)).toBe(junk.length);
    const got: Uint8Array[] = [];
    new StreamFramer((p) => got.push(p.slice())).push(stream);
    expect(got).toHaveLength(4);
  });
});

describe('decoders', () => {
  it('decodes a damage record', () => {
    const ev = decoder().decode(damagePayload({ target: 50_001, actor: 1001, amount: 12_345, crit: true }));
    expect(ev).toMatchObject({ t: 'damage', actor: 1001, target: 50_001, amount: 12_345, crit: true, dot: false });
  });

  it('ignores misses and implausible damage', () => {
    const miss = new W().hex('04 38').varint(50_001).varint(0x01).done();
    expect(decoder().decode(miss)).toBeNull();
    expect(decoder().decode(damagePayload({ target: 50_001, actor: 1001, amount: 0 }))).toBeNull();
    expect(decoder().decode(damagePayload({ target: 1001, actor: 1001, amount: 500 }))).toBeNull();
  });

  it('decodes a damage-over-time tick', () => {
    const dot = new W().hex('05 38').varint(50_001).u8(0x0a).varint(1001).varint(1).u32(110_000_000).varint(777).done();
    expect(decoder().decode(dot)).toMatchObject({ t: 'damage', actor: 1001, target: 50_001, amount: 777, dot: true });
  });

  it('decodes the local player identity', () => {
    const self = new W().hex('33 36').varint(1001).u32(0).u8(0x01).name('SilentDeath').u16(1301).u32(17).u8(0).u32(45).done();
    expect(decoder().decode(self)).toEqual({ t: 'self', id: 1001, name: 'SilentDeath', server: 1301, classCode: 17, level: 45 });
  });

  it('decodes another player with a legion run', () => {
    const other = new W()
      .hex('45 36')
      .varint(2001)
      .u32(0)
      .u8(0x01)
      .name('Milenium')
      .u32(5)
      .zeros(9)
      .u16(2301)
      .u32(99)
      .zeros(2)
      .u16(2301)
      .name('Ragnarok')
      .done();
    expect(decoder().decode(other)).toEqual({ t: 'player', id: 2001, name: 'Milenium', classCode: 5, server: 2301, legion: 'Ragnarok' });
  });

  it('rejects names that are not plausible', () => {
    const bad = new W().hex('45 36').varint(2001).u32(0).u8(0x01).u8(3).hex('ff fe 00').u32(5).done();
    expect(decoder().decode(bad)).toBeNull();
  });

  it('decodes deaths and abyss points', () => {
    expect(decoder().decode(new W().hex('42 36').varint(2001).varint(0).varint(3).done())).toEqual({ t: 'death', id: 2001, flag: 3 });
    expect(decoder().decode(new W().hex('ab ff').u64(133_369).u64(2_500_000).done())).toEqual({ t: 'abyssPoints', points: 133_369, limit: 2_500_000 });
    expect(decoder().decode(new W().hex('ab ff').u64(3_000_000).u64(2_500_000).done())).toBeNull();
  });

  it('decodes party roster members with gear score and combat power', () => {
    const member = (slot: number, id: number, name: string, gs: number, cp: number) =>
      new W().u8(0x02).u8(slot).u32(id).u16(0).u16(1301).name(name).u32(17).u32(45).u32(gs).zeros(2).u16(1301).zeros(3).u64(cp).done();
    const roster = concat(new W().hex('02 97').u32(77).zeros(20).done(), member(0, 7001, 'Ken', 3118, 214_500), member(1, 7002, 'BeGe', 2971, 206_300));
    const ev = decoder().decode(roster);
    expect(ev).toMatchObject({
      t: 'party',
      members: [
        { name: 'Ken', server: 1301, characterId: 7001, gearScore: 3118, combatPower: 214_500 },
        { name: 'BeGe', gearScore: 2971, combatPower: 206_300 },
      ],
    });
  });

  it('decodes a live 45 36 player record (2026-11-12 capture)', () => {
    // first bytes of a real record: id 15665, name "SkyBro", class 34 (Chanter)
    const live = new W().hex('45 36 b1 7a 01 20 a0 01 17 06 53 6b 79 42 72 6f 22 00 00 00 01 02 02 00 12 52 17 59').done();
    expect(decoder().decode(live)).toMatchObject({ t: 'player', id: 15_665, name: 'SkyBro', classCode: 34 });
  });

  it('decodes live hits on a training dummy (2026-11-12 capture, actor = local player)', () => {
    const hit = (hexText: string) => decoder().decode(new W().hex(hexText).done());
    const base = { t: 'damage', actor: 11_813, target: 20_368, dot: false };
    // plain hit: scalar 10000, damage 704
    expect(hit('04 38 90 9f 01 04 00 a5 5c c8 59 d1 00 52 02 c7 11 c7 51 01 00 00 00 90 4e c0 05 01 00')).toMatchObject({ ...base, amount: 704, crit: false });
    // plain hit with a non-zero second field: scalar 12873, damage 1862
    expect(hit('04 38 90 9f 01 04 04 a5 5c 40 85 c6 00 4e 02 0b 0d 8c 4d 01 00 00 00 c9 64 c6 0e 01 00 c8 01')).toMatchObject({ ...base, amount: 1862, crit: false });
    // critical hit in the 10-byte block layout, leading zero before the values
    expect(hit('04 38 90 9f 01 26 04 a5 5c 40 85 c6 00 4e 03 04 00 00 25 b7 8b 4d 02 00 00 00 c9 64 f4 23 04 66 66 66 66 02 00 db 01')).toMatchObject({ ...base, amount: 4596, crit: true });
    // multi-hit critical
    expect(hit('04 38 90 9f 01 24 00 a5 5c 32 b6 cb 00 54 03 93 2b 93 4f 01 00 00 00 c9 64 fe 72 04 c6 02 c6 02 c6 02 c6 02 01 00')).toMatchObject({ ...base, crit: true });
    // periodic self-effect (target == actor, no damage value): not a hit
    expect(hit('04 38 a5 5c 00 00 a5 5c 7f 84 c6 00 50 02 a7 c1 8b 4d 01 00 00 00 c9 64 01 00')).toBeNull();
  });

  it('reads gear score and home server from a live record without a legion (TIM00)', () => {
    const live = new W()
      .hex('45 36 e6 17 01 20 a2 01 17 05 54 49 4d 30 30 09 00 00 00 01 01 02 00 52 52 97 59 47 d8 da 53 c7 00 70 a6 46 00 00 07 43 00 60 01 a2 a2 02 a2 a2 02 a2 0c 00 00 a2 0c 00 00 00 00 00 00 00 00 00 00 80 a2 00 00 00 8a 02 00 00 00 00 00 f0 49 02 00 01 00 00 00 a0 86 01 00 a0 86 01 00 a6 d2 09 00 30 39 0a 00 02 2c d8 cc 01 25 d1 cc 01 26 05 11 11 10 db c3 c9 01 ff ff ff ff ff ff ff ff 80 75 d5 2a bb 03 00 00 e6 17 01 00 04 37 d4 c7 b2 1b ca c7 00 e8 ab 46 11 11 35 c4 c9 01 ff ff ff')
      .done();
    // home server 1318 sits after "25 d1 cc 01" (a u32 in 5M..100M); "d2 09" earlier is a false lead
    expect(decoder().decode(live)).toEqual({ t: 'player', id: 3046, name: 'TIM00', classCode: 9, server: 1318, legion: null, gearScore: 3234 });
  });

  it('does not read a server id from inside the stat pair after the 100000 x2 marker (BAKI, live)', () => {
    const live = new W()
      .hex(
        '45 36 f8 2e 01 20 a6 01 17 04 42 41 4b 49 15 00 00 00 01 01 02 00 d2 52 17 5b 47 d8 5a 52 c7 00 42 a6 46 00 00 07 43 00 60 01 d6 8b 01 d6 8b 01 0a 0e 00 00 0a 0e 00 00 00 00 00 00 00 00 00 00 43 f3 00 00 1c 7d 02 00 00 00 00 00 f0 49 02 00 01 00 00 00 a0 86 01 00 a0 86 01 00 01 b5 08 00 65 7b 0c 00 02 2c d8 cc 01 38 d6 cc 01 65 84 c6 00 26 05 0d 11 10 03 c4 c9 01 ff ff ff ff',
      )
      .done();
    expect(decoder().decode(live)).toMatchObject({ t: 'player', name: 'BAKI', server: 1318, gearScore: 3594 });
  });

  it('never reads the 100000 x2 marker as gear score', () => {
    const rec = new W()
      .hex('45 36')
      .varint(5000)
      .u32(0x01a02001)
      .u8(0x17)
      .name('Faora')
      .u32(9)
      .zeros(24)
      .hex('a0 86 01 00 a0 86 01 00')
      .zeros(8)
      .done();
    const ev = decoder().decode(rec);
    expect(ev).toMatchObject({ t: 'player', name: 'Faora' });
    expect(ev && 'gearScore' in ev ? ev.gearScore : undefined).toBeUndefined();
  });

  it('finds the server and legion ~100 bytes into a live record (LoktarOGar)', () => {
    const live = new W()
      .hex('45 36 82 17 03 20 a6 01 17 0a 4c 6f 6b 74 61 72 4f 47 61 72 09 00 00 00 01 01 02 80 d2 52 17 58 47 d8 da 55 c7 00 70 a6 46 00 00 07 43 00 60 01 d1 92 02 d1 92 02 ba 0f 00 00 ba 0f 00 00 00 00 00 00 00 00 00 00 10 3a 01 00 60 48 02 00 00 00 00 00 f0 49 02 00 01 00 00 00 a0 86 01 00 a0 86 01 00 10 eb 09 00 10 eb 09 00 01 00 00 00 02 2c d8 cc 01 2c d8 cc 01 ee 17 53 02 26 05 71 00 00 00 00 00 26 05 06 41 73 63 65 6e 64 01 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 11 11')
      .done();
    expect(decoder().decode(live)).toEqual({ t: 'player', id: 2946, name: 'LoktarOGar', classCode: 9, server: 1318, legion: 'Ascend', gearScore: 4026 });
  });

  it('reads server, class, level and gear score of the local player (live 33 36)', () => {
    const live = new W()
      .hex('33 36 d0 14 5f 91 eb 2a 3f 0b 53 69 6c 65 6e 74 44 65 61 74 68 26 05 12 00 00 00 01 2d 00 00 00 f3 0a 00 00 f5 0a 00 00 2d 00 00 00')
      .done();
    expect(decoder().decode(live)).toEqual({ t: 'self', id: 2640, name: 'SilentDeath', server: 1318, classCode: 18, level: 45, gearScore: 2803 });
  });

  it('finds player records embedded inside other packets', () => {
    const record = new W().hex('45 36').varint(15_665).u32(0x01a02001).u8(0x17).name('SkyBro').u32(34).zeros(6).done();
    const host = concat(new W().hex('05 8a 00 11 22 33').done(), record, new W().hex('45 36 00 ff').done());
    const found = decoder().embeddedPlayers(host);
    expect(found).toEqual([{ t: 'player', id: 15_665, name: 'SkyBro', classCode: 34, server: null, legion: null }]);
  });

  it('decodes live entity HP records (training dummy, Abyss capture 2026-11-12)', () => {
    // u64 format: current HP 119700, then 58631
    expect(decoder().decode(new W().hex('00 8d 90 9f 01 02 01 00 94 d3 01 00 00 00 00 00').done())).toEqual({ t: 'hp', id: 20_368, cur: 119_700, max: null });
    expect(decoder().decode(new W().hex('00 8d 90 9f 01 02 01 00 07 e5 00 00 00 00 00 00').done())).toEqual({ t: 'hp', id: 20_368, cur: 58_631, max: null });
    // max HP record (kind 7) and the u32 format used for the local player (kind 6 only: ignored)
    expect(decoder().decode(new W().hex('00 8d c8 5e 02 01 07').u64(17_171).done())).toEqual({ t: 'hp', id: 12_104, cur: null, max: 17_171 });
    expect(decoder().decode(new W().hex('00 8d f9 04 01 01 06 5c 70 0b 00').done())).toBeNull();
  });

  it('decodes the stagger gauge and break per the documented layout', () => {
    expect(decoder().decode(new W().hex('05 e0').varint(20_368).hex('03 01').u32(1000).u32(640).u8(1).done())).toEqual({ t: 'stagger', id: 20_368, max: 1000, rest: 640, broken: false });
    expect(decoder().decode(new W().hex('05 e0').varint(20_368).hex('00 03 02').done())).toEqual({ t: 'stagger', id: 20_368, max: 0, rest: 0, broken: true });
    expect(decoder().decode(new W().hex('05 e0').varint(20_368).hex('03 01').u32(10).u32(99).u8(1).done())).toBeNull(); // rest > max
  });

  it('decodes a live expedition lobby roster: members, GS, CP, ready flag, leader (2026-11-12 23:13)', () => {
    const live = new W().hex('02 97 de 68 0a 00 0c 4c 65 61 76 69 6e 67 20 6e 6f 77 2e 05 0e 4f 09 00 04 03 7b 92 03 00 00 00 26 05 3f 01 00 05 0c 01 7b 92 03 00 00 00 26 05 0b 53 69 6c 65 6e 74 44 65 61 74 68 12 00 00 00 2d 00 00 00 f3 0a 00 00 26 05 26 05 04 7b 64 02 00 00 00 00 00 00 01 01 0c 02 82 a1 03 00 00 00 26 05 0b e3 83 84 53 48 41 44 45 e3 83 84 0a 00 00 00 2d 00 00 00 ec 09 00 00 26 05 26 05 04 59 fc 01 00 00 00 00 00 00 01 01 0e 03 e9 1b 04 00 00 00 0c 09 07 41 6c 6d 61 72 65 6e 17 00 00 00 2d 00 00 00 2b 0a 00 00 0c 09 0c 09 04 28 1d 02 00 00 00 00 00 00 01 01 0c 04 78 61 01 00 00 00 27 05 08 41 72 74 65 6d 69 64 65 0e 00 00 00 2d 00 00 00 86 0a 00 00 27 05 27 05 04 87 53 02 00 00 00 00 00 00 01 01 00 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03 00 00 00 00 00 00 00 00 00 00 00 00 09').done();
    const ev = decoder().decode(live);
    expect(ev).toMatchObject({ t: 'party', title: 'Leaving now.' });
    if (ev?.t !== 'party') return;
    expect(ev.members.map((m) => [m.name, m.gearScore, m.combatPower, m.ready, m.slot])).toEqual([
      ['SilentDeath', 2803, 156_795, false, 1],
      ['ツSHADEツ', 2540, 130_137, false, 2],
      ['Almaren', 2603, 138_536, true, 3],
      ['Artemide', 2694, 152_455, false, 4],
    ]);
    // the leader's id is announced right before the member list
    expect(ev.leaderId).toBe(ev.members[0].characterId);
  });

  it('counts unknown opcodes for diagnostics', () => {
    const d = decoder();
    d.decode(new W().hex('99 99 01').done());
    expect(d.seen.get(0x9999)).toBe(1);
  });
});

describe('opcodes', () => {
  it('parses and merges overrides', () => {
    expect(parseOpcode('04 38')).toBe(0x0438);
    expect(parseOpcode('nope')).toBeNull();
    const table = mergeOpcodes({ damage: '05 39', death: 'bad', bogus: '01 02' });
    expect(table.damage).toBe(0x0539);
    expect(table.death).toBe(DEFAULT_OPCODES.death);
  });
});

describe('tcp reassembly', () => {
  it('orders out-of-order segments and drops retransmits', () => {
    const out: number[] = [];
    const r = new TcpReassembler((d) => out.push(...d), () => out.push(-1));
    r.push(100, Uint8Array.of(1, 2), 0);
    r.push(104, Uint8Array.of(5, 6), 1);
    r.push(102, Uint8Array.of(3, 4), 2);
    r.push(100, Uint8Array.of(1, 2), 3); // retransmit
    r.push(105, Uint8Array.of(6, 7), 4); // partial overlap
    expect(out).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('skips a hole after the hold time and reports the gap', () => {
    const out: number[] = [];
    const r = new TcpReassembler((d) => out.push(...d), () => out.push(-1));
    r.push(10, Uint8Array.of(1), 0);
    r.push(20, Uint8Array.of(9), 10);
    r.push(21, Uint8Array.of(8), 600);
    expect(out).toEqual([1, -1, 9, 8]);
  });

  it('handles sequence wrap-around', () => {
    const out: number[] = [];
    const r = new TcpReassembler((d) => out.push(...d), () => out.push(-1));
    r.push(0xffff_fffe, Uint8Array.of(1, 2), 0);
    r.push(0, Uint8Array.of(3), 1);
    expect(out).toEqual([1, 2, 3]);
  });
});

describe('capture pipeline', () => {
  it('detects the heartbeat signature only with a plausible clock', () => {
    expect(hasHeartbeat(heartbeat())).toBe(true);
    expect(hasHeartbeat(frame(new W().hex('00 36').u64(12).done()))).toBe(false);
  });

  it('locks onto the game flow and decodes its server->client stream', () => {
    const events: GameEvent[] = [];
    const status: (number | null)[] = [];
    const pipe = new CapturePipeline(DEFAULT_OPCODES, (e) => events.push(e), (s) => status.push(s.port));
    let seq = 5000;
    const send = (payload: Uint8Array, srcPort = 13328, dstPort = 50_000) => {
      pipe.feed(tcpFrame({ srcPort, dstPort, seq, payload }), 1, 1000);
      seq += payload.length;
    };
    // unrelated traffic and the client->server half are ignored
    send(frame(damagePayload({ target: 50_001, actor: 1001, amount: 1 })), 8080, 50_001);
    expect(status).toEqual([]);

    send(concat(heartbeat(), frame(damagePayload({ target: 50_001, actor: 1001, amount: 4321 })), heartbeat()));
    send(concat(frame(damagePayload({ target: 50_001, actor: 1001, amount: 99 })), heartbeat()));
    expect(status).toEqual([13328]);
    expect(events.filter((e) => e.t === 'damage').map((e) => (e.t === 'damage' ? e.amount : 0))).toEqual([4321, 99]);

    pipe.tick(1000 + 31_000);
    expect(status).toEqual([13328, null]);
  });
});

describe('damage packets with the 0x30 flag pair (live 2026-11-18)', () => {
  it('reads the actor of a hit whose switch byte is 0x36, with no extra varint', () => {
    // captured Abyss session: iShadow (10461) hits target 31361 for 10313; the old decoder read actor 24 and dropped it
    const payload = Buffer.from('04 38 81 f5 01 36 04 dd 51 18 48 c7 00 4a 02 80 00 01 6c 29 d8 4d 01 00 00 00 9c 85 01 c9 50 01 87 08 01 00 bf 09'.replace(/ /g, ''), 'hex');
    const ev = new PacketDecoder(DEFAULT_OPCODES).decode(payload);
    expect(ev).toMatchObject({ t: 'damage', actor: 10461, target: 31361, amount: 10313 });
  });
});
