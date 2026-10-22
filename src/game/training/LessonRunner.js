/**
 * Runs a tutorial lesson's logic: which step is current, how many
 * successes it has, the dummy's behaviour for that step, and the start
 * position. No DOM: LessonActivity draws it, and the tests drive it
 * directly. Like the trial tracker, it only reads the state.
 */
import { fromNumpad } from '../../engine/input/bits.js';
import { parseScript } from '../../engine/input/script.js';
import { Dummy } from './Dummy.js';
import { placedState } from './TrialTracker.js';

const DEFAULT_GAP = 90;

export class LessonRunner {
  /**
   * @param {import('../../engine/sim/step.js').Simulation} sim
   * @param {import('../data/lessons.js').Lesson} lesson
   */
  constructor(sim, lesson) {
    this.sim = sim;
    this.lesson = lesson;
    this.stepIndex = 0;
    this.count = 0;
    /** @type {Record<string, number>} */
    this.mem = {};
    this.done = false;
    this.dummy = new Dummy(sim, 1);
    this.sinceAttack = 0;
    this.nextAttack = 0;
    this.configure();
  }

  get step() {
    return this.lesson.steps[this.stepIndex];
  }

  /** Sets up the dummy for the current step. */
  configure() {
    const d = this.step.dummy ?? {};
    this.dummy.stance = d.stance ?? 'stand';
    this.dummy.block = d.block ?? 'none';
    this.dummy.techThrows = d.tech ?? false;
    this.sinceAttack = 0;
    this.nextAttack = 0;
  }

  /**
   * The state the current step starts from.
   * @param {[string, string]} chars
   * @param {string} [stage]
   */
  startState(chars, stage) {
    return placedState(this.sim, chars, { gap: this.step.gap ?? DEFAULT_GAP, meter: !!this.step.meter, corner: !!this.step.corner, stage });
  }

  /** Starts the current step over (its count and memory). */
  restartStep() {
    this.count = 0;
    this.mem = {};
    this.configure();
  }

  /**
   * Player 2's input: walk in and attack (steps with `attacks`), or the
   * training dummy's settings.
   * @param {import('../../engine/sim/types.js').MatchState} s
   */
  dummyInput(s) {
    const a = this.step.attacks;
    const me = s.fighters[1];
    if (!a) return this.dummy.think(s, 0);
    if (!this.sim.isNeutral(me)) return 0;
    this.sinceAttack++;
    const dist = Math.abs(s.fighters[0].x - me.x) / 256;
    if (dist > a.range) return fromNumpad(6, me.facing);
    if (this.sinceAttack < a.every) return 0;
    this.sinceAttack = 0;
    const token = a.attacks[this.nextAttack % a.attacks.length];
    this.nextAttack++;
    const [step] = parseScript(token);
    return fromNumpad(step.dir, me.facing, step.buttons);
  }

  /**
   * Looks at the state after a step.
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @returns {'count' | 'step' | 'done' | 'reset' | null}  'step': this step is complete and the next one begins.
   */
  observe(s) {
    if (this.done) return null;
    const n = this.step.check(s, this.mem);
    if (n === 0) return null;
    if (n < 0) {
      const had = this.count;
      this.count = 0;
      return had ? 'reset' : null;
    }
    this.count = Math.min(this.step.count, this.count + n);
    if (this.count < this.step.count) return 'count';
    if (this.stepIndex === this.lesson.steps.length - 1) {
      this.done = true;
      return 'done';
    }
    this.stepIndex++;
    this.restartStep();
    return 'step';
  }
}
