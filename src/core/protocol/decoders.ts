import type { GameEvent, RosterMember } from './events';
import { PET_ROWS } from '../pets/petData';
import type { OpcodeTable } from './opcodes';
import { DecodeError, Reader, decodeName, peekU16, peekU32 } from './reader';
import { readVarInt } from './varint';

/**
 * Packet decoders. Each takes a payload (opcode at bytes 0..1) and returns an event or
 * null. Layouts were written from the wire formats documented by the open-source GPL-3.0
 * meters (A2Tools, Aion2DPSMeter, aion2dps) — every decoder validates aggressively and
 * drops anything that does not look right, because a patch can shift a layout at any time.
 */

const MIN_ENTITY_ID = 100;
const MAX_DAMAGE = 99_999_999;
const isServerId = (v: number): boolean => v >= 1000 && v <= 2999;
/**
 * Global server ids are <faction 1|2><region 1..5><slot 01..60> (e.g. 1318 = Elyos, EU, 18).
 * Used where the id is found by scanning, to reject look-alikes such as 1024 or 2048.
 */
const isGlobalServerId = (v: number): boolean => {
  const region = Math.floor(v / 100) % 10;
  const slot = v % 100;
  return isServerId(v) && region >= 1 && region <= 5 && slot >= 1 && slot <= 60;
};

/** Bytes of the fixed block that follows the damage type, by hit kind (low nibble). */
const DAMAGE_BLOCK: Record<number, number> = { 4: 8, 5: 12, 6: 10, 7: 14 };

function decodeDamage(p: Uint8Array): GameEvent | null {
  const r = new Reader(p, 2);
  const target = r.varint();
  const sw = r.varint();
  const kind = sw & 0x0f;
  const blockLen = DAMAGE_BLOCK[kind];
  if (blockLen === undefined) return null; // miss / resist / non-damage record
  if ((sw & 0x30) === 0x30) r.varint();
  r.varint();
  const actor = r.varint();
  const skill = r.u32();
  r.skip(1);
  const damageType = r.varint();
  const block = r.bytes(blockLen);
  // kinds 5..7 carry a modifier byte first and the hit angle in the third byte (open-source docs)
  const mods = kind >= 5 ? block[0] : 0;
  const angle = kind >= 5 ? block[2] : 0;

  let first = r.varint();
  let second = r.varint();
  if (first === 0) {
    // post-2026-06 layout carries a leading zero before the two values
    first = second;
    second = r.varint();
  }
  // Normally <actor power scalar> <damage>; one crit layout sends the damage first.
  const firstIsDamage =
    kind === 6 && damageType === 3 && first >= 1000 && first <= 5_000_000 && second <= 25;
  const amount = firstIsDamage ? first : second;

  if (actor < MIN_ENTITY_ID || target < MIN_ENTITY_ID || actor === target) return null;
  if (amount < 1 || amount > MAX_DAMAGE) return null;
  return {
    t: 'damage',
    actor,
    target,
    skill,
    amount,
    crit: damageType === 3,
    back: (angle & 0x01) !== 0,
    front: (angle & 0x02) !== 0,
    parry: (mods & 0x02) !== 0,
    perfect: (mods & 0x04) !== 0,
    double: (mods & 0x08) !== 0,
    dot: false,
  };
}

function decodeCast(p: Uint8Array): GameEvent | null {
  const r = new Reader(p, 2);
  const actor = r.varint();
  r.varint();
  const skill = r.u32();
  if (actor < MIN_ENTITY_ID || skill < 1_000_000 || skill > 99_999_999) return null;
  return { t: 'cast', actor, skill };
}

function decodeNpcSpawn(p: Uint8Array): GameEvent | null {
  const r = new Reader(p, 2);
  const id = r.varint();
  r.skip(3); // kind, flags, gate
  const code = r.u32();
  if (id < MIN_ENTITY_ID || code < 1000 || code > 0xffffff) return null;
  return { t: 'npc', id, code };
}

