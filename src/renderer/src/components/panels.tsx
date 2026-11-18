import { UNKNOWN_SOURCE } from '@shared/opponents';
import { KdaButtons } from './KdaButtons';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { OverlaySnapshot, PlayerCard, PvpDuel, PvpRow, RivalRecord } from '@shared/types';
import { clock, compact, grouped, percent, signed } from '../format';
import { ClassIcon } from './ClassIcon';
import { Panel, ViewContext } from './Panel';
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
/** Party damage and party deaths (shown next to the party DPS). */
function PartyStats({ total, deaths }: { total: number; deaths: number }) {
  return (
    <>
      <span>
        Party DMG <b className="num font-semibold text-ink">{compact(total)}</b>
      </span>
      <span title="Śmierci drużyny w tym dungeonie (liczone od wejścia, przez wszystkich bossów)" aria-label={`Party Deaths: ${deaths}`}>
        Party Deaths <b className={`num font-semibold ${deaths > 0 ? 'text-bad' : 'text-ink'}`}>{deaths}</b>
      </span>
    </>
  );
}

function FocusStrip({ focus, total, deaths }: { focus: NonNullable<OverlaySnapshot['meter']['focus']>; total: number; deaths: number }) {
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
      <div className="mt-1 flex items-center gap-2 text-[11px] leading-none text-ink-mute">
        <span>
          Party DPS <b className="num font-semibold text-ink">{compact(focus.partyDps)}</b>
        </span>
        <PartyStats total={total} deaths={deaths} />
        <span className="num ml-auto" title="Przewidywany czas do zabicia przy obecnym DPS drużyny">
          TTK <b className="font-semibold text-good">{ttkText(focus.ttkSec)}</b>
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

/** Slots of the roster packet are counted over the whole expedition: 1-5 is party 1, 6-10 is party 2, and so on. */
const PARTY_SIZE = 5;

/** Expedition lobby / party list inside the DPS window: leader, ready state, GS and CP; split by party when there are two or more. */
function LobbySection({ lobby }: { lobby: NonNullable<OverlaySnapshot['lobby']> }) {
  const groups = new Map<number, typeof lobby.members>();
  for (const m of lobby.members) {
    const n = Math.floor((Math.max(1, m.slot) - 1) / PARTY_SIZE) + 1;
    groups.set(n, [...(groups.get(n) ?? []), m]);
  }
  const parties = [...groups.entries()].sort((x, y) => x[0] - y[0]);
  const split = parties.length > 1;
  const row = (m: (typeof lobby.members)[number]) => (
    <PlayerRow
      key={m.card.name}
      card={m.card}
      isSelf={m.isSelf}
      fill={1}
      primary={m.leader ? 'Lider' : m.ready ? 'Gotowy' : 'Niegotowy'}
      secondary={m.card.level ? `poz. ${m.card.level}` : ''}
      tone={m.leader ? 'leader' : m.ready ? 'ready' : 'waiting'}
    />
  );
  return (
    <section className="mx-[5px] mt-[5px]" aria-label="Lobby">
      <h3 className="m-0 flex items-baseline gap-2 px-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-mute">
        <span className="truncate">Lobby{lobby.title ? ` · ${lobby.title}` : ''}</span>
        <span className="num ml-auto shrink-0 normal-case tracking-normal">{lobby.readyCount}/{lobby.members.length} gotowych</span>
      </h3>
      {split ? (
        <div className="flex flex-col gap-1.5">
          {parties.map(([n, members]) => (
            <div key={n}>
              <h4 className="m-0 flex items-center gap-2 px-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-accent">
                <span>Drużyna {n}</span>
                <span className="h-px flex-1 bg-line" aria-hidden="true" />
                <span className="num normal-case tracking-normal text-ink-dim">{members.filter((m) => m.ready || m.leader).length}/{members.length} gotowych</span>
              </h4>
              <ol className="m-0 flex list-none flex-col gap-[3px] p-0">{members.map(row)}</ol>
            </div>
          ))}
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-[3px] p-0">{lobby.members.map(row)}</ol>
      )}
    </section>
  );
}

/** A filled skull in the colour of the text around it (red where it is used for deaths), with a soft highlight and shade. */
const SkullIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className="shrink-0 drop-shadow-[0_1px_1px_oklch(0.1_0.02_255/0.7)]">
    <path d="M8 1.2c-3.200 0-5.600 2.300-5.600 5.300 0 1.800.9 3.200 2.200 4.100V13c0 .6.5 1.100 1.100 1.100h.8v-1.300h1.100v1.300h.8c.6 0 1.100-.5 1.100-1.100v-2.400c1.300-.9 2.200-2.300 2.200-4.100 0-3-2.400-5.300-5.600-5.300Z" fill="currentColor" />
    <path d="M4.300 4.600C5 3.300 6.300 2.500 8 2.500" fill="none" stroke="oklch(1 0 0 / 0.45)" strokeWidth="1" strokeLinecap="round" />
    <ellipse cx="5.900" cy="7.200" rx="1.500" ry="1.700" fill="oklch(0.16 0.03 255)" />
    <ellipse cx="10.100" cy="7.200" rx="1.500" ry="1.700" fill="oklch(0.16 0.03 255)" />
    <path d="M8 9 7.100 10.700h1.800Z" fill="oklch(0.16 0.03 255)" />
    <path d="M6.700 12.800v1M8 12.800v1M9.300 12.800v1" stroke="oklch(0.16 0.03 255)" strokeWidth="0.7" strokeLinecap="round" />
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

/** The local time (HH:MM) at the right end of the footer, so you can see the hour without leaving the game. */
function ClockBadge() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time className="num ml-auto shrink-0 font-semibold text-ink-dim" dateTime={now.toISOString()} title={now.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}>
      {now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
    </time>
  );
}

