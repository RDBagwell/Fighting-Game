/**
 * Arcade mode: the ladder (who you fight, how hard, what a loss costs),
 * the saved run and best clears, and the story data every character
 * needs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { sim } from './helpers/harness.js';
import { roster } from '../src/game/data/characters/index.js';
import { ARCADE } from '../src/game/data/arcade.js';
import { DIFFICULTIES } from '../src/game/cpu/Cpu.js';
import {
  LADDER_LENGTH, ladderDifficulty, newRun, nextFight, recordFight, isCleared, isBetter,
  sanitiseRun, loadArcade, saveRun, recordClear, formatTime,
} from '../src/game/arcade/ladder.js';

/** A localStorage stand-in for Node. */
beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = /** @type {any} */ ({
    getItem: (/** @type {string} */ k) => (data.has(k) ? data.get(k) : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => data.set(k, String(v)),
    removeItem: (/** @type {string} */ k) => data.delete(k),
  });
});

describe('the arcade story data', () => {
  it('every character has a rival from the roster (not themselves), a rival line, and an ending', () => {
    for (const char of roster) {
      const story = ARCADE[char];
      expect(story, char).toBeDefined();
      expect(roster, `${char}'s rival`).toContain(story.rival);
      expect(story.rival).not.toBe(char);
      expect(story.rivalIntro.length).toBeGreaterThan(10);
      expect(story.ending.length, `${char}'s ending`).toBeGreaterThanOrEqual(3);
      for (const panel of story.ending) {
        expect(panel.text.length).toBeGreaterThan(10);
        expect(panel.cast.length === 1 || panel.cast.length === 2).toBe(true);
        for (const c of panel.cast) expect(roster, `${char}'s ending cast`).toContain(c);
      }
      // The ending stars the character.
      expect(story.ending.some((p) => p.cast.includes(char))).toBe(true);
    }
  });
});

describe('the ladder', () => {
  it('is everyone else once, in a random order, then the rival', () => {
    for (const char of roster) {
      const run = newRun(char, roster, ['dusk-shrine'], 7);
      expect(run.opponents).toHaveLength(LADDER_LENGTH);
      expect([...run.opponents.slice(0, -1)].sort()).toEqual(roster.filter((c) => c !== char).sort());
      expect(run.opponents.at(-1)).toBe(ARCADE[char].rival);
      expect(run.stages.every((s) => s === 'dusk-shrine')).toBe(true);
    }
    const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => newRun('mack', roster, ['dusk-shrine'], seed).opponents.join()));
    expect(orders.size).toBeGreaterThan(1);
    expect(newRun('mack', roster, ['dusk-shrine'], 3)).toEqual(newRun('mack', roster, ['dusk-shrine'], 3));
  });

  it('the CPU climbs from Easy to Hard: every number moves the same way, fight by fight', () => {
    expect(ladderDifficulty(0)).toEqual(DIFFICULTIES.easy);
    expect(ladderDifficulty(2)).toEqual({ ...DIFFICULTIES.normal });
    expect(ladderDifficulty(LADDER_LENGTH - 1)).toEqual(DIFFICULTIES.hard);
    for (const key of /** @type {Array<keyof typeof DIFFICULTIES.easy>} */ (Object.keys(DIFFICULTIES.easy))) {
      if (key === 'name') continue;
      const values = Array.from({ length: LADDER_LENGTH }, (_, i) => /** @type {number} */ (ladderDifficulty(i)[key]));
      const rising = DIFFICULTIES.hard[key] >= DIFFICULTIES.easy[key];
      for (let i = 1; i < values.length; i++) {
        if (rising) expect(values[i], `${key} fight ${i + 1}`).toBeGreaterThanOrEqual(values[i - 1]);
        else expect(values[i], `${key} fight ${i + 1}`).toBeLessThanOrEqual(values[i - 1]);
      }
    }
    expect(Number.isInteger(ladderDifficulty(3).reaction)).toBe(true);
  });

  it('a win moves up, a loss costs a continue, a draw is fought again for free', () => {
    let run = newRun('kenji', roster, ['dusk-shrine'], 1);
    run = recordFight(run, { winner: 1, roundsLost: 2, frames: 3000 });
    expect([run.fight, run.continues, run.roundsLost, run.frames]).toEqual([0, 1, 2, 3000]);
    run = recordFight(run, { winner: 2, roundsLost: 1, frames: 100 });
    expect([run.fight, run.continues]).toEqual([0, 1]);
    for (let i = 0; i < LADDER_LENGTH; i++) {
      expect(isCleared(run)).toBe(false);
      expect(nextFight(run).rival).toBe(i === LADDER_LENGTH - 1);
      run = recordFight(run, { winner: 0, roundsLost: 0, frames: 10 });
    }
    expect(isCleared(run)).toBe(true);
    expect(run.continues).toBe(1);
  });

  it('a better clear is fewer continues, then faster', () => {
    expect(isBetter({ continues: 0, frames: 9999 }, { continues: 1, frames: 10 })).toBe(true);
    expect(isBetter({ continues: 1, frames: 10 }, { continues: 1, frames: 20 })).toBe(true);
    expect(isBetter({ continues: 1, frames: 30 }, { continues: 1, frames: 20 })).toBe(false);
    expect(isBetter({ continues: 3, frames: 30 }, undefined)).toBe(true);
    expect(formatTime(60 * 125)).toBe('2:05');
  });
});