function decodeDotTick(p: Uint8Array): GameEvent | null {
  const r = new Reader(p, 2);
  const target = r.varint();
  const flags = r.u8();
  if ((flags & 0x80) !== 0 || (flags & 0x02) === 0) return null; // only damage ticks
  const actor = r.varint();
  r.varint();
  const skill = Math.floor(r.u32() / 100);
  const amount = r.varint();
  if (actor < MIN_ENTITY_ID || target < MIN_ENTITY_ID || actor === target) return null;
  if (amount < 1 || amount > MAX_DAMAGE) return null;
  return { t: 'damage', actor, target, skill, amount, crit: false, back: false, dot: true };
}

/** `<id varint> <mask1 u32> <mask2 u8>` then, when mask2 bit 0 is set, a u8-length name. */
function readIdentityHead(r: Reader): { id: number; name: string | null } {
  const id = r.varint();
  r.skip(4);
  const mask2 = r.u8();
  if ((mask2 & 0x01) === 0) return { id, name: null };
  const len = r.u8();
  if (len < 1 || len > 48) throw new DecodeError('bad name length');
  return { id, name: decodeName(r.bytes(len)) };
}

function decodeSelfInfo(p: Uint8Array): GameEvent | null {
  const r = new Reader(p, 2);
  const { id, name } = readIdentityHead(r);
  if (id < MIN_ENTITY_ID) return null;
  // Before a character has a real name (tutorial placeholder) only the id is trustworthy.
  if (name === null) return { t: 'self', id, name: null, server: null, classCode: null, level: null };
  const server = r.u16();
  const classCode = r.u32();
  r.skip(1);
  const level = r.u32();
  const valid = isServerId(server) && classCode >= 1 && classCode <= 63 && level >= 1 && level <= 99;
  const gs = r.remaining >= 4 ? r.u32() : 0;
  return {
    t: 'self',
    id,
    name,
    server: valid ? server : null,
    classCode: valid ? classCode : null,
    level: valid ? level : null,
    ...(valid && plausible(gs, 100, 100_000) ? { gearScore: gs } : {}),
  };
}

/** Finds `<server u16> <legion id u32> 00 00 <server u16> <len u8> <legion name>`. */
function findLegionRun(p: Uint8Array, from: number): { server: number; legion: string | null } | null {
  // live records put the run ~100 bytes after the class field
  const end = Math.min(p.length - 10, from + 180);
  for (let i = from; i <= end; i++) {
    const server = peekU16(p, i);
    if (!isServerId(server)) continue;
    if (p[i + 6] !== 0 || p[i + 7] !== 0 || peekU16(p, i + 8) !== server) continue;
    const len = p[i + 10];
    let legion: string | null = null;
    if (len >= 1 && len <= 48 && i + 11 + len <= p.length) {
      legion = decodeName(p.subarray(i + 11, i + 11 + len), 24);
    }
    return { server, legion };
  }
  return null;
}

