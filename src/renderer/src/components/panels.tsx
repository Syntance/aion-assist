import { UNKNOWN_SOURCE } from '@shared/opponents';
import { KdaButtons } from './KdaButtons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { OverlaySnapshot, PlayerCard, RivalRecord } from '@shared/types';
import { clock, compact, grouped, percent, signed } from '../format';
import { ClassIcon } from './ClassIcon';
import { Panel } from './Panel';
import { Renamable } from './Renamable';
import { GearLine, PlayerRow } from './PlayerRow';

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="m-0 px-3 py-3 text-[11px] text-ink-mute">{children}</p>
);

const Dot = ({ on }: { on: boolean }) => (
  <span className={`size-1.5 rounded-full ${on ? 'bg-good' : 'bg-ink-mute'}`} aria-hidden="true" />
);

const CAPTURE_TEXT: Record<OverlaySnapshot['capture']['state'], string> = {
  starting: 'Uruchamianie nasłuchu…',
  searching: 'Szukam połączenia z grą…',
  locked: 'Połączono z grą',
  error: 'Błąd nasłuchu',
  demo: 'Tryb demo',
};

// --- DPS meter ----------------------------------------------------------------------


function ttkText(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 90) return `${Math.max(1, Math.round(sec))} s`;
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

/** The boss bar: name, HP (current / max, %), party DPS and predicted time to kill, plus the stagger gauge. */
function FocusStrip({ focus }: { focus: NonNullable<OverlaySnapshot['meter']['focus']> }) {
  const pct = focus.hpPct;
  const label = focus.name ?? (focus.code !== null ? `NPC #${focus.code}` : 'Cel');
  return (
    <div className="mx-[6px] mt-[6px] rounded-[9px] bg-row px-3 py-2 ring-1 ring-line/60" aria-label="Boss">
      <div className="flex items-center gap-2 text-[12px]">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-bad" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          <path d="M5.2 6.6h.01M10.8 6.6h.01M5.5 10.2c1.4 1 3.6 1 5 0" />
        </svg>
        {focus.code !== null ? (
          <Renamable
            className="min-w-0 text-[13px] font-bold text-bad"
            text={label}
            onSave={(name) => window.overlay.setName('npcs', String(focus.code), name)}
          />
        ) : (
          <span className="truncate text-[13px] font-bold text-bad">{label}</span>
        )}
        <span className="num ml-auto shrink-0 text-ink-dim">
          {focus.hpCur !== null ? compact(focus.hpCur) : '—'}
          {focus.hpMax !== null && <span className="text-ink-mute"> / {compact(focus.hpMax)}</span>}
          {pct !== null && <b className="ml-2 font-bold text-bad">{Math.round(pct * 100)}%</b>}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel-head"
        role="progressbar"
        aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="HP bossa"
      >
        <span
          className="bar-fill block h-full w-full rounded-full"
          style={{ transform: `scaleX(${pct ?? 0})`, transformOrigin: 'left', background: 'linear-gradient(90deg, oklch(0.62 0.2 18), oklch(0.74 0.17 12))' }}
        />
      </div>
      <div className="mt-1 flex items-baseline gap-2 text-[11px] text-ink-mute">
        <span>
          Party DPS <b className="num font-semibold text-ink-dim">{compact(focus.partyDps)}</b>
        </span>
        <span className="num ml-auto" title="Przewidywany czas do zabicia przy obecnym DPS drużyny">
          TTK <b className="font-semibold text-ink-dim">{ttkText(focus.ttkSec)}</b>
        </span>
      </div>
      {focus.stagger && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ink-mute">
          <span>Stagger</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-panel-head">
            <span
              className={`bar-fill block h-full w-full ${focus.stagger.broken ? 'bg-accent' : 'bg-cls-spiritmaster'}`}
              style={{ transform: `scaleX(${focus.stagger.broken ? 1 : focus.stagger.pct})`, transformOrigin: 'left' }}
            />
          </div>
          {focus.stagger.broken && <span className="font-bold text-accent">ZŁAMANY</span>}
        </div>
      )}
    </div>
  );
}

