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
            fill={1}
            primary={m.leader ? 'Lider' : m.ready ? 'Gotowy' : 'Niegotowy'}
            secondary={m.card.level ? `poz. ${m.card.level}` : ''}
            tone={m.leader ? 'leader' : m.ready ? 'ready' : 'waiting'}
          />
        ))}
      </ol>
    </section>
  );
}

/** A filled skull in the colour of the text around it (red where it is used for deaths), with a soft highlight and shade. */
const SkullIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="shrink-0 drop-shadow-[0_1px_1px_oklch(0.1_0.02_255/0.7)]">
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
  const mineList = limitRows(pvp.mine, snap.settings.maxPlayerRows);
  const theirsList = limitRows(pvp.theirs, snap.settings.maxPlayerRows);
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
            {mineList.shown.map((row) => (
              <PlayerRow key={row.card.name} card={row.card} isSelf={row.isSelf} fill={row.share} onSelect={() => onDetail(row.card.name, 'livepvp')} primary={compact(row.damage)} secondary={<>{compact(row.dps)}/s · {percent(row.share)}</>} />
            ))}
            <MoreRows hidden={mineList.hidden} />
          </ol>
          <h3 className={`${sideHead} m-0 text-bad`}>Przeciwnicy</h3>
          <ol className="m-0 flex list-none flex-col gap-[3px] p-[5px]">
            {theirsList.shown.map((row) => (
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
            <MoreRows hidden={theirsList.hidden} />
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
