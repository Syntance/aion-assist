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
}

/** GS when the game sent it (party roster); otherwise item level from the character page. */
export function GearLine({ card }: { card: PlayerCard }) {
  const gear =
    card.gearScore !== null ? (
      <>
        <b className="font-semibold text-ink-dim">{card.gearScore}</b> GS
      </>
    ) : card.itemLevel !== null ? (
      <>
        <b className="font-semibold text-ink-dim">{card.itemLevel}</b> iLvl
      </>
    ) : (
      <>— GS</>
    );
  return (
    <span className="num flex gap-2 text-[10px] uppercase tracking-[0.04em] text-ink-mute">
      <span>{gear}</span>
      <span>
        <b className="font-semibold text-ink-dim">{compact(card.combatPower)}</b> CP
      </span>
    </span>
  );
}

const TONE = { leader: 'text-warm', ready: 'text-good', waiting: 'text-ink-dim' } as const;

export function PlayerRow({ card, isSelf, fill, primary, secondary, badge, actions, tone, onSelect }: Props) {
  const cls = card.className ?? 'unknown';
  return (
    <li className={`relative flex h-[42px] items-center gap-2 overflow-hidden rounded-[6px] bg-row px-2 ${onSelect ? 'hover:brightness-125' : ''}`}>
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
          background: `linear-gradient(90deg, color-mix(in oklch, var(--color-cls-${cls}) 88%, transparent), color-mix(in oklch, var(--color-cls-${cls}) 52%, transparent))`,
        }}
        aria-hidden="true"
      />
      {isSelf && <span className="absolute inset-y-0 left-0 w-[3px] bg-self" aria-hidden="true" />}
      <span className="relative flex min-w-0 flex-1 items-center gap-2">
        <ClassIcon className={card.className} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-ink [text-shadow:0_1px_2px_oklch(0.1_0.02_255/0.8)]">{card.name}</span>
            {isSelf && <span className="rounded-[3px] bg-self/25 px-1 text-[9px] font-bold tracking-[0.06em] text-self">JA</span>}
            {badge}
          </span>
          <GearLine card={card} />
        </span>
      </span>
      {actions}
      <span className="num relative flex flex-col items-end">
        <span className={`text-[15px] font-bold leading-tight [text-shadow:0_1px_2px_oklch(0.1_0.02_255/0.8)] ${tone ? TONE[tone] : 'text-ink'}`}>{primary}</span>
        <span className="text-[10px] text-ink-dim">{secondary}</span>
      </span>
    </li>
  );
}