/** Expedition lobby / party list inside the DPS window: leader, ready state, GS and CP. */
function LobbySection({ lobby }: { lobby: NonNullable<OverlaySnapshot['lobby']> }) {
  return (
    <section className="mx-[5px] mt-[5px]" aria-label="Lobby">
      <h3 className="m-0 flex items-baseline gap-2 px-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-mute">
        <span className="truncate">Lobby{lobby.title ? ` · ${lobby.title}` : ''}</span>
        <span className="num ml-auto shrink-0 normal-case tracking-normal">{lobby.readyCount}/{lobby.members.length} gotowych</span>
      </h3>
      <ol className="m-0 flex list-none flex-col gap-[3px] p-0">
        {lobby.members.map((m) => (
          <PlayerRow
            key={m.card.name}
            card={m.card}
            isSelf={m.isSelf}
            fill={0}
            primary={m.leader ? 'Lider' : m.ready ? 'Gotowy' : 'Niegotowy'}
            secondary={m.card.level ? `poz. ${m.card.level}` : ''}
            tone={m.leader ? 'leader' : m.ready ? 'ready' : 'waiting'}
          />
        ))}
      </ol>
    </section>
  );
}

const SkullIcon = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 1.8c-3 0-5 2-5 4.7 0 1.6.8 2.7 1.8 3.4V12h6.4V9.9c1-.7 1.8-1.8 1.8-3.4 0-2.7-2-4.7-5-4.7Z" />
    <path d="M6.2 12v2M9.8 12v2M8 12v2" />
    <circle cx="5.9" cy="7" r="0.9" fill="currentColor" />
    <circle cx="10.1" cy="7" r="0.9" fill="currentColor" />
  </svg>
);

/** Ping to the game server, coloured by quality (green < 60 ms, amber < 120 ms, red above). */
function PingBadge({ ping }: { ping: OverlaySnapshot['ping'] }) {
  const ms = ping.ms;
  const tone = ms === null ? 'text-ink-mute' : ms < 60 ? 'text-good' : ms < 150 ? 'text-warm' : 'text-bad';
  const part = (v: number | null): string => (v === null ? '—' : `${v} ms`);
  return (
    <span
      className={`flex items-center gap-1 ${tone}`}
      title={`Realne opóźnienie w grze = sieć + opóźnienie serwera. Sieć do serwera (TCP): ${part(ping.net)}. Opóźnienie strumienia serwera: ${part(ping.late)} (najgorszy sygnał z 10 s: ${part(ping.peak)}). Pomiar bierny, nic nie jest wysyłane.`}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M2 13V10M6 13V7M10 13V4M14 13V2" />
      </svg>
      <span className="num">{ms === null ? '— ms' : `${ms} ms`}</span>
    </span>
  );
}

/** The game's FPS (from Windows event tracing of its frames), beside the ping. */
function FpsBadge({ fps }: { fps: OverlaySnapshot['fps'] }) {
  const v = fps.value;
  const tone = v === null ? 'text-ink-mute' : v >= 60 ? 'text-good' : v >= 30 ? 'text-warm' : 'text-bad';
  const note =
    fps.state === 'denied'
      ? 'Brak uprawnień do śledzenia klatek: dodaj swoje konto do grupy „Użytkownicy dzienników wydajności" (Performance Log Users) albo uruchom aplikację jako administrator. Szczegóły w Ustawieniach.'
      : fps.state === 'error'
        ? 'Nie udało się uruchomić śledzenia klatek gry.'
        : 'FPS gry: klatki, które gra faktycznie wyświetla (z zdarzeń Windows, bez ingerencji w grę).';
  return (
    <span className={`flex items-center gap-1 ${tone}`} title={note}>
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M2.5 11.5a5.5 5.5 0 1 1 11 0M8 11.5l2.6-3.6" />
      </svg>
      <span className="num">{v === null ? '— fps' : `${v} fps`}</span>
    </span>
  );
}

type MeterMode = 'boss' | 'pvp' | 'lobby';

/**
 * Bosses / PvP / Lobby switch. The view follows the action by itself (a player fight starts: PvP;
 * a boss fight starts: bosses; a party lobby appears between fights: lobby); a click overrides it.
 */
