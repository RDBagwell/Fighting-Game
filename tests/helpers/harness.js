/**
 * Helpers for driving the real simulation from tests with numpad notation,
 * the way fighting-game players write inputs.
 */
import { sim } from '../../src/game/sim.js';
import { fromNumpad, BUTTON_BITS } from '../../src/engine/input/bits.js';
import { SUB } from '../../src/engine/sim/fixed.js';

export { sim };

/**
 * Bits for one numpad token such as "5", "2+L", "6+LM", "3+H".
 * @param {string} token
 * @param {number} facing
 */
export function bits(token, facing) {
  const [dir, buttons = ''] = token.split('+');
  let b = 0;
  for (const name of ['L', 'M', 'H', 'SP']) if (buttons.includes(name)) b |= BUTTON_BITS[/** @type {'L'} */ (name)];
  if (buttons.includes('SP')) b |= BUTTON_BITS.SP;
  return fromNumpad(Number(dir), facing, b);
}

/**
 * A space-separated input script, one token per frame; "token*n" holds it
 * n frames. Example: "2 3 6+L 5*20".
 * @param {string} script
 * @param {number} facing
 */
export function script(script, facing) {
  /** @type {number[]} */
  const out = [];
  for (const part of script.trim().split(/\s+/)) {
    const [token, count = '1'] = part.split('*');
    for (let i = 0; i < Number(count); i++) out.push(bits(token, facing));
  }
  return out;
}

/**
 * A match, already in the fight (no round intro), with the fighters at the
 * given x positions in pixels. Not training mode unless asked, so health
 * doesn't refill in the middle of a test.
 * @param {object} [o]
 * @param {[string, string]} [o.chars]
 * @param {[number, number]} [o.x]
 * @param {boolean} [o.training]
 * @param {boolean} [o.infiniteMeter]
 */
export function setup({ chars = ['mack', 'mack'], x = [480, 520], training = false, infiniteMeter = false } = {}) {
  const s = sim.createMatch({ chars, training, infiniteMeter, seed: 7 });
  s.phase = 'fight';
  s.fighters[0].x = x[0] * SUB;
  s.fighters[1].x = x[1] * SUB;
  s.fighters[0].facing = x[0] < x[1] ? 1 : -1;
  s.fighters[1].facing = x[0] < x[1] ? -1 : 1;
  return s;
}

/**
 * Steps the match through two input arrays (the shorter is padded with
 * its last value), calling `each` after every frame.
 * @param {import('../../src/engine/sim/types.js').MatchState} s
 * @param {number[]} p1
 * @param {number[]} p2
 * @param {(s: import('../../src/engine/sim/types.js').MatchState, i: number) => void} [each]
 */
export function run(s, p1, p2, each) {
  const n = Math.max(p1.length, p2.length);
  for (let i = 0; i < n; i++) {
    sim.step(s, [p1[Math.min(i, p1.length - 1)] ?? 0, p2[Math.min(i, p2.length - 1)] ?? 0]);
    if (each) each(s, i);
  }
  return s;
}

/**
 * The input script that performs a move, for a fighter facing right.
 * @param {import('../../src/engine/sim/types.js').MoveData} mv
 */
export function inputFor(mv) {
  if (mv.kind === 'throw') return '5+LM';
  const b = mv.button ?? 'L';
  switch (mv.motion) {
    case 'qcf': return `2 3 6+${b}`;
    case 'qcb': return `2 1 4+${b}`;
    case 'dp': return `6 2 3+${b}`;
    case 'qcf2': return `2 3 6 2 3 6+${b}`;
    case 'chargeBF': return `1*45 6+${b}`;
    default: break;
  }
  if (mv.stance === 'crouch') return `2+${b}`;
  return `${mv.dir ?? 5}+${b}`;
}
