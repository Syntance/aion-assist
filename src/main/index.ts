import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray, utilityProcess } from 'electron';
import { DemoSource, demoLookup } from '@core/demo';
import { buildDetail, Engine, isWorldNpc } from '@core/engine/engine';
import type { CaptureToMain, MainToCapture } from '@shared/captureMessages';
import { IPC } from '@shared/ipc';
import {
  hitRectsSchema,
  kdaActionSchema,
  nameKindSchema,
  overlayModeSchema,
  panelPatchSchema,
  settingsPatchSchema,
  type CaptureStatus,
  type HistoryData,
  type NamesData,
  type OverlayMode,
  type OverlaySnapshot,
  type PlayerDetail,
} from '@shared/types';
import { PetBook } from '@core/pets/petBook';
import { Updater } from './updater';
import { Armory } from './armory';
import { NpcCatalog } from './catalog';
import { importCatalogFromAbyss } from './catalogImport';
import { FpsMeter } from './fps';
import { HistoryStore, NamesStore } from './history';
import { loadPetStore, savePetStore } from './petStore';
import { readPetTrackerProfiles } from './petTrackerImport';
import { readContext, readIdentity, readOpcodeOverrides, Store, writeContext, writeIdentity } from './store';
import { acceleratorLabel } from '@shared/keys';
import { onlySent } from '@shared/patch';
import { getCursorState, getForegroundWindow } from './win32';

const POLL_MS = 150;
const SNAPSHOT_MS = 250;
const SAVE_MS = 5_000;
const SELF_REFRESH_MS = 10 * 60_000;

/** Tried in order; Ctrl+Shift+M is often taken (Discord: toggle mute). */
const HOTKEY_MARK_CANDIDATES = ['Control+Shift+M', 'Control+Alt+M', 'Control+Shift+F9', 'F9'];
const demoMode = process.argv.includes('--demo');
const discoverMode = !demoMode && process.argv.includes('--discover');
const shotPath = process.argv.find((a) => a.startsWith('--shot='))?.slice('--shot='.length) ?? null;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
/** Set by main(): what happens when the user starts a second copy (the running one speaks up). */
let announceRunning: (() => void) | null = null;
let editMode = false;
let pinned = demoMode || shotPath !== null;
let visible = false;
/** Manual override from the control window: the overlay sometimes drops out (e.g. while AFK). */
let overlayMode: OverlayMode = 'auto';
/** The game window is in the foreground: the toolbar shows even while menus are open. */
let gameFocused = false;
/** A text box in the overlay has focus (renaming, game title): the window is focusable meanwhile. */
let textInput = false;
/** Always false now: the game blocks outside key-state reads, so a "hold a key" mode cannot work (the pin hotkey replaces it). */
const altMode = false;
/** Rectangles (window DIP coords) that catch clicks; the rest of the window is click-through. */
let hitRects: { x: number; y: number; w: number; h: number }[] = [];
/** A drag is running: keep the mouse captured even outside the rectangles. */
let forceCapture = false;
let capturing = false;
const HIT_POLL_MS = 30;
let capture: CaptureStatus = { state: demoMode ? 'demo' : 'starting', detail: null, port: null };
/** Discovery mode: the marker hotkey that actually registered, shown on the overlay. */
let markHint: string | null = null;

/** False in a second copy of the app: it must exit without touching hotkeys, files or capture. */
const primaryInstance = app.requestSingleInstanceLock();
let markCount = 0;
const discoveryHint = (): string => `Odkrywanie · znacznik: ${markHint ?? 'BRAK SKRÓTU'} · ${markCount}×`;

