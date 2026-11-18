import { describe, expect, it } from 'vitest';
import { Engine, type EngineStore } from '../src/core/engine/engine';
import { PacketDecoder } from '../src/core/protocol/decoders';
import { mergeOpcodes } from '../src/core/protocol/opcodes';

const decoder = new PacketDecoder(mergeOpcodes(null));
const hex = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s.replace(/\s+/g, ''), 'hex'));
const T0 = 1_800_000_000_000;

describe('Odyle energy', () => {
  it('decodes a balance update (a real packet: charged 290)', () => {
    // 0C 61 = opcode, 00, pool 08 (charged), id 60000001, value A2 02 = 290, trailing 03
    expect(decoder.decode(hex('0C 61 00 08 01 87 93 03 A2 02 03'))).toEqual({ t: 'odyle', snapshot: false, basic: null, charged: 290 });
    // pool 04 = basic
    expect(decoder.decode(hex('0C 61 00 04 01 87 93 03 C0 02 03'))).toEqual({ t: 'odyle', snapshot: false, basic: 320, charged: null });
  });

  it('reads both balances when the pool byte is 0x0c (real packets: 15 + 425)', () => {
    expect(decoder.decode(hex('0C 61 00 0C 01 87 93 03 0F A9 03 02'))).toEqual({ t: 'odyle', snapshot: false, basic: 15, charged: 425 });
    expect(decoder.decode(hex('0B 61 49 08 01 00 00 00 02  8c 96 98 00  0C 01 87 93 03 0F A9 03  04 02 87 93 03 0E'))).toEqual({ t: 'odyle', snapshot: true, basic: 15, charged: 425 });
  });

  it('finds the entry in the login list and ignores the other tickets', () => {
    const list = hex('0B 61 49 04 01 00 00 00 02  8c 96 98 00  08 01 87 93 03 A2 02  04 02 87 93 03 0E  04 03 87 93 03 0E');
    expect(decoder.decode(list)).toEqual({ t: 'odyle', snapshot: true, basic: 0, charged: 290 });
    // a list without the Odyle entry decodes to an event with no values (the engine ignores it)
    expect(decoder.decode(hex('0B 61 49 04 02 87 93 03 0E'))).toEqual({ t: 'odyle', snapshot: true, basic: null, charged: null });
    // an update without the entry is nothing
    expect(decoder.decode(hex('0C 61 00 04 0C 00 00 00 0E 02'))).toBeNull();
  });

  it('keeps both pools, keeps a pool a packet does not mention, ignores lists without Odyle, and remembers it per character', () => {
    const store: EngineStore = { rivals: {}, daily: {} };
    const e = new Engine({ store, fightIdleMs: () => 8000 });
    e.apply({ t: 'self', id: 1, name: 'SilentDeath', server: 1318, classCode: 18, level: 45 }, T0);
    e.apply({ t: 'odyle', snapshot: true, basic: 100, charged: 290 }, T0 + 1);
    e.apply({ t: 'odyle', snapshot: false, basic: 320, charged: null }, T0 + 2); // an update keeps the other pool
    expect(e.odyleSnapshot()).toMatchObject({ basic: 320, charged: 290 });
    e.apply({ t: 'odyle', snapshot: true, basic: null, charged: 50 }, T0 + 3); // no basic entry: it keeps its value
    expect(e.odyleSnapshot()).toMatchObject({ basic: 320, charged: 50 });
    e.apply({ t: 'odyle', snapshot: true, basic: null, charged: null }, T0 + 4); // a list with no Odyle at all: ignored
    expect(e.odyleSnapshot()).toMatchObject({ basic: 320, charged: 50 });
    expect(store.odyle?.['SilentDeath']).toMatchObject({ basic: 320, charged: 50 });

    // a restart: the last known value comes back once the character is known
    const again = new Engine({ store, fightIdleMs: () => 8000 });
    expect(again.odyleSnapshot()).toBeNull();
    again.apply({ t: 'self', id: 1, name: 'SilentDeath', server: 1318, classCode: 18, level: 45 }, T0 + 10);
    expect(again.odyleSnapshot()).toMatchObject({ basic: 320, charged: 50 });
  });
});
