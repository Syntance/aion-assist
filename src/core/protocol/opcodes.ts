/**
 * Opcode table (first two payload bytes, wire order). Values reflect the community's
 * knowledge of the Global client as of 2026-11 (see README, "Źródła protokołu").
 * Game patches shift these from time to time, so every entry can be overridden at
 * runtime from `opcodes.json` in the app's user-data folder — no rebuild needed.
 */

export const OPCODE_NAMES = [
  'heartbeat',
  'damage',
  'dotTick',
  'selfInfo',
  'playerInfo',
  'death',
  'teleport',
  'partyRoster',
  'partyLeftWorld',
  'partyLeftInstance',
  'abyssPoints',
  'abyssPointsLegacy',
  'kill',
  'hp',
  'cast',
  'npcSpawn',
  'stagger',
  'mapLoad',
  'entityPlaced',
  'petSnapshot',
  'petSouls',
  'petSpent',
  'petRank',
] as const;

export type OpcodeName = (typeof OPCODE_NAMES)[number];
export type OpcodeTable = Record<OpcodeName, number>;

export const DEFAULT_OPCODES: OpcodeTable = {
  heartbeat: 0x0036,
  damage: 0x0438,
  dotTick: 0x0538,
  selfInfo: 0x3336,
  playerInfo: 0x4536,
  death: 0x4236,
  teleport: 0x2336,
  partyRoster: 0x0297,
  partyLeftWorld: 0x1392,
  partyLeftInstance: 0x1d97,
  abyssPoints: 0xabff,
  abyssPointsLegacy: 0xa9ff,
  /** `<target V> <skill u32> <killer V> <server u16> <name> <legion>`: who killed whom (live 2026-11-12). */
  kill: 0x048d,
  /** `<entity V> <fmt u8> ...`: fmt 02 = N x (kind u8, u64 LE), fmt 01 = N x (kind u8, u32 LE); kind 0 = HP, 7 = max HP. */
  hp: 0x008d,
  /** Skill cast: `<actor V> <flag V> <skill u32> <seq u8> <kind u8> <target V>`. */
  cast: 0x0238,
  /** NPC spawn: `<entity V> <kind u8> <flags u8> <gate u8> <npc code u32 LE> ...`. */
  npcSpawn: 0x4136,
  /** Stagger gauge: `<entity V> 03 01 <max u32> <rest u32> <status u8>` or break `<entity V> 00 03 02` (documented by open-source meters, NOT yet seen live). */
  stagger: 0x05e0,
  /** `<u32 load count> <u32 map id> …` — sent on every map load, including teleports. */
  mapLoad: 0x2136,
  /** `<entity varint> 02 00` — arrives together with mapLoad for the local character (seen live 2026-11-12). */
  entityPlaced: 0x4736,
  /** Pet collection at login: equipped pet, (id, id, rank) triples, then (id, souls) pairs (family 0x90; layout from PetTracker). */
  petSnapshot: 0x0090,
  /** Soul points received: `<count V> N x (pet u32, amount u32)`. */
  petSouls: 0x0d90,
  /** Soul points spent on a rank-up, same layout as petSouls. */
  petSpent: 0x0e90,
  /** Rank reached: `u16 0, pet u32, rank u32, ...` (23 bytes). */
  petRank: 0x1490,
};

/** Parses "04 38" / "0438" into 0x0438. Returns null for anything else. */
export function parseOpcode(text: string): number | null {
  const hex = text.replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
  return parseInt(hex, 16);
}

export function mergeOpcodes(overrides: Partial<Record<string, string>> | null | undefined): OpcodeTable {
  const table: OpcodeTable = { ...DEFAULT_OPCODES };
  if (!overrides) return table;
  for (const name of OPCODE_NAMES) {
    const raw = overrides[name];
    if (typeof raw !== 'string') continue;
    const code = parseOpcode(raw);
    if (code !== null) table[name] = code;
  }
  return table;
}
