import { useEffect, useState, type ReactNode } from 'react';
import type { PlayerDetail } from '@shared/types';
import { clock, compact, grouped, percent } from '../format';
import { ClassIcon } from './ClassIcon';

interface Props {
  name: string;
  /** "live" (current fight) or a saved encounter id. */
  source: string;
  onClose: () => void;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="num whitespace-nowrap text-ink-dim">
      {label} <b className="font-semibold text-ink">{value}</b>
    </span>
  );
}

/** Per-skill breakdown of one player: totals, hit-type rates and a skill table (like the Abyss Logs detail view). */
export function DetailWindow({ name, source, onClose }: Props) {
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    let ticks = 0;
    const load = async (): Promise<void> => {
      const next = await window.overlay.getDetail(name, source);
      if (!alive) return;
      setMissing(next === null);
      if (next) setDetail(next);
    };
    void load();
    // live: follow the fight; saved: only re-read a few times to pick up skill names fetched meanwhile
    const timer = setInterval(() => {
      ticks++;
      const live = source === 'live' || source === 'livepvp';
      if (!live && ticks > 5) return;
      void load();
    }, source === 'live' || source === 'livepvp' ? 700 : 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [name, source]);

  return (
    <section
      data-hit="detail"
      aria-label={`Szczegóły: ${name}`}
      className="flex max-h-[78vh] w-[740px] shrink-0 flex-col overflow-hidden rounded-[10px] bg-panel shadow-[0_14px_44px_oklch(0.1_0.02_255/0.65)] ring-1 ring-line"
    >
      <header className="flex items-center gap-2.5 bg-panel-head px-3 py-2">
        <ClassIcon className={detail?.className ?? null} />
        <h2 className="m-0 text-[14px] font-bold">{name}</h2>
        <span className="num text-[11px] text-ink-mute">{detail ? clock(detail.durationMs) : ''}</span>
        {detail?.title && <span className="truncate text-[11px] text-ink-dim">· {detail.title}</span>}
        <button type="button" aria-label="Zamknij" onClick={onClose} className="ml-auto grid size-6 place-items-center rounded-[5px] text-ink-dim hover:bg-row hover:text-ink">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>

      {!detail ? (
        <p className="m-0 px-3 py-4 text-[12px] text-ink-mute">{missing ? 'Brak danych o tym graczu w tej walce.' : 'Wczytuję…'}</p>
      ) : (
        <div className="overflow-y-auto">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-3 pt-2.5">
            <span className="num text-[22px] font-bold leading-none">{compact(detail.total)}</span>
            <span className="text-[11px] text-ink-mute">obrażeń</span>
            <span className="num text-[16px] font-bold text-accent">{compact(detail.dps)}/s</span>
            <span className="num text-[11px] text-ink-dim">
              {detail.gearScore !== null && <>GS {detail.gearScore} · </>}
              {detail.combatPower !== null && <>CP {grouped(detail.combatPower)}</>}
              {detail.level !== null && <> · poz. {detail.level}</>}
            </span>
          </div>
          <div className="mx-3 mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-[6px] bg-row px-2.5 py-1.5 text-[11px]">
            <Stat label="Rzuty" value={detail.casts} />
            <Stat label="Trafienia" value={grouped(detail.hits)} />
            <Stat label="Krytyki" value={percent(detail.crit)} />
            <Stat label="Z tyłu" value={percent(detail.back)} />
            <Stat label="Z przodu" value={percent(detail.front)} />
            <Stat label="Parowanie" value={percent(detail.parry)} />
            <Stat label="Perfekt" value={percent(detail.perfect)} />
            <Stat label="Podwójne" value={percent(detail.double)} />
            <Stat label="Śmierci" value={detail.deaths} />
          </div>
          <table className="num mt-2 w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-ink-mute">
                <th className="px-3 py-1 font-semibold">Umiejętność</th>
                <th className="px-2 py-1 text-right font-semibold">Obrażenia</th>
                <th className="px-2 py-1 text-right font-semibold">%</th>
                <th className="px-2 py-1 text-right font-semibold">Rzuty</th>
                <th className="px-2 py-1 text-right font-semibold">Kryt.</th>
                <th className="px-2 py-1 text-right font-semibold">Maks.</th>
                <th className="px-2 py-1 text-right font-semibold">Śr.</th>
                <th className="px-3 py-1 text-right font-semibold">Par.</th>
              </tr>
            </thead>
            <tbody>
              {detail.skills.map((sk) => (
                <tr key={sk.skill} className="border-t border-line/60">
                  <td className="relative px-3 py-1">
                    <span className="absolute inset-y-0 left-0 bg-accent/10" style={{ width: `${Math.round(sk.pct * 100)}%` }} aria-hidden="true" />
                    <span className="relative font-semibold">{sk.name ?? `Umiejętność #${sk.skill}`}</span>
                  </td>
                  <td className="px-2 py-1 text-right font-semibold">{compact(sk.damage)}</td>
                  <td className="px-2 py-1 text-right text-ink-dim">{percent(sk.pct)}</td>
                  <td className="px-2 py-1 text-right text-ink-dim">{sk.casts || '—'}</td>
                  <td className="px-2 py-1 text-right text-ink-dim">{sk.hits > 0 ? percent(sk.critPct) : '—'}</td>
                  <td className="px-2 py-1 text-right text-ink-dim">{compact(sk.max)}</td>
                  <td className="px-2 py-1 text-right text-ink-dim">{compact(sk.avg)}</td>
                  <td className="px-3 py-1 text-right text-ink-dim">{sk.hits > 0 ? percent(sk.parryPct) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
