import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Plain-text application log (`app.log` in the user-data folder, rotated at 1 MB, one older copy kept).
 * Always records the important things (start, capture state, updates, errors); `debug` lines only when
 * detailed logging is switched on. Nothing leaves the computer: the user chooses whether to send a report.
 */

const MAX_BYTES = 1_000_000;

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export class Logger {
  readonly file: string;
  private readonly older: string;

  constructor(
    private readonly dir: string,
    private readonly detailed: () => boolean,
  ) {
    this.file = join(dir, 'app.log');
    this.older = join(dir, 'app.1.log');
  }

  private write(level: LogLevel, text: string): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      if (existsSync(this.file) && statSync(this.file).size > MAX_BYTES) renameSync(this.file, this.older);
      appendFileSync(this.file, `${new Date().toISOString()} ${level.padEnd(5)} ${text}\n`, 'utf8');
    } catch {
      // a log that cannot be written must never take the app down
    }
  }

  info(text: string): void {
    this.write('INFO', text);
  }

  warn(text: string): void {
    this.write('WARN', text);
  }

  error(text: string): void {
    this.write('ERROR', text);
  }

  /** Written only while detailed logging is on. */
  debug(text: string): void {
    if (this.detailed()) this.write('DEBUG', text);
  }

  /** The last `maxBytes` of the log (older copy included when the current file is short). */
  tail(maxBytes = 200_000): string {
    const read = (file: string): string => {
      try {
        return existsSync(file) ? readFileSync(file, 'utf8') : '';
      } catch {
        return '';
      }
    };
    const current = read(this.file);
    const text = current.length >= maxBytes ? current : `${read(this.older)}${current}`;
    return text.length > maxBytes ? text.slice(text.length - maxBytes) : text;
  }
}
