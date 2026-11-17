import type { ClassName } from '@shared/types';

/** Hand-drawn 16×16 class glyphs (single path each, stroke-based). */
const GLYPHS: Record<ClassName | 'unknown', string> = {
  gladiator: 'M3 13 L11 5 M9 3 L13 7 M4 9 L7 12', // greatsword
  templar: 'M8 2 L13 4 V8 C13 11 11 13 8 14 C5 13 3 11 3 8 V4 Z', // shield
  ranger: 'M4 2 C10 4 10 12 4 14 M4 2 V14 M6 8 H14 M12 6 L14 8 L12 10', // bow
  assassin: 'M3 13 L8 3 L9 9 Z M13 13 L8 3', // twin daggers
  spiritmaster: 'M8 2 C11 5 12 7 8 14 C4 7 5 5 8 2 Z M8 7 V10', // spirit flame
  sorcerer: 'M8 2 L9.5 6.5 L14 8 L9.5 9.5 L8 14 L6.5 9.5 L2 8 L6.5 6.5 Z', // arcane star
  cleric: 'M8 2 V14 M4 6 H12 M6 14 H10', // staff cross
  chanter: 'M4 13 L12 3 M10 3 H13 V6 M3 10 L6 13', // battle staff
  unknown: 'M8 3 A5 5 0 1 0 8.01 3 Z',
};

export function ClassIcon({ className }: { className: ClassName | null }) {
  const key = className ?? 'unknown';
  return (
    <span
      className="grid size-[22px] shrink-0 place-items-center rounded-[5px] ring-1 ring-white/15"
      style={{ background: `color-mix(in oklch, var(--color-cls-${key}) 70%, black)` }}
      title={className ?? undefined}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={GLYPHS[key]} />
      </svg>
    </span>
  );
}