function decodePlayerInfo(p: Uint8Array): GameEvent | null {
  const r = new Reader(p, 2);
  const { id, name } = readIdentityHead(r);
  if (id < MIN_ENTITY_ID || name === null) return null;
  let classCode: number | null = null;
  if (r.remaining >= 4) {
    const code = r.u32();
    if (code >= 1 && code <= 63) classCode = code;
  }
  const classEnd = r.pos;
  // Layout measured on 96 live records (Abyss Logs debug captures, 2026-11-12):
  // gear score = first pair of identical u32 values after the class field (offset varies
  // with the mask); the home server id comes after the fixed "a0 86 01 00 a0 86 01 00"
  // marker and the u32 pair behind it, right after a u32 in 5M..100M.
  let gsAt = -1;
  for (let k = classEnd; k + 8 <= p.length && k < classEnd + 220; k++) {
    const g = peekU32(p, k);
    // 100000 is excluded: "a0 86 01 00 a0 86 01 00" is a fixed marker, and in records without
    // a gear-score pair it was read as GS 100000 (seen live: Faora, Aeryn)
    // ...and the real pair is always followed by 8 zero bytes (all 96 live records); without
    // that check other equal pairs were taken (live: "575 GS" for a 198K CP player)
    if (plausible(g, 100, 99_999) && g === peekU32(p, k + 4) && peekU32(p, k + 8) === 0 && peekU32(p, k + 12) === 0) {
      gsAt = k;
      break;
    }
  }
  const gearScore = gsAt >= 0 ? peekU32(p, gsAt) : null;
  let server: number | null = null;
  if (gsAt >= 0) {
    // Scanning inside the u32 pair right after the 100000 x2 marker gave false ids live
    // (e.g. "01 b5 08 00" read as 2229 for a 1318 player), so start after it.
    let from = gsAt + 8;
    for (let k = gsAt + 8; k + 8 <= p.length && k < gsAt + 120; k++) {
      if (peekU32(p, k) === 100_000 && peekU32(p, k + 4) === 100_000) {
        from = k + 16;
        break;
      }
    }
    for (let k = from; k + 2 <= p.length && k < gsAt + 160; k++) {
      const v = peekU16(p, k);
      if (!isGlobalServerId(v) || p[k - 1] > 3) continue;
      const before = peekU32(p, k - 4);
      if (before >= 5_000_000 && before <= 100_000_000) {
        server = v;
        break;
      }
    }
  }
  const run = findLegionRun(p, classEnd);
  return {
    t: 'player',
    id,
    name,
    classCode,
    server: server ?? run?.server ?? null,
    legion: run?.legion ?? null,
    ...(gearScore !== null ? { gearScore } : {}),
  };
}

// --- pet collection (layouts verified by the PetTracker project on live captures) ---------------

const PET_IDS: ReadonlySet<number> = new Set(PET_ROWS.map((r) => r[0]));
const PET_MAX_SOULS_PER_REWARD = 75;
const PET_STAGE_GOAL: Readonly<Record<number, number>> = { 1: 25, 2: 75 };

const i32 = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) | 0;

/** Pet decoders use a 3-byte varint (counts), rejecting padded encodings. */
function petCount(b: Uint8Array, at: number): { value: number; size: number } | null {
  let value = 0;
  for (let n = 0; n < 3; n++) {
    if (at + n >= b.length) return null;
    const x = b[at + n];
    value |= (x & 127) << (n * 7);
    if (x < 128) {
      if (n > 0 && value < 1 << (7 * n)) return null;
      return { value, size: n + 1 };
    }
  }
  return null;
}

function decodePetSnapshot(p: Uint8Array): GameEvent | null {
  const b = p.subarray(2);
  if (b.length < 6) return null;
  const equipped = i32(b, 0);
  if (equipped !== 0 && !PET_IDS.has(equipped)) return null;
  let at = 4;
  const c1 = petCount(b, at);
  if (!c1 || c1.value > PET_IDS.size || c1.value > Math.floor((b.length - at - c1.size) / 12)) return null;
  at += c1.size;
  const ranks: Record<number, number> = {};
  for (let n = 0; n < c1.value; n++, at += 12) {
    const id = i32(b, at);
    const rank = i32(b, at + 8);
    if (!PET_IDS.has(id) || i32(b, at + 4) !== id || rank < 1 || rank > 3 || ranks[id] !== undefined) return null;
    ranks[id] = rank;
  }
  if (equipped !== 0 && ranks[equipped] === undefined) return null;
  const c2 = petCount(b, at);
  if (!c2 || c2.value > PET_IDS.size || c2.value > Math.floor((b.length - at - c2.size) / 8)) return null;
  at += c2.size;
  const souls: Record<number, number> = {};
  for (let n = 0; n < c2.value; n++, at += 8) {
    const id = i32(b, at);
    const value = i32(b, at + 4);
    const cap = PET_STAGE_GOAL[ranks[id] ?? 0] ?? 0x7fffffff;
    if (!PET_IDS.has(id) || value < 0 || value > cap || souls[id] !== undefined) return null;
    souls[id] = value;
  }
  return { t: 'petSnapshot', equipped, ranks, souls };
}

