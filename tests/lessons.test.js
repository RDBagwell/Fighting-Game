/**
 * The tutorial: every lesson step can be passed by doing what it says, in
 * the real simulation, and isn't passed by doing nothing (or the wrong
 * thing). The texts resolve to the player's keys.
 */
import { describe, it, expect } from 'vitest';
import { sim } from './helpers/harness.js';
import { LESSONS } from '../src/game/data/lessons.js';
import { LessonRunner } from '../src/game/training/LessonRunner.js';
import { Dummy } from '../src/game/training/Dummy.js';
import { parseScript, scriptBits } from '../src/engine/input/script.js';
import { fromNumpad, L, M, H } from '../src/engine/input/bits.js';
import { keyLabels, howTo } from '../src/game/ui/howTo.js';
import { DEFAULT_KEYS, DEFAULT_PAD } from '../src/engine/input/bindings.js';

const CHARS = /** @type {[string, string]} */ (['mack', 'kenji']);

/**
 * Plays one step of a lesson. `p1` gives player 1's input each frame.
 * @param {number} li  Lesson index
 * @param {number} si  Step index
 * @param {(s: import('../src/engine/sim/types.js').MatchState, frame: number) => number} p1
 * @param {number} frames
 */
function playStep(li, si, p1, frames) {
  const r = new LessonRunner(sim, LESSONS[li]);
  r.stepIndex = si;
  r.restartStep();
  const s = r.startState(CHARS);
  for (let f = 0; f < frames; f++) {
    sim.step(s, [p1(s, f), r.dummyInput(s)]);
    const change = r.observe(s);
    if (change === 'step' || change === 'done') return { passed: true, frames: f };
  }
  return { passed: false, count: r.count };
}

/** Player 1 plays a numpad script, then stands still. */
const scripted = (/** @type {string} */ text) => {
  const steps = parseScript(text);
  return (/** @type {any} */ s, /** @type {number} */ f) => (f < steps.length ? scriptBits(steps[f], s.fighters[0].facing) : 0);
};

/** Player 1 blocks perfectly (the training dummy's own logic, on side 0). */
const perfectBlocker = () => {
  const d = new Dummy(sim, 0);
  d.block = 'all';
  return (/** @type {any} */ s) => d.think(s, 0);
};

/**
 * Player 1 parries (the training dummy's own logic, on side 0), and can
 * punish after, guard-cancel out of blocks, or burst when hit.
 * @param {{ punish?: boolean, guardCancel?: boolean, burst?: boolean }} o
 */
const defender = (o) => {
  const d = new Dummy(sim, 0);
  d.parry = !o.guardCancel && !o.burst;
  d.block = o.guardCancel ? 'all' : 'none';
  d.guardCancel = !!o.guardCancel;
  let parried = -1;
  return (/** @type {any} */ s) => {
    if (s.events.some((e) => e.type === 'parry' && e.side === 0)) parried = s.frame;
    if (o.punish && parried > 0 && s.freeze === 0 && sim.isNeutral(s.fighters[0])) {
      parried = -1;
      return fromNumpad(5, s.fighters[0].facing, L);
    }
    if (o.burst) return (s.fighters[0].state === 'hitstun' && s.freeze === 0) ? L | M | H : 0;
    return d.think(s, 0);
  };
};

/** Player 1 escapes every throw. */
const techer = (/** @type {any} */ s) => (s.fighters[0].state === 'thrown' ? L | M : 0);

describe('tutorial lessons', () => {
  const steps = LESSONS.flatMap((l, li) => l.steps.map((st, si) => ({ l, li, st, si })));

  for (const { l, li, st, si } of steps) {
    it(`${l.name}, step ${si + 1} (${st.goal}): passed by doing it`, () => {
      let p1;
      if (st.demo) p1 = scripted(st.demo);
      else if (l.id === 'high-low') p1 = perfectBlocker();
      else if (l.id === 'throws') p1 = techer;
      else if (l.id === 'defence') p1 = defender([{}, {}, { punish: true }, { guardCancel: true }, { burst: true }][si]);
      else throw new Error('no way to play this step in the test');
      expect(playStep(li, si, p1, 60 * 20).passed).toBe(true);
    });

    it(`${l.name}, step ${si + 1}: not passed by doing nothing`, () => {
      expect(playStep(li, si, () => 0, 60 * 10).passed).toBe(false);
    });
  }

  it('blocking standing doesn’t count against lows; crouching doesn’t count against overheads', () => {
    const li = LESSONS.findIndex((l) => l.id === 'high-low');
    expect(playStep(li, 0, () => fromNumpad(4, 1), 60 * 10).passed).toBe(false);
    expect(playStep(li, 1, (s) => fromNumpad(1, s.fighters[0].facing), 60 * 10).passed).toBe(false);
  });

  it('“in a row” starts over when a hit gets through', () => {
    const li = LESSONS.findIndex((l) => l.id === 'high-low');
    // Always crouch-blocking: the lows are blocked, the overheads hit, so 4 in a row never happens.
    expect(playStep(li, 2, (s) => fromNumpad(1, s.fighters[0].facing), 60 * 20).passed).toBe(false);
  });

  it('every lesson has a unique id, and every text resolves to keys (nothing undefined)', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    const k = keyLabels({ kbA: DEFAULT_KEYS.kbA, pad: DEFAULT_PAD });
    const mack = sim.characters.mack.moves;
    const c = { ...k, move: (/** @type {string} */ id) => k.move(mack[id], sim.motions) };
    for (const l of LESSONS) for (const st of l.steps) {
      const text = st.text(c);
      expect(text, `${l.id}: ${st.goal}`).not.toMatch(/undefined|NaN|(^|[\s(/+])\?([\s)/,]|$)/);
    }
    expect(LESSONS.find((l) => l.id === 'specials')?.steps[0].text(c)).toContain('S, S+D, D, then K');
    expect(howTo(mack['236M'], sim.motions, { kbA: DEFAULT_KEYS.kbA, pad: DEFAULT_PAD }).arrows).toBe('↓ ↘ → + Medium');
  });
});
