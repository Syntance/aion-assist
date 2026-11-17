import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Logger } from '../src/main/log';

describe('Logger', () => {
  it('writes info always and debug only when detailed logging is on', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aion-log-'));
    try {
      let detailed = false;
      const log = new Logger(dir, () => detailed);
      log.info('start');
      log.debug('hidden');
      detailed = true;
      log.debug('shown');
      log.error('boom');
      const text = readFileSync(log.file, 'utf8');
      expect(text).toContain('INFO  start');
      expect(text).not.toContain('hidden');
      expect(text).toContain('DEBUG shown');
      expect(text).toContain('ERROR boom');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rotates a big log and tails the newest part', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aion-log-'));
    try {
      const log = new Logger(dir, () => false);
      writeFileSync(log.file, 'x'.repeat(1_100_000), 'utf8');
      log.info('after rotation');
      expect(readFileSync(join(dir, 'app.1.log'), 'utf8').length).toBe(1_100_000);
      expect(readFileSync(log.file, 'utf8')).toContain('after rotation');
      expect(log.tail(50)).toContain('after rotation');
      expect(log.tail(50).length).toBeLessThanOrEqual(50);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
