import { useEffect, useState } from 'react';
import type { OverlaySnapshot } from '@shared/types';
import { FpsAccess } from './components/FpsAccess';
import { SettingsWindow } from './components/Settings';

const CAPTURE_TEXT: Record<OverlaySnapshot['capture']['state'], string> = {
  starting: 'Uruchamianie nasłuchu…',
  searching: 'Szukam połączenia z grą…',
  locked: 'Połączono z grą',
  error: 'Błąd nasłuchu',
  demo: 'Tryb demo',
};

/** The ordinary window behind the taskbar button: app status, all settings and a way to quit. */
export function ControlApp() {
  const [snap, setSnap] = useState<OverlaySnapshot | null>(null);
  useEffect(() => window.overlay.onSnapshot(setSnap), []);
  if (!snap) return null;
  const connected = snap.capture.state === 'locked' || snap.capture.state === 'demo';
  return (
    <div className="flex h-full flex-col bg-panel text-ink">
      <header className="flex items-center gap-3 border-b border-line bg-panel-head px-4 py-2.5">
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
          <path d="M8 1l7 7-7 7-7-7Z" fill="var(--color-accent)" />
          <path d="M8 4.5l3.5 3.5L8 11.5 4.5 8Z" fill="var(--color-panel-head)" />
        </svg>
        <h1 className="m-0 text-[15px] font-bold">Aion Assist</h1>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-dim">
          <span className={`size-2 rounded-full ${connected ? 'bg-good' : 'bg-ink-mute'}`} aria-hidden="true" />
          {snap.capture.detail ?? CAPTURE_TEXT[snap.capture.state]}
        </span>
        <span className="text-[12px] text-ink-dim">{snap.self?.name ? `Postać: ${snap.self.name}` : 'Postać nierozpoznana'}</span>
        <span className="text-[12px] text-ink-dim">{snap.gameFocused ? 'Gra na wierzchu: nakładka widoczna' : 'Gra w tle: nakładka ukryta'}</span>
        <div role="group" aria-label="Widoczność nakładki" className="ml-auto flex gap-0.5 rounded-[7px] bg-row p-0.5 ring-1 ring-line">
          {(
            [
              ['auto', 'Auto', 'Nakładka pokazuje się, gdy gra jest na wierzchu'],
              ['show', 'Pokaż nakładkę', 'Nakładka widoczna zawsze, także gdy gra jest w tle lub AFK'],
              ['hide', 'Schowaj', 'Nakładka ukryta, dopóki jej nie pokażesz'],
            ] as const
          ).map(([mode, label, hint]) => (
            <button
              key={mode}
              type="button"
              title={hint}
              aria-pressed={snap.overlayMode === mode}
              onClick={() => window.overlay.setOverlayMode(mode)}
              className={`rounded-[5px] px-2.5 py-1 text-[12px] font-semibold ${snap.overlayMode === mode ? 'bg-accent/25 text-accent' : 'text-ink-dim hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => window.overlay.quitApp()}
          className="rounded-[6px] bg-row px-3 py-1.5 text-[12px] font-semibold text-bad ring-1 ring-line hover:bg-line"
        >
          Zakończ aplikację
        </button>
      </header>
      {snap.settings.showFps && snap.fps.state === 'denied' && (
        <div className="border-b border-line bg-warm/10 px-4 py-2.5 text-[12px]">
          <b className="mb-1 block text-warm">FPS w oknie DPS wymaga jednorazowego uprawnienia</b>
          <FpsAccess />
        </div>
      )}
      <div className="min-h-0 flex-1">
        <SettingsWindow snap={snap} embedded onClose={() => undefined} />
      </div>
    </div>
  );
}
