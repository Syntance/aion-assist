/**
 * Global shortcuts (registered with the OS hotkey API, so they work while the game is in front).
 * Stored as Electron accelerators, e.g. "Control+Shift+K": one to three modifiers plus a key.
 */

export const MODIFIERS = ['Control', 'Alt', 'Shift'] as const;
export const HOTKEY_KEYS: readonly string[] = [
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ...Array.from({ length: 10 }, (_, i) => String(i)),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
];

export const DEFAULT_HOTKEYS = { pin: 'Control+Shift+K', edit: 'Control+Shift+L' };

export function isValidAccelerator(value: string): boolean {
  const parts = value.split('+');
  const key = parts.pop();
  if (key === undefined || !HOTKEY_KEYS.includes(key)) return false;
  if (parts.length < 1 || parts.length > 3) return false;
  if (new Set(parts).size !== parts.length) return false;
  return parts.every((p) => (MODIFIERS as readonly string[]).includes(p));
}

export function splitAccelerator(value: string): { modifiers: string[]; key: string } {
  const parts = value.split('+');
  const key = parts.pop() ?? '';
  return { modifiers: parts, key };
}

/** Modifiers in a fixed order, then the key. */
export function buildAccelerator(modifiers: readonly string[], key: string): string {
  const ordered = MODIFIERS.filter((m) => modifiers.includes(m));
  return [...ordered, key].join('+');
}

/** "Control+Shift+K" -> "Ctrl + Shift + K". */
export function acceleratorLabel(value: string): string {
  return value.replaceAll('Control', 'Ctrl').split('+').join(' + ');
}
