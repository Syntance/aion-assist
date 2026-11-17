/** 91_300 -> "91.3K", 7_550_000 -> "7.55M". */
export function compact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(1)}K`;
  if (abs >= 1000) return `${(value / 1000).toFixed(2)}K`;
  return String(Math.round(value));
}

export function grouped(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('pl-PL');
}

export function signed(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value >= 0 ? '+' : '−'}${grouped(Math.abs(value))}`;
}

export function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
