import { describe, expect, it } from 'vitest';
import { acceleratorLabel, buildAccelerator, DEFAULT_HOTKEYS, isValidAccelerator, splitAccelerator } from '../src/shared/keys';
import { onlySent } from '../src/shared/patch';
import { DEFAULT_SETTINGS, panelPatchSchema, settingsPatchSchema, settingsSchema } from '../src/shared/types';

describe('panel settings', () => {
  it('a partial layout patch keeps only what was sent', () => {
    const raw = { id: 'meter', layout: { x: 10, y: 20, w: 300 } };
    const patch = panelPatchSchema.parse(raw);
    expect(onlySent(patch.layout, raw.layout)).toEqual({ x: 10, y: 20, w: 300 });
    expect(panelPatchSchema.parse({ id: 'meter', layout: { pinned: true } }).layout).toEqual({ pinned: true });
  });

  it('a settings patch does not reset unrelated fields to their defaults', () => {
    const raw = { opacity: 0.5 };
    const parsed = settingsPatchSchema.parse(raw);
    // zod fills defaults for absent fields; onlySent drops them again
    expect(parsed.showLobby).toBe(true);
    expect(onlySent(parsed, raw)).toEqual({ opacity: 0.5 });
  });

  it('settings saved before pinning and shortcuts existed load with defaults', () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Record<string, unknown>;
    for (const panel of Object.values(old.panels as Record<string, Record<string, unknown>>)) delete panel.pinned;
    delete old.hotkeys;
    const loaded = settingsSchema.parse(old);
    expect(Object.values(loaded.panels).every((p) => p.pinned === false)).toBe(true);
    expect(loaded.hotkeys).toEqual(DEFAULT_HOTKEYS);
  });
});

describe('global shortcuts', () => {
  it('accepts one to three modifiers plus a letter, digit or F key', () => {
    expect(isValidAccelerator('Control+Shift+K')).toBe(true);
    expect(isValidAccelerator('Control+Alt+P')).toBe(true);
    expect(isValidAccelerator('Alt+F9')).toBe(true);
    expect(isValidAccelerator('Control+Alt+Shift+7')).toBe(true);
  });

  it('rejects a bare key, unknown keys, repeated modifiers and non-accelerators', () => {
    expect(isValidAccelerator('K')).toBe(false);
    expect(isValidAccelerator('Control')).toBe(false);
    expect(isValidAccelerator('Control+Control+K')).toBe(false);
    expect(isValidAccelerator('Control+Space')).toBe(false);
    expect(isValidAccelerator('Super+K')).toBe(false);
    expect(isValidAccelerator('')).toBe(false);
  });

  it('builds, splits and labels accelerators in a fixed order', () => {
    expect(buildAccelerator(['Shift', 'Control'], 'K')).toBe('Control+Shift+K');
    expect(splitAccelerator('Control+Alt+P')).toEqual({ modifiers: ['Control', 'Alt'], key: 'P' });
    expect(acceleratorLabel('Control+Shift+K')).toBe('Ctrl + Shift + K');
  });

  it('a settings patch with an invalid shortcut is rejected', () => {
    expect(settingsPatchSchema.safeParse({ hotkeys: { pin: 'K', edit: 'Control+Shift+L' } }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ hotkeys: { pin: 'Control+Alt+P', edit: 'Control+Shift+L' } }).success).toBe(true);
  });
});