function decodePetBatch(p: Uint8Array, kind: 'petSouls' | 'petSpent'): GameEvent | null {
  const b = p.subarray(2);
  const c = petCount(b, 0);
  if (!c || c.value <= 0 || c.value > PET_IDS.size || b.length - c.size !== c.value * 8) return null;
  const entries: { pet: number; amount: number }[] = [];
  const seen = new Set<number>();
  for (let n = 0, at = c.size; n < c.value; n++, at += 8) {
    const pet = i32(b, at);
    const amount = i32(b, at + 4);
    if (!PET_IDS.has(pet) || seen.has(pet) || amount <= 0 || amount > PET_MAX_SOULS_PER_REWARD) return null;
    seen.add(pet);
    entries.push({ pet, amount });
  }
  return { t: kind, entries };
}

// --- Odyle energy (ticket id 60000001) ----------------------------------------------------------

const ODYLE_ID = [0x01, 0x87, 0x93, 0x03]; // 60000001 as u32 LE
const POOL_BASIC = 0x04;
const POOL_CHARGED = 0x08;

/**
 * Finds the Odyle entry `<pool u8> 01 87 93 03 <value varint>` in a ticket packet. The id is a specific four-byte
 * value, so a plain search is safe; the pool byte before it says which balance the value is.
 */
function decodeOdyle(p: Uint8Array, snapshot: boolean): GameEvent | null {
  let basic: number | null = null;
  let charged: number | null = null;
  for (let i = 1; i + 4 < p.length; i++) {
    if (p[i] !== ODYLE_ID[0] || p[i + 1] !== ODYLE_ID[1] || p[i + 2] !== ODYLE_ID[2] || p[i + 3] !== ODYLE_ID[3]) continue;
    const pool = p[i - 1];
    if (pool !== POOL_BASIC && pool !== POOL_CHARGED) continue;
    const v = readVarInt(p, i + 4);
    if (v.size < 0 || v.value > 100_000) continue;
    if (pool === POOL_BASIC) basic = v.value;
    else charged = v.value;
  }
  if (basic === null && charged === null) return snapshot ? { t: 'odyle', snapshot, basic: null, charged: null } : null;
  return { t: 'odyle', snapshot, basic, charged };
}

function decodePetRank(p: Uint8Array): GameEvent | null {
  const b = p.subarray(2);
  if (b.length !== 23 || b[0] !== 0 || b[1] !== 0) return null;
  const pet = i32(b, 2);
  const rank = i32(b, 6);
  return PET_IDS.has(pet) && rank >= 1 && rank <= 3 ? { t: 'petRank', pet, rank } : null;
}

function decodeDeath(p: Uint8Array): GameEvent | null {
  const r = new Reader(p, 2);
  const id = r.varint();
  r.varint();
  const flag = r.varint();
  if (id < MIN_ENTITY_ID) return null;
  return { t: 'death', id, flag };
}

/**
 * Kill record. Despawn variants (killer 0, all zeros) are ignored; the same opcode also
 * carries summon-ownership records, which fail the server-id / name checks below.
 */
function decodeKill(p: Uint8Array): GameEvent | null {
  const r = new Reader(p, 2);
  const target = r.varint();
  const skill = r.u32();
  const killerId = r.varint();
  if (target < MIN_ENTITY_ID || killerId < MIN_ENTITY_ID) return null;
  const killerServer = r.u16();
  // Server 0 and a real entity id: a monster killed this entity (live 2026-11-14: a party member killed
  // by a boss, `04 8d <target> <skill u32> <npc entity> 00 00 ...`; the same record Abyss logs as "chardie").
  if (killerServer === 0) return { t: 'mobKill', target, killerId, skill };
  if (!isServerId(killerServer)) return null;
  const len = r.u8();
  if (len < 1 || len > 48) return null;
  const bytes = r.bytes(len);
  // a few names are not valid UTF-8 in the capture; the ids stay authoritative
  const killerName = decodeName(bytes, 24) ?? new TextDecoder().decode(bytes);
  return { t: 'kill', target, killerId, killerName, killerServer, skill };
}

