import { createContext, useContext, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { PanelId, PanelLayout } from '@shared/types';

/** What the overlay shows right now: `visible` follows the cursor auto-hide, `shown` only the game being in front. */
export const ViewContext = createContext({ visible: true, shown: true, opacity: 1 });

const ICON_PIN = 'M6 2h4l-.8 4 2.8 2.8H4L6.8 6ZM8 8.8V14';

interface Props {
  id: PanelId;
  title: string;
  layout: PanelLayout;
  editMode: boolean;
  aside?: ReactNode;
  /** Before the title (status dot) and right after it (timer). */
  lead?: ReactNode;
  sub?: ReactNode;
  /** Replaces the visible title (the title stays as the accessible name), e.g. a mode switch. */
  heading?: ReactNode;
  children: ReactNode;
}

type Drag = { kind: 'move' | 'resize' | 'height' | 'scale'; startX: number; startY: number; origin: PanelLayout };

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A movable / resizable overlay panel. Dragging only works in edit mode. */
export function Panel({ id, title, layout, editMode, aside, lead, sub, heading, children }: Props) {
  const [draft, setDraft] = useState<PanelLayout | null>(null);
  const drag = useRef<Drag | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const shown = draft ?? layout;
  const view = useContext(ViewContext);
  const on = layout.pinned ? view.shown : view.visible;

  const begin = (kind: Drag['kind']) => (e: PointerEvent<HTMLElement>) => {
    // The header always drags the window; the size handles only exist in layout-edit mode.
    if (kind !== 'move' && !editMode) return;
    if (!on || e.button !== 0) return;
    // buttons, inputs and links inside the header keep their own clicks
    if (e.target instanceof Element && e.target.closest('button, input, select, a, [data-nodrag]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    window.overlay.setMouseCapture(true); // keep catching the mouse for the whole drag
    const origin = kind === 'height' ? { ...layout, h: layout.h ?? sectionRef.current?.offsetHeight ?? 200 } : layout;
    drag.current = { kind, startX: e.clientX, startY: e.clientY, origin };
    setDraft(origin);
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const s = d.origin.scale; // the window is drawn scaled: screen pixels -> window pixels
    if (d.kind === 'move') {
      setDraft({ ...d.origin, x: Math.min(Math.max(0, d.origin.x + dx), window.innerWidth - 80), y: Math.min(Math.max(0, d.origin.y + dy), window.innerHeight - 40) });
    } else if (d.kind === 'resize') {
      setDraft({ ...d.origin, w: Math.min(Math.max(220, d.origin.w + dx / s), 900) });
    } else if (d.kind === 'height') {
      setDraft({ ...d.origin, h: Math.min(Math.max(60, (d.origin.h ?? 200) + dy / s), 3000) });
    } else {
      setDraft({ ...d.origin, scale: Math.min(Math.max(0.5, d.origin.scale * (1 + (dx + dy) / 600)), 2.5) });
    }
  };

  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    window.overlay.setMouseCapture(false);
    if (draft && (draft.x !== layout.x || draft.y !== layout.y || draft.w !== layout.w || draft.h !== layout.h || draft.scale !== layout.scale)) {
      window.overlay.updatePanel({
        id,
        layout: { x: Math.round(draft.x), y: Math.round(draft.y), w: Math.round(draft.w), h: draft.h === null ? null : Math.round(draft.h), scale: round2(draft.scale) },
      });
    }
    setDraft(null);
  };

  // Alt released mid-drag: the window turns click-through and pointerup never arrives,
  // so finish (and save) the drag here.
  const endRef = useRef(end);
  endRef.current = end;
  useEffect(() => {
    if (!editMode) endRef.current();
  }, [editMode]);

  if (!layout.visible) return null;

  return (
    <section
      data-hit={layout.pinned ? 'panel-pinned' : 'panel'}
      aria-label={title}
      ref={sectionRef}
      aria-hidden={!on}
      className={`absolute flex flex-col overflow-hidden rounded-[12px] bg-panel shadow-[0_8px_28px_oklch(0.1_0.02_255/0.55)] ring-1 ${
        editMode ? 'ring-accent/80' : 'ring-line'
      }`}
      style={{ transform: `translate(${shown.x}px, ${shown.y}px) scale(${shown.scale})`, transformOrigin: '0 0', width: shown.w, height: shown.h ?? undefined, opacity: on ? 1 : 0, pointerEvents: on ? undefined : 'none' }}
    >
      <header
        className={`flex h-[34px] shrink-0 items-center gap-2 border-b border-line/50 bg-panel-head px-3 cursor-grab touch-none active:cursor-grabbing`}
        onPointerDown={begin('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {lead}
        <h2 className={heading ? 'sr-only' : 'm-0 text-[13px] font-bold tracking-[0.01em] text-ink'}>{title}</h2>
        {heading}
        {sub}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-dim">{aside}</div>
        <button
          type="button"
          aria-pressed={layout.pinned}
          aria-label={layout.pinned ? `Odepnij okno ${title}` : `Przypnij okno ${title}`}
          title={layout.pinned ? 'Odepnij (znowu chowa się przy kursorze)' : 'Przypnij (zawsze widoczne, także przy kursorze)'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => window.overlay.updatePanel({ id, layout: { pinned: !layout.pinned } })}
          className={`grid size-5 shrink-0 place-items-center rounded-[4px] transition-[background-color,color] duration-150 hover:bg-row ${layout.pinned ? 'text-accent' : 'text-ink-mute hover:text-ink'}`}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill={layout.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICON_PIN} />
          </svg>
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      {editMode && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`Zmień szerokość: ${title}`}
            title="Przeciągnij: szerokość okna"
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize touch-none bg-accent/50"
            onPointerDown={begin('resize')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={`Rozciągnij w dół: ${title}`}
            title="Przeciągnij: wysokość okna (dwuklik: wysokość automatyczna)"
            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none bg-accent/50"
            onPointerDown={begin('height')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onDoubleClick={() => window.overlay.updatePanel({ id, layout: { h: null } })}
          />
          <div
            role="slider"
            aria-label={`Skala okna: ${title}`}
            aria-valuemin={50}
            aria-valuemax={250}
            aria-valuenow={Math.round(shown.scale * 100)}
            title="Przeciągnij: powiększenie okna (dwuklik: 100%)"
            className="absolute bottom-0 right-0 z-10 grid size-4 cursor-nwse-resize touch-none place-items-center rounded-tl-[6px] bg-accent text-[8px] font-bold text-panel-head"
            onPointerDown={begin('scale')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onDoubleClick={() => window.overlay.updatePanel({ id, layout: { scale: 1 } })}
          >
            ⤡
          </div>
        </>
      )}
    </section>
  );
}
