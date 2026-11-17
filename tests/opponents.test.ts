import { describe, expect, it } from 'vitest';
import { groupByOpponent } from '../src/shared/opponents';
import type { EncounterSummary, KillEntry } from '../src/shared/types';

const fight = (id: string, startedAt: number, opponents: string[], total = 1000, theirs = 500): EncounterSummary => ({
  id, startedAt, durationMs: 20_000, total, npcCode: null, npcMaxHp: null, players: 1, top: null, theirsTotal: theirs, opponents,
});
const kill = (at: number, kind: 'kill' | 'death', who = 'Beb0p'): KillEntry => ({ at, kind, killer: kind === 'death' ? who : 'me', victim: kind === 'kill' ? who : 'me', skill: null });

describe('groupByOpponent', () => {
  it('groups one player across any gap and sums the results', () => {
    const fights = [fight('1', 0, ['Beb0p']), fight('2', 9_000_000, ['Phew']), fight('3', 18_000_000, ['Beb0p'], 2000, 100)];
    const kills = [kill(10_000, 'kill'), kill(18_010_000, 'death')];
    const groups = groupByOpponent(fights, kills);
    expect(groups.map((g) => g.label)).toEqual(['Beb0p', 'Phew']);
    const b = groups[0];
    expect([b?.fights.length, b?.wins, b?.losses, b?.dealt, b?.taken]).toEqual([2, 1, 1, 3000, 600]);
    expect(b?.fights[0]?.fight.id).toBe('3');
  });

  it('lists a group fight under each opponent separately', () => {
    const groups = groupByOpponent([fight('1', 0, ['A', 'B', 'C'])], []);
    expect(groups.map((g) => g.label).sort()).toEqual(['A', 'B', 'C']);
    expect(groups.every((g) => g.fights.length === 1 && g.fights[0]?.opponents === 3)).toBe(true);
  });

  it('credits a kill or death only to the player it names, not to everyone in a group fight', () => {
    const groups = groupByOpponent([fight('1', 0, ['A', 'B', 'C'])], [kill(5_000, 'kill', 'B'), kill(8_000, 'death', 'C')]);
    const by = (name: string) => groups.find((g) => g.label === name);
    expect([by('A')?.wins, by('A')?.losses]).toEqual([0, 0]);
    expect([by('B')?.wins, by('B')?.losses]).toEqual([1, 0]);
    expect([by('C')?.wins, by('C')?.losses]).toEqual([0, 1]);
  });

  it('keeps unknown opponents in their own group', () => {
    const groups = groupByOpponent([fight('1', 0, []), fight('2', 5, [])], []);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBeNull();
  });
});
