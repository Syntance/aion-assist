import { z } from 'zod';
import type { PetRow, PetsSnapshot } from './pets';
import { DEFAULT_HOTKEYS, isValidAccelerator } from './keys';

export const CLASS_NAMES = [
  'gladiator',
  'templar',
  'ranger',
  'assassin',
  'spiritmaster',
  'sorcerer',
  'cleric',
  'chanter',
] as const;
export type ClassName = (typeof CLASS_NAMES)[number];
export type Faction = 'elyos' | 'asmodian';

/**
 * Class code as sent in identity / roster packets. Assumed to share the official
 * site's `pcId` numbering (5-8 Gladiator ... 33-36 Chanter); unknown codes yield null.
 */
export function classFromCode(code: number | null | undefined): ClassName | null {
  if (code == null || code < 5 || code > 36) return null;
  return CLASS_NAMES[Math.floor((code - 5) / 4)] ?? null;
}

/** Server ids are <faction><region><slot>: 1xxx Elyos, 2xxx Asmodian. */
export function factionFromServer(server: number | null | undefined): Faction | null {
  if (server == null) return null;
  if (server >= 1000 && server <= 1999) return 'elyos';
  if (server >= 2000 && server <= 2999) return 'asmodian';
  return null;
}

/** The built-in colours of the class bars (hex versions of the CSS tokens), the colour of the "JA" tag and its text. */
export const DEFAULT_CLASS_COLORS: Record<ClassName, string> = {
  gladiator: '#d24d42',
  templar: '#4397be',
  ranger: '#40a35c',
  assassin: '#8951bf',
  spiritmaster: '#00a29f',
  sorcerer: '#367ad1',
  cleric: '#c0a241',
  chanter: '#db7d24',
};
export const DEFAULT_TAG_BG = '#f269cb';
export const DEFAULT_TAG_TEXT = '#2a0a1d';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const colorsSchema = z.object({
  /** Bar colour per class; a class missing here keeps the built-in one. */
  classes: z.partialRecord(z.enum(CLASS_NAMES), hexColor).default({}),
  /** Bar colour of your own row; null = your class colour. */
  self: hexColor.nullable().default(null),
  /** The "JA" tag next to your name. */
  tagBg: hexColor.default(DEFAULT_TAG_BG),
  tagText: hexColor.default(DEFAULT_TAG_TEXT),
});
export type ColorSettings = z.infer<typeof colorsSchema>;
export const DEFAULT_COLORS: ColorSettings = { classes: {}, self: null, tagBg: DEFAULT_TAG_BG, tagText: DEFAULT_TAG_TEXT };

export const PANEL_IDS = ['meter', 'pvp', 'target', 'daily', 'pets'] as const;
export type PanelId = (typeof PANEL_IDS)[number];

const panelBase = z.object({
  x: z.number().min(0).max(10_000),
  y: z.number().min(0).max(10_000),
  w: z.number().min(220).max(900),
  /** Zoom of the whole window (1 = normal). */
  scale: z.number().min(0.5).max(2.5),
  /** Fixed height (stretched downward; the list scrolls inside); null = as tall as the content. */
  h: z.number().min(60).max(3000).nullable(),
  visible: z.boolean(),
  pinned: z.boolean(),
});
// Settings files from before pinning lack the field. (The patch schema below is built from the
// base without the default: zod's partial() would otherwise reset `pinned` on every patch.)
const panelSchema = panelBase.extend({
  /** Pinned window ignores the cursor auto-hide: it stays while the game is in front. */
  pinned: z.boolean().default(false),
  scale: z.number().min(0.5).max(2.5).default(1),
  h: z.number().min(60).max(3000).nullable().default(null),
});
export type PanelLayout = z.infer<typeof panelSchema>;

