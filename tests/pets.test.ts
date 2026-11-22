import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPetTrackerProfiles } from '../src/main/petTrackerImport';
import { PetBook, emptyPetStore } from '../src/core/pets/petBook';
import { NPC_PETS } from '../src/core/pets/petData';
import { PacketDecoder } from '../src/core/protocol/decoders';
import { mergeOpcodes } from '../src/core/protocol/opcodes';
import { compareToMax, soulsToMax } from '../src/shared/pets';

const decoder = new PacketDecoder(mergeOpcodes(null));
const T0 = 1_800_000_000_000;

const le32 = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const snapshotPacket = (equipped: number, ranks: [number, number][], souls: [number, number][]): Uint8Array =>
  Uint8Array.from([
    0x00,
    0x90,
    ...le32(equipped),
    ranks.length,
    ...ranks.flatMap(([id, r]) => [...le32(id), ...le32(id), ...le32(r)]),
    souls.length,
    ...souls.flatMap(([id, v]) => [...le32(id), ...le32(v)]),
  ]);
const batchPacket = (op: number, entries: [number, number][]): Uint8Array =>
  Uint8Array.from([op, 0x90, entries.length, ...entries.flatMap(([id, v]) => [...le32(id), ...le32(v)])]);
const rankPacket = (id: number, rank: number): Uint8Array =>
  Uint8Array.from([0x14, 0x90, 0, 0, ...le32(id), ...le32(rank), ...new Array(13).fill(0)]);

const book = (): PetBook => {
  const b = new PetBook({ store: emptyPetStore(), rowLimit: () => 5, hideMaxed: () => false });
  b.apply({ t: 'self', id: 1, name: 'SilentDeath', server: 1318, classCode: 18, level: 45 }, T0);
  return b;
};
const feed = (b: PetBook, p: Uint8Array, at = T0): void => {
  const ev = decoder.decode(p);
  if (!ev) throw new Error('packet was not decoded');
  b.apply(ev, at);
};

describe('pet packets', () => {
  it('decodes a collection snapshot', () => {
    const ev = decoder.decode(snapshotPacket(1002, [[1002, 2], [1003, 3]], [[1002, 10]]));
    expect(ev).toEqual({ t: 'petSnapshot', equipped: 1002, ranks: { 1002: 2, 1003: 3 }, souls: { 1002: 10 } });
  });

  it('rejects a snapshot with a counter above the stage goal or an unknown pet', () => {
    expect(decoder.decode(snapshotPacket(0, [[1002, 1]], [[1002, 26]]))).toBeNull(); // rank 1 caps at 25
    expect(decoder.decode(snapshotPacket(999_999, [[1002, 1]], []))).toBeNull();
  });

  it('decodes soul rewards, spends and rank messages', () => {
    expect(decoder.decode(batchPacket(0x0d, [[1002, 3], [1003, 1]]))).toEqual({
      t: 'petSouls',
      entries: [
        { pet: 1002, amount: 3 },
        { pet: 1003, amount: 1 },
      ],
    });
    expect(decoder.decode(batchPacket(0x0e, [[1002, 25]]))).toEqual({ t: 'petSpent', entries: [{ pet: 1002, amount: 25 }] });
    expect(decoder.decode(rankPacket(1002, 2))).toEqual({ t: 'petRank', pet: 1002, rank: 2 });
    expect(decoder.decode(batchPacket(0x0d, [[1002, 76]]))).toBeNull(); // more than one reward can give
  });
});

describe('PetBook', () => {
  it('follows a pet from snapshot through rewards to a rank-up and max', () => {
    const b = book();
    feed(b, snapshotPacket(0, [[1002, 1]], [[1002, 20]]));
    expect(b.snapshot(T0, 'recent').summary).toMatchObject({ collected: 1, maxed: 0 });
    feed(b, batchPacket(0x0d, [[1002, 3]]), T0 + 1000);
    let row = b.snapshot(T0 + 1000, 'recent').rows[0];
    expect(row).toMatchObject({ id: 1002, rank: 1, souls: 23, goal: 25, remaining: 2, pending: false });
    feed(b, batchPacket(0x0d, [[1002, 2]]), T0 + 2000);
    row = b.snapshot(T0 + 2000, 'recent').rows[0];
    expect(row).toMatchObject({ souls: 25, pending: true }); // waiting for the game's rank message
    feed(b, batchPacket(0x0e, [[1002, 25]]), T0 + 2500);
    feed(b, rankPacket(1002, 2), T0 + 3000);
    row = b.snapshot(T0 + 3000, 'recent').rows[0];
    expect(row).toMatchObject({ rank: 2, souls: 0, goal: 75, pending: false });
    expect(b.snapshot(T0 + 3000, 'recent').session).toEqual({ souls: 5, rankUps: 1 });
    feed(b, batchPacket(0x0d, [[1002, 75]]), T0 + 4000); // the last reward maxes it
    expect(b.snapshot(T0 + 4000, 'recent').rows[0]).toMatchObject({ rank: 3, souls: null, remaining: null });
  });

  it('hides maxed pets when asked and never lists paid-only pets', () => {
    const b = new PetBook({ store: emptyPetStore(), rowLimit: () => 5, hideMaxed: () => true });
    b.apply({ t: 'self', id: 1, name: 'SilentDeath', server: 1318, classCode: 18, level: 45 }, T0);
    feed(b, snapshotPacket(0, [[1002, 3], [1003, 1]], [[1003, 4]]));
    feed(b, batchPacket(0x0d, [[1003, 1]]), T0 + 10);
    expect(b.snapshot(T0 + 20, 'recent').rows.map((r) => r.id)).toEqual([1003]);
    expect(b.all(T0).some((r) => r.paid)).toBe(false);
  });

  it('shows pet mobs in view and drops them when they leave', () => {
    const b = book();
    const [npcCode, [petId]] = Object.entries(NPC_PETS)[0] ?? [];
    expect(npcCode).toBeDefined();
    b.apply({ t: 'npc', id: 500, code: Number(npcCode) }, T0);
    expect(b.snapshot(T0 + 1000, 'nearby').rows.map((r) => r.id)).toEqual([petId]);
    b.apply({ t: 'death', id: 500, flag: 7 }, T0 + 2000);
    expect(b.snapshot(T0 + 3000, 'nearby').rows).toEqual([]);
    expect(b.snapshot(T0 + 3000, 'nearby').nearbyCount).toBe(0);
  });

  it('applies a snapshot that arrived before the character was known, and keeps the collection per character', () => {
    const store = emptyPetStore();
    const b = new PetBook({ store, hideMaxed: () => false });
    feed(b, snapshotPacket(0, [[1002, 2]], [[1002, 7]]));
    b.apply({ t: 'self', id: 1, name: 'SilentDeath', server: 1318, classCode: 18, level: 45 }, T0);
    expect(b.all(T0).find((r) => r.id === 1002)).toMatchObject({ rank: 2, souls: 7 });
    // a restart: the saved profile is remembered, but not trusted as a fresh sync
    const again = new PetBook({ store, hideMaxed: () => false });
    again.apply({ t: 'self', id: 1, name: 'SilentDeath', server: 1318, classCode: 18, level: 45 }, T0 + 10);
    expect(again.snapshot(T0 + 20, 'recent').synced).toBe(false);
    expect(again.all(T0 + 20).find((r) => r.id === 1002)).toMatchObject({ rank: 2, souls: 7, stale: true, remaining: null });
  });
});

