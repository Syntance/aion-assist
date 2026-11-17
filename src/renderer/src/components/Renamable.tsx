import { useState } from 'react';

/** Click-to-rename label: the user gives dungeon / map / boss ids a readable name (stored locally). */
export function Renamable({ text, onSave, className = '' }: { text: string; onSave: (name: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  if (!editing) {
    return (
      <span className={`flex min-w-0 items-center gap-1 ${className}`}>
        <span className="truncate">{text}</span>
        <button
          type="button"
          aria-label={`Zmień nazwę: ${text}`}
          title="Zmień nazwę"
          onClick={() => {
            setDraft(text);
            setEditing(true);
          }}
          className="grid size-5 shrink-0 place-items-center rounded-[4px] text-ink-mute hover:bg-row hover:text-ink"
        >
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 13.5l1-3.5 7.5-7.5 2.5 2.5L6 12.5ZM9.5 4l2.5 2.5" />
          </svg>
        </button>
      </span>
    );
  }
  const commit = () => {
    onSave(draft);
    setEditing(false);
  };
  return (
    <input
      autoFocus
      type="text"
      value={draft}
      maxLength={60}
      aria-label="Nowa nazwa"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="min-w-0 flex-1 rounded-[4px] bg-panel-head px-1.5 py-0.5 text-[12px] text-ink outline-1 outline-accent"
    />
  );
}
