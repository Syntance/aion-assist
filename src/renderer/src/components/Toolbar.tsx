import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { acceleratorLabel } from '@shared/keys';
import { PANEL_IDS, type OverlaySnapshot, type PanelId } from '@shared/types';

/**
 * Always-visible settings bar (shown whenever the game is in the foreground, menus included).
 * Only the bar itself catches the mouse; the rest of the screen stays click-through.
 */

const PANEL_META: Record<PanelId, { label: string; icon: string }> = {
  meter: { label: 'DPS', icon: 'M3 13V8M8 13V3M13 13V6' },
  pvp: { label: 'PvP', icon: 'M3 3l8 8M13 3L5 11M3.5 12.5l1.5-1.5M12.5 12.5L11 11M2.5 9.5l4 4M13.5 9.5l-4 4' },
  target: { label: 'Cel', icon: 'M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M8 4.5a3.5 3.5 0 1 0 0.01 0Z' },
  daily: { label: 'Dzisiaj', icon: 'M2.5 4h11v9.5h-11ZM2.5 7h11M5.5 2.5v3M10.5 2.5v3' },
  pets: { label: 'Zwierzaki', icon: 'M2.500 4.500L4.500 7H9.500L10.800 4.200 13 3.500l1 1.800-.7 1H12L11.200 8.200V13.500H9.800V10H6.200V13.500H4.800V8.500L4.500 7M12 4.800h.01' },
};

const ICON_MOVE = 'M8 1.5v13M1.5 8h13M8 1.5L6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2';
const ICON_RESET = 'M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3';
const ICON_HIDE = 'M1.5 8S4 3.500 8 3.500 14.500 8 14.500 8 12 12.500 8 12.500 1.500 8 1.500 8ZM3 13L13 3';
const ICON_PIN ='M6 2h4l-.8 4 2.8 2.8H4L6.8 6ZM8 8.8V14';

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid size-7 place-items-center rounded-[6px] transition-[background-color,color] duration-150 hover:bg-row hover:text-ink ${
        active ? 'bg-accent/20 text-accent' : 'text-ink-dim'
      }`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />;

const ICON_HISTORY = 'M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 2.5v3h3M8 5v3.2l2.2 1.3';

const ICON_SETTINGS = 'M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6M10 3v3M6 10v3';

export function Toolbar({
  snap,
  shown,
  historyOpen,
  onHistory,
  settingsOpen,
  onSettings,
}: {
  snap: OverlaySnapshot;
  shown: boolean;
  historyOpen: boolean;
  onHistory: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
}) {
  const api = window.overlay;
  const { settings, editMode, pinned } = snap;
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const pos = draft ?? settings.toolbar;

  const begin = (e: PointerEvent<HTMLElement>) => {
    if (!editMode && !snap.altMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    api.setMouseCapture(true);
    drag.current = { startX: e.clientX, startY: e.clientY, ...settings.toolbar };
    setDraft(settings.toolbar);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    setDraft({
      x: Math.min(Math.max(0, d.x + e.clientX - d.startX), window.innerWidth - 120),
      y: Math.min(Math.max(0, d.y + e.clientY - d.startY), window.innerHeight - 40),
    });
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    api.setMouseCapture(false);
    if (draft) api.updateSettings({ toolbar: { x: Math.round(draft.x), y: Math.round(draft.y) } });
    setDraft(null);
  };
  const step = (delta: number) =>
    api.updateSettings({ opacity: Math.round(Math.min(1, Math.max(0.05, settings.opacity + delta)) * 100) / 100 });

  return (
    <nav
      data-hit="toolbar"
      aria-label="Pasek Aion Assist"
      className={`absolute top-0 left-0 flex h-9 items-center gap-0.5 rounded-[10px] bg-panel-head/95 px-1.5 shadow-[0_6px_20px_oklch(0.1_0.02_255/0.5)] ring-1 transition-opacity duration-150 ${
        editMode || snap.altMode ? 'ring-accent/80' : 'ring-line'
      }`}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, opacity: shown ? 1 : 0, pointerEvents: shown ? 'auto' : 'none' }}
    >
      <span
        className={`flex items-center gap-1.5 pr-1.5 pl-0.5 text-[12px] font-bold text-ink ${editMode || snap.altMode ? 'cursor-move touch-none' : ''}`}
        title={editMode || snap.altMode ? 'Przeciągnij, aby przesunąć pasek' : undefined}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M8 1l7 7-7 7-7-7Z" fill="var(--color-accent)" />
          <path d="M8 4.5l3.5 3.5L8 11.5 4.5 8Z" fill="var(--color-panel-head)" />
        </svg>
        Aion Assist
      </span>
      <Sep />
      {PANEL_IDS.filter((id) => id !== 'pvp').map((id) => (
        <ToolButton
          key={id}
          label={`${settings.panels[id].visible ? 'Ukryj' : 'Pokaż'} panel ${PANEL_META[id].label}`}
          active={settings.panels[id].visible}
          onClick={() => api.updatePanel({ id, layout: { visible: !settings.panels[id].visible } })}
        >
          <Icon d={PANEL_META[id].icon} />
        </ToolButton>
      ))}
      <ToolButton label={historyOpen ? 'Zamknij historię dungeonów' : 'Historia dungeonów i bossów'} active={historyOpen} onClick={onHistory}>
        <Icon d={ICON_HISTORY} />
      </ToolButton>
      <ToolButton label={settingsOpen ? 'Zamknij ustawienia' : 'Ustawienia aplikacji'} active={settingsOpen} onClick={onSettings}>
        <Icon d={ICON_SETTINGS} />
      </ToolButton>
      <Sep />
      <ToolButton label="Zmniejsz krycie" onClick={() => step(-0.05)}>
        <Icon d="M3.5 8h9" />
      </ToolButton>
      <span className="num w-9 text-center text-[11px] text-ink-dim" aria-label="Krycie">
        {Math.round(settings.opacity * 100)}%
      </span>
      <ToolButton label="Zwiększ krycie" onClick={() => step(0.05)}>
        <Icon d="M3.5 8h9M8 3.5v9" />
      </ToolButton>
      <Sep />
      <ToolButton label={editMode ? 'Zablokuj układ (zapisz pozycje)' : 'Przestaw układ'} active={editMode} onClick={() => api.toggleEditMode()}>
        <Icon d={ICON_MOVE} />
      </ToolButton>
      <ToolButton label={pinned ? 'Odepnij (auto-ukrywanie)' : 'Przypnij (zawsze widoczna)'} active={pinned} onClick={() => api.setPinned(!pinned)}>
        <Icon d={ICON_PIN} />
      </ToolButton>
      <ToolButton label={`Ukryj wszystkie okna (${acceleratorLabel(settings.hotkeys.hideAll)} przywraca)`} onClick={() => api.setOverlayMode('hide')}>
        <Icon d={ICON_HIDE} />
      </ToolButton>
      <ToolButton
        label="Wyzeruj DPS i PvP"
        onClick={() => {
          api.resetMeter();
          api.resetPvp();
        }}
      >
        <Icon d={ICON_RESET} />
      </ToolButton>
    </nav>
  );
}