describe('saving', () => {
  it('a run in progress survives a reload; a broken one is ignored', () => {
    const run = recordFight(newRun('reroe', roster, ['dusk-shrine'], 5), { winner: 0, roundsLost: 1, frames: 900 });
    saveRun(run, roster);
    expect(loadArcade(roster).run).toEqual(run);
    saveRun(null, roster);
    expect(loadArcade(roster).run).toBeNull();
    expect(sanitiseRun({ ...run, char: 'nobody' }, roster)).toBeNull();
    expect(sanitiseRun({ ...run, fight: LADDER_LENGTH }, roster)).toBeNull();
    expect(sanitiseRun({ ...run, opponents: run.opponents.slice(1) }, roster)).toBeNull();
    expect(sanitiseRun({ ...run, continues: -1 }, roster)).toBeNull();
    localStorage.setItem('dusk-duel-arcade-v1', '{not json');
    expect(loadArcade(roster)).toEqual({ run: null, best: {} });
  });

  it('a clear is recorded, the run ends, and only a better clear replaces the best', () => {
    const cleared = (/** @type {number} */ continues, /** @type {number} */ frames) => ({ ...newRun('mav', roster, ['dusk-shrine'], 2), fight: LADDER_LENGTH, continues, frames });
    saveRun(newRun('mav', roster, ['dusk-shrine'], 2), roster);
    expect(recordClear(cleared(2, 5000), roster)).toEqual({ newBest: true, best: { clears: 1, continues: 2, frames: 5000 } });
    expect(loadArcade(roster).run).toBeNull();
    expect(recordClear(cleared(3, 100), roster)).toEqual({ newBest: false, best: { clears: 2, continues: 2, frames: 5000 } });
    expect(recordClear(cleared(0, 9000), roster)).toEqual({ newBest: true, best: { clears: 3, continues: 0, frames: 9000 } });
    expect(loadArcade(roster).best.mav).toEqual({ clears: 3, continues: 0, frames: 9000 });
  });
});

describe('an arcade fight', () => {
  it('plays as an ordinary CPU match at the ladder\'s difficulty', async () => {
    const { Cpu } = await import('../src/game/cpu/Cpu.js');
    const run = newRun('elumlur', roster, ['dusk-shrine'], 9);
    const next = nextFight(run);
    const s = sim.createMatch({ chars: ['elumlur', next.opponent], seed: 4 });
    const cpus = [new Cpu(0, DIFFICULTIES.hard, sim, 1), new Cpu(1, next.level, sim, 2)];
    let f = 0;
    while (s.phase !== 'matchEnd' && f++ < 60 * 60 * 6) sim.step(s, [cpus[0].think(s), cpus[1].think(s)]);
    expect(s.phase).toBe('matchEnd');
  });
});
