import type { DeathSnapshot } from '@shared/types';
import { ClassIcon } from './ClassIcon';
import { GearLine } from './PlayerRow';
import { UNKNOWN_RIVAL } from '@shared/opponents';
import { KdaButtons } from './KdaButtons';

/** Shown after your final death: who got you, and a way to fix the K/D by hand if the game sent no record. */
export function DeathPopup({ death }: { death: DeathSnapshot }) {
  const { killer, killerCard: card } = death;
  return (
    <section
      data-hit="death"
      aria-label="Zginąłeś"
      role="status"
      className="absolute left-1/2 top-[18%] z-30 w-[300px] -translate-x-1/2 overflow-hidden rounded-[10px] bg-panel shadow-[0_14px_44px_oklch(0.1_0.02_255/0.65)] ring-1 ring-bad/70"
    >
      <header className="flex items-center gap-2 bg-bad/20 px-3 py-1.5">
        <h2 className="m-0 text-[12px] font-bold uppercase tracking-[0.08em] text-bad">Zginąłeś</h2>
        <span className={`num text-[10px] ${death.registered ? 'text-good' : 'text-warm'}`}>{death.registered ? 'zapisano w K/D/A' : 'nie zapisano'}</span>
        <button
          type="button"
          aria-label="Zamknij"
          title="Zamknij"
          onClick={() => window.overlay.dismissDeath()}
          className="ml-auto grid size-5 place-items-center rounded-[4px] text-ink-dim hover:bg-row hover:text-ink"
        >
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>
      {killer && card ? (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <ClassIcon className={card.className} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-bold">{killer}</span>
            <GearLine card={card} />
          </div>
          <KdaButtons name={killer} />
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-3 py-2">
          <p className="m-0 text-[11px] text-ink-mute">Nie wiem, kto cię zabił. Ostatni przeciwnicy:</p>
          {death.candidates.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{name}</span>
              <KdaButtons name={name} />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-dim">{UNKNOWN_RIVAL}</span>
            <KdaButtons name={UNKNOWN_RIVAL} />
          </div>
        </div>
      )}
    </section>
  );
}
