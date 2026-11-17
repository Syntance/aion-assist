import { useEffect, useState } from 'react';
import type { PetRow, PetsSnapshot } from '@shared/pets';
import type { OverlaySnapshot } from '@shared/types';
import { Panel } from './Panel';
import { FamilyChip, PetPortrait } from './PetIcon';
import { loadSpawns, petsWithMap } from './PetMap';

/** Three pips: how many ranks the pet has. */
export function RankPips({ rank }: { rank: number | null }) {
  return (
    <span className="flex gap-[3px]" role="img" aria-label={rank === null ? 'Ranga nieznana' : rank === 0 ? 'Nieposiadany' : `Ranga ${rank} z 3`} title={rank === null ? 'Ranga nieznana (zaloguj postać ponownie)' : rank === 0 ? 'Nieposiadany' : `Ranga ${rank}/3`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`h-[7px] w-[7px] rounded-[2px] ${rank !== null && rank >= n ? 'bg-accent' : 'bg-line'}`} />
      ))}
    </span>
  );
}

export function progressText(p: PetRow): { text: string; tone: string } {
  if (p.rank === 3) return { text: 'MAX', tone: 'text-good' };
  if (p.rank === null) return { text: '—', tone: 'text-ink-mute' };
  if (p.pending) return { text: 'awans oczekuje', tone: 'text-warm' };
  if (p.souls === null || p.goal === null) return { text: '—', tone: 'text-ink-mute' };
  return { text: `${p.stale ? '~' : ''}${p.souls}/${p.goal}`, tone: p.stale ? 'text-ink-mute' : 'text-ink' };
}