function ModeSwitch({
  mode,
  onChange,
  kda,
  lobbyTab,
}: {
  mode: MeterMode;
  onChange: (m: MeterMode) => void;
  kda: OverlaySnapshot['pvp'];
  lobbyTab: boolean;
}) {
  const tab = (id: MeterMode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === id}
      onClick={() => onChange(id)}
      className={`rounded-[5px] px-2.5 py-0.5 text-[11px] font-semibold transition-[background-color,color] duration-150 ${
        mode === id ? 'bg-accent/25 text-accent' : 'text-ink-dim hover:bg-row hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1 px-[7px] pt-[5px]">
      <div role="tablist" aria-label="Tryb licznika" className="flex gap-0.5 rounded-[7px] bg-panel-head p-0.5">
        {tab('boss', 'Bossy')}
        {tab('pvp', 'PvP')}
        {lobbyTab && tab('lobby', 'Lobby')}
      </div>
      {mode === 'pvp' && (
        <span className="num ml-auto text-[11px] font-semibold" title="Zabójstwa / zgony / asysty z kill recordu">
          <span className="text-good">{kda.kills}</span> K <span className="text-bad">{kda.deaths}</span> D <span className="text-ink">{kda.assists}</span> A
        </span>
      )}
    </div>
  );
}

export function MeterPanel({ snap, onDetail }: { snap: OverlaySnapshot; onDetail: (name: string, source: string) => void }) {
  const { meter, capture, daily, self, pvp } = snap;
  const top = meter.rows[0]?.damage ?? 0;
  const lobbyTab = snap.settings.showLobby;
  const lobby = snap.lobby && snap.lobby.members.length > 1 ? snap.lobby : null;
  const [mode, setMode] = useState<MeterMode>('boss');
  const prev = useRef({ pvp: false, boss: false, lobby: false });
  useEffect(() => {
    const lobbyNow = lobbyTab && lobby !== null;
    if (pvp.active && !prev.current.pvp) setMode('pvp');
    else if (meter.active && !prev.current.boss && !pvp.active) setMode('boss');
    else if (lobbyNow && !prev.current.lobby && !meter.active && !pvp.active) setMode('lobby');
    prev.current = { pvp: pvp.active, boss: meter.active, lobby: lobbyNow };
  }, [pvp.active, meter.active, lobbyTab, lobby]);
  // Switched the lobby tab off while it was open
  const shownMode: MeterMode = mode === 'lobby' && !lobbyTab ? 'boss' : mode;
  return (
    <Panel
      id="meter"
      title={shownMode === 'pvp' ? 'PvP Combat' : shownMode === 'lobby' ? 'Lobby' : meter.active ? 'Boss Combat' : 'DPS'}
      layout={snap.settings.panels.meter}
      editMode={snap.editMode || snap.altMode}
      lead={shownMode === 'lobby' ? undefined : <Dot on={shownMode === 'pvp' ? pvp.active : meter.active} />}
      sub={
        shownMode === 'lobby' ? undefined : (
          <span className="num text-[12px] font-semibold text-accent">{clock(shownMode === 'pvp' ? pvp.durationMs : meter.durationMs)}</span>
        )
      }
      aside={
        shownMode === 'pvp' ? (
          <span className="num text-ink-mute">{compact(pvp.mineTotal)}</span>
        ) : shownMode === 'lobby' ? (
          lobby && (
            <span className="num" title="Gotowi gracze">
              {lobby.readyCount}/{lobby.members.length} gotowych
            </span>
          )
        ) : (
          <>
            <span className="num text-ink-mute">{compact(meter.total)}</span>
            <span
              className={`num flex items-center gap-0.5 ${meter.deaths > 0 ? 'text-bad' : 'text-ink-mute'}`}
              title="Śmierci drużyny w tym dungeonie (liczone od wejścia, przez wszystkich bossów)"
              aria-label={`Śmierci drużyny w dungeonie: ${meter.deaths}`}
            >
              <SkullIcon />
              {meter.deaths}
            </span>
          </>
        )
      }
    >
      <ModeSwitch mode={shownMode} onChange={setMode} kda={pvp} lobbyTab={lobbyTab} />
      {shownMode === 'pvp' ? (
        <PvpBody snap={snap} onDetail={onDetail} />
      ) : shownMode === 'lobby' ? (
        lobby ? <LobbySection lobby={lobby} /> : <Empty>Brak lobby ani drużyny. Pojawi się po dołączeniu do drużyny lub poczekalni ekspedycji.</Empty>
      ) : (
        <>
          {meter.focus && <FocusStrip focus={meter.focus} />}
          {meter.rows.length === 0 ? (
            <Empty>
              {capture.state !== 'locked' && capture.state !== 'demo'
                ? (capture.detail ?? CAPTURE_TEXT[capture.state])
                : self === null
                  ? 'Nie rozpoznaję jeszcze twojej postaci. Zmień strefę (teleport, wejście do instancji) albo wyloguj się do wyboru postaci.'
                  : 'Czekam na walkę…'}
            </Empty>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-[3px] p-[5px]">
              {meter.rows.map((row) => (
                <PlayerRow
                  key={row.card.name}
                  card={row.card}
                  isSelf={row.isSelf}
                  fill={top > 0 ? row.damage / top : 0}
                  onSelect={() => onDetail(row.card.name, 'live')}
                  primary={compact(row.dps)}
                  secondary={
                    <>
                      {percent(row.share)} · {compact(row.damage)}
                      {row.deaths > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-bad" title={`Śmierci w tym dungeonie: ${row.deaths}`}>
                          <SkullIcon />
                          {row.deaths}
                        </span>
                      )}
                    </>
                  }
                />
              ))}
            </ol>
          )}
        </>
      )}
      <footer className="num flex items-center gap-3 border-t border-line bg-panel-head px-2.5 py-1.5 text-[11px] text-ink-dim">
        <span className="truncate font-semibold text-self">{self?.name ?? '—'}</span>
        <span title="Abyss Points zdobyte dzisiaj">AP {signed(daily.apGained)}</span>
        {snap.settings.showPing && <PingBadge ping={snap.ping} />}
        {snap.settings.showFps && <FpsBadge fps={snap.fps} />}
        <span className="ml-auto flex min-w-0 items-center gap-1.5" title={capture.detail ?? undefined}>
          <Dot on={capture.state === 'locked' || capture.state === 'demo'} />
          <span className="truncate">{capture.detail ?? CAPTURE_TEXT[capture.state]}</span>
        </span>
      </footer>
    </Panel>
  );
}

// --- PvP ----------------------------------------------------------------------------

function RecordBadge({ record }: { record: RivalRecord | null }) {
  if (!record || record.wins + record.losses === 0) return null;
  return (
    <span className="num rounded-[3px] bg-panel-head/80 px-1 text-[10px] font-semibold" title="Twój bilans z tym graczem (wygrane–przegrane)">
      <span className="text-good">{record.wins}</span>
      <span className="text-ink-mute">–</span>
      <span className="text-bad">{record.losses}</span>
    </span>
  );
}

/** PvP view inside the DPS window: both sides of the current player fight. */
function PvpBody({ snap, onDetail }: { snap: OverlaySnapshot; onDetail: (name: string, source: string) => void }) {
  const { pvp } = snap;
  const sum = pvp.mineTotal + pvp.theirsTotal;
  const mineShare = sum > 0 ? pvp.mineTotal / sum : 0.5;
  const seconds = Math.max(1, pvp.durationMs / 1000);
  const sideHead = 'px-2.5 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em]';
  return (
    <>
      {pvp.mine.length + pvp.theirs.length === 0 ? (
        <Empty>Brak starć z graczami w tej sesji.</Empty>
      ) : (
        <>
          <h3 className={`${sideHead} m-0 text-good`}>Twoja strona</h3>
          <ol className="m-0 flex list-none flex-col gap-[3px] p-[5px]">
            {pvp.mine.map((row) => (
              <PlayerRow key={row.card.name} card={row.card} isSelf={row.isSelf} fill={row.share} onSelect={() => onDetail(row.card.name, 'livepvp')} primary={compact(row.damage)} secondary={<>{compact(row.dps)}/s · {percent(row.share)}</>} />
            ))}
          </ol>
          <h3 className={`${sideHead} m-0 text-bad`}>Przeciwnicy</h3>
          <ol className="m-0 flex list-none flex-col gap-[3px] p-[5px]">
            {pvp.theirs.map((row) => (
              <PlayerRow
                key={row.card.name}
                card={row.card}
                isSelf={false}
                fill={row.share}
                onSelect={() => onDetail(row.card.name, 'livepvp')}
                primary={compact(row.damage)}
                secondary={<>{compact(row.dps)}/s · {percent(row.share)}</>}
                badge={<RecordBadge record={row.record} />}
                actions={row.card.name === UNKNOWN_SOURCE ? undefined : <KdaButtons name={row.card.name} />}
              />
            ))}
          </ol>
          <div className="mx-[5px] flex h-1 overflow-hidden rounded-full bg-bad" aria-hidden="true">
            <span className="bar-fill block h-full w-full bg-good" style={{ transform: `scaleX(${mineShare})` }} />
          </div>
          <dl className="num m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-[11px]">
            <dt className="text-good">Twoja strona</dt>
            <dd className="m-0 text-right text-ink-dim">{grouped(pvp.mineTotal)} · {compact(pvp.mineTotal / seconds)}/s</dd>
            <dt className="text-bad">Przeciwnicy</dt>
            <dd className="m-0 text-right text-ink-dim">{grouped(pvp.theirsTotal)} · {compact(pvp.theirsTotal / seconds)}/s</dd>
          </dl>
        </>
      )}
    </>
  );
}

// --- target -------------------------------------------------------------------------

const FACTION_TEXT = { elyos: 'Elyos', asmodian: 'Asmodian' } as const;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col rounded-[6px] bg-row px-2 py-1">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.08em] text-ink-mute">{label}</dt>
      <dd className="num m-0 text-[14px] font-bold text-ink">{value}</dd>
      {sub && <dd className="num m-0 text-[10px] text-ink-mute">{sub}</dd>}
    </div>
  );
}

const CLASS_LABEL: Record<string, string> = {
  gladiator: 'Gladiator',
  templar: 'Templar',
  ranger: 'Ranger',
  assassin: 'Assassin',
  spiritmaster: 'Spiritmaster',
  sorcerer: 'Sorcerer',
  cleric: 'Cleric',
  chanter: 'Chanter',
};

/** Abyss ranking of a player, from the official character page: place and ranking points, or why there is none. */
function abyssRankTile(card: PlayerCard): { value: string; sub?: string } {
  if (card.abyssRank !== null) {
    return { value: `#${grouped(card.abyssRank)}`, ...(card.abyssPoints !== null ? { sub: `${grouped(card.abyssPoints)} pkt rankingowych` } : {}) };
  }
  if (card.lookup === 'loading') return { value: '…' };
  if (card.lookup === 'off') return { value: '—', sub: 'profile wyłączone' };
  if (card.lookup === 'notfound' || card.lookup === 'error') return { value: '—', sub: 'brak profilu' };
  return { value: 'poza rankingiem', sub: 'oficjalna strona nie podaje miejsca' };
}

