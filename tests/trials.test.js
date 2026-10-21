/**
 * Combo trials: every trial's demonstration completes it in the real
 * simulation, facing either way and against either character, and the
 * tracker counts only real combos.
 */
import { describe, it, expect } from 'vitest';
import { sim, script } from './helpers/harness.js';
import { TRIALS } from '../src/game/data/trials.js';
import { TrialTracker, trialStartState } from '../src/game/training/TrialTracker.js';
import { parseScript, scriptBits } from '../src/engine/input/script.js';
import { roster } from '../src/game/data/characters/index.js';

/**
 * Plays inputs for player 1 (dummy idle) and returns what the tracker saw.
 * @param {import('../src/game/data/trials.js').Trial} trial
 * @param {string} char
 * @param {string} opponent
 * @param {boolean} mirrored
 * @param {string} [inputs]
 */
function play(trial, char, opponent, mirrored, inputs = trial.demo) {
  const s = trialStartState(sim, [char, opponent], trial, { mirrored });
  const t = new TrialTracker(trial);
  const facing = s.fighters[0].facing;
  /** @type {string[]} */
  const changes = [];
  for (const step of parseScript(`${inputs} 5*30`)) {
    sim.step(s, [scriptBits(step, facing), 0]);
    const c = t.observe(s);
    if (c) changes.push(`${c}:${t.progress}`);
    if (t.done) break;
  }
  return { t, changes };
}

describe('combo trials', () => {
  it('every character in the roster has trials, and every step is a real move', () => {
    for (const char of roster) {
      expect(TRIALS[char]?.length, char).toBeGreaterThanOrEqual(5);
      for (const trial of TRIALS[char]) for (const step of trial.steps) expect(sim.characters[char].moves[step], `${trial.id} ${step}`).toBeDefined();
    }
    const ids = Object.values(TRIALS).flat().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const char of roster) {
    for (const trial of TRIALS[char]) {
      it(`${trial.id} (${trial.steps.join(' → ')}): the demonstration completes it, from either side, against either character`, () => {
        for (const opponent of roster) {
          for (const mirrored of [false, true]) {
            const { t } = play(trial, char, opponent, mirrored);
            expect(t.done, `${trial.id} vs ${opponent}${mirrored ? ' mirrored' : ''}`).toBe(true);
          }
        }
      });
    }
  }
});

describe('the trial tracker', () => {
  const trial = TRIALS.mack[2]; // 2L → 5L → 236M

  it('counts each step as it lands, in order', () => {
    const { changes } = play(trial, 'mack', 'kenji', false);
    expect(changes).toEqual(['progress:1', 'progress:2', 'done:3']);
  });

  it('a dropped combo (too slow between hits) starts over, and says where', () => {
    const { t } = play(trial, 'mack', 'kenji', false, '2+L 5*40 5+L 5*9 2 3 6+M 5*40');
    expect(t.done).toBe(false);
    expect(t.droppedAt).toBe(1);
  });

  it('the wrong move in the middle fails the attempt', () => {
    const { t } = play(trial, 'mack', 'kenji', false, '2+L 5*4 2+L 5*9 2 3 6+M 5*40');
    expect(t.done).toBe(false);
  });

  it('multi-hit moves count once: the super trial finishes on its first hit', () => {
    const { changes } = play(TRIALS.mack[5], 'mack', 'mack', false);
    expect(changes.at(-1)).toBe('done:3');
  });

  it('the same moves without the opponent being hit don’t count', () => {
    const s = trialStartState(sim, ['mack', 'kenji'], trial);
    s.fighters[0].x -= 200 * 256; // far away: everything whiffs
    const t = new TrialTracker(trial);
    for (const b of script('2+L 5*4 5+L 5*9 2 3 6+M 5*40', 1)) {
      sim.step(s, [b, 0]);
      t.observe(s);
    }
    expect(t.progress).toBe(0);
    expect(t.done).toBe(false);
  });
});
