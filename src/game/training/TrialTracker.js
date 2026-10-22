/**
 * Follows a combo trial as it's played: which step comes next, and whether
 * the combo was dropped. It only reads the state and its events after each
 * step, like the HUD; it never changes the fight.
 *
 * A step counts when player 1's hit with that move lands while the
 * opponent is in the same combo as the previous step (their combo counter
 * didn't restart). Extra hits of the move just completed (a multi-hit
 * super) are ignored. A hit with any other move, or the combo ending
 * before the last step, starts the trial over.
 */
import { SUB } from '../../engine/sim/fixed.js';
import { TRIAL_GAP } from '../data/trials.js';
export class TrialTracker {
  /** @param {import('../data/trials.js').Trial} trial */
  constructor(trial) {
    this.trial = trial;
    /** Steps done in the current attempt. */
    this.progress = 0;
    this.done = false;
    this.attempts = 0;
    /** Set when an attempt failed after at least one step: the step it failed on. */
    /** @type {number | null} */
    this.droppedAt = null;
  }

  reset() {
    this.progress = 0;
    this.done = false;
    this.droppedAt = null;
  }

  /**
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @returns {'progress' | 'done' | 'dropped' | null}  What changed this frame.
   */
  observe(s) {
    if (this.done) return null;
    const steps = this.trial.steps;
    const victim = s.fighters[1];
    /** @type {'progress' | 'done' | 'dropped' | null} */
    let change = null;
    for (const e of s.events) {
      if (e.type !== 'hit' || e.side !== 0) continue;
      const move = e.move ?? '';
      const fresh = victim.combo <= 1;
      if (fresh || this.progress === 0) {
        // A new combo: it's the first step or nothing.
        if (this.progress > 0) this.fail();
        if (move === steps[0]) {
          this.progress = 1;
          this.attempts++;
          change = 'progress';
        }
      } else if (move === steps[this.progress]) {
        this.progress++;
        change = 'progress';
      } else if (move !== steps[this.progress - 1]) {
        this.fail();
        change = 'dropped';
      }
      if (this.progress === steps.length) {
        this.done = true;
        return 'done';
      }
    }
    // The combo ended (the opponent recovered) before the last step.
    if (this.progress > 0 && victim.combo === 0) {
      this.fail();
      change = 'dropped';
    }
    return change;
  }

  fail() {
    this.droppedAt = this.progress;
    this.progress = 0;
  }
}

/**
 * A trial's starting state: training rules (health refills), the fighters
 * TRIAL_GAP apart in the middle of the stage, player 1 on the left unless
 * `mirrored`, the fight already on, and a full meter if the trial needs it.
 * @param {import('../../engine/sim/step.js').Simulation} sim
 * @param {[string, string]} chars
 * @param {import('../data/trials.js').Trial} trial
 * @param {{ mirrored?: boolean, stage?: string }} [o]
 */
export function trialStartState(sim, chars, trial, { mirrored = false, stage } = {}) {
  return placedState(sim, chars, { gap: TRIAL_GAP, meter: !!trial.meter, mirrored, stage });
}

/**
 * A training state with the fight on and the fighters `gap` pixels apart
 * in the middle of the stage (player 1 on the left unless `mirrored`).
 * @param {import('../../engine/sim/step.js').Simulation} sim
 * @param {[string, string]} chars
 * @param {{ gap: number, meter?: boolean, mirrored?: boolean, corner?: boolean, stage?: string }} o  `corner`: player 1 starts with their back to the wall.
 */
export function placedState(sim, chars, { gap, meter = false, mirrored = false, corner = false, stage }) {
  const s = sim.createMatch({ chars, training: true, infiniteMeter: meter, stage, seed: 1 });
  const wall = sim.config.stage.wall;
  const mid = corner ? wall + 10 + Math.trunc(gap / 2) : Math.trunc(sim.config.stage.width / 2);
  const half = Math.trunc(gap / 2);
  const [a, b] = mirrored ? [mid + half, mid - half] : [mid - half, mid + half];
  s.phase = 'fight';
  s.fighters[0].x = a * SUB;
  s.fighters[1].x = b * SUB;
  s.fighters[0].facing = a < b ? 1 : -1;
  s.fighters[1].facing = a < b ? -1 : 1;
  return s;
}
