import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateSnapshot } from '@shared/types';

/**
 * Updates from GitHub Releases (electron-updater): the installer is checked against the sha512 in `latest.yml`,
 * downloaded in the background and installed when the app quits or when the user asks.
 * Only the installed build updates itself; `pnpm dev` and demo runs do not.
 */

const FIRST_CHECK_MS = 8_000;
const CHECK_EVERY_MS = 60 * 60_000;

const firstLine = (err: unknown): string => (err instanceof Error ? (err.message.split('\n')[0] ?? 'Błąd aktualizacji') : 'Błąd aktualizacji');

export class Updater {
  private snap: UpdateSnapshot = { version: app.getVersion(), state: 'idle', available: null, percent: null, error: null, checkedAt: null };
  private timer: NodeJS.Timeout | null = null;
  private manual = false;

  constructor(
    private readonly onChange: () => void,
    private readonly enabled: () => boolean,
    private readonly log: (level: 'INFO' | 'WARN', text: string) => void = () => undefined,
  ) {
    if (!app.isPackaged) {
      this.snap.state = 'off';
      return;
    }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;
    autoUpdater.on('checking-for-update', () => {
      this.log('INFO', 'updater: checking');
      this.set({ state: 'checking', error: null });
    });
    autoUpdater.on('update-available', (info) => {
      this.log('INFO', `updater: ${info.version} available`);
      this.set({ state: 'downloading', available: info.version, percent: 0 });
    });
    autoUpdater.on('update-not-available', () => {
      this.log('INFO', 'updater: up to date');
      this.set({ state: 'current', available: null, percent: null, checkedAt: Date.now() });
    });
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (info) => {
      this.log('INFO', `updater: ${info.version} downloaded`);
      this.set({ state: 'ready', available: info.version, percent: 100, checkedAt: Date.now() });
    });
    autoUpdater.on('error', (err) => {
      this.log('WARN', `updater: ${firstLine(err)}`);
      // a failed background check is quiet (no internet, no release yet); a manual one says why
      this.set({ state: this.manual ? 'error' : 'idle', error: this.manual ? firstLine(err) : null });
    });
  }

  get snapshot(): UpdateSnapshot {
    return this.snap;
  }

  private set(patch: Partial<UpdateSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.onChange();
  }

  /** Starts the periodic background checks (the first one shortly after launch). */
  start(): void {
    if (!app.isPackaged || this.timer) return;
    const run = (): void => {
      if (this.enabled()) void this.check(false);
    };
    setTimeout(run, FIRST_CHECK_MS);
    this.timer = setInterval(run, CHECK_EVERY_MS);
  }

  async check(manual: boolean): Promise<void> {
    if (!app.isPackaged) {
      this.set({ state: 'off', error: null });
      return;
    }
    if (this.snap.state === 'checking' || this.snap.state === 'downloading' || this.snap.state === 'ready') return;
    this.manual = manual;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.set({ state: manual ? 'error' : 'idle', error: manual ? firstLine(err) : null });
    }
  }

  /** Installs the downloaded update now: the app closes, the installer runs silently and the app starts again. */
  install(): void {
    if (this.snap.state === 'ready') autoUpdater.quitAndInstall(true, true);
  }
}
