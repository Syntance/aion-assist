import { useEffect, useState } from 'react';

type Stage = 'checking' | 'notMember' | 'member' | 'working' | 'cancelled' | 'error' | 'confirmLogoff';

const button = 'rounded-[6px] bg-panel-head px-3 py-1.5 text-[12px] font-semibold text-ink ring-1 ring-line hover:bg-line';

/**
 * Frame counting needs the Windows account to be in "Performance Log Users". One click here shows the Windows
 * permission prompt once and adds it; after the next Windows sign-in the FPS appears.
 */
export function FpsAccess() {
  const [stage, setStage] = useState<Stage>('checking');
  const api = window.overlay;

  useEffect(() => {
    let alive = true;
    void api.fpsAccess('check').then((r) => alive && setStage(r === 'member' ? 'member' : 'notMember'));
    return () => {
      alive = false;
    };
  }, [api]);

  const grant = () => {
    setStage('working');
    void api.fpsAccess('grant').then((r) => setStage(r === 'granted' ? 'member' : r === 'cancelled' ? 'cancelled' : 'error'));
  };

  if (stage === 'checking') return <span className="text-ink-mute">Sprawdzam uprawnienia do pomiaru FPS…</span>;
  if (stage === 'member' || stage === 'confirmLogoff') {
    return (
      <span className="flex flex-col gap-1.5 text-ink-dim">
        <span>
          Konto ma już uprawnienie do pomiaru FPS. Żeby zaczęło działać, <b>wyloguj się z Windows i zaloguj ponownie</b> (zapisz grę i inne prace przed wylogowaniem).
        </span>
        {stage === 'confirmLogoff' ? (
          <span className="flex items-center gap-2">
            <span className="text-warm">Na pewno? Wylogowanie zamknie wszystkie programy, także grę.</span>
            <button type="button" className={button} onClick={() => void api.fpsAccess('logoff')}>
              Tak, wyloguj teraz
            </button>
            <button type="button" className={button} onClick={() => setStage('member')}>
              Nie
            </button>
          </span>
        ) : (
          <span>
            <button type="button" className={button} onClick={() => setStage('confirmLogoff')}>
              Wyloguj z Windows…
            </button>
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1.5">
      <span className={stage === 'error' || stage === 'cancelled' ? 'text-bad' : 'text-ink-dim'}>
        {stage === 'cancelled'
          ? 'Anulowano: bez zgody administratora pomiar FPS nie ruszy.'
          : stage === 'error'
            ? 'Nie udało się nadać uprawnienia. Możesz uruchomić aplikację jako administrator.'
            : 'Pomiar FPS potrzebuje jednorazowego uprawnienia Windows (grupa „Użytkownicy dzienników wydajności”). Windows zapyta o zgodę administratora.'}
      </span>
      <span>
        <button type="button" className={button} disabled={stage === 'working'} onClick={grant}>
          {stage === 'working' ? 'Czekam na zgodę…' : 'Włącz pomiar FPS'}
        </button>
      </span>
    </span>
  );
}
