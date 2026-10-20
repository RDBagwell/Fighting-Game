/**
 * The input buffer and the motion-input parser, through the real
 * simulation: inputs go in as bytes, and the test checks which move came
 * out (or didn't).
 */
import { describe, it, expect } from 'vitest';
import { sim, setup, script, run } from './helpers/harness.js';
import { matchMotion, pushHistory } from '../src/engine/sim/motion.js';
import { toNumpad, fromNumpad, cleanInput, toRelative, LEFT, RIGHT, UP, DOWN } from '../src/engine/input/bits.js';

/**
 * Runs a script for player 1 (player 2 idle far away) and returns the
 * moves player 1 started, in order.
 * @param {string} input
 * @param {object} [o]
 * @param {string} [o.char]
 * @param {number} [o.facing]  1: P1 on the left; -1: P1 on the right
 */
function movesFrom(input, { char = 'mack', facing = 1 } = {}) {
  const s = setup({ chars: [char, 'mack'], x: facing === 1 ? [300, 700] : [700, 300], infiniteMeter: true });
  const started = [];
  let last = '';
  run(s, script(input + ' 5*40', facing), [0], (st) => {
    const f = st.fighters[0];
    const now = f.state === 'move' ? `${f.move}@${f.moveFrame === 1 ? 'start' : ''}` : '';
    if (f.state === 'move' && f.moveFrame === 1 && now !== last) started.push(f.move);
    if (f.state === 'dashF' && f.stateFrame === 1) started.push('dashF');
    if (f.state === 'dashB' && f.stateFrame === 1) started.push('dashB');
    last = now;
  });
  return started;
}

describe('input bits', () => {
  it('numpad directions are relative to facing', () => {
    expect(toNumpad(RIGHT, 1)).toBe(6);
    expect(toNumpad(RIGHT, -1)).toBe(4);
    expect(toNumpad(DOWN | LEFT, -1)).toBe(3);
    expect(toNumpad(UP | RIGHT, 1)).toBe(9);
    expect(toNumpad(0, 1)).toBe(5);
    for (const facing of [1, -1]) for (let n = 1; n <= 9; n++) expect(toNumpad(fromNumpad(n, facing), facing)).toBe(n);
  });

  it('impossible inputs are cleaned (left+right = neutral, up+down = up)', () => {
    expect(toNumpad(cleanInput(LEFT | RIGHT), 1)).toBe(5);
    expect(toNumpad(cleanInput(UP | DOWN), 1)).toBe(8);
  });

  it('relative recordings flip back to absolute', () => {
    expect(toRelative(LEFT, -1)).toBe(RIGHT);
    expect(toRelative(toRelative(LEFT | DOWN, -1), -1)).toBe(LEFT | DOWN);
  });
});

