/**
 * The input buffer and motion-input parser.
 *
 * Each fighter keeps the last N frames of input bytes in `hist` (hist[0] is
 * this frame). Everything here is a pure function of that history, the
 * fighter's facing and the frame number, so it is deterministic and part of
 * the saved state.
 *
 * - A **press** is a rising edge: the button is down at age a and wasn't at
 *   age a+1.
 * - The **buffer**: a press counts for `buffer` frames after it happened,
 *   so pressing a button a few frames before you're able to act still works.
 *   Once a press starts something it's "used" (`fighter.used` = its frame)
 *   and can't start anything else.
 * - A **motion** (quarter-circle, dragon punch...) is a list of steps, each
 *   a set of numpad directions. Reading back from the press, each step must
 *   be found in order, all within the motion's `window` of frames.
 * - A **charge** move needs back held for `chargeFrames`, then forward and
 *   the button within the window. The charge counter lives in the fighter
 *   (`charge`, `chargeGrace`) because it can be longer than the history.
 *
 * See docs/FRAME-DATA.md, "The input buffer" and "Motion inputs".
 */
import { toNumpad, BUTTON_BITS, L, M } from '../input/bits.js';

/**
 * Pushes this frame's input onto the front of the history.
 * @param {number[]} hist
 * @param {number} bits
 */
export function pushHistory(hist, bits) {
  for (let i = hist.length - 1; i > 0; i--) hist[i] = hist[i - 1];
  hist[0] = bits;
}

/**
 * True if `bit` went down at exactly age `a`.
 * @param {number[]} hist
 * @param {number} a
 * @param {number} bit
 */
export function pressedAt(hist, a, bit) {
  const now = hist[a] ?? 0;
  const before = hist[a + 1] ?? 0;
  return (now & bit) !== 0 && (before & bit) === 0;
}

/**
 * The youngest age (0..buffer) at which `bit` was pressed and that press
 * hasn't been used, or -1.
 * @param {import('./types.js').FighterState} f
 * @param {number} frame  The current absolute frame.
 * @param {number} bit
 * @param {number} buffer
 */
export function findPress(f, frame, bit, buffer) {
  for (let a = 0; a <= buffer && a < f.hist.length - 1; a++) {
    if (frame - a <= f.used) return -1;
    if (pressedAt(f.hist, a, bit)) return a;
  }
  return -1;
}

/**
 * Like findPress for any of several buttons (a string such as 'LMH').
 * Returns { age, button } for the youngest press, preferring heavier
 * buttons when two are pressed on the same frame.
 * @param {import('./types.js').FighterState} f
 * @param {number} frame
 * @param {string} buttons
 * @param {number} buffer
 * @returns {{ age: number, button: string } | null}
 */
export function findButtonPress(f, frame, buttons, buffer) {
  for (let a = 0; a <= buffer && a < f.hist.length - 1; a++) {
    if (frame - a <= f.used) return null;
    for (const name of ['H', 'M', 'L', 'SP']) {
      if (buttons.includes(name) && pressedAt(f.hist, a, BUTTON_BITS[/** @type {'L'} */ (name)])) return { age: a, button: name };
    }
  }
  return null;
}

/**
 * A throw: L and M both down on some frame within the buffer, with at least
 * one of them pressed on that frame and the other pressed no more than 3
 * frames earlier (pressing them "together" by human standards).
 * Returns the age, or -1.
 * @param {import('./types.js').FighterState} f
 * @param {number} frame
 * @param {number} buffer
 */
export function findThrowPress(f, frame, buffer) {
  const both = L | M;
  for (let a = 0; a <= buffer && a < f.hist.length - 4; a++) {
    if (frame - a <= f.used) return -1;
    if ((f.hist[a] & both) !== both) continue;
    const lAt = pressedAt(f.hist, a, L);
    const mAt = pressedAt(f.hist, a, M);
    if (!lAt && !mAt) continue;
    const other = lAt ? M : L;
    for (let b = a; b <= a + 3; b++) if (pressedAt(f.hist, b, other)) return a;
  }
  return -1;
}

/**
 * Does the history contain this motion, ending at or before age `from`
 * (the button press) and starting no more than `motion.window` frames
 * before it? Directions are read relative to `facing`.
 * @param {number[]} hist
 * @param {number} facing
 * @param {import('./types.js').MotionData} motion
 * @param {number} from
 */
export function matchMotion(hist, facing, motion, from) {
  let step = motion.steps.length - 1;
  const last = Math.min(hist.length - 1, from + motion.window);
  for (let a = from; a <= last; a++) {
    const dir = String(toNumpad(hist[a], facing));
    if (motion.steps[step].includes(dir)) {
      step--;
      if (step < 0) return true;
    }
  }
  return false;
}

/**
 * The relative direction (numpad) on this frame.
 * @param {import('./types.js').FighterState} f
 */
export function currentDir(f) {
  return toNumpad(f.hist[0], f.facing);
}

/**
 * Updates the charge counter once per frame (before acting): holding a
 * charge direction (back: 1, 4 or 7) adds a frame; letting go keeps the
 * charge for `grace` frames, then loses it.
 * @param {import('./types.js').FighterState} f
 * @param {number} grace
 */
export function updateCharge(f, grace) {
  const dir = currentDir(f);
  if (dir === 1 || dir === 4 || dir === 7) {
    f.charge = Math.min(f.charge + 1, 999);
    f.chargeGrace = grace;
  } else if (f.chargeGrace > 0) {
    f.chargeGrace--;
  } else {
    f.charge = 0;
  }
}

/**
 * A charge motion: enough charge, and a release direction within the
 * window before the press.
 * @param {import('./types.js').FighterState} f
 * @param {import('./types.js').MotionData} motion
 * @param {number} from
 */
export function matchCharge(f, motion, from) {
  if (f.charge < (motion.chargeFrames ?? 0)) return false;
  return matchMotion(f.hist, f.facing, motion, from);
}

/**
 * A dash: the direction pressed, released to neutral, pressed again, the
 * second press on this very frame.
 * @param {import('./types.js').FighterState} f
 * @param {import('./types.js').MotionData} motion
 */
export function matchDash(f, motion) {
  const target = motion.steps[motion.steps.length - 1];
  const now = String(toNumpad(f.hist[0], f.facing));
  const before = String(toNumpad(f.hist[1], f.facing));
  if (!target.includes(now) || target.includes(before)) return false;
  return matchMotion(f.hist, f.facing, motion, 0);
}
