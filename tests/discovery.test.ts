import { describe, expect, it } from 'vitest';
import { Discovery } from '@core/discovery';
import { W, frame } from './helpers';

describe('discovery', () => {
  const setup = () => {
    const lines: string[] = [];
    const d = new Discovery((l) => lines.push(l), new Set([0x0438, 0x4536]), new Set([0x4536]));
    d.onEvent({ t: 'player', id: 2001, name: 'Milenium', classCode: 5, server: 2301, legion: null }, 0);
    lines.length = 0;
    return { d, lines };
  };

  it('notes identity events once per player', () => {
    const lines: string[] = [];
    const d = new Discovery((l) => lines.push(l), new Set());
    const player = { t: 'player', id: 2001, name: 'Milenium', classCode: 5, server: 2301, legion: null } as const;
    d.onEvent({ t: 'self', id: 1001, name: 'Me', server: 1301, classCode: 17, level: 45 }, 0);
    d.onEvent(player, 0);
    d.onEvent(player, 0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('SELF id=1001 name=Me');
    expect(lines[1]).toContain('PLAYER id=2001 name=Milenium');
  });

  it('logs client packets only inside a mark window (they are encrypted)', () => {
    const { d, lines } = setup();
    d.onRaw('c2s', frame(new W().hex('11 22').varint(2001).done()), 0);
    expect(lines).toEqual([]);
    d.mark(100);
    d.onRaw('c2s', frame(new W().hex('11 22').varint(2001).done()), 200);
    expect(lines.at(-1)).toContain('c2s 11 22');
    expect(lines.at(-1)).toContain('gracze=[Milenium]');
  });

  it('always logs watched target-candidate opcodes', () => {
    const { d, lines } = setup();
    d.onRaw('s2c', new W().hex('44 37 d0 14 00 00').done(), 0);
    expect(lines[0]).toContain('WATCH 44 37 len=6');
  });

  it('reports unknown packets that carry a name', () => {
    const { d, lines } = setup();
    const p = new W().hex('46 36').varint(2640).u32(0).u8(1).name('AlfaOmega').done();
    for (let i = 0; i < 12; i++) d.onRaw('s2c', p, 0);
    expect(lines.filter((l) => l.includes('NAMEPKT 46 36 name=AlfaOmega'))).toHaveLength(10);
  });

  it('skips opcodes the app already decodes', () => {
    const { d, lines } = setup();
    d.onRaw('s2c', new W().hex('04 38').varint(2001).done(), 0);
    expect(lines).toEqual([]);
  });

  it('dumps identity packets even though they are decoded', () => {
    const { d, lines } = setup();
    d.onRaw('s2c', new W().hex('45 36 01 02 03').done(), 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('IDENT 45 36 len=5 hex=45 36 01 02 03');
  });

  it('logs everything for a few seconds after a mark', () => {
    const { d, lines } = setup();
    d.mark(1000);
    d.onRaw('s2c', new W().hex('77 36 01').done(), 2000);
    d.onRaw('s2c', new W().hex('77 36 02').done(), 9000);
    expect(lines.filter((l) => l.includes('77 36'))).toHaveLength(1);
  });

  it('dumps the last seconds of server traffic when something dies', () => {
    const { d, lines } = setup();
    d.onRaw('s2c', new W().hex('77 36 aa bb').done(), 1000);
    d.onRaw('s2c', new W().hex('78 36 cc').done(), 2000);
    d.onRaw('s2c', new W().hex('79 36 dd').done(), 9000); // older packets fall out of the window
    d.onEvent({ t: 'death', id: 50_001, flag: 3 }, 9100);
    const dump = lines.filter((l) => l.includes('AUTODUMP') || l.includes('RING'));
    expect(dump[0]).toContain('AUTODUMP death id=50001 flag=3');
    expect(dump.some((l) => l.includes('RING 79 36'))).toBe(true);
    expect(dump.some((l) => l.includes('RING 77 36'))).toBe(false);
    // a second death right away does not dump again
    d.onEvent({ t: 'death', id: 50_002, flag: 3 }, 9200);
    expect(lines.filter((l) => l.includes('AUTODUMP'))).toHaveLength(1);
  });

  it('summarises opcodes by how often they carry a player id', () => {
    const { d } = setup();
    d.onRaw('s2c', new W().hex('55 36').varint(2001).done(), 0);
    d.onRaw('s2c', new W().hex('55 36 00').done(), 0);
    expect(d.summary(0).join('\n')).toContain('s2c 55 36: 1/2');
    expect(d.summary(0)).toEqual([]);
  });
});
