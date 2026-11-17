import koffi from 'koffi';

/**
 * The only Win32 calls the app makes about the game. All are plain user32 window /
 * cursor / key-state queries available to any desktop app. Deliberately NOT used: OpenProcess,
 * ReadProcessMemory, hooks, input injection — nothing that takes a handle to, or
 * otherwise touches, the game process. The game is recognised by its window title.
 */

interface CursorInfo {
  cbSize: number;
  flags?: number;
  hCursor?: number | bigint;
  pt?: { x: number; y: number };
}
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const CURSOR_SHOWING = 0x1;

const user32 = koffi.load('user32.dll');
const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });
const CURSORINFO = koffi.struct('CURSORINFO', { cbSize: 'uint32', flags: 'uint32', hCursor: 'uintptr_t', pt: POINT });
koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });

const GetCursorInfo: (info: CursorInfo) => boolean = user32.func(
  'bool __stdcall GetCursorInfo(_Inout_ CURSORINFO *pci)',
);
const GetForegroundWindow: () => bigint | null = user32.func('void * __stdcall GetForegroundWindow()');
const GetWindowTextW: (hwnd: bigint, buf: Buffer, max: number) => number = user32.func(
  'int __stdcall GetWindowTextW(void *hWnd, _Out_ uint16_t *buf, int max)',
);
const SetForegroundWindow: (hwnd: bigint) => boolean = user32.func('bool __stdcall SetForegroundWindow(void *hWnd)');
const GetWindowRect: (hwnd: bigint, rect: Partial<Rect>) => boolean = user32.func(
  'bool __stdcall GetWindowRect(void *hWnd, _Out_ RECT *rect)',
);


const CURSORINFO_SIZE = koffi.sizeof(CURSORINFO);

const titleBuffer = Buffer.alloc(512);

const GetWindowThreadProcessId: (hwnd: bigint, pid: number[]) => number = user32.func(
  'uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *pid)',
);

export interface ForegroundWindow {
  title: string;
  /** Physical-pixel bounds. */
  rect: Rect | null;
  /** Id of the process that owns the window (a plain window query; no handle to the process is opened). */
  pid: number | null;
  /** The window handle, kept only to give the focus back to the same window (see focusWindow). */
  hwnd: bigint;
}

export function getForegroundWindow(): ForegroundWindow | null {
  const hwnd = GetForegroundWindow();
  if (!hwnd) return null;
  const length = GetWindowTextW(hwnd, titleBuffer, 255);
  const title = length > 0 ? titleBuffer.toString('utf16le', 0, length * 2) : '';
  const rect: Partial<Rect> = {};
  const ok = GetWindowRect(hwnd, rect);
  const pidOut = [0];
  GetWindowThreadProcessId(hwnd, pidOut);
  return { title, rect: ok ? (rect as Rect) : null, pid: (pidOut[0] ?? 0) > 0 ? (pidOut[0] ?? null) : null, hwnd };
}

/**
 * Gives the keyboard focus back to a window (the game's, after the overlay's own windows closed). The same as clicking
 * it in the taskbar: a plain window-management call that does not touch the window's process.
 */
export function focusWindow(hwnd: bigint): void {
  SetForegroundWindow(hwnd);
}

/** System cursor state: shown (menus, map, inventory) or hidden (camera mode), plus position. */
export function getCursorState(): { visible: boolean; x: number; y: number } {
  const info: CursorInfo = { cbSize: CURSORINFO_SIZE };
  if (!GetCursorInfo(info)) return { visible: true, x: -1, y: -1 }; // fail safe: visible -> overlay hides
  const pt = info.pt ?? { x: -1, y: -1 };
  return { visible: ((info.flags ?? 0) & CURSOR_SHOWING) !== 0 && Boolean(info.hCursor), x: pt.x, y: pt.y };
}

export function isCursorVisible(): boolean {
  return getCursorState().visible;
}