/** Entity HP record (live 2026-11-12): kind 0 = current HP, kind 7 = max HP. */
function decodeHp(p: Uint8Array): GameEvent | null {
  const r = new Reader(p, 2);
  const id = r.varint();
  if (id < MIN_ENTITY_ID) return null;
  const fmt = r.u8();
  if (fmt !== 0x01 && fmt !== 0x02) return null;
  const count = r.u8();
  if (count < 1 || count > 16) return null;
  let cur: number | null = null;
  let max: number | null = null;
  for (let i = 0; i < count; i++) {
    const kind = r.u8();
    const value = fmt === 0x02 ? r.u64() : r.u32();
    if (kind === 0) cur = value;
    else if (kind === 7) max = value;
  }
  return cur === null && max === null ? null : { t: 'hp', id, cur, max };
}

/** Stagger gauge per the open-source meters' documentation; not verified on a live boss yet. */
function decodeStagger(p: Uint8Array): GameEvent | null {
  const r = new Reader(p, 2);
  const id = r.varint();
  if (id < MIN_ENTITY_ID) return null;
  if (r.remaining === 3 && r.u8() === 0x00 && r.u8() === 0x03 && r.u8() === 0x02) {
    return { t: 'stagger', id, max: 0, rest: 0, broken: true };
  }
  r.pos = 2;
  r.varint();
  if (r.remaining < 10 || r.u8() !== 0x03 || r.u8() !== 0x01) return null;
  const max = r.u32();
  const rest = r.u32();
  if (max <= 0 || max > 100_000_000 || rest > max) return null;
  return { t: 'stagger', id, max, rest, broken: false };
}

function decodeTeleport(p: Uint8Array): GameEvent | null {
  // entity id 0 = the local player entering a zone
  return p.length >= 3 && p[2] === 0x00 ? { t: 'zone' } : null;
}

function decodeAbyssPoints(p: Uint8Array): GameEvent | null {
  if (p.length !== 18) return null;
  const r = new Reader(p, 2);
  const points = r.u64();
  const limit = r.u64();
  if (limit < 1 || limit > 1_000_000_000 || points > limit) return null;
  return { t: 'abyssPoints', points, limit };
}

const peekU8 = (b: Uint8Array, off: number): number => (off >= 0 && off < b.length ? b[off] : -1);
const plausible = (v: number, min: number, max: number): boolean => v >= min && v <= max;

/**
 * Party roster. The fixed header is not needed: members are located by scanning for
 * `<presence u8> <slot u8> <dbid u64> <name> <class u32> <level u32>`, where the dbid's
 * top 16 bits are the server id and its low 32 bits the character id. Gear score and
 * combat power follow at slightly variable offsets, so both are best-effort.
 */
function decodePartyRoster(p: Uint8Array): GameEvent | null {
  const members: RosterMember[] = [];
  let lastSlot = -1;
  let i = 2;
  while (i + 20 <= p.length && members.length < 24) {
    const member = readRosterMember(p, i, lastSlot);
    if (!member) {
      i++;
      continue;
    }
    members.push(member.info);
    lastSlot = member.slot;
    i = member.end;
  }
  if (members.length === 0) return null;
  // `<party key u32> <title len u8> <title> <size u8> <dungeon u32> <2 bytes> <leader dbid u64> ...`
  let title: string | null = null;
  let leaderId: number | null = null;
  const titleLen = peekU8(p, 6);
  if (titleLen >= 0 && titleLen <= 40 && 7 + titleLen + 7 + 4 <= p.length) {
    try {
      title = new TextDecoder('utf-8', { fatal: true }).decode(p.subarray(7, 7 + titleLen)) || null;
    } catch {
      title = null;
    }
    const lead = peekU32(p, 7 + titleLen + 7);
    if (members.some((m) => m.characterId === lead)) leaderId = lead;
  }
  let dungeonId: number | null = null;
  if (titleLen >= 0 && titleLen <= 40) {
    const d = peekU32(p, 7 + titleLen + 1);
    dungeonId = d > 0 ? d : null;
  }
  return { t: 'party', members, title, leaderId, dungeonId };
}