function lookupNote(card: PlayerCard): string | null {
  switch (card.lookup) {
    case 'loading':
      return 'Pobieram profil z oficjalnej strony…';
    case 'notfound':
      return 'Nie znaleziono profilu postaci.';
    case 'error':
      return 'Nie udało się pobrać profilu.';
    case 'off':
      return 'Pobieranie profili jest wyłączone.';
    default:
      return null;
  }
}

export function TargetPanel({ snap }: { snap: OverlaySnapshot }) {
  const { target } = snap;
  return (
    <Panel id="target" title="Cel" layout={snap.settings.panels.target} editMode={snap.editMode || snap.altMode} aside={target && <span>{target.source === 'attacked' ? 'atakujesz' : 'atakuje cię'}</span>}>
      {!target ? (
        <Empty>Pojawi się gracz, z którym wymienisz obrażenia.</Empty>
      ) : (
        <div className="flex flex-col gap-1.5 p-2">
          <div className="flex items-center gap-2">
            <ClassIcon className={target.card.className} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-bold">{target.card.name}</span>
              <span className="truncate text-[10px] text-ink-mute">
                {[
                  target.card.className && CLASS_LABEL[target.card.className],
                  target.card.faction && FACTION_TEXT[target.card.faction],
                  target.card.level && `poz. ${target.card.level}`,
                  target.card.legion,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </span>
            </div>
            <span className="ml-auto flex flex-col items-end gap-1">
              <GearLine card={target.card} />
              <KdaButtons name={target.card.name} />
            </span>
          </div>
          <dl className="m-0 grid grid-cols-3 gap-1">
            <Stat label={target.card.gearScore !== null ? 'Gear score' : 'Item level'} value={grouped(target.card.gearScore ?? target.card.itemLevel)} />
            <Stat label="Combat power" value={compact(target.card.combatPower)} />
            <Stat label="Ranga Abyss" {...abyssRankTile(target.card)} />
          </dl>
          {target.record && (
            <dl className="num m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px] text-ink-dim">
              <dt>Bilans (W–P)</dt>
              <dd className="m-0 text-right font-semibold">
                <span className="text-good">{target.record.wins}</span>–<span className="text-bad">{target.record.losses}</span>
                <span className="font-normal text-ink-mute"> · {target.record.encounters} spotk.</span>
              </dd>
              <dt>Zadane / otrzymane</dt>
              <dd className="m-0 text-right">
                {compact(target.record.dealt)} / {compact(target.record.taken)}
              </dd>
            </dl>
          )}
          {lookupNote(target.card) && <p className="m-0 text-[10px] text-ink-mute">{lookupNote(target.card)}</p>}
        </div>
      )}
    </Panel>
  );
}

// --- nearby (optional scan, off by default) ------------------------------------------

export function NearbyPanel({ snap }: { snap: OverlaySnapshot }) {
  const rows = snap.nearby;
  const enemies = rows.filter((r) => r.enemy === true).length;
  return (
    <Panel id="nearby" title="W pobliżu" layout={snap.settings.panels.nearby} editMode={snap.editMode || snap.altMode} aside={<span className="num">{enemies} wrog.</span>}>
      {rows.length === 0 ? (
        <Empty>
          {snap.settings.showAllies
            ? 'Gracze pojawią się, gdy wejdą w zasięg wzroku.'
            : 'Brak wrogów w zasięgu. Sojusznicy są ukryci (opcja w ustawieniach).'}
        </Empty>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-[3px] p-[5px]">
          {rows.map((row) => (
            <li
              key={row.card.name}
              className={`flex h-[40px] items-center gap-2 rounded-[6px] px-2 ${row.attacking ? 'bg-accent/25 ring-1 ring-accent' : 'bg-row'}`}
            >
              <span className={`h-6 w-[3px] rounded-full ${row.enemy === true ? 'bg-bad' : row.enemy === false ? 'bg-good' : 'bg-ink-mute'}`} aria-hidden="true" />
              <ClassIcon className={row.card.className} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold">{row.card.name}</span>
                  {row.attacking && <span className="rounded-[3px] bg-accent px-1 text-[9px] font-bold text-panel-head">ATAKUJESZ</span>}
                  <RecordBadge record={row.record} />
                </span>
                <GearLine card={row.card} />
              </span>
              <span className="num text-right text-[11px] text-ink-dim">
                {row.card.abyssRank !== null ? `#${grouped(row.card.abyssRank)}` : row.card.lookup === 'loading' ? '…' : '—'}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

// --- daily --------------------------------------------------------------------------

export function DailyPanel({ snap }: { snap: OverlaySnapshot }) {
  const { daily } = snap;
  return (
    <Panel id="daily" title="Dzisiaj" layout={snap.settings.panels.daily} editMode={snap.editMode || snap.altMode} aside={<span className="num">{daily.date}</span>}>
      <dl className="m-0 grid grid-cols-2 gap-1 p-2">
        <Stat label="Abyss Points" value={signed(daily.apGained)} />
        <Stat label="Pkt rankingowe" value={signed(daily.rankPointsGained)} />
        <Stat label="K / D / A" value={`${daily.kills} / ${daily.deaths} / ${daily.assists}`} />
        <Stat label="Ranga Abyss" value={daily.abyssRank !== null ? `#${grouped(daily.abyssRank)}` : '—'} />
      </dl>
      {daily.apWeek && (
        <p className="num m-0 px-2.5 pb-2 text-[10px] text-ink-mute">
          Tydzień: {grouped(daily.apWeek.points)} / {grouped(daily.apWeek.limit)} AP
        </p>
      )}
    </Panel>
  );
}
