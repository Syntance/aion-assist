import { useCallback, useEffect, useState } from 'react';
import type { EncounterRecord, EncounterSummary, HistoryData, KillEntry, NameKind, RunSummary } from '@shared/types';
import { dayKey } from '@shared/day';
import { dpsSeconds } from '@shared/dps';
import { groupByOpponent, UNKNOWN_RIVAL, type FightResult, type OpponentGroup } from '@shared/opponents';
import { clock, compact, grouped, percent } from '../format';
import { ClassIcon } from './ClassIcon';
import { KdaButtons } from './KdaButtons';
import { Renamable } from './Renamable';

interface Props {
  onDetail: (name: string, source: string) => void;
}

function dateText(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function runLabel(run: RunSummary, names: HistoryData['names']): string {
  if (run.dungeonId !== null && names.dungeons[String(run.dungeonId)]) return names.dungeons[String(run.dungeonId)] ?? '';
  if (run.mapId !== null && names.maps[String(run.mapId)]) return names.maps[String(run.mapId)] ?? '';
  if (run.world) return 'World Bosses';
  if (run.dungeonId !== null) return `Instancja #${run.dungeonId}`;
  if (run.mapId !== null) return `Mapa #${run.mapId}`;
  return 'Nieznana lokacja';
}

function bossLabel(enc: { npcCode: number | null }, names: HistoryData['names']): string {
  if (enc.npcCode === null) return 'Walka';
  return names.npcs[String(enc.npcCode)] ?? `NPC #${enc.npcCode}`;
}

/** Players of one saved boss fight with their damage; clicking one opens the per-skill detail. */
export function PlayersWindow({
  id,
  onDetail,
  onClose,
  activeName,
}: {
  id: string;
  onDetail: Props['onDetail'];
  onClose: () => void;
  activeName: string | null;
}) {
  const [rec, setRec] = useState<EncounterRecord | null | undefined>(undefined);
  const [names, setNames] = useState<HistoryData['names'] | null>(null);
  useEffect(() => {
    let alive = true;
    setRec(undefined);
    void window.overlay.getEncounter(id).then((r) => alive && setRec(r));
    void window.overlay.getHistory().then((h) => {
      if (!alive) return;
      setNames(h.names);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  const rename = (kind: NameKind, key: number, name: string) => {
    window.overlay.setName(kind, String(key), name);
    setNames((n) => {
      if (!n) return n;
      const next = { ...n[kind] };
      if (name.trim()) next[String(key)] = name.trim();
      else delete next[String(key)];
      return { ...n, [kind]: next };
    });
  };
  // what the party dealt per second: the sum of its players' own DPS (each from his first to his last hit)
  const partyDps = rec ? rec.rows.reduce((sum, r) => sum + r.damage / dpsSeconds(rec.durationMs, r.joinedMs, r.lastMs), 0) : 0;
  const dict = names ?? { skills: {}, npcs: {}, maps: {}, dungeons: {} };
  const groups: { title: string | null; tone: string; rows: EncounterRecord['rows']; total: number }[] = !rec
    ? []
    : rec.kind === 'pvp'
      ? [
          { title: 'Twoja strona', tone: 'text-good', rows: rec.rows.filter((r) => r.side !== 'theirs'), total: rec.total },
          { title: 'Przeciwnicy', tone: 'text-bad', rows: rec.rows.filter((r) => r.side === 'theirs'), total: rec.theirsTotal ?? 0 },
        ]
      : [{ title: null, tone: '', rows: rec.rows, total: rec.total }];
  return (
    <section
      data-hit="players"
      aria-label="Gracze w walce"
      className="flex max-h-[78vh] w-[340px] shrink-0 flex-col overflow-hidden rounded-[10px] bg-panel shadow-[0_14px_44px_oklch(0.1_0.02_255/0.65)] ring-1 ring-line"
    >
      <header className="flex items-center gap-2 bg-panel-head px-3 py-2">
        <h2 className="m-0 flex min-w-0 flex-1 items-baseline gap-2 text-[13px] font-bold">
          {rec ? (
            rec.kind === 'pvp' ? (
              `PvP · ${dateText(rec.startedAt)}`
            ) : rec.npcCode !== null ? <Renamable text={bossLabel(rec, dict)} onSave={(n) => rename('npcs', rec.npcCode ?? 0, n)} /> : bossLabel(rec, dict)
          ) : (
            'Walka'
          )}
          {rec && <span className="num shrink-0 text-[11px] font-normal text-ink-mute">{clock(rec.durationMs)}</span>}
        </h2>
        <button type="button" aria-label="Zamknij" onClick={onClose} className="grid size-6 place-items-center rounded-[5px] text-ink-dim hover:bg-row hover:text-ink">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>
      {rec === undefined ? (
        <p className="m-0 px-3 py-3 text-[12px] text-ink-mute">Wczytuję…</p>
      ) : rec === null ? (
        <p className="m-0 px-3 py-3 text-[12px] text-ink-mute">Nie znaleziono tej walki.</p>
      ) : (
        <div className="overflow-y-auto">
          <p className="num m-0 px-3 pt-2 text-[11px] text-ink-mute">
            {rec.kind === 'pvp'
              ? `${compact(rec.total)} vs ${compact(rec.theirsTotal ?? 0)} · ${rec.rows.length} gr.`
              : `${compact(rec.total)} łącznie · ${compact(partyDps)}/s · ${rec.rows.length} gr.`}
          </p>
          {groups.map((g) => (
          <div key={g.title ?? 'all'}>
          {g.title && <h3 className={`m-0 px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.08em] ${g.tone}`}>{g.title}</h3>}
          <ol className="m-0 mt-1.5 flex list-none flex-col gap-[3px] px-2.5 pb-2">
            {g.rows.map((row) => (
              <li key={row.name}>
                <button
                  type="button"
                  onClick={() => onDetail(row.name, rec.id)}
                  aria-pressed={activeName === row.name}
                  className={`flex h-[38px] w-full items-center gap-2 rounded-[6px] px-2 text-left hover:brightness-125 ${activeName === row.name ? 'bg-accent/25 ring-1 ring-accent' : 'bg-row'}`}
                >
                  <ClassIcon className={row.className} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold">
                      {row.name}
                      {row.isSelf && <span className="ml-1.5 text-[9px] font-bold text-self">JA</span>}
                    </span>
                    <span className="num text-[10px] text-ink-mute">
                      {row.gearScore !== null ? `${row.gearScore} GS · ` : ''}
                      {row.combatPower !== null ? `${compact(row.combatPower)} CP` : ''}
                      {row.deaths > 0 ? ` · ${row.deaths} zgonów` : ''}
                    </span>
                  </span>
                  <span className="num flex flex-col items-end">
                    <span className="text-[14px] font-bold">{compact(row.damage / dpsSeconds(rec.durationMs, row.joinedMs, row.lastMs))}/s</span>
                    <span className="text-[10px] text-ink-dim">
                      {percent(g.total > 0 ? row.damage / g.total : 0)} · {compact(row.damage)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** 139_000 -> "2m 19s", 93_000 -> "1m 33s", 45_000 -> "45s". */
function spanText(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined }}>
    <path d="M6 3l5 5-5 5" />
  </svg>
);

const PersonIcon = () => (
  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="5" r="2.5" />
    <path d="M3 13.5c.6-2.6 2.5-4 5-4s4.4 1.4 5 4" />
  </svg>
);

/** Two-step delete: the first click arms it ("Usuń?"), the second one deletes. Disarms itself after 3 s. */
function TrashButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      aria-label={armed ? `Potwierdź usunięcie: ${label}` : `Usuń: ${label}`}
      title={armed ? 'Kliknij ponownie, aby usunąć (nie da się cofnąć)' : 'Usuń z historii'}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={`grid h-6 shrink-0 place-items-center rounded-[5px] text-[10px] font-bold transition-colors duration-150 ${
        armed ? 'bg-bad/25 px-1.5 text-bad ring-1 ring-bad/60' : 'w-6 text-ink-mute hover:bg-panel-head hover:text-bad'
      }`}
    >
      {armed ? (
        'Usuń?'
      ) : (
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" />
        </svg>
      )}
    </button>
  );
}

function RunBlock({
  run,
  names,
  rename,
  onOpen,
  onDelete,
  selectedId,
  defaultOpen,
}: {
  run: RunSummary;
  names: HistoryData['names'];
  rename: (kind: NameKind, key: number, name: string) => void;
  onOpen: (enc: EncounterSummary) => void;
  onDelete: (kind: 'run' | 'encounter' | 'pvpday', id: string) => void;
  selectedId: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const kind: NameKind = run.dungeonId !== null ? 'dungeons' : 'maps';
  const key = run.dungeonId ?? run.mapId;
  const tagTone = run.world ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-warm/15 text-warm ring-warm/40';
  const selectedHere = run.encounters.some((e) => e.id === selectedId);
  return (
    <li className={`rounded-[10px] bg-row ring-1 ${selectedHere ? 'ring-ink/80' : 'ring-line/70'}`}>
      <div className="flex items-start gap-2 px-2.5 py-2">
        <button type="button" aria-expanded={open} aria-label={open ? 'Zwiń walki' : 'Rozwiń walki'} onClick={() => setOpen(!open)} className="mt-0.5 grid size-5 place-items-center text-ink-dim hover:text-ink">
          <Chevron open={open} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-accent">
            {key !== null ? <Renamable text={runLabel(run, names)} onSave={(n) => rename(kind, key, n)} /> : runLabel(run, names)}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-mute">
            <span>{dateText(run.startedAt)}</span>
            {run.tag && <span className={`rounded-[4px] px-1.5 py-px text-[10px] font-semibold ring-1 ${tagTone}`}>{run.tag}</span>}
          </div>
        </div>
        <div className="num flex shrink-0 items-center gap-3 pt-0.5 text-[12px]">
          <span className="text-ink-dim">{spanText(run.durationMs)}</span>
          <span className="w-[58px] text-right font-semibold">{compact(run.total)}</span>
          <span className="flex w-8 items-center gap-0.5 text-ink-dim">
            {run.players}
            <PersonIcon />
          </span>
          <TrashButton label={runLabel(run, names)} onConfirm={() => onDelete('run', run.id)} />
        </div>
      </div>
      {open && (
        <ul className="m-0 mb-1.5 ml-[18px] flex list-none flex-col gap-0.5 border-l border-line/60 p-0 pl-2">
          {run.encounters.map((enc) => (
            <li key={enc.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpen(enc)}
                aria-pressed={selectedId === enc.id}
                className={`num flex min-w-0 flex-1 items-center gap-3 rounded-[7px] px-2.5 py-1.5 text-left text-[12px] hover:bg-panel-head/70 ${selectedId === enc.id ? 'bg-accent/20 ring-1 ring-accent/60' : ''}`}
              >
                <span className="size-1.5 shrink-0 rounded-full bg-ink-mute" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {bossLabel(enc, names)} <span className="text-bad" title="Boss">♦</span>
                </span>
                <span className="text-ink-dim">{spanText(enc.durationMs)}</span>
                <span className="w-[58px] text-right font-semibold">{compact(enc.total)}</span>
              </button>
              <TrashButton label={bossLabel(enc, names)} onConfirm={() => onDelete('encounter', enc.id)} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** "Dzisiaj · poniedziałek, 16 listopada", "Wczoraj · …", or just the date. */
function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const text = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  if (key === dayKey(Date.now())) return `Dzisiaj · ${text}`;
  if (key === dayKey(Date.now() - 86_400_000)) return `Wczoraj · ${text}`;
  return text;
}

function PvpFightRow({
  f,
  result,
  others = 0,
  selectedId,
  onSelect,
  onRemove,
}: {
  f: EncounterSummary;
  result?: FightResult;
  /** Other players in the same fight (0 for a duel). */
  others?: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (kind: 'encounter' | 'pvpday', id: string) => void;
}) {
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onSelect(f.id)}
        aria-pressed={selectedId === f.id}
        className={`num flex min-w-0 flex-1 flex-col gap-0.5 rounded-[8px] px-2.5 py-1.5 text-left hover:brightness-125 ${selectedId === f.id ? 'bg-accent/20 ring-1 ring-accent/60' : 'bg-panel-head/60'}`}
      >
        <span className="flex items-baseline gap-3 text-[12px]">
          <span className={`w-[14px] text-[12px] font-bold ${result === 'win' ? 'text-good' : result === 'loss' ? 'text-bad' : 'text-ink-mute'}`} title={result === 'win' ? 'Wygrana' : result === 'loss' ? 'Przegrana' : 'Wynik nieznany'}>
            {result === 'win' ? '✓' : result === 'loss' ? '✗' : '–'}
          </span>
          <span className="text-ink-mute">{new Date(f.startedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="text-ink-mute">{clock(f.durationMs)}</span>
          {others > 0 && (
            <span className="text-[10px] text-ink-mute" title="Walka grupowa: obrażenia dotyczą całej walki, nie tylko tego gracza">
              +{others} {others === 1 ? 'inny' : 'innych'}
            </span>
          )}
          <span className="ml-auto font-semibold">
            <span className="text-good">{compact(f.total)}</span>
            <span className="text-ink-mute"> vs </span>
            <span className="text-bad">{compact(f.theirsTotal ?? 0)}</span>
          </span>
        </span>
      </button>
      <TrashButton label={`PvP ${dateText(f.startedAt)}`} onConfirm={() => onRemove('encounter', f.id)} />
    </li>
  );
}

/** One opponent inside a day: summary line (fights, W:L, damage) that expands to every single fight against them. */
function OpponentBlock({
  group,
  rivals,
  dayKeyText,
  selectedId,
  onSelect,
  onRemove,
  onChanged,
}: {
  group: OpponentGroup;
  rivals: HistoryData['rivals'];
  dayKeyText: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (kind: 'encounter' | 'pvpday', id: string) => void;
  onChanged: () => void;
}) {
  const [isOpen, setOpen] = useState(false);
  const label = group.label ?? 'Przeciwnicy nieznani';
  const rivalName = group.label ?? UNKNOWN_RIVAL;
  const rival = rivals[rivalName];
  const life = { k: rival?.wins ?? 0, d: rival?.losses ?? 0, a: rival?.assists ?? 0, seen: rival !== undefined };
  return (
    <li className="rounded-[9px] bg-panel-head/40 p-1 ring-1 ring-line/60">
      <div className="flex items-center gap-1">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Zwiń' : 'Rozwiń'} walki z ${label} (${dayKeyText})`}
        onClick={() => setOpen(!isOpen)}
        className="num flex min-w-0 flex-1 items-center gap-2 rounded-[7px] px-2 py-1 text-left text-[12px] hover:brightness-125"
      >
        <span className="grid size-4 place-items-center text-ink-dim">
          <Chevron open={isOpen} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{label}</span>
          <span className="block text-[11px] font-normal" title="Obrażenia zadane vs otrzymane w tych walkach">
            <span className="text-good">{compact(group.dealt)}</span>
            <span className="text-ink-mute"> vs </span>
            <span className="text-bad">{compact(group.taken)}</span>
          </span>
        </span>
        <span className="text-ink-mute" title="Liczba walk z tym graczem">{group.fights.length}×</span>
        <span className="text-[13px] font-bold" title="Łącznie z tym graczem, ze wszystkich dni (nie zeruje się)">
          <span className="text-good">{life.k}</span> K <span className="text-bad">{life.d}</span> D <span className="text-ink">{life.a}</span> A
        </span>
      </button>
        <KdaButtons name={rivalName} onChanged={onChanged} />
      </div>
      {isOpen && (
        <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
          {group.fights.map((r) => (
            <PvpFightRow key={r.fight.id} f={r.fight} result={r.result} others={r.opponents - 1} selectedId={selectedId} onSelect={onSelect} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Player fights grouped by day: each day shows its K/D/A (saved across restarts) and totals; today starts open. */
function PvpDays({
  data,
  selectedId,
  onSelect,
  onRemove,
  onChanged,
}: {
  data: HistoryData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (kind: 'encounter' | 'pvpday', id: string) => void;
  onChanged: () => void;
}) {
  const today = dayKey(Date.now());
  const [open, setOpen] = useState<Record<string, boolean>>({ [today]: true });
  const byDay = new Map<string, EncounterSummary[]>();
  for (const f of data.pvp) {
    const key = dayKey(f.startedAt);
    const list = byDay.get(key);
    if (list) list.push(f);
    else byDay.set(key, [f]);
  }
  const killsByDay = new Map<string, KillEntry[]>();
  for (const k of data.kills) {
    const key = dayKey(k.at);
    const list = killsByDay.get(key);
    if (list) list.push(k);
    else killsByDay.set(key, [k]);
  }
  const days = new Set([...byDay.keys(), ...killsByDay.keys()]);
  for (const [key, d] of Object.entries(data.daily)) if (d.kills + d.deaths + d.assists > 0) days.add(key);
  const ordered = [...days].sort().reverse();
  if (ordered.length === 0) {
    return <p className="m-0 px-3 py-4 text-[12px] text-ink-mute">Brak zapisanych walk PvP. Każde starcie z graczami zapisuje się tu samo, a K/D/A zbiera się osobno dla każdego dnia.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-2.5">
      {ordered.map((key) => {
        const fights = byDay.get(key) ?? [];
        const hasDetails = fights.length > 0;
        const stats = data.daily[key] ?? { kills: 0, deaths: 0, assists: 0, ap: null };
        const dealt = fights.reduce((n, f) => n + f.total, 0);
        const taken = fights.reduce((n, f) => n + (f.theirsTotal ?? 0), 0);
        const isOpen = open[key] ?? false;
        const groups = groupByOpponent(fights, data.kills);
        return (
          <li key={key} className="rounded-[10px] bg-row ring-1 ring-line/70">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={isOpen ? `Zwiń ${dayLabel(key)}` : `Rozwiń ${dayLabel(key)}`}
                disabled={!hasDetails}
                onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
              >
                <span className={`grid size-5 place-items-center text-ink-dim ${hasDetails ? '' : 'opacity-30'}`}>
                  <Chevron open={isOpen} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold capitalize text-accent">{dayLabel(key)}</span>
                  <span className="num block text-[11px] text-ink-mute">
                    {fights.length} walk{groups.length > 0 ? ` · ${groups.length} ${groups.length === 1 ? 'przeciwnik' : 'przeciwników'}` : ''}{stats.ap !== null ? ` · AP ${stats.ap >= 0 ? '+' : '−'}${grouped(Math.abs(stats.ap))}` : ''}
                    {fights.length > 0 && (
                      <>
                        {' · '}
                        <span className="text-good">{compact(dealt)}</span> vs <span className="text-bad">{compact(taken)}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="num shrink-0 text-[13px] font-bold" title="Zabójstwa / zgony / asysty tego dnia (z rekordów zabójstw)">
                  <span className="text-good">{stats.kills}</span> K <span className="text-bad">{stats.deaths}</span> D <span className="text-ink">{stats.assists}</span> A
                </span>
              </button>
              {fights.length > 0 && <TrashButton label={`wszystkie walki PvP: ${dayLabel(key)}`} onConfirm={() => onRemove('pvpday', key)} />}
            </div>
            {isOpen && groups.length > 0 && (
              <ul className="m-0 mb-1.5 flex list-none flex-col gap-1 px-2 pb-1">
                {groups.map((g) => (
                  <OpponentBlock key={g.key} group={g} rivals={data.rivals} dayKeyText={key} selectedId={selectedId} onSelect={onSelect} onRemove={onRemove} onChanged={onChanged} />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Saved dungeon runs and the bosses fought in them (like the Encounters list in Abyss Logs). */
export function HistoryWindow({
  tab,
  onTab,
  onClose,
  selectedId,
  onSelect,
  onDeselect,
}: {
  tab: 'boss' | 'pvp';
  onTab: (tab: 'boss' | 'pvp') => void;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeselect: () => void;
}) {
  const [data, setData] = useState<HistoryData | null>(null);
  const reload = useCallback(() => {
    void window.overlay.getHistory().then(setData);
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [reload]);

  const remove = (kind: 'run' | 'encounter' | 'pvpday', id: string) => {
    window.overlay.deleteHistory(kind, id);
    // drop it from the view at once; the main process saves it and the next refresh confirms
    setData((d) => {
      if (!d) return d;
      return {
        ...d,
        runs:
          kind === 'run'
            ? d.runs.filter((r) => r.id !== id)
            : kind === 'encounter'
              ? d.runs.map((r) => ({ ...r, encounters: r.encounters.filter((e) => e.id !== id) })).filter((r) => r.encounters.length > 0)
              : d.runs,
        pvp: kind === 'encounter' ? d.pvp.filter((e) => e.id !== id) : kind === 'pvpday' ? d.pvp.filter((e) => dayKey(e.startedAt) !== id) : d.pvp,
      };
    });
    if (selectedId === id || (kind === 'pvpday' && selectedId !== null && data?.pvp.some((e) => e.id === selectedId && dayKey(e.startedAt) === id))) onDeselect();
  };

  const rename = (kind: NameKind, key: number, name: string) => {
    window.overlay.setName(kind, String(key), name);
    setData((d) => {
      if (!d) return d;
      const next = { ...d.names[kind] };
      if (name.trim()) next[String(key)] = name.trim();
      else delete next[String(key)];
      return { ...d, names: { ...d.names, [kind]: next } };
    });
  };

  return (
    <section
      data-hit="history"
      aria-label="Historia dungeonów"
      className="flex max-h-[78vh] w-[520px] shrink-0 flex-col overflow-hidden rounded-[10px] bg-panel shadow-[0_14px_44px_oklch(0.1_0.02_255/0.65)] ring-1 ring-line"
    >
      <header className="flex items-center gap-2 bg-panel-head px-3 py-2">
        <h2 className="m-0 text-[14px] font-bold">Historia</h2>
        <div role="tablist" aria-label="Rodzaj historii" className="ml-2 flex gap-0.5 rounded-[7px] bg-row p-0.5">
          {(['boss', 'pvp'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTab(id)}
              className={`rounded-[5px] px-2.5 py-0.5 text-[11px] font-semibold ${tab === id ? 'bg-accent/25 text-accent' : 'text-ink-dim hover:text-ink'}`}
            >
              {id === 'boss' ? 'Bossy' : 'PvP'}
              <span className="num ml-1 text-[10px] font-normal text-ink-mute">{data ? (id === 'boss' ? data.runs.length : data.pvp.length) : ''}</span>
            </button>
          ))}
        </div>
        <button type="button" aria-label="Zamknij" onClick={onClose} className="ml-auto grid size-6 place-items-center rounded-[5px] text-ink-dim hover:bg-row hover:text-ink">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>
      <div className="overflow-y-auto">
        {!data ? (
          <p className="m-0 px-3 py-3 text-[12px] text-ink-mute">Wczytuję…</p>
        ) : tab === 'pvp' ? (
          <PvpDays data={data} selectedId={selectedId} onSelect={onSelect} onRemove={remove} onChanged={reload} />
        ) : data.runs.length === 0 ? (
          <p className="m-0 px-3 py-4 text-[12px] text-ink-mute">
            Brak zapisanych walk z bossami. Zapisują się same (zwykłe moby są pomijane); nazwy map, instancji i bossów nadasz ikoną ołówka.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-2.5">
            {data.runs.map((run, i) => (
              <RunBlock key={run.id} run={run} names={data.names} rename={rename} onOpen={(enc) => onSelect(enc.id)} onDelete={remove} selectedId={selectedId} defaultOpen={i === 0} />
            ))}
          </ul>
        )}
      </div>
      {data && (tab === 'boss' ? data.runs.length : data.pvp.length) > 0 && (
        <p className="num m-0 border-t border-line px-3 py-1.5 text-[10px] text-ink-mute">
          Wszystkie dane zostają na tym komputerze · łącznie {grouped(tab === 'boss' ? data.runs.reduce((n, r) => n + r.encounters.length, 0) : data.pvp.length)} walk
        </p>
      )}
    </section>
  );
}
