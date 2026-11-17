import { useEffect, useMemo, useState } from 'react';
import type { PetRow } from '@shared/pets';
import { FamilyChip, PetPortrait } from './PetIcon';
import { PinButton, progressText, RankPips } from './PetsPanel';

const FAMILIES = ['Cogni', 'Fera', 'Natura', 'Varian', 'Special'] as const;
type RankFilter = 'all' | 'none' | '1' | '2' | '3' | 'open' | 'unknown';
type Sort = 'name' | 'close';

const RANK_LABEL: Record<RankFilter, string> = {
  all: 'Wszystkie rangi',
  open: 'Bez MAX',
  none: 'Nieposiadane',
  '1': 'Ranga 1',
  '2': 'Ranga 2',
  '3': 'MAX',
  unknown: 'Ranga nieznana',
};

function matchesRank(p: PetRow, f: RankFilter): boolean {
  switch (f) {
    case 'none':
      return p.rank === 0;
    case '1':
    case '2':
    case '3':
      return p.rank === Number(f);
    case 'open':
      return p.rank !== 3;
    case 'unknown':
      return p.rank === null;
    default:
      return true;
  }
}

const select = 'rounded-[6px] border border-line bg-panel-head px-1.5 py-1 text-[11px] text-ink';

/** Every pet in one searchable list: rank, souls to the next rank, and where it comes from. */
export function PetFinderWindow({ onClose }: { onClose: () => void }) {
  const [pets, setPets] = useState<PetRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [rank, setRank] = useState<RankFilter>('open');
  const [sort, setSort] = useState<Sort>('name');
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => void window.overlay.getPets().then((p) => alive && setPets(p));
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (pets ?? []).filter(
      (p) => (family === '' || p.family === family) && matchesRank(p, rank) && (q === '' || p.name.toLowerCase().includes(q) || (p.source ?? '').toLowerCase().includes(q)),
    );
    return list.sort((a, b) =>
      sort === 'close'
        ? (a.remaining ?? 9999) - (b.remaining ?? 9999) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  }, [pets, query, family, rank, sort]);

  return (
    <section
      data-hit="pets"
      aria-label="Wyszukiwarka petów"
      className="absolute left-1/2 top-[64px] z-20 flex max-h-[78vh] w-[520px] -translate-x-1/2 flex-col overflow-hidden rounded-[10px] bg-panel shadow-[0_14px_44px_oklch(0.1_0.02_255/0.65)] ring-1 ring-line"
    >
      <header className="flex items-center gap-2 bg-panel-head px-3 py-2">
        <h2 className="m-0 text-[14px] font-bold">Zwierzaki</h2>
        <span className="num text-[11px] text-ink-mute">{pets ? `${shown.length} z ${pets.length}` : ''}</span>
        <button type="button" aria-label="Zamknij" onClick={onClose} className="ml-auto grid size-6 place-items-center rounded-[5px] text-ink-dim hover:bg-row hover:text-ink">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj peta lub źródła…"
          aria-label="Szukaj peta"
          className="min-w-[150px] flex-1 rounded-[6px] border border-line bg-panel-head px-2 py-1 text-[12px] text-ink placeholder:text-ink-mute"
        />
        <select aria-label="Rodzina" value={family} onChange={(e) => setFamily(e.target.value)} className={select}>
          <option value="">Wszystkie rodziny</option>
          {FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select aria-label="Ranga" value={rank} onChange={(e) => setRank(e.target.value as RankFilter)} className={select}>
          {(Object.keys(RANK_LABEL) as RankFilter[]).map((k) => (
            <option key={k} value={k}>
              {RANK_LABEL[k]}
            </option>
          ))}
        </select>
        <select aria-label="Sortowanie" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={select}>
          <option value="name">Wg nazwy</option>
          <option value="close">Najbliżej awansu</option>
        </select>
      </div>
      <div className="overflow-y-auto">
        {!pets ? (
          <p className="m-0 px-3 py-3 text-[12px] text-ink-mute">Wczytuję…</p>
        ) : shown.length === 0 ? (
          <p className="m-0 px-3 py-4 text-[12px] text-ink-mute">Nic nie pasuje do filtrów.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-2.5">
            {shown.map((p) => {
              const prog = progressText(p);
              const open = openId === p.id;
              return (
                <li key={p.id} className="rounded-[8px] bg-row ring-1 ring-line/60">
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : p.id)}
                      className="num flex min-w-0 flex-1 items-center gap-2 text-left text-[12px]"
                    >
                      <PetPortrait id={p.id} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-semibold">{p.name}</span>
                          <FamilyChip family={p.family} />
                        </span>
                        <span className="block truncate text-[10px] text-ink-mute">{p.sourceKind ?? 'Źródło nieznane'}</span>
                      </span>
                      <RankPips rank={p.rank} />
                      {p.remaining !== null && p.remaining > 0 && <span className="text-[10px] text-ink-mute">brakuje {p.remaining}</span>}
                      <span className={`w-[78px] text-right font-bold ${prog.tone}`}>{prog.text}</span>
                    </button>
                    <PinButton pet={p} />
                  </div>
                  {open && (
                    <p className="m-0 border-t border-line/60 px-3 py-2 text-[11px] leading-snug text-ink-dim">
                      {p.source ?? 'Brak opisu, skąd wziąć tego peta.'}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <footer className="border-t border-line px-3 py-1.5 text-[10px] text-ink-mute">
        Ranga i dusze pochodzą z pakietów kolekcji gry, wczytywanych przy logowaniu postaci. Pety tylko za prawdziwe pieniądze są pominięte.
      </footer>
    </section>
  );
}