/** The game's FPS (from Windows event tracing of its frames), beside the ping. */
function FpsBadge({ fps }: { fps: OverlaySnapshot['fps'] }) {
  const v = fps.value;
  const tone = v === null ? 'text-ink-mute' : v >= 60 ? 'text-good' : v >= 30 ? 'text-warm' : 'text-bad';
  const note =
    fps.state === 'denied'
      ? 'Brak uprawnień do śledzenia klatek: wystarczy jednorazowo kliknąć „Włącz pomiar FPS” w oknie aplikacji (przycisk na pasku zadań) albo w Ustawieniach.'
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
/** The Bossy / PvP / Lobby switch, shown in the DPS window's header in place of its title. */
function ModeTabs({ mode, onChange, lobbyTab }: { mode: MeterMode; onChange: (m: MeterMode) => void; lobbyTab: boolean }) {
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
    <div role="tablist" aria-label="Tryb licznika" className="flex gap-0.5 rounded-[7px] bg-row p-0.5">
      {tab('boss', 'Bossy')}
      {tab('pvp', 'PvP')}
      {lobbyTab && tab('lobby', 'Lobby')}
    </div>
  );
}

/** The top `max` rows (0 = all); you always stay on the list, taking the last slot when you rank lower. */
const odyleUrl = import.meta.glob<string>('../assets/items/odyle.webp', { eager: true, query: '?url', import: 'default' })['../assets/items/odyle.webp'];