describe('PetTracker import', () => {
  it('reads a saved PetTracker profile (with BOM) and fills the collection', () => {
    const root = mkdtempSync(join(tmpdir(), 'pettracker-'));
    try {
      mkdirSync(join(root, 'PetTracker', 'profiles'), { recursive: true });
      const profile = { CharacterName: 'SilentDeath', Pets: { '1002': { Id: 1002, Level: 2, Souls: 15, EstimatedSouls: null }, '1003': { Id: 1003, Level: 3, Souls: null } } };
      writeFileSync(join(root, 'PetTracker', 'profiles', 'a.json'), '﻿' + JSON.stringify(profile), 'utf8');
      const found = readPetTrackerProfiles(root);
      expect(found).toHaveLength(1);
      const b = book();
      expect(b.importPets(found[0]?.pets ?? [], T0)).toBe(2);
      expect(b.hasCollection()).toBe(true);
      expect(b.all(T0).find((r) => r.id === 1002)).toMatchObject({ rank: 2, souls: 15 });
      expect(b.all(T0).find((r) => r.id === 1003)).toMatchObject({ rank: 3 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('closest to MAX', () => {
  it('counts the souls missing for MAX over the stage you are in and every stage after it', () => {
    expect(soulsToMax(1, 10)).toBe(90); // 15 left of 25, then 75
    expect(soulsToMax(2, 70)).toBe(5);
    expect(soulsToMax(2, 75)).toBe(0); // a rank-up waiting for its confirmation
    expect(soulsToMax(0, 2)).toBe(103); // 3 to unlock, then 25 and 75
    expect(soulsToMax(3, null)).toBe(0);
    expect(soulsToMax(null, null)).toBeNull();
    expect(soulsToMax(1, null)).toBeNull();
  });

  it('orders the pets still to be maxed first, unknown ones next and the maxed ones last', () => {
    const rows = [
      { id: 'maxed', rank: 3, souls: null },
      { id: 'unknown', rank: 1, souls: null },
      { id: 'far', rank: 1, souls: 3 },
      { id: 'near', rank: 2, souls: 70 },
      { id: 'mid', rank: 2, souls: 10 },
    ];
    expect([...rows].sort(compareToMax).map((r) => r.id)).toEqual(['near', 'mid', 'far', 'unknown', 'maxed']);
  });

  it('lists the pets closest to MAX first before trimming to the row limit, pins first', () => {
    const make = (sortMax: boolean, rowLimit: number): PetBook => {
      const b = new PetBook({ store: emptyPetStore(), rowLimit: () => rowLimit, hideMaxed: () => false, sortMax: () => sortMax });
      b.apply({ t: 'self', id: 1, name: 'SilentDeath', server: 1318, classCode: 18, level: 45 }, T0);
      feed(b, snapshotPacket(0, [[1002, 1], [1003, 2], [1005, 2]], [[1002, 10], [1003, 70], [1005, 10]]));
      // newest last: the reward order is 1003, then 1005, then 1002
      feed(b, batchPacket(0x0d, [[1003, 1]]), T0 + 10);
      feed(b, batchPacket(0x0d, [[1005, 1]]), T0 + 20);
      feed(b, batchPacket(0x0d, [[1002, 1]]), T0 + 30);
      return b;
    };
    const ids = (b: PetBook, limit = 5): number[] => b.snapshot(T0 + 40, 'recent').rows.slice(0, limit).map((r) => r.id);
    expect(ids(make(false, 5))).toEqual([1002, 1005, 1003]); // newest first
    expect(ids(make(true, 5))).toEqual([1003, 1005, 1002]); // closest to MAX first (4, 64, 89 missing)
    expect(ids(make(true, 2))).toEqual([1003, 1005]); // the trim keeps the closest, not the newest
    const pinned = make(true, 2);
    pinned.togglePin(1002);
    expect(ids(pinned)).toEqual([1002, 1003]); // a pin stays on top
  });
});
