import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core/engine/engine';
import { PacketDecoder } from '../src/core/protocol/decoders';
import { DEFAULT_OPCODES } from '../src/core/protocol/opcodes';

const decoder = new PacketDecoder(DEFAULT_OPCODES);
const hex = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s, 'hex'));
// real spawn records (Abyss Logs session, 2026-11-19): a chanter's spirit owned by Kaamq (entity 5416), and a cleric's
// summon that also carries its owner's name before the NPC code, owned by Orzelkas (entity 12072)
const CHANTER_SPIRIT =
  '413687f0015f0000cf902c004002efecadc64af299460082c54721edc542604601ea9b01ea9b01ff120000ff120000000000000000000000000000503a020064000000f04902000100000000000000a08601000000000090230b00010101110181969800ffffffffffffffff8075d52abb03000087f0010102efecadc64af299460082c54707020628150000a20100000000260508556e69766572736501000200000000000000000000000000000003cd0091100000d000c4010000d600320000002d00000000';
const CLERIC_SUMMON =
  '413681ee015f0001084f727a656c6b6173ca902c00400200faafc60082aa468077c5475a4b0d41480601d7ac01d7ac01aa120000aa120000000000000000000000000000747f020064000000f04902000100000000000000a08601000000000090230b00010101110181969800ffffffffffffffff8075d52abb03000081ee01010200faafc60082aa468077c547070206282f0000a20100000000260508556e69766572736501000200000000000000000000000000000003cd00ee070000d000b4010000d600320000002d00000000';

describe('summons', () => {
  it('reads the owner of a summon, also when the spawn carries a name', () => {
    expect(decoder.decode(hex(CHANTER_SPIRIT))).toEqual({ t: 'npc', id: 30727, code: 0x2c90cf, owner: 5416 });
    expect(decoder.decode(hex(CLERIC_SUMMON))).toEqual({ t: 'npc', id: 30465, code: 0x2c90ca, owner: 12072 });
  });

  it("credits a summon's hits on a boss to the player who summoned it", () => {
    const T0 = 1_800_000_000_000;
    const e = new Engine({ store: { rivals: {}, daily: {} }, fightIdleMs: () => 8000 });
    e.apply({ t: 'self', id: 9020, name: 'SilentDeath', server: 1318, classCode: 17, level: 45 }, T0);
    e.apply({ t: 'player', id: 5416, name: 'Kaamq', classCode: 7, server: 1318, legion: null }, T0);
    e.apply({ t: 'party', title: null, leaderId: null, members: [{ name: 'Kaamq', server: 1318, characterId: 2, classCode: 7, level: 45, gearScore: null, combatPower: null, ready: false, slot: 2 }] }, T0);
    e.apply({ t: 'npc', id: 30727, code: 0x2c90cf, owner: 5416 }, T0);
    const hit = (actor: number, amount: number, at: number) =>
      e.apply({ t: 'damage', actor, target: 19832, amount, crit: false, back: false, dot: false, skill: 15_280_141 }, at);
    hit(5416, 1000, T0 + 100);
    hit(30727, 500, T0 + 200); // the spirit
    const rows = e.meterSnapshot(T0 + 300).rows;
    expect(rows.find((r) => r.card.name === 'Kaamq')?.damage).toBe(1500);
    // the same id spawned again as an ordinary NPC is nobody's summon any more
    e.apply({ t: 'npc', id: 30727, code: 0x2c90cf, owner: null }, T0 + 400);
    hit(30727, 700, T0 + 500);
    expect(e.meterSnapshot(T0 + 600).rows.find((r) => r.card.name === 'Kaamq')?.damage).toBe(1500);
  });
});