/** The item icon of Odyle energy (the game's artwork, when present), otherwise a drawn bolt. */
function OdyleIcon() {
  if (odyleUrl) return <img src={odyleUrl} alt="" width={16} height={16} className="size-4 drop-shadow-[0_1px_1px_oklch(0.1_0.02_255/0.8)]" draggable={false} />;
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-warm" aria-hidden="true">
      <path d="M9 1.500L3.500 9h4l-1 5.500L12.500 7h-4Z" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

function limitRows<T extends { isSelf: boolean }>(rows: readonly T[], max: number): { shown: T[]; hidden: number } {
  if (max <= 0 || rows.length <= max) return { shown: [...rows], hidden: 0 };
  const shown = rows.slice(0, max);
  const me = rows.find((r) => r.isSelf);
  if (me && !shown.includes(me)) shown[max - 1] = me;
  return { shown, hidden: rows.length - max };
}

function MoreRows({ hidden }: { hidden: number }) {
  if (hidden <= 0) return null;
  return <li className="num px-2 py-0.5 text-center text-[10px] text-ink-mute">+{hidden} więcej (limit listy w ustawieniach)</li>;
}

export function MeterPanel({
  snap,
  onDetail,
  onHistory,
  historyOpen,
}: {
  snap: OverlaySnapshot;
  onDetail: (name: string, source: string) => void;
  onHistory: (tab: 'boss' | 'pvp') => void;
  historyOpen: boolean;
}) {
  const { meter, capture, self, pvp } = snap;
  const view = useContext(ViewContext);
  const meterShow = snap.settings.panels.meter.pinned ? view.shown : view.visible; // same rule as the panel itself
  const top = meter.rows[0]?.damage ?? 0;
  const meterList = limitRows(meter.rows, snap.settings.maxPlayerRows);
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
      heading={
        <>
          <ModeTabs mode={shownMode} onChange={setMode} lobbyTab={lobbyTab} />
          <button
            type="button"
            aria-pressed={historyOpen}
            aria-label="Historia walk"
            title={shownMode === 'pvp' ? 'Historia PvP' : 'Historia bossów'}
            onClick={() => onHistory(shownMode === 'pvp' ? 'pvp' : 'boss')}
            className={`grid size-6 place-items-center rounded-[6px] ring-1 transition-[background-color,color] duration-150 ${
              historyOpen ? 'bg-accent/25 text-accent ring-accent/60' : 'bg-row text-ink-dim ring-line hover:text-ink'
            }`}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 2.5v3h3M8 5v3.2l2.2 1.3" />
            </svg>
          </button>
        </>
      }
      layout={snap.settings.panels.meter}
      editMode={snap.editMode || snap.altMode}
      sub={
        shownMode === 'lobby' ? undefined : (
          <span className="num text-[12px] font-semibold text-accent">{clock(shownMode === 'pvp' ? pvp.durationMs : meter.durationMs)}</span>
        )
      }
      aside={
        shownMode === 'pvp' ? (
          <>
            <span className="num font-semibold" title="Zabójstwa / zgony / asysty dzisiaj">
              <span className="text-good">{pvp.kills}</span> K <span className="text-bad">{pvp.deaths}</span> D <span className="text-ink">{pvp.assists}</span> A
            </span>
            <span className="num text-ink-mute">{compact(pvp.mineTotal)}</span>
          </>
        ) : shownMode === 'lobby' ? (
          lobby && (
            <span className="num" title="Gotowi gracze">
              {lobby.readyCount}/{lobby.members.length} gotowych
            </span>
          )
        ) : null
      }
    >
      {shownMode === 'pvp' ? (
        <PvpBody snap={snap} onDetail={onDetail} />
      ) : shownMode === 'lobby' ? (
        lobby ? <LobbySection lobby={lobby} /> : <Empty>Brak lobby ani drużyny. Pojawi się po dołączeniu do drużyny lub poczekalni ekspedycji.</Empty>
      ) : (
        <>
          {meter.focus ? (
            <FocusStrip focus={meter.focus} total={meter.total} deaths={meter.deaths} />
          ) : (
            (meter.total > 0 || meter.deaths > 0) && (
              <div className="mx-[6px] mt-[6px] flex items-center gap-2 px-1 text-[11px] leading-none text-ink-mute">
                <PartyStats total={meter.total} deaths={meter.deaths} />
              </div>
            )
          )}
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
              {meterList.shown.map((row) => (
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
                    </>
                  }
                  aside={
                    <SideMarks
                      show={meterShow}
                      marks={row.deaths > 0 ? [{ key: 'x', n: row.deaths, tone: 'bad', icon: 'skull', title: `Śmierci w tym dungeonie: ${row.deaths}` }] : []}
                    />
                  }
                />
              ))}
              <MoreRows hidden={meterList.hidden} />
            </ol>
          )}
        </>
      )}
      <footer className="num mt-auto flex items-center gap-3 border-t border-line bg-panel-head px-2.5 py-1.5 text-[11px] text-ink-dim">
        <span className="flex shrink-0 items-center" title={capture.detail ?? CAPTURE_TEXT[capture.state]} role="img" aria-label={capture.detail ?? CAPTURE_TEXT[capture.state]}>
          <Dot on={capture.state === 'locked' || capture.state === 'demo'} />
        </span>
        <span className="truncate font-semibold text-self">{self?.name ?? '—'}</span>
        {snap.odyle && (
          <span
            className="num flex items-center gap-1"
            title={`Energia Odyle: podstawowa ${snap.odyle.basic}, naładowana (bonus) +${snap.odyle.charged}. Wartość z ostatniego pakietu gry (logowanie lub zmiana), nie odlicza regeneracji na żywo.`}
          >
            <OdyleIcon />
            <b className="font-semibold text-ink">{snap.odyle.basic}</b>
            {snap.odyle.charged > 0 && <span className="text-[oklch(0.76_0.13_240)]">(+{snap.odyle.charged})</span>}
          </span>
        )}
        {snap.settings.showPing && <PingBadge ping={snap.ping} />}
        {snap.settings.showFps && <FpsBadge fps={snap.fps} />}
        {snap.settings.showClock && <ClockBadge />}
      </footer>
    </Panel>
  );
}