export const settingsSchema = z.object({
  panels: z.object({
    meter: panelSchema,
    pvp: panelSchema,
    target: panelSchema,
    daily: panelSchema,
    // added later: older settings files lack it
    pets: panelSchema.default({ x: 1100, y: 220, w: 300, scale: 1, h: null, visible: true, pinned: false }),
  }),
  opacity: z.number().min(0.05).max(1),
  /** Hide the overlay while the system cursor is visible (in-game menus). */
  hideOnCursor: z.boolean(),
  /** Case-insensitive substring of the game window title. */
  gameTitle: z.string().min(1).max(64),
  /** Look up CP / item level / Abyss rank on the official character page. */
  armoryLookup: z.boolean(),
  region: z.enum(['eu', 'nae', 'naw', 'sa', 'asia']),
  /** Seconds without damage before a fight is closed. */
  fightIdleSec: z.number().min(3).max(120),
  /** Seconds without damage after which the PvP window starts a new fight. */
  pvpIdleSec: z.number().min(5).max(120).default(20),
  /** Show the expedition lobby / party list inside the DPS window (between fights). */
  showLobby: z.boolean().default(true),
  historyBossOnly: z.boolean().default(true),
  /** Pet tracker: which list the pet window shows, how many rows, and whether maxed pets are hidden. */
  petsMode: z.enum(['recent', 'nearby']).default('recent'),
  petsRows: z.number().int().min(1).max(8).default(5),
  petsHideMaxed: z.boolean().default(true),
  /** Look for a newer version on GitHub in the background and download it. */
  autoUpdate: z.boolean().default(true),
  /** Detailed log lines (event counts, timings) in app.log. */
  debugLog: z.boolean().default(false),
  /** The "you died" pop-up (who killed you, K/D buttons) and when it closes: after a respawn, or only by hand. */
  /** Most players listed per side in the DPS / PvP window (0 = no limit): in mass PvP only the top ones show. */
  maxPlayerRows: z.number().int().min(0).max(100).default(10),
  /** Custom colours of the class bars, your row and the "JA" tag. */
  colors: colorsSchema.default(DEFAULT_COLORS),
  /** Which set of class emblems to show: the first (from the class list) or the second (coloured crests). */
  classIcons: z.enum(['game', 'alt']).default('game'),
  deathPopup: z.boolean().default(true),
  deathPopupClose: z.enum(['respawn', 'manual']).default('respawn'),
  /** Record raw game packets to raw_tcp_ours.log (needs a restart; large file, advanced). */
  rawCapture: z.boolean().default(false),
  /** Show the ping (round trip to the game server, from captured TCP acknowledgements) in the DPS window footer. */
  showPing: z.boolean().default(false),
  /** Show the game's FPS beside the ping (Windows event tracing of the game's frames; passive). */
  showFps: z.boolean().default(true),
  /** The current time at the right end of the DPS window's footer. */
  showClock: z.boolean().default(true),
  /** Global shortcuts (work while the game is in front). pin = toolbar pin (everything stays visible), edit = move windows. */
  hotkeys: z
    .object({
      pin: z.string().refine(isValidAccelerator, 'invalid shortcut'),
      edit: z.string().refine(isValidAccelerator, 'invalid shortcut'),
      hideAll: z.string().refine(isValidAccelerator, 'invalid shortcut').default(DEFAULT_HOTKEYS.hideAll),
    })
    .default(DEFAULT_HOTKEYS),
  /** One global shortcut per window that pins / unpins just that window (missing = no shortcut). */
  panelHotkeys: z.partialRecord(z.enum(PANEL_IDS), z.string().refine(isValidAccelerator, 'invalid shortcut')).default({}),
  /** Toolbar position (always-visible settings bar). */
  toolbar: z
    .object({ x: z.number().min(0).max(10_000), y: z.number().min(0).max(10_000) })
    .default({ x: 1100, y: 24 }),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema.omit({ panels: true }).partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const panelPatchSchema = z.object({
  id: z.enum(PANEL_IDS),
  layout: panelBase.partial().strict(),
});
export type PanelPatch = z.infer<typeof panelPatchSchema>;

export const DEFAULT_SETTINGS: Settings = {
  panels: {
    meter: { x: 24, y: 220, w: 360, scale: 1, h: null, visible: true, pinned: false },
    pvp: { x: 24, y: 540, w: 380, scale: 1, h: null, visible: true, pinned: false },
    target: { x: 420, y: 24, w: 300, scale: 1, h: null, visible: true, pinned: false },
    daily: { x: 24, y: 24, w: 260, scale: 1, h: null, visible: true, pinned: false },
    pets: { x: 1100, y: 220, w: 300, scale: 1, h: null, visible: true, pinned: false },
  },
  opacity: 0.94,
  hideOnCursor: true,
  gameTitle: 'AION2',
  armoryLookup: true,
  region: 'eu',
  fightIdleSec: 8,
  pvpIdleSec: 20,
  showLobby: true,
  historyBossOnly: true,
  petsMode: 'recent',
  petsRows: 5,
  petsHideMaxed: true,
  autoUpdate: true,
  debugLog: false,
  maxPlayerRows: 10,
  colors: DEFAULT_COLORS,
  classIcons: 'game',
  deathPopup: true,
  deathPopupClose: 'respawn',
  rawCapture: false,
  showPing: false,
  showFps: true,
  showClock: true,
  hotkeys: DEFAULT_HOTKEYS,
  panelHotkeys: {},
  toolbar: { x: 1100, y: 24 },
};

export type LookupState = 'off' | 'idle' | 'loading' | 'ok' | 'notfound' | 'error';

export interface PlayerCard {
  name: string;
  server: number | null;
  faction: Faction | null;
  className: ClassName | null;
  level: number | null;
  legion: string | null;
  gearScore: number | null;
  combatPower: number | null;
  itemLevel: number | null;
  abyssRank: number | null;
  abyssPoints: number | null;
  lookup: LookupState;
}

export interface MeterRow {
  card: PlayerCard;
  isSelf: boolean;
  damage: number;
  dps: number;
  share: number;
  critRate: number;
  /** Deaths of this player in the current run (dungeon). */
  deaths: number;
}

/** Per-skill damage of one player in one fight (skill = base id: packet code minus its last four digits). */
export interface SkillRow {
  skill: number;
  damage: number;
  hits: number;
  crits: number;
  max: number;
  casts: number;
  parry: number;
}

export interface EncounterRow {
  name: string;
  /** PvP fights only: which side the player was on. */
  side?: 'mine' | 'theirs';
  className: ClassName | null;
  level: number | null;
  gearScore: number | null;
  combatPower: number | null;
  isSelf: boolean;
  damage: number;
  hits: number;
  crits: number;
  casts: number;
  back: number;
  front: number;
  parry: number;
  perfect: number;
  double: number;
  deaths: number;
  skills: SkillRow[];
}

/** A finished fight, saved to the history. Names (npc / map / dungeon / skills) are resolved at display time. */
export interface EncounterRecord {
  id: string;
  /** Absent in older saves = boss fight. */
  kind?: 'boss' | 'pvp';
  /** PvP: damage dealt by the opposing side (total is your side's). */
  theirsTotal?: number;
  startedAt: number;
  durationMs: number;
  total: number;
  npcCode: number | null;
  npcMaxHp: number | null;
  mapId: number | null;
  dungeonId: number | null;
  rows: EncounterRow[];
}

export interface PlayerDetail {
  name: string;
  title: string;
  className: ClassName | null;
  level: number | null;
  gearScore: number | null;
  combatPower: number | null;
  durationMs: number;
  total: number;
  dps: number;
  casts: number;
  hits: number;
  crit: number;
  back: number;
  front: number;
  parry: number;
  perfect: number;
  double: number;
  deaths: number;
  skills: {
    skill: number;
    name: string | null;
    damage: number;
    pct: number;
    casts: number;
    hits: number;
    critPct: number;
    max: number;
    avg: number;
    parryPct: number;
  }[];
}

export type NameKind = 'skills' | 'npcs' | 'maps' | 'dungeons';
export const nameKindSchema = z.enum(['skills', 'npcs', 'maps', 'dungeons']);

/** User-editable dictionary: ids (as strings) to names. Skill names are filled from the official site. */
export interface NamesData {
  skills: Record<string, string>;
  npcs: Record<string, string>;
  maps: Record<string, string>;
  dungeons: Record<string, string>;
}

export interface EncounterSummary {
  id: string;
  startedAt: number;
  durationMs: number;
  total: number;
  npcCode: number | null;
  npcMaxHp: number | null;
  players: number;
  top: { name: string; dps: number } | null;
  /** PvP only. */
  theirsTotal?: number;
  opponents?: string[];
}

export interface RunSummary {
  id: string;
  startedAt: number;
  endedAt: number;
  mapId: number | null;
  dungeonId: number | null;
  /** "Dungeon · Conquest [Normal]" when the catalog knows the dungeon. */
  tag?: string;
  /** Open-world fights (world bosses): no dungeon behind them. */
  world?: boolean;
  /** Sum of the fights' damage and durations, and how many different players took part. */
  total: number;
  durationMs: number;
  players: number;
  /** Newest first. */
  encounters: EncounterSummary[];
}

/** One day's player-fight totals (from the daily statistics, saved across restarts). */
export interface DaySummary {
  kills: number;
  deaths: number;
  assists: number;
  /** Abyss Points gained that day, null when unknown. */
  ap: number | null;
}

export interface HistoryData {
  /** Statistics per local day ("2026-11-16"). */
  daily: Record<string, DaySummary>;
  /** Kills, deaths and assists with names, newest first (the most recent ones are kept). */
  kills: KillEntry[];
  /** Newest first. */
  runs: RunSummary[];
  /** PvP fights, newest first. */
  pvp: EncounterSummary[];
  names: NamesData;
  /** Lifetime record per player (kills = wins, deaths = losses, assists); never reset. */
  rivals: Record<string, RivalRecord>;
}

export interface FocusSnapshot {
  /** Entity id of the NPC being hit (the game's target is not observable, so: the one you last hit). */
  id: number;
  /** NPC code (what the name dictionary is keyed by) and the user-given name, when there is one. */
  code: number | null;
  name: string | null;
  /** The group's current DPS (the boss bar shows it as "Party DPS"). */
  partyDps: number;
  hpCur: number | null;
  hpMax: number | null;
  /** 0..1 */
  hpPct: number | null;
  /** Predicted seconds to kill at the group's current DPS; null when unknown. */
  ttkSec: number | null;
  /** Stagger gauge 0..1 (rest / max) and break state; null when the game sent none. */
  stagger: { pct: number; broken: boolean } | null;
}

/** All in ms, null when there is no recent estimate. */
export interface PingSnapshot {
  /** The real delay: net + late. */
  ms: number | null;
  /** TCP round trip to the game server (close to an ICMP ping). */
  net: number | null;
  /** How late the server's stream runs on top of that (smoothed; stalls and retransmission waits). */
  late: number | null;
  /** Worst single heartbeat of the last 10 s. */
  peak: number | null;
}

export interface MeterSnapshot {
  active: boolean;
  durationMs: number;
  total: number;
  rows: MeterRow[];
  focus: FocusSnapshot | null;
  /** Deaths of you and your party since the last loading screen (the current run). */
  deaths: number;
}

export const overlayModeSchema = z.enum(['auto', 'show', 'hide']);
export interface UpdateSnapshot {
  /** The installed version. */
  version: string;
  /** off: not an installed build (dev / demo); current: checked, nothing newer. */
  state: 'off' | 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'error';
  /** The newer version being downloaded or waiting to be installed. */
  available: string | null;
  percent: number | null;
  error: string | null;
  checkedAt: number | null;
}

export type OverlayMode = z.infer<typeof overlayModeSchema>;

export interface RivalRecord {
  wins: number;
  losses: number;
  dealt: number;
  taken: number;
  encounters: number;
  lastSeen: number;
  /** Assists on this player (added later: older saves lack it). */
  assists?: number;
}

export interface PvpRow {
  card: PlayerCard;
  isSelf: boolean;
  damage: number;
  dps: number;
  share: number;
  /** Lifetime record against this player (opponents only). */
  record: RivalRecord | null;
  /** HP exchange with this opponent in the current fight (null for the unknown source). */
  duel: PvpDuel | null;
}

/** One opponent against you: how much of whose HP each took. What you took of theirs is capped at 1; what they took of yours is the real share and can pass 1. */
export interface PvpDuel {
  /** The opponent's HP left (0..1); 0 once they died; null while their HP is unknown. */
  remainingPct: number | null;
  /** What you took of the opponent's max HP; null while their HP is unknown. */
  dealtPct: number | null;
  /** What they really took of your max HP (not capped: you can be healed or die and return); null while your HP is unknown. */
  takenPct: number | null;
  dead: boolean;
  /** Raw damage you dealt them and they dealt you in this fight. */
  dealtDmg: number;
  takenDmg: number;
  /** Kill records with this opponent in this fight: you killed them, they killed you, you assisted. */
  kills: number;
  deaths: number;
  assists: number;
}

/** One kill involving you: you killed someone, someone killed you, or you assisted. */
export interface KillEntry {
  /** Unix ms. */
  at: number;
  kind: 'kill' | 'death' | 'assist';
  killer: string;
  victim: string;
  /** Skill id of the killing blow when the game sent it. */
  skill: number | null;
  /** Entered by hand (the game sent no record). */
  manual?: boolean;
}

/** Your last final death, shown in a pop-up for a short while. */
export interface DeathSnapshot {
  at: number;
  /** Who killed you, when known (kill record, or the player who hit you last). */
  killer: string | null;
  killerCard: PlayerCard | null;
  /** The death is already counted in your K/D/A. */
  registered: boolean;
  /** When the killer is unknown: foes active just before, to pick from. */
  candidates: string[];
}

export type KdaAction = 'kill' | 'death' | 'assist' | 'undo';
export const kdaActionSchema = z.enum(['kill', 'death', 'assist', 'undo']);

export interface PvpSnapshot {
  /** Today's kills, deaths and assists with names, newest first. */
  feed: KillEntry[];
  active: boolean;
  durationMs: number;
  kills: number;
  deaths: number;
  assists: number;
  mine: PvpRow[];
  theirs: PvpRow[];
  mineTotal: number;
  theirsTotal: number;
}

export interface TargetSnapshot {
  card: PlayerCard;
  record: RivalRecord | null;
  /** How the target was picked: packets carry no "selected target", only combat. */
  source: 'attacked' | 'attackedBy';
}

export interface LobbyMember {
  card: PlayerCard;
  isSelf: boolean;
  leader: boolean;
  ready: boolean;
  slot: number;
}

export interface LobbySnapshot {
  title: string | null;
  members: LobbyMember[];
  readyCount: number;
}

export interface DailySnapshot {
  date: string;
  apGained: number | null;
  apWeek: { points: number; limit: number } | null;
  rankPointsGained: number | null;
  rankPoints: number | null;
  abyssRank: number | null;
  kills: number;
  deaths: number;
  assists: number;
}

export interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const hitRectsSchema = z
  .array(z.object({ x: z.number().finite(), y: z.number().finite(), w: z.number().finite().min(0), h: z.number().finite().min(0) }))
  .max(24);

export type CaptureState = 'starting' | 'searching' | 'locked' | 'error' | 'demo';
export interface CaptureStatus {
  state: CaptureState;
  detail: string | null;
  port: number | null;
}

export interface OverlaySnapshot {
  visible: boolean;
  editMode: boolean;
  /** The game window is in the foreground (the toolbar shows even while menus are open). */
  gameFocused: boolean;
  /** Alt held over the game: the whole overlay is visible, clickable and movable. */
  altMode: boolean;
  /** Manual override of auto-hide: follow the game window (auto), always show, or always hide. */
  overlayMode: OverlayMode;
  death: DeathSnapshot | null;
  pets: PetsSnapshot;
  update: UpdateSnapshot;
  /** Odyle energy (basic + charged bonus) as last reported by the game; null until seen. */
  odyle: { basic: number; charged: number; at: number } | null;
  /** Shortcuts the OS refused to register (taken by another app). */
  hotkeyConflicts: string[];
  /** The delay the player really has (network + server lateness), in ms. */
  ping: PingSnapshot;
  /** The game's frames per second; state tells whether the measurement runs or why it cannot. */
  fps: { value: number | null; state: 'off' | 'running' | 'denied' | 'error' };
  pinned: boolean;
  capture: CaptureStatus;
  self: PlayerCard | null;
  meter: MeterSnapshot;
  pvp: PvpSnapshot;
  target: TargetSnapshot | null;
  lobby: LobbySnapshot | null;
  daily: DailySnapshot;
  settings: Settings;
}

/** API exposed to the renderer through the preload bridge. */
export interface OverlayApi {
  onSnapshot(listener: (snapshot: OverlaySnapshot) => void): () => void;
  updateSettings(patch: SettingsPatch): void;
  updatePanel(patch: PanelPatch): void;
  resetMeter(): void;
  resetPvp(): void;
  exitEditMode(): void;
  /** Keep the mouse captured (during a drag) even if the pointer leaves its rectangle. */
  setMouseCapture(on: boolean): void;
  /** Rectangles (window DIP coordinates) that should catch clicks; the rest stays click-through. */
  setHitRects(rects: HitRect[]): void;
  /** Toggle layout editing: every panel and the toolbar can be moved. */
  toggleEditMode(): void;
  setPinned(on: boolean): void;
  /** Per-skill detail of one player: "live" (current fight) or a saved encounter id. */
  getDetail(name: string, source: string): Promise<PlayerDetail | null>;
  getHistory(): Promise<HistoryData>;
  getEncounter(id: string): Promise<EncounterRecord | null>;
  setName(kind: NameKind, key: string, name: string): void;
  /** Deletes a saved boss run, a single fight, a PvP fight, or all PvP fights of one day ("2026-11-16") from the history. */
  deleteHistory(kind: 'run' | 'encounter' | 'pvpday', id: string): void;
  /** A text box has (or lost) focus: the overlay window becomes focusable so it can take keystrokes. */
  setTextInput(on: boolean): void;
  /** Quits the whole app (from the taskbar window). */
  quitApp(): void;
  /** Manual K/D correction against one player: add a kill, add a death, or undo the last manual entry. */
  adjustKda(name: string, action: KdaAction): void;
  /** Every pet with its rank, souls and how to get it (the pet finder window). */
  getPets(): Promise<PetRow[]>;
  /** Opens the folder with the app's data and logs. */
  openLogFolder(): void;
  /** A window the user opened (settings, history, finder, map, detail) is on screen: the mouse works over it without Alt. */
  setWindowsOpen(open: boolean): void;
  /** Frame-tracing permission: check whether the user is in the "Performance Log Users" group, add them (one UAC prompt), or sign out of Windows. */
  fpsAccess(action: 'check' | 'grant' | 'logoff'): Promise<'member' | 'notMember' | 'unknown' | 'granted' | 'cancelled' | 'error'>;
  /** Asks where to save a diagnostic report (versions, state, settings, recent log); resolves to the saved path or null. */
  saveReport(): Promise<string | null>;
  checkUpdate(): void;
  installUpdate(): void;
  /** Copies ranks and souls from the PetTracker app's saved profile; resolves to how many pets were imported. */
  importPetTracker(): Promise<number>;
  togglePetPin(id: number): void;
  resetPetSession(): void;
  dismissDeath(): void;
  setOverlayMode(mode: OverlayMode): void;
  /** Builds the NPC / dungeon name catalog from the installed Abyss Logs program (read-only file read). */
  importCatalog(): Promise<{ ok: boolean; message: string }>;
}
