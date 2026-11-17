/** The local calendar day of a time, "2026-11-16": what the daily statistics and the PvP history are grouped by. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