// --- PvP ----------------------------------------------------------------------------

function RecordBadge({ record }: { record: RivalRecord | null }) {
  const assists = record?.assists ?? 0;
  if (!record || record.wins + record.losses + assists === 0) return null;
  return (
    <span className="num shrink-0 whitespace-nowrap rounded-[3px] bg-panel-head/80 px-1 text-[10px] font-semibold" title="Twój bilans z tym graczem ze wszystkich zapisanych walk: zabójstwa – zgony – asysty">
      <span className="text-good">{record.wins}</span>
      <span className="text-ink-mute">–</span>
      <span className="text-bad">{record.losses}</span>
      <span className="text-ink-mute">–</span>
      <span className="text-ink">{assists}</span>
    </span>
  );
}

interface SideMark {
  key: string;
  n: number;
  tone: 'good' | 'bad';
  title: string;
  icon: 'swords' | 'skull';
}

/**
 * Round markers outside the panel, to the right of a row: crossed swords (green = you killed them, red = they killed you)
 * or a skull (a death in a dungeon), with a count when it happened more than once. The panel clips its content,
 * so they are drawn in a fixed layer positioned from an anchor in the row.
 */
export function SideMarks({ marks, show }: { marks: SideMark[]; show: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; h: number } | null>(null);
  useEffect(() => {
    const read = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      setBox((prev) => (prev && Math.abs(prev.x - r.right) < 0.5 && Math.abs(prev.y - r.top) < 0.5 && Math.abs(prev.h - r.height) < 0.5 ? prev : { x: r.right, y: r.top, h: r.height }));
    };
    read();
    const t = setInterval(read, 150);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <span ref={anchor} className="pointer-events-none absolute inset-y-0 right-0 w-0" aria-hidden="true" />
      {box && show && marks.length > 0 &&
        createPortal(
          <div className="pointer-events-none fixed z-50 flex items-center gap-1.5" style={{ left: box.x + 14, top: box.y, height: box.h }}>
            {marks.map((m) => (
              <span
                key={m.key}
                title={m.title}
                role="img"
                aria-label={m.title}
                className={`relative grid size-[28px] place-items-center rounded-full shadow-[0_3px_8px_oklch(0.1_0.02_255/0.6),inset_0_1px_0_oklch(1_0_0/0.35)] ring-1 ${m.tone === 'good' ? 'bg-good text-[oklch(0.18_0.05_150)] ring-good/70' : 'bg-bad text-[oklch(0.97_0.01_25)] ring-bad/70'}`}
              >
                {m.icon === 'skull' ? (
                  <SkullIcon size={20} />
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                    {[45, -45].map((deg) => (
                      <g key={deg} transform={`rotate(${deg} 12 12)`}>
                        <path d="M12 1.200 14.100 12.600H9.900Z" />
                        <rect x="7.200" y="12.600" width="9.600" height="2" rx="1" />
                        <rect x="11" y="14.600" width="2" height="5" rx=".6" />
                        <circle cx="12" cy="21" r="1.500" />
                      </g>
                    ))}
                  </svg>
                )}
                {m.n > 1 && <span className="num absolute -right-1 -top-1 rounded-full bg-panel px-[3px] text-[9px] font-extrabold leading-[12px] text-ink ring-1 ring-line">{m.n}</span>}
              </span>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function DuelIcons({ duel, show }: { duel: PvpDuel; show: boolean }) {
  const marks: SideMark[] = [];
  if (duel.kills > 0) marks.push({ key: 'k', n: duel.kills, tone: 'good', icon: 'swords', title: `Zabiłeś go w tym starciu: ${duel.kills}` });
  if (duel.deaths > 0) marks.push({ key: 'd', n: duel.deaths, tone: 'bad', icon: 'swords', title: `Zabił cię w tym starciu: ${duel.deaths}` });
  return <SideMarks marks={marks} show={show} />;
}

/**
 * An opponent as one tug-of-war bar of damage: from the left what THEY dealt to you (red), from the right what YOU dealt
 * to them (green). The bar tips toward whoever dealt more.
 */
function HpDuelRow({ row, onSelect, show }: { row: PvpRow; onSelect: () => void; show: boolean }) {
  const d = row.duel;
  const cls = row.card.className ?? 'unknown';
  const unknown = row.card.name === UNKNOWN_SOURCE;
  const theirs = d?.takenDmg ?? 0;
  const mine = d?.dealtDmg ?? 0;
  const left = unknown ? 1 : theirs + mine > 0 ? theirs / (theirs + mine) : 0.5;
  const seg = (color: string) => `linear-gradient(90deg, color-mix(in oklch, ${color} 88%, transparent), color-mix(in oklch, ${color} 52%, transparent))`;
  return (
    <li className="overflow-hidden rounded-[6px] bg-row shadow-[inset_0_1px_0_oklch(1_0_0/0.22),inset_0_-1px_0_oklch(0_0_0/0.3),0_2px_3px_oklch(0_0_0/0.35)]">
     <div className="relative flex h-[38px] items-center gap-2 px-2">
      {d && <DuelIcons duel={d} show={show} />}
      <button type="button" onClick={onSelect} aria-label={`Szczegóły: ${row.card.name}`} title="Pokaż szczegóły umiejętności" className="absolute inset-0 z-10 cursor-pointer rounded-[6px] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent" />
      <span className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(90deg, oklch(0 0 0 / 0.5), oklch(0 0 0 / 0.28) 30%, oklch(0 0 0 / 0) 75%)' }} aria-hidden="true" />
      <span className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to bottom, oklch(1 0 0 / 0.14), oklch(1 0 0 / 0) 45%), linear-gradient(to top, oklch(0 0 0 / 0.24), oklch(0 0 0 / 0) 55%)' }} aria-hidden="true" />
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `var(--color-cls-${cls})` }} aria-hidden="true" />
      <span className="relative flex w-[38%] min-w-[140px] shrink-0 items-center gap-2">
        <ClassIcon className={row.card.className} size={26} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-ink [text-shadow:0_1px_2px_oklch(0.1_0.02_255/0.8)]">{row.card.name}</span>
            <RecordBadge record={row.record} />
          </span>
          <GearLine card={row.card} />
        </span>
      </span>
      {d ? (
        /* the HP bar starts after the name block so it never runs under the nick */
        <span className="relative my-1 flex-1 self-stretch overflow-hidden rounded-[4px]">
          <span className="bar-fill absolute inset-0" style={{ transform: `scaleX(${left})`, transformOrigin: 'left center', background: seg('var(--color-bad)') }} aria-hidden="true" />
          <span className="bar-fill absolute inset-0" style={{ transform: `scaleX(${1 - left})`, transformOrigin: 'right center', background: seg('var(--color-good)') }} aria-hidden="true" />
          {/* what they dealt rides the end of the red bar; what you dealt sits at the right edge */}
          <span
            className="num pointer-events-none absolute inset-y-0 flex items-center pr-1.5 text-[12px] font-bold text-ink transition-[left] duration-[260ms] [text-shadow:0_1px_2px_oklch(0.08_0.02_255/0.95)]"
            style={{ left: `max(${left * 100}%, 42px)`, transform: 'translateX(-100%)' }}
            title={unknown ? 'Obrażenia z nieznanego źródła na tobie' : 'Obrażenia, które on zadał tobie'}
          >
            {compact(theirs)}
          </span>
          {!unknown && (
            <span className="num pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-[12px] font-bold text-ink [text-shadow:0_1px_2px_oklch(0.08_0.02_255/0.95)]" title="Obrażenia, które ty zadałeś jemu">
              {compact(mine)}
            </span>
          )}
        </span>
      ) : (
        <span className="num relative ml-auto text-[13px] font-bold text-ink">{compact(row.damage)}</span>
      )}
     </div>
     {row.card.name !== UNKNOWN_SOURCE && (
      <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-0.5">
       <KdaButtons name={row.card.name} />
      </div>
     )}
    </li>
  );
}

/** PvP view inside the DPS window: both sides of the current player fight. */
function PvpBody({ snap, onDetail }: { snap: OverlaySnapshot; onDetail: (name: string, source: string) => void }) {
  const { pvp } = snap;
  const view = useContext(ViewContext);
  const panelOn = snap.settings.panels.meter.pinned ? view.shown : view.visible; // same rule as the panel itself
  const mineList = limitRows(pvp.mine, snap.settings.maxPlayerRows);
  const theirsList = limitRows(pvp.theirs, snap.settings.maxPlayerRows);
  const sideHead = 'px-2.5 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em]';
  return (
    <>
      {pvp.mine.length + pvp.theirs.length === 0 ? (
        <Empty>Brak starć z graczami w tej sesji.</Empty>
      ) : (
        <>
          <h3 className={`${sideHead} m-0 text-good`}>Twoja strona</h3>
          <ol className="m-0 flex list-none flex-col gap-[3px] p-[5px]">
            {mineList.shown.map((row) => (
              <PlayerRow key={row.card.name} card={row.card} isSelf={row.isSelf} fill={row.share} onSelect={() => onDetail(row.card.name, 'livepvp')} primary={compact(row.damage)} secondary={<>{compact(row.dps)}/s · {percent(row.share)}</>} />
            ))}
            <MoreRows hidden={mineList.hidden} />
          </ol>
          <h3 className={`${sideHead} m-0 text-bad`}>Przeciwnicy</h3>
          <ol className="m-0 flex list-none flex-col gap-[3px] p-[5px]">
            {theirsList.shown.map((row) => (
              <HpDuelRow key={row.card.name} row={row} show={panelOn} onSelect={() => onDetail(row.card.name, 'livepvp')} />
            ))}
            <MoreRows hidden={theirsList.hidden} />
          </ol>
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