function readRosterMember(
  p: Uint8Array,
  i: number,
  lastSlot: number,
): { info: RosterMember; slot: number; end: number } | null {
  const presence = p[i];
  const slot = p[i + 1];
  if (presence === 0 || slot > 24 || slot <= lastSlot) return null;
  const characterId = peekU32(p, i + 2);
  const server = peekU16(p, i + 8);
  if (characterId <= 0 || peekU16(p, i + 6) !== 0 || !isServerId(server)) return null;
  const nameLen = p[i + 10];
  const nameEnd = i + 11 + nameLen;
  if (nameLen < 1 || nameLen > 48 || nameEnd + 8 > p.length) return null;
  const name = decodeName(p.subarray(i + 11, nameEnd));
  if (name === null) return null;
  const classCode = peekU32(p, nameEnd);
  const level = peekU32(p, nameEnd + 4);
  if (!plausible(classCode, 1, 63) || !plausible(level, 1, 99)) return null;

  let o = nameEnd + 8;
  // Some builds put a 4-byte "conqueror level" in front of the gear score.
  const a = peekU32(p, o);
  const b = peekU32(p, o + 4);
  let gearScore: number | null = null;
  if ((presence & 0x01) !== 0 && a >= 0 && a < 100 && plausible(b, 100, 100_000)) {
    gearScore = b;
    o += 8;
  } else if (plausible(a, 100, 100_000)) {
    gearScore = a;
    o += 4;
  }

  let combatPower: number | null = null;
  if (gearScore !== null) {
    for (let k = o; k < o + 12 && k + 13 <= p.length; k++) {
      if (peekU16(p, k) !== server) continue;
      const cp = new Reader(p, k + 5).u64();
      if (plausible(cp, 1000, 1_000_000_000)) {
        combatPower = cp;
        o = k + 13;
      }
      break;
    }
  }
  const ready = (presence & 0x02) !== 0;
  return { info: { name, server, characterId, classCode, level, gearScore, combatPower, ready, slot }, slot, end: o };
}

type Decoder = (payload: Uint8Array) => GameEvent | null;

/** Smallest plausible player record: opcode + id + mask + flag + 1-char name + class. */
const MIN_EMBEDDED_RECORD = 2 + 1 + 4 + 1 + 2 + 4;

export class PacketDecoder {
  private readonly table = new Map<number, Decoder>();
  private readonly playerHi: number;
  private readonly playerLo: number;
  private readonly npcHi: number;
  private readonly npcLo: number;
  /** Opcode -> packets seen; lets the diagnostics view show what a new patch changed. */
  readonly seen = new Map<number, number>();
  /** Opcode -> packets that decoded into an event (seen minus rejected). */
  readonly accepted = new Map<number, number>();

  constructor(opcodes: OpcodeTable) {
    this.playerHi = opcodes.playerInfo >> 8;
    this.playerLo = opcodes.playerInfo & 0xff;
    this.npcHi = opcodes.npcSpawn >> 8;
    this.npcLo = opcodes.npcSpawn & 0xff;
    this.table.set(opcodes.heartbeat, (p) =>
      p.length >= 10 ? { t: 'heartbeat', clock: new Reader(p, 2).u64() } : null,
    );
    this.table.set(opcodes.damage, decodeDamage);
    this.table.set(opcodes.dotTick, decodeDotTick);
    this.table.set(opcodes.selfInfo, decodeSelfInfo);
    this.table.set(opcodes.playerInfo, decodePlayerInfo);
    this.table.set(opcodes.death, decodeDeath);
    this.table.set(opcodes.petSnapshot, decodePetSnapshot);
    this.table.set(opcodes.petSouls, (p) => decodePetBatch(p, 'petSouls'));
    this.table.set(opcodes.petSpent, (p) => decodePetBatch(p, 'petSpent'));
    this.table.set(opcodes.petRank, decodePetRank);
    this.table.set(opcodes.ticketSnapshot, (p) => decodeOdyle(p, true));
    this.table.set(opcodes.ticketUpdate, (p) => decodeOdyle(p, false));
    this.table.set(opcodes.teleport, decodeTeleport);
    this.table.set(opcodes.partyRoster, decodePartyRoster);
    this.table.set(opcodes.partyLeftWorld, () => ({ t: 'partyLeft' }));
    this.table.set(opcodes.partyLeftInstance, () => ({ t: 'partyLeft' }));
    this.table.set(opcodes.abyssPoints, decodeAbyssPoints);
    this.table.set(opcodes.abyssPointsLegacy, decodeAbyssPoints);
    this.table.set(opcodes.kill, decodeKill);
    this.table.set(opcodes.hp, decodeHp);
    this.table.set(opcodes.cast, decodeCast);
    this.table.set(opcodes.npcSpawn, decodeNpcSpawn);
    this.table.set(opcodes.stagger, decodeStagger);
    this.table.set(opcodes.mapLoad, (p) => {
      if (p.length < 10) return null;
      const r = new Reader(p, 2);
      r.u32(); // load counter
      const mapId = r.u32();
      return mapId > 0 && mapId < 10_000_000 ? { t: 'mapLoad', mapId } : null;
    });
    this.table.set(opcodes.entityPlaced, (p) => {
      const r = new Reader(p, 2);
      const id = r.varint();
      // exact shape: id followed by 02 00 and nothing else
      if (id < MIN_ENTITY_ID || r.remaining !== 2 || r.u8() !== 0x02 || r.u8() !== 0x00) return null;
      return { t: 'entityPlaced', id };
    });
  }

