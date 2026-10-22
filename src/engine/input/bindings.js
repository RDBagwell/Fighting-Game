/**
 * Default controls and the actions they map to. Bindings are plain data
 * (stored in settings, remappable on the Controls screen); InputManager
 * turns them into the one-byte input the simulation reads (bits.js).
 */
import { UP, DOWN, LEFT, RIGHT, L, M, H, SP } from './bits.js';

/** @typedef {'up'|'down'|'left'|'right'|'L'|'M'|'H'|'SP'|'throw'|'parry'|'burst'} Action */

/** Every action, in the order the Controls screen lists them. */
export const ACTIONS = /** @type {Action[]} */ (['up', 'down', 'left', 'right', 'L', 'M', 'H', 'throw', 'parry', 'burst', 'SP']);

/**
 * What each action sets in the input byte. Throw is L and M together,
 * parry (and guard cancel) M and H, burst all three.
 */
export const ACTION_BITS = /** @type {Record<Action, number>} */ ({
  up: UP, down: DOWN, left: LEFT, right: RIGHT, L, M, H, SP, throw: L | M, parry: M | H, burst: L | M | H,
});

/** Names for the Controls screen and the move list. */
export const ACTION_LABELS = /** @type {Record<Action, string>} */ ({
  up: 'Up (jump)', down: 'Down (crouch)', left: 'Left', right: 'Right',
  L: 'Light attack', M: 'Medium attack', H: 'Heavy attack', throw: 'Throw (L+M)',
  parry: 'Parry / guard cancel (M+H)', burst: 'Burst (L+M+H)', SP: 'Easy special',
});

/**
 * @typedef {Record<Action, string[]>} KeyBinding  KeyboardEvent.code values per action.
 * @typedef {Record<Action, number[]>} PadBinding  Standard-mapping button indices per action.
 */

/** @type {{ kbA: KeyBinding, kbB: KeyBinding }} */
export const DEFAULT_KEYS = {
  // Left hand on WASD, right hand on J K L (and U for throw, I for easy
  // special, H for parry; E for burst, under the left hand).
  kbA: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    L: ['KeyJ'], M: ['KeyK'], H: ['KeyL'], throw: ['KeyU'], parry: ['KeyH'], burst: ['KeyE'], SP: ['KeyI'],
  },
  // Arrow keys with the number pad (or , . / ; on keyboards without one).
  kbB: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    L: ['Numpad1', 'Comma'], M: ['Numpad2', 'Period'], H: ['Numpad3', 'Slash'], throw: ['Numpad4', 'Semicolon'],
    parry: ['Numpad6', 'KeyM'], burst: ['Numpad0', 'Backslash'], SP: ['Numpad5', 'Quote'],
  },
};

/**
 * Gamepad, standard mapping: X = L, Y = M, B = H (the three attack buttons
 * in an arc), A = throw, LB = parry, RT = burst, RB = easy special; the
 * d-pad and the left stick move.
 * @type {PadBinding}
 */
export const DEFAULT_PAD = {
  up: [12], down: [13], left: [14], right: [15],
  L: [2], M: [3], H: [1], throw: [0], parry: [4], burst: [7], SP: [5],
};

/** Standard-mapping names for the Controls screen (Xbox / PlayStation). */
export const PAD_BUTTON_NAMES = [
  'A / ✕', 'B / ○', 'X / □', 'Y / △', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2',
  'View / Share', 'Menu / Options', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home',
];

/** Gamepad buttons that open the pause menu, and that reset in training. */
export const PAD_START = 9;
export const PAD_SELECT = 8;

/**
 * A readable name for a KeyboardEvent.code ("KeyJ" → "J").
 * @param {string} code
 */
export function keyName(code) {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace(/^Arrow/, '')
    .replace('Comma', ',')
    .replace('Period', '.')
    .replace('Slash', '/')
    .replace('Semicolon', ';')
    .replace('Quote', "'");
}

/**
 * Validates stored bindings: unknown actions dropped, missing ones filled
 * from the defaults, so a broken save can't leave a player without a key.
 * A default that the stored bindings already use for something else is
 * left out (settings saved before an action existed keep working).
 * @template {KeyBinding | PadBinding} T
 * @param {unknown} stored
 * @param {T} defaults
 * @returns {T}
 */
export function sanitiseBinding(stored, defaults) {
  const out = /** @type {Record<string, unknown[]>} */ ({});
  const src = stored && typeof stored === 'object' ? /** @type {Record<string, unknown>} */ (stored) : {};
  /** @type {string[]} */
  const missing = [];
  for (const action of ACTIONS) {
    const value = src[action];
    const def = /** @type {Record<string, unknown[]>} */ (defaults)[action];
    const valid = Array.isArray(value) && value.length && value.every((v) => typeof v === typeof def[0]);
    out[action] = valid ? value.slice(0, 3) : def.slice();
    if (!valid) missing.push(action);
  }
  if (missing.length < ACTIONS.length) {
    for (const action of missing) {
      const taken = ACTIONS.filter((a) => !missing.includes(a)).flatMap((a) => out[a]);
      const free = out[action].filter((v) => !taken.includes(v));
      if (free.length) out[action] = free;
    }
  }
  return /** @type {T} */ (/** @type {unknown} */ (out));
}
