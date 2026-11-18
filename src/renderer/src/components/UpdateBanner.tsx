import { useState } from 'react';
import type { UpdateSnapshot } from '@shared/types';

const button = 'rounded-[6px] bg-panel-head px-3 py-1.5 text-[12px] font-semibold text-ink ring-1 ring-line hover:bg-line';

/** Whether a newer version is being downloaded or waits to be installed, and which version it is. */
export function pendingUpdate(update: UpdateSnapshot): { version: string; ready: boolean; percent: number } | null {
  if ((update.state === 'ready' || update.state === 'downloading') && update.available) {
    return { version: update.available, ready: update.state === 'ready', percent: update.percent ?? 0 };
  }
  return null;
}

/**
 * "A newer version is available" banner. It shows once per app start for each version (closing it with "Później" hides it
 * until the next start), first with the download progress, then with the button that installs it and restarts the app.
 */
export function UpdateBanner({ update, variant, anchor }: { update: UpdateSnapshot; variant: 'popup' | 'strip'; anchor?: { x: number; y: number } }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const pending = pendingUpdate(update);
  if (!pending || dismissed === pending.version) return null;
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="text-[13px] text-accent">Dostępna nowa wersja {pending.version}</b>
        <span className="text-[11px] text-ink-dim">
          {pending.ready ? `Masz ${update.version}. Pobrana, gotowa do instalacji.` : `Pobieram w tle (${pending.percent}%)…`}
        </span>
      </span>
      {pending.ready && (
        <button type="button" className={button} onClick={() => window.overlay.installUpdate()}>
          {variant === 'popup' ? 'Zainstaluj' : 'Zainstaluj i uruchom ponownie'}
        </button>
      )}
      <button type="button" className={button} onClick={() => setDismissed(pending.version)}>
        Później
      </button>
    </>
  );
  if (variant === 'strip') {
    return (
      <div role="status" className="flex items-center gap-3 border-b border-line bg-accent/10 px-4 py-2.5">
        {body}
      </div>
    );
  }
  // a small bubble right above the toolbar (the menu bar of the overlay), left edges aligned; below it when the bar is at the very top
  const below = (anchor?.y ?? 0) < 90;
  return (
    <section
      data-hit="update"
      role="status"
      aria-label="Dostępna aktualizacja"
      className="absolute z-30 flex w-[360px] max-w-[94vw] items-center gap-2.5 rounded-[10px] bg-panel px-3 py-2 shadow-[0_10px_30px_oklch(0.1_0.02_255/0.6)] ring-1 ring-accent/60"
      style={below ? { left: anchor?.x ?? 24, top: (anchor?.y ?? 0) + 46 } : { left: anchor?.x ?? 24, top: (anchor?.y ?? 0) - 8, transform: 'translateY(-100%)' }}
    >
      {body}
    </section>
  );
}
