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
  children: ReactNode;
}

type Drag = { kind: 'move' | 'resize'; startX: number; startY: number; origin: PanelLayout };

/** A movable / resizable overlay panel. Dragging only works in edit mode. */
export function Panel({ id, title, layout, editMode, aside, lead, sub, children }: Props) {
  const [draft, setDraft] = useState<PanelLayout | null>(null);
  const drag = useRef<Drag | null>(null);
  const shown = draft ?? layout;
  const view = useContext(ViewContext);
  const on = layout.pinned ? view.shown : view.visible;

  const begin = (kind: Drag['kind']) => (e: PointerEvent<HTMLElement>) => {
    // The header always drags the window; the width handle only exists in layout-edit mode.
    if (kind === 'resize' && !editMode) return;
    if (!on || e.button !== 0) return;
    // buttons, inputs and links inside the header keep their own clicks
    if (e.target instanceof Element && e.target.closest('button, input, select, a, [data-nodrag]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    window.overlay.setMouseCapture(true); // keep catching the mouse for the whole drag
    drag.current = { kind, startX: e.clientX, startY: e.clientY, origin: layout };
    setDraft(layout);
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setDraft(
      d.kind === 'move'
        ? {
            ...d.origin,
            x: Math.min(Math.max(0, d.origin.x + dx), window.innerWidth - 80),
            y: Math.min(Math.max(0, d.origin.y + dy), window.innerHeight - 40),
          }
        : { ...d.origin, w: Math.min(Math.max(220, d.origin.w + dx), 900) },
    );
  };

  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    window.overlay.setMouseCapture(false);
    if (draft && (draft.x !== layout.x || draft.y !== layout.y || draft.w !== layout.w)) {
      window.overlay.updatePanel({ id, layout: { x: Math.round(draft.x), y: Math.round(draft.y), w: Math.round(draft.w) } });
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
      aria-hidden={!on}
      className={`absolute overflow-hidden rounded-[12px] bg-panel shadow-[0_8px_28px_oklch(0.1_0.02_255/0.55)] ring-1 ${
        editMode ? 'ring-accent/80' : 'ring-line'
      }`}
      style={{ transform: `translate(${shown.x}px, ${shown.y}px)`, width: shown.w, opacity: on ? view.opacity : 0, pointerEvents: on ? undefined : 'none' }}
    >
      <header
        className={`flex h-[34px] items-center gap-2 border-b border-line/50 bg-panel-head px-3 cursor-grab touch-none active:cursor-grabbing`}
        onPointerDown={begin('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {lead}
        <h2 className="m-0 text-[13px] font-bold tracking-[0.01em] text-ink">{title}</h2>
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
      {children}
      {editMode && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Zmień szerokość: ${title}`}
          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize touch-none bg-accent/50"
          onPointerDown={begin('resize')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      )}
    </section>
  );
}
