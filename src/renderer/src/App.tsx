import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CLASS_NAMES, type OverlaySnapshot } from '@shared/types';
import { DetailWindow } from './components/Detail';
import { ClassIconSetContext } from './components/ClassIcon';
import { DeathPopup } from './components/DeathPopup';
import { PetFinderWindow } from './components/PetFinder';
import { UpdateBanner } from './components/UpdateBanner';
import { PetMapWindow } from './components/PetMap';
import { PetsPanel } from './components/PetsPanel';
import { HistoryWindow, PlayersWindow } from './components/History';
import { ViewContext } from './components/Panel';
import { SettingsWindow } from './components/Settings';
import { DailyPanel, MeterPanel, TargetPanel } from './components/panels';
import { Toolbar } from './components/Toolbar';

/** The toolbar (and the windows that hang off it) shows while the game is in front, in edit mode, pinned, or forced on; a forced "hide" wins. */
function isToolbarShown(snap: OverlaySnapshot): boolean {
  if (snap.overlayMode === 'hide') return snap.editMode;
  return snap.gameFocused || snap.editMode || snap.pinned || snap.overlayMode === 'show';
}

export function App() {
  const [snap, setSnap] = useState<OverlaySnapshot | null>(null);
  const [detail, setDetail] = useState<{ name: string; source: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<'boss' | 'pvp'>('boss');
  /** The History button of the DPS window: opens the tab of the mode you are in (PvP while a player fight is on, otherwise bosses). */
  const openHistory = (tab: 'boss' | 'pvp') => {
    if (historyOpen && historyTab === tab) {
      setHistoryOpen(false);
      return;
    }
    setHistoryTab(tab);
    setHistoryOpen(true);
  };
  const [petsOpen, setPetsOpen] = useState(false);
  const [mapPet, setMapPet] = useState<{ id: number; name: string } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const colors = snap?.settings.colors;
  useEffect(() => {
    // custom colours become CSS variables on the page root (class bars, your row, the "JA" tag)
    if (!colors) return;
    const root = document.documentElement.style;
    for (const c of CLASS_NAMES) {
      const v = colors.classes[c];
      if (v) root.setProperty(`--color-cls-${c}`, v);
      else root.removeProperty(`--color-cls-${c}`);
    }
    if (colors.self) root.setProperty('--self-bar', colors.self);
    else root.removeProperty('--self-bar');
    root.setProperty('--self-tag-bg', colors.tagBg);
    root.setProperty('--self-tag-text', colors.tagText);
  }, [colors]);
  const rootRef = useRef<HTMLElement>(null);
  const bgOpacity = snap?.settings.opacity;
  useEffect(() => {
    // the opacity setting is the panels' background opacity; text and icons stay fully visible
    if (bgOpacity !== undefined) rootRef.current?.style.setProperty('--bg-alpha', String(bgOpacity));
  }, [bgOpacity]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const anyWindowOpen = settingsOpen || historyOpen || detail !== null || petsOpen || mapOpen;
  useEffect(() => {
    window.overlay.setWindowsOpen(anyWindowOpen);
  }, [anyWindowOpen]);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  useEffect(() => window.overlay.onSnapshot(setSnap), []);
  // Text boxes (rename, game title) need real keyboard focus; the overlay window is not focusable otherwise.
  useEffect(() => {
    const isText = (t: EventTarget | null): boolean => t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && (t.type === 'text' || t.type === 'search'));
    const focusIn = (e: FocusEvent): void => {
      if (isText(e.target)) window.overlay.setTextInput(true);
    };
    const focusOut = (e: FocusEvent): void => {
      if (isText(e.target)) window.overlay.setTextInput(false);
    };
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    return () => {
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
    };
  }, []);
  const lastRects = useRef('');
  // Tell the main process which rectangles should catch clicks. Panels count only while the
  // overlay is visible (hidden panels must not eat clicks); the toolbar while it is shown.
  useLayoutEffect(() => {
    if (!snap) return;
    const toolbarShown = isToolbarShown(snap);
    const rects = [...document.querySelectorAll<HTMLElement>('[data-hit]')]
      .filter((el) => (el.dataset.hit === 'toolbar' || el.dataset.hit === 'history' || el.dataset.hit === 'players' || el.dataset.hit === 'detail' || el.dataset.hit === 'settings' || el.dataset.hit === 'death' || el.dataset.hit === 'pets' || el.dataset.hit === 'petmap' || el.dataset.hit === 'update' || el.dataset.hit === 'panel-pinned' ? toolbarShown : snap.visible))
      .map((el) => el.getBoundingClientRect())
      .map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }));
    const key = JSON.stringify(rects);
    if (key !== lastRects.current) {
      lastRects.current = key;
      window.overlay.setHitRects(rects);
    }
  });

  if (!snap) return null;

  // Panels follow auto-hide (cursor/menus); the toolbar shows whenever the game is in front.
  const toolbarShown = isToolbarShown(snap);

  return (
    <div className="relative h-full">
      <ClassIconSetContext.Provider value={snap.settings.classIcons}>
      <ViewContext.Provider value={{ visible: snap.visible, shown: toolbarShown, opacity: snap.settings.opacity }}>
      <main ref={rootRef} className="overlay-root relative h-full">
        <h1 className="sr-only">Aion Assist</h1>
        <DailyPanel snap={snap} />
        <MeterPanel snap={snap} onDetail={(name, source) => setDetail({ name, source })} onHistory={openHistory} historyOpen={historyOpen} />
        <TargetPanel snap={snap} />
        <PetsPanel
          snap={snap}
          onFinder={() => setPetsOpen(true)}
          onMap={(pet) => {
            setPetsOpen(true);
            setMapOpen(true);
            setMapPet(pet);
          }}
        />
      </main>
      {/* Windows opened by the user stay until closed: they do not follow the cursor auto-hide */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: toolbarShown ? 1 : 0 }}>
        <div className="pointer-events-auto contents">
          {snap.death && <DeathPopup death={snap.death} />}
          <UpdateBanner update={snap.update} variant="popup" anchor={snap.settings.toolbar} />
          {petsOpen && (
            <div className="absolute left-1/2 top-[64px] z-20 flex -translate-x-1/2 items-start gap-3">
              <PetFinderWindow
                onClose={() => {
                  setPetsOpen(false);
                  setMapOpen(false);
                  setMapPet(null);
                }}
                onMap={(pet) => {
                  setMapOpen(true);
                  setMapPet(pet);
                }}
              />
              {mapOpen && (
                <PetMapWindow
                  pet={mapPet}
                  onPick={setMapPet}
                  onClose={() => {
                    setMapOpen(false);
                    setMapPet(null);
                  }}
                />
              )}
            </div>
          )}
          {settingsOpen && <SettingsWindow snap={snap} onClose={() => setSettingsOpen(false)} />}
          {(historyOpen || detail) && (
            <div className="absolute left-1/2 top-[64px] z-20 flex -translate-x-1/2 items-start gap-3">
              {historyOpen && (
                <HistoryWindow
                  tab={historyTab}
                  onTab={setHistoryTab}
                  onClose={() => {
                    setHistoryOpen(false);
                    setEncounterId(null);
                    setDetail((d) => (d?.source.startsWith('live') ? d : null));
                  }}
                  selectedId={encounterId}
                  onDeselect={() => {
                    setEncounterId(null);
                    setDetail((d) => (d?.source.startsWith('live') ? d : null));
                  }}
                  onSelect={(id) => {
                    setEncounterId(id);
                    setDetail(null);
                  }}
                />
              )}
              {historyOpen && encounterId && (
                <PlayersWindow
                  id={encounterId}
                  activeName={detail?.source === encounterId ? detail.name : null}
                  onDetail={(name, source) => setDetail({ name, source })}
                  onClose={() => {
                    setEncounterId(null);
                    setDetail((d) => (d?.source.startsWith('live') ? d : null));
                  }}
                />
              )}
              {detail && <DetailWindow name={detail.name} source={detail.source} onClose={() => setDetail(null)} />}
            </div>
          )}
        </div>
      </div>
      <Toolbar
        snap={snap}
        shown={toolbarShown}
        historyOpen={historyOpen}
        onHistory={() => setHistoryOpen((v) => !v)}
        settingsOpen={settingsOpen}
        onSettings={() => setSettingsOpen((v) => !v)}
      />
      </ViewContext.Provider>
      </ClassIconSetContext.Provider>
    </div>
  );
}
