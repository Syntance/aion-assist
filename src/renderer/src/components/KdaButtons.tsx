/** Three tiny buttons to fix K/D by hand against one player: I killed them, they killed me, undo the last manual entry. */
export function KdaButtons({ name, onChanged }: { name: string; onChanged?: () => void }) {
  const send = (action: 'kill' | 'death' | 'undo') => {
    window.overlay.adjustKda(name, action);
    if (onChanged) setTimeout(onChanged, 250);
  };
  const base = 'num grid h-[18px] min-w-[18px] place-items-center rounded-[4px] bg-panel-head/80 px-1 text-[10px] font-bold ring-1 ring-line/70 hover:brightness-150';
  return (
    <span className="relative z-20 flex shrink-0 items-center gap-0.5">
      <button type="button" className={`${base} text-good`} title={`Zabiłem: ${name}`} aria-label={`Dodaj zabójstwo: ${name}`} onClick={() => send('kill')}>
        +K
      </button>
      <button type="button" className={`${base} text-bad`} title={`Zginąłem od: ${name}`} aria-label={`Dodaj zgon od: ${name}`} onClick={() => send('death')}>
        +D
      </button>
      <button type="button" className={`${base} text-ink-dim`} title="Cofnij ostatni ręczny wpis" aria-label={`Cofnij ostatni ręczny wpis: ${name}`} onClick={() => send('undo')}>
        ↶
      </button>
    </span>
  );
}