  /**
   * NPC appearances also arrive inside larger packets (the NPCs already standing in an area when you enter it), not only as
   * standalone frames. Scans for the NPC opcode and keeps only records with a plausible entity, a valid NPC code and the
   * fixed marker byte, the same checks PetTracker uses.
   */
  embeddedNpcs(payload: Uint8Array): GameEvent[] {
    const out: GameEvent[] = [];
    const hi = this.npcHi;
    const lo = this.npcLo;
    for (let i = 2; i + 14 <= payload.length; i++) {
      if (payload[i] !== hi || payload[i + 1] !== lo) continue;
      const rec = payload.subarray(i + 2);
      const ent = readVarInt(rec, 0);
      if (ent.size < 0 || ent.value < MIN_ENTITY_ID || ent.size + 3 > rec.length) continue;
      let p = ent.size;
      if ((rec[p] & 0x1f) === 0x1f) continue; // a summon
      p += 3;
      for (const at of [p + 2, p]) {
        if (at + 6 > rec.length) continue;
        const code = (rec[at] | (rec[at + 1] << 8) | (rec[at + 2] << 16) | (rec[at + 3] << 24)) >>> 0;
        if (code >= 2_000_000 && code < 3_000_000 && rec[at + 5] === 2) {
          out.push({ t: 'npc', id: ent.value, code });
          break;
        }
      }
    }
    return out;
  }

  /**
   * Player records also travel embedded inside larger packets (seen live: only a fraction
   * of nearby players arrive as standalone frames). Scans for the player opcode and keeps
   * only records that pass the strict name check and carry a valid class code.
   */
  embeddedPlayers(payload: Uint8Array): GameEvent[] {
    const out: GameEvent[] = [];
    if (payload.length < MIN_EMBEDDED_RECORD + 2) return out;
    // starts at 2: a standalone record (offset 0) is already handled by decode()
    for (let i = 2; i + MIN_EMBEDDED_RECORD <= payload.length; i++) {
      if (payload[i] !== this.playerHi || payload[i + 1] !== this.playerLo) continue;
      let ev: GameEvent | null = null;
      try {
        ev = decodePlayerInfo(payload.subarray(i));
      } catch (err) {
        if (!(err instanceof DecodeError)) throw err;
      }
      if (ev && ev.t === 'player' && ev.classCode !== null) out.push(ev);
    }
    return out;
  }

  decode(payload: Uint8Array): GameEvent | null {
    if (payload.length < 2) return null;
    const opcode = (payload[0] << 8) | payload[1];
    this.seen.set(opcode, (this.seen.get(opcode) ?? 0) + 1);
    const decoder = this.table.get(opcode);
    if (!decoder) return null;
    try {
      const event = decoder(payload);
      if (event) this.accepted.set(opcode, (this.accepted.get(opcode) ?? 0) + 1);
      return event;
    } catch (err) {
      if (err instanceof DecodeError) return null;
      throw err;
    }
  }
}
