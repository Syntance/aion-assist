/**
 * Zod applies `.default()` values even inside `.partial()`, so a validated patch can carry
 * defaults for fields the sender never mentioned and would silently reset them. This keeps
 * only the keys that were actually present in the raw input.
 */
export function onlySent<T extends object>(parsed: T, raw: unknown): Partial<T> {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Partial<T> = {};
  for (const key of Object.keys(parsed)) {
    if (!Object.hasOwn(raw, key)) continue;
    Object.defineProperty(out, key, { value: Object.getOwnPropertyDescriptor(parsed, key)?.value, enumerable: true, writable: true, configurable: true });
  }
  return out;
}
