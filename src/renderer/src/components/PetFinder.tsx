import { useEffect, useMemo, useState } from 'react';
import type { PetRow } from '@shared/pets';
import { FAMILIES, FamilyChip, PetPortrait } from './PetIcon';
import { loadSpawns, petsWithMap } from './PetMap';
import { PendingMark, PinButton, progressText, RankPips } from './PetsPanel';

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
export function PetFinderWindow({ onClose, onMap }: { onClose: () => void; onMap: (pet: { id: number; name: string } | null) => void }) {
  const [mapIds, setMapIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    let alive = true;
    void loadSpawns().then((d) => alive && setMapIds(petsWithMap(d)));
    return () => {
      alive = false;
    };
  }, []);
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
      className="flex max-h-[84vh] w-[520px] shrink-0 flex-col overflow-hidden rounded-[10px] bg-panel shadow-[0_14px_44px_oklch(0.1_0.02_255/0.65)] ring-1 ring-line"
    >
      <header className="flex items-center gap-2 bg-panel-head px-3 py-2">
        <h2 className="m-0 text-[14px] font-bold">Zwierzaki</h2>
        <span className="num text-[11px] text-ink-mute">{pets ? `${shown.length} z ${pets.length}` : ''}</span>
        <button
          type="button"
          title="Mapa spawnów petów z filtrem rodzin"
          aria-label="Otwórz mapę petów"
          onClick={() => onMap(null)}
          className="ml-auto grid h-6 place-items-center rounded-[5px] px-2 text-[11px] font-bold text-ink-dim ring-1 ring-line hover:bg-row hover:text-accent"
        >
          Mapa
        </button>
        <button type="button" aria-label="Zamknij" onClick={onClose} className="grid size-6 place-items-center rounded-[5px] text-ink-dim hover:bg-row hover:text-ink">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>
      <div className="flex flex-col gap-2 border-b border-line px-3 py-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj peta lub źródła…"
          aria-label="Szukaj peta"
          className="h-7 w-full rounded-[6px] border border-line bg-panel-head px-2 text-[12px] text-ink placeholder:text-ink-mute"
        />
        <div role="group" aria-label="Rodzina" className="flex gap-1">
          {[''].concat(FAMILIES).map((f) => (
            <button
              key={f || 'all'}
              type="button"
              aria-pressed={family === f}
              onClick={() => setFamily(f)}
              className={`flex h-6 flex-1 items-center justify-center gap-1 rounded-[6px] px-1 text-[11px] font-semibold ring-1 transition-colors ${family === f ? 'bg-accent/20 text-accent ring-accent/50' : 'text-ink-dim ring-line hover:bg-row hover:text-ink'}`}
            >
              {f !== '' && <FamilyChip family={f} compact />}
              {f === '' ? 'Wszystkie' : f}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <select aria-label="Ranga" value={rank} onChange={(e) => setRank(e.target.value as RankFilter)} className={select}>
            {(Object.keys(RANK_LABEL) as RankFilter[]).map((k) => (
              <option key={k} value={k}>
                {RANK_LABEL[k]}
              </option>
            ))}
          </select>
          <select aria-label="Sortowanie" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={select}>
            <option value="name">Sortuj: wg nazwy</option>
            <option value="close">Sortuj: najbliżej awansu</option>
          </select>
        </div>
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
                      <PetPortrait id={p.id} size={36} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-semibold">{p.name}</span>
                          <FamilyChip family={p.family} compact />
                        </span>
                        <span className="block truncate text-[10px] text-ink-mute">{p.sourceKind ?? 'Źródło nieznane'}</span>
                      </span>
                      {/* fixed columns, so rank, amount, map and pin line up in every row */}
                      <span className="flex w-[64px] shrink-0 flex-col items-end gap-1">
                        <RankPips rank={p.rank} />
                        <span className="num whitespace-nowrap text-[10px] text-ink-mute">{p.remaining !== null && p.remaining > 0 ? `brakuje ${p.remaining}` : ''}</span>
                      </span>
                      <span className="flex w-[76px] shrink-0 flex-col items-end gap-1">
                        <span className="flex items-center gap-1">
                          <PendingMark pending={prog.pending} />
                          <span className={`whitespace-nowrap font-bold ${prog.tone}`}>{prog.text}</span>
                        </span>
                        {p.rank !== null && p.rank !== 3 && p.souls !== null && p.goal ? (
                          <span className="block h-[3px] w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
                            <span className="block h-full rounded-full bg-warm" style={{ width: `${Math.round(Math.min(1, p.souls / p.goal) * 100)}%` }} />
                          </span>
                        ) : (
                          <span className="h-[3px]" aria-hidden="true" />
                        )}
                      </span>
                    </button>
                    <span className="flex w-[38px] shrink-0 justify-center">
                      {mapIds?.has(p.id) && (
                        <button
                          type="button"
                          title="Pokaż spawny na mapie"
                          aria-label={`Mapa: ${p.name}`}
                          onClick={() => onMap({ id: p.id, name: p.name })}
                          className="grid h-5 w-full place-items-center rounded-[4px] text-[10px] font-bold text-ink-dim ring-1 ring-line hover:bg-line hover:text-accent"
                        >
                          Mapa
                        </button>
                      )}
                    </span>
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
        Ranga i dusze pochodzą z kolekcji gry wczytywanej przy logowaniu. Pety tylko za prawdziwe pieniądze są pominięte.
      </footer>
    </section>
  );
}
