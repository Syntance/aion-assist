import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Store, salvageSettings } from '../src/main/store';
import { DEFAULT_SETTINGS } from '../src/shared/types';

describe('settings persistence', () => {
  it('keeps every valid setting when one value is broken (e.g. after an update changed it)', () => {
    const saved = { ...DEFAULT_SETTINGS, petsRows: 7, opacity: 5 /* out of range */, showPing: true, colors: { classes: { gladiator: '#112233' }, self: null, tagBg: '#f269cb', tagText: '#2a0a1d' } };
    const s = salvageSettings(saved);
    expect(s.petsRows).toBe(7);
    expect(s.showPing).toBe(true);
    expect(s.colors.classes.gladiator).toBe('#112233');
    expect(s.opacity).toBe(DEFAULT_SETTINGS.opacity); // only the broken one falls back
  });

  it('keeps the other window layouts when one is broken', () => {
    const saved = { ...DEFAULT_SETTINGS, panels: { ...DEFAULT_SETTINGS.panels, meter: { x: 300, y: 400, w: 400, scale: 1, h: null, visible: true, pinned: true }, pvp: { garbage: true } } };
    const s = salvageSettings(saved);
    expect(s.panels.meter).toMatchObject({ x: 300, y: 400, pinned: true });
    expect(s.panels.pvp).toEqual(DEFAULT_SETTINGS.panels.pvp);
  });

  it('writes a change soon after it is made and notices unflagged changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aion-store-'));
    try {
      const store = new Store(dir);
      store.data.settings.petsRows = 3;
      store.saveSoon(20);
      await new Promise((r) => setTimeout(r, 120));
      expect(JSON.parse(readFileSync(join(dir, 'aion-assist.json'), 'utf8')).settings.petsRows).toBe(3);
      store.data.settings.petsRows = 6;
      store.saveIfChanged();
      expect(JSON.parse(readFileSync(join(dir, 'aion-assist.json'), 'utf8')).settings.petsRows).toBe(6);
      expect(new Store(dir).data.settings.petsRows).toBe(6); // a restart reads it back
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps a corrupt file aside instead of overwriting it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aion-store-'));
    try {
      writeFileSync(join(dir, 'aion-assist.json'), '{ broken', 'utf8');
      const store = new Store(dir);
      expect(store.data.settings.petsRows).toBe(DEFAULT_SETTINGS.petsRows);
      expect(existsSync(join(dir, 'aion-assist.json'))).toBe(false);
      expect(readdirSync(dir).some((f) => f.startsWith('aion-assist.json.corrupt-'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