describe('motion inputs', () => {
  it('236 + button is a quarter-circle special', () => {
    expect(movesFrom('2 3 6+L')).toEqual(['236L']);
    expect(movesFrom('2 3 6+H')).toEqual(['236H']);
  });

  it('623 is the dragon punch, and wins over 236 when both are in the input', () => {
    expect(movesFrom('6 2 3+M')).toEqual(['623M']);
    // Walking forward first: 6, then 236 also contains 6-2-3. Like the
    // classic games, the dragon punch has priority.
    expect(movesFrom('6 5 2 3 6+M')).toEqual(['623M']);
  });

  it('leniency: extra frames between steps are fine inside the window', () => {
    expect(movesFrom('2*3 3*3 6*3 6+L')).toEqual(['236L']);
    expect(movesFrom('2 2 1 2 3 3 6 6+M')).toEqual(['236M']);
  });

  it('too slow: a motion that takes longer than its window is just a normal', () => {
    // 14-frame window: 2 then 3 then 15 frames of 6 before the press.
    expect(movesFrom('2 3 6*15 6+L')).toEqual(['5L']);
  });

  it('the button can come a little after the motion (the buffer of the window)', () => {
    expect(movesFrom('2 3 6 5 5 5+M')).toEqual(['236M']);
  });

  it('is read relative to facing: the same motion works from the right side', () => {
    expect(movesFrom('2 3 6+L', { facing: -1 })).toEqual(['236L']);
    expect(movesFrom('6 2 3+L', { facing: -1 })).toEqual(['623L']);
  });

  it('a quarter-circle back is not a quarter-circle forward', () => {
    expect(movesFrom('2 1 4+L')).not.toContain('236L');
  });

  it('236236 is the super (with meter)', () => {
    expect(movesFrom('2 3 6 2 3 6+H')).toEqual(['236236H']);
  });

  it('charge: back for 40 frames, then forward + button', () => {
    expect(movesFrom('4*45 6+M', { char: 'kenji' })).toEqual(['46M']);
    expect(movesFrom('1*45 6+H', { char: 'kenji' })).toEqual(['46H']);
    // Not enough charge: forward + M is Kenji's overhead instead.
    expect(movesFrom('4*20 6+M', { char: 'kenji' })).toEqual(['6M']);
    // The charge survives a few frames after letting go (8 frames of grace).
    expect(movesFrom('4*45 5*5 6+M', { char: 'kenji' })).toEqual(['46M']);
    expect(movesFrom('4*45 5*12 6+M', { char: 'kenji' })).toEqual(['6M']);
  });

  it('a charge in one direction is lost when the fighters swap sides', () => {
    // Charging "back" while facing right, then the opponent jumps over:
    // the held direction is now forward, so the charge is gone.
    const s = setup({ chars: ['kenji', 'mack'], x: [500, 700] });
    run(s, script('4*45', 1), [0]);
    expect(s.fighters[0].charge).toBeGreaterThanOrEqual(40);
    s.fighters[1].x = 300 * 256;
    run(s, script('4*12', 1), [0]);
    expect(s.fighters[0].facing).toBe(-1);
    expect(s.fighters[0].charge).toBe(0);
  });

  it('dashes: forward, neutral, forward within 12 frames', () => {
    expect(movesFrom('6 5 6')).toEqual(['dashF']);
    expect(movesFrom('4 5 4')).toEqual(['dashB']);
    expect(movesFrom('6 5*14 6')).toEqual([]);
  });

  it('the easy-specials button does the mapped special', () => {
    expect(movesFrom('5+SP')).toEqual(['236M']);
    expect(movesFrom('2+SP')).toEqual(['623M']);
    expect(movesFrom('5+SPH')).toEqual(['236236H']);
  });

  it('matchMotion reads steps in order, backwards from the press', () => {
    const hist = new Array(20).fill(0);
    for (const n of [2, 3, 6]) pushHistory(hist, fromNumpad(n, 1));
    const qcf = sim.motions.qcf;
    expect(matchMotion(hist, 1, qcf, 0)).toBe(true);
    expect(matchMotion(hist, -1, qcf, 0)).toBe(false);
    const reversed = new Array(20).fill(0);
    for (const n of [6, 3, 2]) pushHistory(reversed, fromNumpad(n, 1));
    expect(matchMotion(reversed, 1, qcf, 0)).toBe(false);
  });
});

describe('the input buffer', () => {
  it('a press a few frames before recovery ends still comes out', () => {
    // 5L lasts 15 frames. Press 5L again on frame 13 (3 frames early).
    const s = setup({ chars: ['mack', 'mack'], x: [300, 700] });
    const p1 = script('5+L 5*11 5+L 5*30', 1);
    const starts = [];
    run(s, p1, [0], (st) => {
      if (st.fighters[0].state === 'move' && st.fighters[0].moveFrame === 1) starts.push(st.frame);
    });
    expect(starts).toEqual([1, 16]);
  });

  it('a press too early (beyond the buffer) is dropped', () => {
    const s = setup({ chars: ['mack', 'mack'], x: [300, 700] });
    const starts = [];
    run(s, script('5+L 5*5 5+L 5*30', 1), [0], (st) => {
      if (st.fighters[0].state === 'move' && st.fighters[0].moveFrame === 1) starts.push(st.frame);
    });
    expect(starts).toEqual([1]);
  });

  it('one press starts one move, never two', () => {
    const s = setup({ chars: ['mack', 'mack'], x: [300, 700] });
    const starts = [];
    run(s, script('5+L 5+L*40', 1), [0], (st) => {
      if (st.fighters[0].state === 'move' && st.fighters[0].moveFrame === 1) starts.push(st.frame);
    });
    expect(starts).toEqual([1]);
  });

  it('a special input during hit-stop comes out when hit-stop ends (a cancel)', () => {
    // 5M connects on frame 8 and freezes for 10 frames; the motion is done during the freeze.
    const s2 = setup({ chars: ['mack', 'mack'], x: [480, 510] });
    const moves = [];
    run(s2, script('5+M 5*7 2 3 6+L 5*40', 1), [0], (st) => {
      const f = st.fighters[0];
      if (f.state === 'move' && f.moveFrame === 1) moves.push(f.move);
    });
    expect(moves).toEqual(['5M', '236L']);
  });
});