export function PinButton({ pet }: { pet: PetRow }) {
  return (
    <button
      type="button"
      aria-pressed={pet.pinned}
      aria-label={pet.pinned ? `Odepnij: ${pet.name}` : `Przypnij: ${pet.name}`}
      title={pet.pinned ? 'Odepnij z listy' : 'Przypnij na liście (do 5)'}
      onClick={() => window.overlay.togglePetPin(pet.id)}
      className={`grid size-5 shrink-0 place-items-center rounded-[4px] hover:bg-line ${pet.pinned ? 'text-accent' : 'text-ink-mute hover:text-ink'}`}
    >
      <svg viewBox="0 0 16 16" width="11" height="11" fill={pet.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 2h4l-.8 4 2.8 2.8H4L6.8 6ZM8 8.8V14" />
      </svg>
    </button>
  );
}

function age(at: number | null, now: number): string {
  if (at === null) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s < 15 ? 'teraz' : s < 90 ? `${s}s temu` : `${Math.round(s / 60)} min temu`;
}

function PetLine({ pet, mode, hasMap, onMap }: { pet: PetRow; mode: 'recent' | 'nearby'; hasMap: boolean; onMap: (pet: { id: number; name: string }) => void }) {
  const prog = progressText(pet);
  const fill = pet.rank === 3 ? 1 : pet.souls !== null && pet.goal ? Math.min(1, pet.souls / pet.goal) : 0;
  const max = pet.rank === 3;
  return (
    <li className={`flex items-center gap-2 rounded-[8px] bg-row px-2 py-1.5 ${max ? 'opacity-70' : ''}`}>
      <PetPortrait id={pet.id} size={38} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold">{pet.name}</span>
        </span>
        <span className="num flex items-center gap-1.5 text-[10px] text-ink-mute">
          <span title="Ranga peta">Rank {pet.rank === null ? '?' : pet.rank}</span>
          <FamilyChip family={pet.family} />
          {pet.sessionSouls > 0 && <span className="text-good" title="Dusze zebrane w tej sesji">+{pet.sessionSouls}</span>}
          {mode === 'nearby' && <span>{age(pet.seenAt, Date.now())}</span>}
        </span>
        {!max && pet.rank !== null && (
          <span className="block h-[3px] overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span className="block h-full rounded-full bg-warm" style={{ width: `${Math.round(fill * 100)}%` }} />
          </span>
        )}
      </span>
      {max ? (
        <span className="num rounded-[5px] bg-panel-head px-1.5 py-0.5 text-[11px] font-bold text-good ring-1 ring-line/80">✓ MAX</span>
      ) : (
        <span className={`num text-[13px] font-bold ${prog.tone}`} title={pet.remaining !== null && pet.remaining > 0 ? `Brakuje ${pet.remaining} do następnej rangi` : undefined}>
          {prog.text.replace('/', ' / ')}
        </span>
      )}
      {hasMap && (
        <button
          type="button"
          title="Pokaż spawny tego peta na mapie"
          aria-label={`Mapa: ${pet.name}`}
          onClick={() => onMap({ id: pet.id, name: pet.name })}
          className="grid h-5 shrink-0 place-items-center rounded-[4px] px-1.5 text-[10px] font-bold text-ink-dim ring-1 ring-line hover:bg-line hover:text-accent"
        >
          Mapa
        </button>
      )}
      <PinButton pet={pet} />
    </li>
  );
}

function emptyText(pets: PetsSnapshot, mode: 'recent' | 'nearby', hideMaxed: boolean): string {
  if (!pets.synced && pets.summary.unknown === pets.summary.total) {
    return 'Wczytam kolekcję przy logowaniu postaci: wróć do wyboru postaci i zaloguj się ponownie przy włączonej nakładce.';
  }
  if (mode === 'nearby') return hideMaxed && pets.nearbyCount > 0 ? 'Pety w pobliżu są na maksimum. Wyłącz „Ukryj MAX”, żeby je zobaczyć.' : 'Nie wykryto petów w pobliżu. Pochodź po okolicy.';
  return 'Nagrody za dusze pojawią się tutaj.';
}

export function PetsPanel({ snap, onFinder, onMap }: { snap: OverlaySnapshot; onFinder: () => void; onMap: (pet: { id: number; name: string } | null) => void }) {
  const [mapIds, setMapIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    let alive = true;
    void loadSpawns().then((d) => alive && setMapIds(petsWithMap(d)));
    return () => {
      alive = false;
    };
  }, []);
  const { pets, settings } = snap;
  const mode = settings.petsMode;
  const api = window.overlay;
  const tab = (id: 'recent' | 'nearby', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === id}
      onClick={() => api.updateSettings({ petsMode: id })}
      className={`rounded-[5px] px-2 py-0.5 text-[11px] font-semibold ${mode === id ? 'bg-accent/25 text-accent' : 'text-ink-dim hover:text-ink'}`}
    >
      {label}
      {id === 'nearby' && pets.nearbyCount > 0 && <span className="num ml-1 text-[10px] font-normal text-ink-mute">{pets.nearbyCount}</span>}
    </button>
  );
  const iconButton = 'grid h-[22px] place-items-center rounded-[5px] px-1.5 text-[11px] font-semibold text-ink-dim ring-1 ring-line hover:bg-line hover:text-ink';
  return (
    <Panel
      id="pets"
      title="Zwierzaki"
      layout={settings.panels.pets}
      editMode={snap.editMode || snap.altMode}
      sub={
        <button
          type="button"
          title="Mapa spawnów petów (wybierz peta na mapie)"
          aria-label="Otwórz mapę petów"
          onClick={() => onMap(null)}
          className="grid h-5 place-items-center rounded-[4px] px-1.5 text-[10px] font-bold text-ink-dim ring-1 ring-line hover:bg-line hover:text-accent"
        >
          Mapa
        </button>
      }
      aside={pets.summary.total > 0 && pets.synced ? <span className="num" title="Zebrane / wszystkie (bez petów tylko za prawdziwe pieniądze)">{pets.summary.collected}/{pets.summary.total}</span> : null}
    >
      <div className="flex items-center gap-1.5 px-2 pt-1.5">
        <div role="tablist" aria-label="Lista petów" className="flex gap-0.5 rounded-[7px] bg-row p-0.5">
          {tab('recent', 'Ostatnie')}
          {tab('nearby', 'W pobliżu')}
        </div>
        <button
          type="button"
          aria-pressed={settings.petsHideMaxed}
          title="Ukrywa pety na maksymalnej randze"
          onClick={() => api.updateSettings({ petsHideMaxed: !settings.petsHideMaxed })}
          className={`${iconButton} ml-auto ${settings.petsHideMaxed ? 'bg-accent/20 text-accent' : ''}`}
        >
          Ukryj MAX
        </button>
        <button type="button" title="Wyszukiwarka petów: rangi, dusze i źródła" aria-label="Otwórz wyszukiwarkę petów" onClick={onFinder} className={iconButton}>
          Szukaj
        </button>
      </div>
      {pets.rows.length === 0 ? (
        <p className="m-0 px-3 py-3 text-[11px] text-ink-mute">{emptyText(pets, mode, settings.petsHideMaxed)}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-[3px] p-[5px]">
          {pets.rows.map((p) => (
            <PetLine key={p.id} pet={p} mode={mode} hasMap={mapIds?.has(p.id) ?? false} onMap={onMap} />
          ))}
        </ol>
      )}
      <div className="num flex items-center gap-2 px-2.5 pb-1.5 text-[10px] text-ink-mute">
        <span title="Dusze i awanse zaobserwowane od uruchomienia">
          Sesja: <b className="font-semibold text-good">+{pets.session.souls}</b> dusz · {pets.session.rankUps} awans.
        </span>
        <button type="button" onClick={() => api.resetPetSession()} className="ml-auto rounded-[4px] px-1.5 text-ink-dim hover:bg-line hover:text-ink" title="Zeruje licznik sesji i listę ostatnich (kolekcja zostaje)">
          Zeruj
        </button>
      </div>
    </Panel>
  );
}
