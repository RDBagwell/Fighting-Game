/**
 * How to do a move, in plain words: which keys or buttons to press, read
 * from the player's current bindings, instead of numpad notation.
 *
 *   236+M   →  arrows:     ↓ ↘ → + Medium
 *              keyboard:   S, S+D, D, then K
 *              controller: ↓ ↘ → (d-pad or stick), then Y / △
 *              easy:       I alone (80% damage)
 *
 * Built from the move's data (stance, direction, motion, button), not by
 * parsing the notation, so a new move written as data reads correctly
 * without changes here. Directions are written facing right: forward is
 * right. Facing left, left and right swap; the texts say so where it
 * matters.
 */
import { keyName, PAD_BUTTON_NAMES } from '../../engine/input/bindings.js';

/** @typedef {import('../../engine/sim/types.js').MoveData} MoveData */
/** @typedef {import('../../engine/input/bindings.js').KeyBinding} KeyBinding */
/** @typedef {import('../../engine/input/bindings.js').PadBinding} PadBinding */

export const BUTTON_WORDS = /** @type {Record<string, string>} */ ({ L: 'Light', M: 'Medium', H: 'Heavy' });

/** Numpad direction → arrow, facing right. */
const ARROWS = /** @type {Record<string, string>} */ ({ 1: '↙', 2: '↓', 3: '↘', 4: '←', 5: '', 6: '→', 7: '↖', 8: '↑', 9: '↗' });
/** Numpad direction → the actions held, facing right (forward = right). */
const DIR_ACTIONS = /** @type {Record<string, Array<'up'|'down'|'left'|'right'>>} */ ({
  1: ['down', 'left'], 2: ['down'], 3: ['down', 'right'], 4: ['left'], 5: [], 6: ['right'], 7: ['up', 'left'], 8: ['up'], 9: ['up', 'right'],
});
/** Directions in words, relative to facing. */
const DIR_WORDS = /** @type {Record<string, string>} */ ({
  1: 'down-back', 2: 'down', 3: 'down-forward', 4: 'back', 5: 'neutral', 6: 'forward', 7: 'up-back', 8: 'up', 9: 'up-forward',
});

/**
 * One step of an input: a sequence of directions rolled through, a held
 * direction (charge), a jump, then a button.
 * @typedef {{ dirs: string[], hold?: { dir: string, frames: number }, jump?: boolean, crouch?: boolean, button: 'L'|'M'|'H'|'throw', backThrow?: boolean }} InputRecipe
 */

/**
 * What the move needs, from its data.
 * @param {MoveData} mv
 * @param {Record<string, import('../../engine/sim/types.js').MotionData>} motions
 * @returns {InputRecipe}
 */
export function recipe(mv, motions) {
  if (mv.kind === 'throw') return { dirs: [], button: 'throw' };
  const button = /** @type {'L'|'M'|'H'} */ (mv.button ?? 'L');
  if (mv.motion) {
    const m = motions[mv.motion];
    // Each step lists the directions that satisfy it; the first is the one to show.
    const dirs = m.steps.map((s) => s[0]);
    if (m.charge) return { dirs, hold: { dir: m.charge.includes('4') ? '4' : m.charge[0], frames: m.chargeFrames ?? 40 }, button };
    return { dirs, button };
  }
  if (mv.stance === 'air') return { dirs: [], jump: true, button };
  if (mv.stance === 'crouch') return { dirs: [], crouch: true, button };
  return { dirs: mv.dir ? [String(mv.dir)] : [], button };
}

/** @param {number} frames */
function seconds(frames) {
  const s = frames / 60;
  if (Math.abs(s - 2 / 3) < 0.05) return '⅔ of a second';
  if (Math.abs(s - 0.5) < 0.05) return 'half a second';
  return `${s.toFixed(1)} s`;
}

/**
 * The keys for a direction ("S+D"), from a keyboard binding.
 * @param {string} dir
 * @param {KeyBinding} kb
 */
function dirKeys(dir, kb) {
  return DIR_ACTIONS[dir].map((a) => keyName(kb[a]?.[0] ?? '?')).join('+');
}

/**
 * @param {'L'|'M'|'H'|'throw'|'SP'} action
 * @param {KeyBinding} kb
 */
function key(action, kb) {
  return keyName(kb[action]?.[0] ?? '?');
}

/**
 * @param {'L'|'M'|'H'|'throw'|'SP'} action
 * @param {PadBinding} pad
 */
function padButton(action, pad) {
  const i = pad[action]?.[0];
  return i === undefined ? '?' : PAD_BUTTON_NAMES[i] ?? `Button ${i}`;
}

/** @param {InputRecipe} r */
export function arrowsText(r) {
  const button = r.button === 'throw' ? 'L+M (throw)' : BUTTON_WORDS[r.button];
  if (r.hold) return `Hold ${ARROWS[r.hold.dir]}, then ${r.dirs.map((d) => ARROWS[d]).join(' ')} + ${button}`;
  if (r.jump) return `Jump, then ${button} in the air`;
  if (r.crouch) return `↓ + ${button}`;
  return r.dirs.length ? `${r.dirs.map((d) => ARROWS[d]).join(' ')} + ${button}` : button;
}