function main(): void {
  // Makes the running app belong to the pinned taskbar icon / shortcut (the installer uses the same id).
  app.setAppUserModelId('app.aionassist.overlay');
  const store = new Store(app.getPath('userData'), !demoMode && shotPath === null);
  const settings = () => store.data.settings;
  const armory = new Armory();
  const persistData = !demoMode && shotPath === null;
  const history = new HistoryStore(app.getPath('userData'), persistData);
  const names = new NamesStore(app.getPath('userData'), persistData);
  const petFile = loadPetStore(app.getPath('userData'), persistData);
  const pets = new PetBook({
    store: petFile.data,
    rowLimit: () => settings().petsRows,
    hideMaxed: () => settings().petsHideMaxed,
  });
  /** Copies the collection from the standalone PetTracker app for the current character; returns how many pets were taken. */
  const importPetTracker = (): number => {
    const name = pets.currentCharacter;
    if (!name) return 0;
    const match = readPetTrackerProfiles(process.env.LOCALAPPDATA).find((p) => p.character === name);
    return match ? pets.importPets(match.pets, Date.now()) : 0;
  };
  const updater = new Updater(
    () => push(),
    () => settings().autoUpdate && !demoMode && shotPath === null,
  );
  const fpsMeter = new FpsMeter();
  /** Starts or stops the frame tracing to follow the setting (it only runs while the FPS option is on). */
  const syncFps = (): void => {
    if (demoMode || shotPath !== null) return;
    if (settings().showFps) fpsMeter.start();
    else if (fpsMeter.state !== 'off') fpsMeter.stop();
  };
  syncFps();
  const catalog = new NpcCatalog(app.getPath('userData'));
  /** A name you typed wins over the catalog's. */
  const npcName = (code: number): string | null => names.get().npcs[String(code)] ?? catalog.npc(code)?.name ?? null;

  const knownDungeon = (mapId: number): boolean | null => (catalog.size === 0 ? null : catalog.dungeon(mapId) !== null);
  const fixHistory = (): void => {
    if (catalog.size > 0) history.normalize(isWorldNpc, knownDungeon);
  };
  fixHistory();

  const engine: Engine = new Engine({
    store: store.data,
    knownDungeon,
    fightIdleMs: () => settings().fightIdleSec * 1000,
    bossOnly: () => settings().historyBossOnly,
    npcName,
    npcBoss: (code) => catalog.npc(code)?.boss ?? null,
    onEncounter: (record) => history.add(record),
    showAllies: () => settings().showAllies,
    requestLookup: (name, server) => {
      if (demoMode) {
        setTimeout(() => engine.applyLookup(name, demoLookup(name), Date.now()), 600);
        return true;
      }
      if (!settings().armoryLookup) return false;
      armory.lookup(name, server, settings().region, (outcome) => engine.applyLookup(name, outcome, Date.now()));
      return true;
    },
  });

  // --- overlay window -------------------------------------------------------------

  /**
   * The overlay covers its monitor except for the last pixel row. A topmost window that covers a monitor
   * exactly can make Windows think a full-screen app is running (it then hides the taskbar and stops
   * notifications); one pixel short, it never does.
   */
  const overlayBounds = (b: Electron.Rectangle): Electron.Rectangle => ({ x: b.x, y: b.y, width: b.width, height: b.height - 1 });
  const display = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    ...overlayBounds(display.bounds),
    title: 'Aion Assist',
    transparent: !shotPath,
    backgroundColor: shotPath ? '#27313a' : '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.once('ready-to-show', () => win?.showInactive());

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));

  // --- app window (taskbar) -------------------------------------------------------
  // The overlay itself is a transparent click-through window with no taskbar button, so nothing would show
  // the app is running. This ordinary window has one, holds the settings, and closing it only minimizes it.
  let quitting = false;
  let controlWin: BrowserWindow | null = null;
  if (!demoMode && shotPath === null) {
    controlWin = new BrowserWindow({
      width: 900,
      height: 640,
      minWidth: 720,
      minHeight: 520,
      title: 'Aion Assist',
      backgroundColor: '#141d27',
      autoHideMenuBar: true,
      show: false,
      webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    controlWin.removeMenu();
    controlWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    controlWin.webContents.on('will-navigate', (e) => e.preventDefault());
    controlWin.once('ready-to-show', () => controlWin?.show());
    controlWin.on('close', (e) => {
      if (quitting) return;
      e.preventDefault();
      controlWin?.minimize();
    });
    if (!app.isPackaged && devUrl) void controlWin.loadURL(`${devUrl}?control=1`);
    else void controlWin.loadFile(join(__dirname, '../renderer/index.html'), { query: { control: '1' } });
    app.on('before-quit', () => {
      quitting = true;
    });
  }
  const showControlWindow = (): void => {
    if (!controlWin || controlWin.isDestroyed()) return;
    if (controlWin.isMinimized()) controlWin.restore();
    controlWin.show();
    controlWin.focus();
  };

  // --- snapshot -------------------------------------------------------------------

  function snapshot(): OverlaySnapshot {
    const now = Date.now();
    return {
      visible,
      editMode,
      gameFocused,
      altMode,
      overlayMode,
      death: engine.deathSnapshot(now),
      pets: pets.snapshot(now, settings().petsMode),
      update: updater.snapshot,
      hotkeyConflicts,
      ping: engine.pingSnapshot(now),
      fps: demoMode ? { value: 96 + Math.round(Math.sin(now / 1500) * 6), state: 'running' } : { value: fpsMeter.value(now), state: fpsMeter.state },
      pinned,
      capture,
      self: engine.selfSnapshot(),
      meter: engine.meterSnapshot(now),
      pvp: engine.pvpSnapshot(now),
      target: engine.targetSnapshot(),
      // Off (default): the scan does not run at all, including the profile lookups it triggers for strangers.
      nearby: settings().scanNearby ? engine.nearbySnapshot(now) : [],
      lobby: engine.lobbySnapshot(),
      daily: engine.dailySnapshot(now),
      settings: settings(),
    };
  }
  const push = (): void => {
    const snap = snapshot();
    if (win && !win.isDestroyed()) win.webContents.send(IPC.snapshot, snap);
    if (controlWin && !controlWin.isDestroyed() && !controlWin.isMinimized()) controlWin.webContents.send(IPC.snapshot, snap);
  };

  // --- auto-hide ------------------------------------------------------------------

  function followGameWindow(rect: { left: number; top: number; right: number; bottom: number }): void {
    if (!win) return;
    const center = screen.screenToDipPoint({
      x: Math.round((rect.left + rect.right) / 2),
      y: Math.round((rect.top + rect.bottom) / 2),
    });
    const target = overlayBounds(screen.getDisplayNearestPoint(center).bounds);
    const current = win.getBounds();
    if (current.x !== target.x || current.y !== target.y || current.width !== target.width || current.height !== target.height) {
      win.setBounds(target);
    }
  }

  function poll(): void {
    const fg = getForegroundWindow();
    const focused = textInput || (fg !== null && fg.title.toLowerCase().includes(settings().gameTitle.toLowerCase()));
    if (focused && !textInput && fg?.rect && !editMode && !pinned) followGameWindow(fg.rect);
    if (focused && !textInput && fg?.pid != null) fpsMeter.setPid(fg.pid);
    let next = editMode || pinned;
    if (!next && focused) next = !(settings().hideOnCursor && getCursorState().visible);
    if (overlayMode === 'show') next = true;
    else if (overlayMode === 'hide' && !editMode) next = false;
    if (focused !== gameFocused) {
      gameFocused = focused;
      push();
    }
    if (next !== visible) {
      visible = next;
      push();
    }
  }

  /**
   * Click-through hit test done here instead of relying on mouse-move forwarding (unreliable
   * on transparent windows): the window catches the mouse only while the cursor is over a
   * reported rectangle (panels, toolbar), or during a drag.
   */
  function hitTest(): void {
    if (!win || win.isDestroyed()) return;
    if (editMode) return; // edit mode catches everything
    let over = forceCapture;
    if (!over && gameFocused) {
      const cur = getCursorState();
      // only meaningful while a cursor exists: Alt held or a menu open
      if (cur.visible || altMode) {
        const dip = screen.screenToDipPoint({ x: cur.x, y: cur.y });
        const b = win.getBounds();
        const x = dip.x - b.x;
        const y = dip.y - b.y;
        over = hitRects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      }
    }
    if (over !== capturing) {
      capturing = over;
      win.setIgnoreMouseEvents(!over, { forward: true });
    }
  }

  function setEditMode(on: boolean): void {
    if (!win || editMode === on) return;
    editMode = on;
    if (on) {
      win.setIgnoreMouseEvents(false);
      win.setFocusable(true);
      win.focus();
    } else {
      win.setIgnoreMouseEvents(true, { forward: true });
      capturing = false;
      win.setFocusable(false);
      win.blur();
      store.save();
    }
    poll();
    push();
    refreshTray();
  }

  function setPinned(on: boolean): void {
    pinned = on;
    poll();
    push();
    refreshTray();
  }

  // Launching the app again while it runs: a notification from the tray icon, and for a few seconds the
  // windows are shown even if the game is not in front, so it is plain that the app is alive.
  announceRunning = () => {
    if (controlWin && !controlWin.isDestroyed()) {
      showControlWindow();
      return;
    }
    tray?.displayBalloon({ title: 'Aion Assist już działa', content: 'Okna pojawiają się, gdy gra jest na wierzchu.' });
    if (!pinned) {
      setPinned(true);
      setTimeout(() => setPinned(false), 8000);
    }
  };
  ipcMain.on(IPC.quitApp, () => app.quit());
  ipcMain.handle(IPC.importPetTracker, () => {
    const n = importPetTracker();
    push();
    return n;
  });
  ipcMain.on(IPC.checkUpdate, () => void updater.check(true));
  ipcMain.on(IPC.installUpdate, () => updater.install());
  ipcMain.handle(IPC.getPets, () => pets.all(Date.now()));
  ipcMain.on(IPC.togglePetPin, (_e, id: unknown) => {
    if (typeof id !== 'number' || !Number.isInteger(id)) return;
    pets.togglePin(id);
    push();
  });
  ipcMain.on(IPC.resetPetSession, () => {
    pets.newSession();
    push();
  });
  ipcMain.on(IPC.dismissDeath, () => {
    engine.dismissDeath();
    push();
  });
  ipcMain.on(IPC.adjustKda, (_e, rawName: unknown, rawAction: unknown) => {
    const action = kdaActionSchema.safeParse(rawAction);
    if (!action.success || typeof rawName !== 'string' || rawName.length === 0 || rawName.length > 64) return;
    engine.manualKda(rawName, action.data, Date.now());
    push();
  });
  ipcMain.on(IPC.setOverlayMode, (_e, mode: unknown) => {
    const parsed = overlayModeSchema.safeParse(mode);
    if (!parsed.success) return;
    overlayMode = parsed.data;
    if (overlayMode === 'show' && win && !win.isDestroyed()) {
      win.showInactive();
      win.moveTop();
    }
    poll();
    push();
  });

  // --- tray -----------------------------------------------------------------------

  function trayIcon(): Electron.NativeImage {
    const size = 16;
    const pixels = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.abs(x - 7.5) + Math.abs(y - 7.5); // diamond
        const i = (y * size + x) * 4;
        if (d <= 7) pixels.set(d <= 4 ? [0xf2, 0xe6, 0xd8, 0xff] : [0xd6, 0x8a, 0x4a, 0xff], i); // BGRA
      }
    }
    return nativeImage.createFromBitmap(pixels, { width: size, height: size });
  }

  function refreshTray(): void {
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Otwórz okno aplikacji (ustawienia)', click: () => showControlWindow() },
        { type: 'separator' },
        { label: `Tryb edycji (${acceleratorLabel(settings().hotkeys.edit)})`, type: 'checkbox', checked: editMode, click: () => setEditMode(!editMode) },
        { label: `Zawsze widoczna (${acceleratorLabel(settings().hotkeys.pin)})`, type: 'checkbox', checked: pinned, click: () => setPinned(!pinned) },
        { type: 'separator' },
        { label: 'Wyzeruj licznik DPS', click: () => engine.resetMeter() },
        { label: 'Wyzeruj sesję PvP', click: () => engine.resetPvp() },
        { type: 'separator' },
        { label: 'Zakończ', click: () => app.quit() },
      ]),
    );
  }
  tray = new Tray(trayIcon());
  tray.setToolTip('Aion Assist');
  refreshTray();

  // Global shortcuts are re-registered whenever the settings change; ones the OS refuses
  // (already taken by another app) are reported to the settings window.
  let hotkeyConflicts: ('pin' | 'edit')[] = [];
  let activeHotkeys: string[] = [];
  let registeredHotkeys = '';
  function registerHotkeys(): void {
    const { pin, edit } = settings().hotkeys;
    const wanted = `${pin}|${edit}`;
    if (wanted === registeredHotkeys) return;
    registeredHotkeys = wanted;
    for (const accelerator of activeHotkeys) globalShortcut.unregister(accelerator);
    activeHotkeys = [];
    hotkeyConflicts = [];
    const bind = (id: 'pin' | 'edit', accelerator: string, action: () => void): void => {
      if (activeHotkeys.includes(accelerator) || !globalShortcut.register(accelerator, action)) hotkeyConflicts.push(id);
      else activeHotkeys.push(accelerator);
    };
    bind('edit', edit, () => setEditMode(!editMode));
    bind('pin', pin, () => setPinned(!pinned));
    refreshTray();
    push();
  }
  registerHotkeys();

  // --- IPC (renderer -> main), validated ------------------------------------------

  ipcMain.on(IPC.ready, push);
  ipcMain.on(IPC.updateSettings, (_e, raw: unknown) => {
    const patch = settingsPatchSchema.safeParse(raw);
    if (!patch.success) return;
    Object.assign(store.data.settings, onlySent(patch.data, raw));
    registerHotkeys();
    syncFps();
    push();
  });
  ipcMain.on(IPC.updatePanel, (_e, raw: unknown) => {
    const patch = panelPatchSchema.safeParse(raw);
    if (!patch.success) return;
    const sentLayout = typeof raw === 'object' && raw !== null && 'layout' in raw ? raw.layout : undefined;
    Object.assign(store.data.settings.panels[patch.data.id], onlySent(patch.data.layout, sentLayout));
    push();
  });
  ipcMain.on(IPC.resetMeter, () => engine.resetMeter());
  ipcMain.on(IPC.resetPvp, () => engine.resetPvp());
  ipcMain.on(IPC.exitEdit, () => setEditMode(false));
  // Rectangles that catch clicks (reported by the renderer) and drag capture
  ipcMain.on(IPC.hitRects, (_e, raw: unknown) => {
    const parsed = hitRectsSchema.safeParse(raw);
    if (parsed.success) hitRects = parsed.data;
  });
  ipcMain.on(IPC.mouseCapture, (_e, raw: unknown) => {
    if (typeof raw === 'boolean') forceCapture = raw;
  });
  ipcMain.on(IPC.toggleEdit, () => setEditMode(!editMode));

  // --- history, detail and names (request / response) ------------------------------
  const resolveSkills = (detail: PlayerDetail): PlayerDetail => ({
    ...detail,
    skills: detail.skills.map((sk) => ({ ...sk, name: names.get().skills[String(sk.skill)] ?? null })),
  });
  const wantSkillNames = (detail: PlayerDetail): void => {
    if (!settings().armoryLookup || demoMode) return;
    if (!detail.skills.some((sk) => sk.name === null)) return;
    const card = engine.cardFor(detail.name);
    armory.skills(detail.name, card?.server ?? null, settings().region, (found) => {
      names.merge('skills', found);
      push();
    });
  };
  ipcMain.handle(IPC.detail, (_e, rawName: unknown, rawSource: unknown): PlayerDetail | null => {
    if (typeof rawName !== 'string' || typeof rawSource !== 'string' || rawName.length > 64 || rawSource.length > 64) return null;
    let detail: PlayerDetail | null = null;
    if (rawSource === 'live') {
      detail = engine.liveDetail(rawName, Date.now());
    } else if (rawSource === 'livepvp') {
      detail = engine.livePvpDetail(rawName, Date.now());
    } else {
      const rec = history.encounter(rawSource);
      const row = rec?.rows.find((r) => r.name === rawName);
      if (rec && row) {
        const boss = rec.kind === 'pvp' ? 'PvP' : rec.npcCode !== null ? (npcName(rec.npcCode) ?? `NPC #${rec.npcCode}`) : 'Walka';
        detail = buildDetail(row, rec.durationMs, boss);
      }
    }
    if (!detail) return null;
    wantSkillNames(detail);
    return resolveSkills(detail);
  });
  ipcMain.handle(IPC.history, () => {
    // Names for just the codes in the history: yours first, then the catalog's (it is far too big to send whole).
    const base = names.get();
    const merged: NamesData = { ...base, npcs: { ...base.npcs }, maps: { ...base.maps }, dungeons: { ...base.dungeons } };
    const daily: HistoryData['daily'] = {};
    for (const [date, d] of Object.entries(store.data.daily)) {
      daily[date] = { kills: d.kills, deaths: d.deaths, assists: d.assists, ap: d.apStart !== null && d.apLast !== null ? d.apBanked + d.apLast - d.apStart : null };
    }
    const data = history.data(merged, daily, [...(store.data.killLog ?? [])].reverse(), store.data.rivals);
    const bossCodes = new Set<number>();
    for (const run of data.runs) {
      for (const enc of run.encounters) if (enc.npcCode !== null) bossCodes.add(enc.npcCode);
      if (run.dungeonId === null && catalog.size > 0) {
        run.world = true;
        run.tag = 'Open World';
      }
      const dungeon = run.dungeonId !== null ? catalog.dungeon(run.dungeonId) : null;
      if (dungeon) {
        run.tag = [dungeon.category, dungeon.tier].filter(Boolean).join(' · ');
        if (run.dungeonId !== null && merged.dungeons[String(run.dungeonId)] === undefined) merged.dungeons[String(run.dungeonId)] = dungeon.name;
      }
    }
    for (const code of bossCodes) {
      const name = npcName(code);
      if (name) merged.npcs[String(code)] = name;
    }
    return data;
  });
  ipcMain.handle(IPC.encounter, (_e, rawId: unknown) => (typeof rawId === 'string' && rawId.length < 64 ? history.encounter(rawId) : null));
  // A text box in the overlay (rename, game title) needs keystrokes: make the window focusable while
  // it has focus, and keep treating the game as focused meanwhile (our own window is then in front).
  ipcMain.on(IPC.textInput, (_e, on: unknown) => {
    const next = on === true;
    if (next === textInput || !win) return;
    textInput = next;
    if (next) {
      win.setFocusable(true);
      win.focus();
    } else if (!editMode) {
      win.setFocusable(false);
      win.blur();
    }
    poll();
    push();
  });
  ipcMain.handle(IPC.importCatalog, () => {
    const result = importCatalogFromAbyss(app.getPath('userData'));
    if (result.ok) {
      catalog.reload();
      fixHistory();
      push();
    }
    return result;
  });
  ipcMain.on(IPC.deleteHistory, (_e, rawKind: unknown, rawId: unknown) => {
    if ((rawKind !== 'run' && rawKind !== 'encounter' && rawKind !== 'pvpday') || typeof rawId !== 'string' || rawId.length > 64) return;
    if (rawKind === 'run') history.deleteRun(rawId);
    else if (rawKind === 'pvpday') history.deletePvpDay(rawId);
    else history.deleteEncounter(rawId);
  });
  ipcMain.on(IPC.setName, (_e, rawKind: unknown, rawKey: unknown, rawName: unknown) => {
    const kind = nameKindSchema.safeParse(rawKind);
    if (!kind.success || typeof rawKey !== 'string' || typeof rawName !== 'string' || rawKey.length > 24) return;
    names.set(kind.data, rawKey, rawName);
  });
  ipcMain.on(IPC.setPinned, (_e, raw: unknown) => {
    if (typeof raw === 'boolean') setPinned(raw);
  });

  // --- event sources --------------------------------------------------------------

  if (demoMode) {
    const demo = new DemoSource();
    setInterval(() => {
      const now = Date.now();
      for (const event of demo.step()) engine.apply(event, now);
    }, 200);
  } else {
    const child = utilityProcess.fork(join(__dirname, 'capture.js'), [], { serviceName: 'Aion Assist capture' });
    const discoveryLog = join(app.getPath('userData'), 'discovery-log.txt');
    const userData = app.getPath('userData');
    let currentFlow: string | null = null;
    let contextRestored = false;
    setInterval(() => {
      if (!currentFlow || !engine.contextDirty) return;
      engine.contextDirty = false;
      writeContext(userData, { flow: currentFlow, ...engine.exportContext() });
    }, 3000);
    const diag = {
      damage: 0,
      ownDamage: 0,
      selfIdHint: (): number | null => {
        const m = /selfId=(\d+)/.exec(engine.debugState(Date.now()));
        return m ? Number(m[1]) : null;
      },
    };
    if (discoverMode) {
      setInterval(() => {
        const stamp = new Date().toTimeString().slice(0, 8);
        const line = `${stamp} ENGINE ${engine.debugState(Date.now())} damageEvents=${diag.damage} ownDamageEvents=${diag.ownDamage} flow=${currentFlow ?? '-'}`;
        appendFileSync(discoveryLog, `${line}\n`, 'utf8');
      }, 10_000);
    }
    child.on('message', (message: CaptureToMain) => {
      if (message.type === 'discovery') {
        appendFileSync(discoveryLog, `${message.lines.join('\n')}\n`, 'utf8');
        return;
      }
      if (message.type === 'status') {
        currentFlow = message.flow ?? null;
        // same game connection as when the character was last announced: restore it
        const saved = currentFlow ? readIdentity(userData) : null;
        if (saved && saved.flow === currentFlow && engine.selfCharacter === null) {
          const { flow: _flow, ...rest } = saved;
          void _flow;
          engine.apply({ t: 'self', ...rest }, Date.now());
          pets.apply({ t: 'self', ...rest }, Date.now());
        }
        // same connection: also restore who was in the zone and the party (lost on a restart)
        const ctx = currentFlow && !contextRestored ? readContext(userData) : null;
        if (currentFlow) contextRestored = true;
        if (ctx && ctx.flow === currentFlow) {
          const { flow: _f, ...rest } = ctx;
          void _f;
          engine.restoreContext(rest, Date.now());
        }
        const hint = discoverMode && message.state === 'locked' ? discoveryHint() : null;
        capture = { state: message.state, detail: message.detail ?? hint, port: message.port };
        push();
        return;
      }
      const now = Date.now();
      for (const event of message.events) {
        if (event.t === 'damage') {
          diag.damage++;
          if (event.actor === diag.selfIdHint()) diag.ownDamage++;
        }
        engine.apply(event, now);
        pets.apply(event, now);
        if (event.t === 'self' && event.name && !pets.hasCollection()) importPetTracker(); // first run: take what PetTracker already knows
        if (event.t === 'self' && event.name && currentFlow) {
          writeIdentity(userData, {
            flow: currentFlow,
            id: event.id,
            name: event.name,
            server: event.server,
            classCode: event.classCode,
            level: event.level,
            ...(event.gearScore !== undefined ? { gearScore: event.gearScore } : {}),
          });
        }
      }
    });
    child.on('exit', (code) => {
      capture = { state: 'error', detail: `Proces nasłuchu zakończył się (kod ${code}). Czy Npcap jest zainstalowany?`, port: null };
      push();
    });
    const init: MainToCapture = {
      type: 'init',
      opcodes: readOpcodeOverrides(app.getPath('userData')),
      discover: discoverMode,
      // the last known character name, so discovery can find every packet that carries it
      watchNames: discoverMode ? [readIdentity(app.getPath('userData'))?.name].filter((n): n is string => !!n) : [],
      rawTcpPath: discoverMode ? join(app.getPath('userData'), 'raw_tcp_ours.log') : null,
    };
    child.once('spawn', () => child.postMessage(init));
    if (discoverMode) {
      writeFileSync(discoveryLog, `# Aion Assist discovery ${new Date().toISOString()}\n`, 'utf8');
      const mark: MainToCapture = { type: 'mark' };
      const registered: string[] = [];
      const failed: string[] = [];
      for (const accelerator of HOTKEY_MARK_CANDIDATES) {
        const ok = globalShortcut.register(accelerator, () => {
          child.postMessage(mark);
          markCount++;
          // visible feedback that the key press actually reached the app
          if (capture.state === 'locked') capture = { ...capture, detail: discoveryHint() };
          push();
        });
        (ok ? registered : failed).push(accelerator);
      }
      const summary = `HOTKEYS ok=[${registered.join(', ')}] zajęte=[${failed.join(', ')}]`;
      appendFileSync(discoveryLog, `${summary}\n`, 'utf8');
      console.warn(`[discover] log: ${discoveryLog}\n[discover] ${summary}`);
      markHint = registered[0]?.replaceAll('Control', 'Ctrl') ?? null;
    }
    app.on('before-quit', () => child.kill());

    // keep own Abyss rank / ranking points fresh for the daily counter
    setInterval(() => {
      const self = engine.selfCharacter;
      if (!self || !settings().armoryLookup) return;
      armory.lookup(self.name, self.server, settings().region, (outcome) => engine.applyLookup(self.name, outcome, Date.now()), true);
    }, SELF_REFRESH_MS);
  }

  setInterval(() => engine.pollHistory(Date.now()), 1000);
  setInterval(() => {
    history.save();
    names.save();
  }, 3000);
  setInterval(poll, POLL_MS);
  setInterval(hitTest, HIT_POLL_MS);
  setInterval(push, SNAPSHOT_MS);
  setInterval(() => {
    if (pets.dirty) {
      pets.dirty = false;
      savePetStore(petFile.file, petFile.data);
    }
    if (!engine.dirty) return;
    engine.dirty = false;
    store.save();
  }, SAVE_MS);

  updater.start();
  app.on('will-quit', () => {
    engine.pollHistory(Date.now() + 3_600_000); // archive a fight still on the screen
    history.save();
    names.save();
    if (pets.dirty) savePetStore(petFile.file, petFile.data);
    fpsMeter.stop();
    globalShortcut.unregisterAll();
    store.save();
  });
  app.on('window-all-closed', () => app.quit());

  if (shotPath) {
    setTimeout(() => {
      void win?.webContents.capturePage().then((image) => {
        writeFileSync(shotPath, image.toPNG());
        app.quit();
      });
    }, 9_000);
  }
}

