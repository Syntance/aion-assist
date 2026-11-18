import type { ReactNode } from 'react';
import type { PlayerCard } from '@shared/types';
import { compact } from '../format';
import { ClassIcon } from './ClassIcon';

interface Props {
  card: PlayerCard;
  isSelf: boolean;
  /** 0..1 bar length relative to the top row. */
  fill: number;
  primary: string;
  secondary: ReactNode;
  badge?: ReactNode;
  /** Extra controls (above the click overlay), e.g. manual K/D buttons. */
  actions?: ReactNode;
  /** Lobby status colouring of the primary text. */
  tone?: 'leader' | 'ready' | 'waiting';
  /** Makes the row clickable (opens the per-skill detail). */
  onSelect?: () => void;
  /** Rendered inside the row but may draw outside the panel (e.g. death markers). */
  aside?: ReactNode;
}

/** GS when the game sent it (party roster); otherwise item level from the character page. */
export function GearLine({ card }: { card: PlayerCard }) {
  const gear =
    card.gearScore !== null ? (
      <>
        <b className="font-bold text-ink">{card.gearScore}</b> GS
      </>
    ) : card.itemLevel !== null ? (
      <>
        <b className="font-bold text-ink">{card.itemLevel}</b> iLvl
      </>
    ) : (
      <>— GS</>
    );
  return (
    <span className="num flex gap-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-dim [text-shadow:0_1px_2px_oklch(0.08_0.02_255/0.95),0_0_3px_oklch(0.08_0.02_255/0.8)]">
      <span>{gear}</span>
      <span>
        <b className="font-bold text-ink">{compact(card.combatPower)}</b> CP
      </span>
    </span>
  );
}

const TONE = { leader: 'text-warm', ready: 'text-good', waiting: 'text-ink-dim' } as const;

export function PlayerRow({ card, isSelf, fill, primary, secondary, badge, actions, tone, onSelect, aside }: Props) {
  const cls = card.className ?? 'unknown';
  return (
    <li
      className={`relative flex h-[34px] items-center gap-2 overflow-hidden rounded-[6px] bg-row px-2 shadow-[inset_0_1px_0_oklch(1_0_0/0.22),inset_0_-1px_0_oklch(0_0_0/0.3),0_2px_3px_oklch(0_0_0/0.35)] ${onSelect ? 'hover:brightness-125' : ''}`}
    >
      {aside}
      {onSelect && (
        <button
          type="button"
          onClick={onSelect}
          aria-label={`Szczegóły: ${card.name}`}
          title="Pokaż szczegóły umiejętności"
          className="absolute inset-0 z-10 cursor-pointer rounded-[6px] focus-visible:outline-2 focus-visible:outline-accent"
        />
      )}
      <span
        className="bar-fill absolute inset-0"
        style={{
          transform: `scaleX(${Math.max(0.02, Math.min(1, fill))})`,
          // your own row can have its own colour (--self-bar, set from the settings); otherwise the class colour
          background: `linear-gradient(90deg, color-mix(in oklch, ${isSelf ? `var(--self-bar, var(--color-cls-${cls}))` : `var(--color-cls-${cls})`} 88%, transparent), color-mix(in oklch, ${isSelf ? `var(--self-bar, var(--color-cls-${cls}))` : `var(--color-cls-${cls})`} 52%, transparent))`,
        }}
        aria-hidden="true"
      />
      {/* a darker fade from the left edge to the right, so the class icon stands out from the bar colour */}
      <span className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(90deg, oklch(0 0 0 / 0.5), oklch(0 0 0 / 0.28) 30%, oklch(0 0 0 / 0) 75%)' }} aria-hidden="true" />
      {/* light from above: a soft highlight on the top and a light fade of shadow along the bottom over the full width */}
      <span
        className="bar-fill pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, oklch(1 0 0 / 0.14), oklch(1 0 0 / 0) 45%), linear-gradient(to top, oklch(0 0 0 / 0.24), oklch(0 0 0 / 0) 55%)' }}
        aria-hidden="true"
      />
      {isSelf && <span className="absolute inset-y-0 left-0 w-[3px] bg-self" aria-hidden="true" />}
      <span className="relative flex min-w-0 flex-1 items-center gap-2">
        <ClassIcon className={card.className} size={26} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-ink [text-shadow:0_1px_2px_oklch(0.1_0.02_255/0.8)]">{card.name}</span>
            {isSelf && (
              <span className="rounded-[3px] px-1 text-[9px] font-extrabold tracking-[0.06em]" style={{ background: 'var(--self-tag-bg, #f269cb)', color: 'var(--self-tag-text, #2a0a1d)' }}>
                JA
              </span>
            )}
            {badge}
          </span>
          <GearLine card={card} />
        </span>
      </span>
      {actions}
      <span className="num relative flex flex-col items-end">
        <span className={`text-[15px] font-bold leading-tight [text-shadow:0_1px_2px_oklch(0.1_0.02_255/0.8)] ${tone ? TONE[tone] : 'text-ink'}`}>{primary}</span>
        <span className="text-[10px] text-ink">{secondary}</span>
      </span>
    </li>
  );
}