/** @param {InputRecipe} r */
export function wordsText(r) {
  const button = r.button === 'throw' ? 'Light and Medium together' : BUTTON_WORDS[r.button];
  if (r.hold) return `Hold ${DIR_WORDS[r.hold.dir]} for ${seconds(r.hold.frames)}, then ${r.dirs.map((d) => DIR_WORDS[d]).join(', ')} and ${button}`;
  if (r.jump) return `Jump, then ${button} in the air`;
  if (r.crouch) return `Hold down and press ${button}`;
  if (!r.dirs.length) return `Press ${button}`;
  if (r.dirs.length === 1) return `Hold ${DIR_WORDS[r.dirs[0]]} and press ${button}`;
  return `Roll ${r.dirs.map((d) => DIR_WORDS[d]).join(', ')}, then ${button}`;
}

/**
 * @param {InputRecipe} r
 * @param {KeyBinding} kb
 */
export function keyboardText(r, kb) {
  if (r.button === 'throw') return `${key('throw', kb)} (or ${key('L', kb)}+${key('M', kb)} together)`;
  const b = key(r.button, kb);
  if (r.hold) return `Hold ${dirKeys(r.hold.dir, kb)} for ${seconds(r.hold.frames)}, then ${r.dirs.map((d) => dirKeys(d, kb)).join(', ')} + ${b}`;
  if (r.jump) return `${dirKeys('8', kb)}, then ${b} in the air`;
  if (r.crouch) return `Hold ${dirKeys('2', kb)} + ${b}`;
  if (!r.dirs.length) return b;
  if (r.dirs.length === 1) return `${dirKeys(r.dirs[0], kb)} + ${b}`;
  return `${r.dirs.map((d) => dirKeys(d, kb)).join(', ')}, then ${b}`;
}

/**
 * @param {InputRecipe} r
 * @param {PadBinding} pad
 */
export function padText(r, pad) {
  if (r.button === 'throw') return `${padButton('throw', pad)} (or ${padButton('L', pad)} + ${padButton('M', pad)})`;
  const b = padButton(r.button, pad);
  if (r.hold) return `Hold ${ARROWS[r.hold.dir]} for ${seconds(r.hold.frames)}, then ${r.dirs.map((d) => ARROWS[d]).join(' ')} + ${b}`;
  if (r.jump) return `↑, then ${b} in the air`;
  if (r.crouch) return `Hold ↓ + ${b}`;
  if (!r.dirs.length) return b;
  if (r.dirs.length === 1) return `${ARROWS[r.dirs[0]]} + ${b}`;
  return `${r.dirs.map((d) => ARROWS[d]).join(' ')}, then ${b}`;
}

/**
 * The easy-special shortcut for a move, or null.
 * @param {MoveData} mv
 * @param {KeyBinding} kb
 * @param {PadBinding} pad
 * @returns {{ keyboard: string, pad: string } | null}
 */
export function easyText(mv, kb, pad) {
  if (!mv.easy) return null;
  const sp = key('SP', kb);
  const spPad = padButton('SP', pad);
  switch (mv.easy) {
    case '5': return { keyboard: `${sp} alone`, pad: `${spPad} alone` };
    case 'H': return { keyboard: `${sp} + ${key('H', kb)}`, pad: `${spPad} + ${padButton('H', pad)}` };
    default: return { keyboard: `${sp} + ${dirKeys(mv.easy, kb)}`, pad: `${spPad} + ${ARROWS[mv.easy]}` };
  }
}

/**
 * Everything the move list and the trials show for one move.
 * @param {MoveData} mv
 * @param {Record<string, import('../../engine/sim/types.js').MotionData>} motions
 * @param {{ kbA: KeyBinding, pad: PadBinding }} controls
 */
export function howTo(mv, motions, controls) {
  const r = recipe(mv, motions);
  const text = {
    arrows: arrowsText(r),
    words: wordsText(r),
    keyboard: keyboardText(r, controls.kbA),
    pad: padText(r, controls.pad),
    easy: easyText(mv, controls.kbA, controls.pad),
  };
  if (mv.kind === 'throw') {
    // Back throw: hold back as you throw.
    text.words = 'Light and Medium together, up close. Hold back to throw them behind you.';
    text.keyboard += `; hold ${dirKeys('4', controls.kbA)} to throw backwards`;
    text.pad += '; hold ← to throw backwards';
  }
  return text;
}

/**
 * Short labels for lesson texts: a direction or a button, with the
 * player's keyboard key and controller button. dir('6') → "→ (D / d-pad →)",
 * button('M') → "Medium (K / Y / △)".
 * @param {{ kbA: KeyBinding, pad: PadBinding }} controls
 */
export function keyLabels(controls) {
  return {
    /** @param {string} d */
    dir: (d) => `${ARROWS[d]} (${dirKeys(d, controls.kbA)} / d-pad ${ARROWS[d]})`,
    /** @param {'L'|'M'|'H'|'throw'|'SP'} b */
    button: (b) => `${b === 'throw' ? 'Throw' : b === 'SP' ? 'Special' : BUTTON_WORDS[b]} (${key(b, controls.kbA)} / ${padButton(b, controls.pad)})`,
    /** @param {MoveData} mv @param {Record<string, import('../../engine/sim/types.js').MotionData>} motions */
    move: (mv, motions) => {
      const r = recipe(mv, motions);
      return `${arrowsText(r)}: on the keyboard ${keyboardText(r, controls.kbA)}; on a controller ${padText(r, controls.pad)}`;
    },
  };
}