/** Appends an error to crash.log in the user-data folder (a second copy of the app, or a failed start, must leave a trace). */
function logCrash(where: string, err: unknown): void {
  const text = err instanceof Error ? `${err.stack ?? err.message}` : String(err);
  try {
    appendFileSync(join(app.getPath('userData'), 'crash.log'), `${new Date().toISOString()} [${where}] ${text}\n`, 'utf8');
  } catch {
    /* nowhere to write */
  }
}

// An error in one timer or handler must not take the whole overlay down (or leave it half-alive and invisible).
process.on('uncaughtException', (err) => logCrash('uncaughtException', err));
process.on('unhandledRejection', (err) => logCrash('unhandledRejection', err));

if (primaryInstance) {
  // Starting the app again while it already runs: say so, instead of exiting without a word.
  app.on('second-instance', () => announceRunning?.());
  app
    .whenReady()
    .then(main)
    .catch((err: unknown) => {
      // A start that fails must be visible and must end the process: otherwise it lingers with no window, and
      // every later launch quits at once because "the app is already running".
      logCrash('start', err);
      dialog.showErrorBox('Aion Assist nie uruchomił się', `${err instanceof Error ? err.message : String(err)}\n\nSzczegóły: ${join(app.getPath('userData'), 'crash.log')}`);
      app.exit(1);
    });
} else {
  app.quit();
}
