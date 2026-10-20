/**
 * One frame of one player's input, as a single byte.
 *
 * Every input device (keyboard, gamepad, touch, the CPU, a replay, and in
 * session 2 the network) produces exactly this, once per simulation frame.
 * The simulation never sees a key or a button, only these bits:
 *
 *   bit   7    6   5   4   3      2     1     0
 *        SP    H   M   L   RIGHT  LEFT  DOWN  UP
 *
 * Directions are **absolute** (screen left and right). The simulation turns
 * them into forward and back using the fighter's facing on that frame
 * (`toNumpad`), so the same byte means "forward" for a fighter facing right
 * and "back" for one facing left, and recorded inputs replay correctly.
 *
 * L, M and H are the light, medium and heavy attack buttons. L+M together is
 * a throw. SP is the "easy specials" button (touch controls and assist).
 */

export const UP = 1;
export const DOWN = 2;
export const LEFT = 4;
export const RIGHT = 8;
export const L = 16;
export const M = 32;
export const H = 64;
export const SP = 128;

export const DIRECTIONS = UP | DOWN | LEFT | RIGHT;
export const BUTTONS = L | M | H | SP;

/** Button names to bits, for data files ('L', 'M', 'H', 'SP'). */
export const BUTTON_BITS = /** @type {const} */ ({ L, M, H, SP });

/**
 * Cleans up impossible combinations (SOCD: "simultaneous opposing cardinal
 * directions", which keyboards and hitboxes can produce): left + right is
 * neutral, and up + down is up.
 * @param {number} bits
 */
export function cleanInput(bits) {
  let b = bits & 0xff;
  if ((b & LEFT) && (b & RIGHT)) b &= ~(LEFT | RIGHT);
  if ((b & UP) && (b & DOWN)) b &= ~DOWN;
  return b;
}

/**
 * The direction in numpad notation, relative to facing: 6 is forward, 4 is
 * back, 2 down, 8 up, 3 down-forward, 1 down-back, 5 neutral.
 *
 *   7 8 9
 *   4 5 6     (for a fighter facing right; mirrored when facing left)
 *   1 2 3
 *
 * @param {number} bits
 * @param {number} facing  1 = facing right, -1 = facing left
 */
export function toNumpad(bits, facing) {
  const b = cleanInput(bits);
  const h = ((b & RIGHT) ? 1 : 0) - ((b & LEFT) ? 1 : 0);
  const v = (b & UP) ? 3 : (b & DOWN) ? -3 : 0;
  return 5 + h * facing + v;
}

/**
 * The reverse of toNumpad: a facing-relative numpad direction (and
 * buttons) back to absolute bits. Used by the CPU, the training dummy and
 * recordings, which think in forward/back.
 * @param {number} numpad  1-9
 * @param {number} facing
 * @param {number} [buttons=0]
 */
export function fromNumpad(numpad, facing, buttons = 0) {
  const col = ((numpad - 1) % 3) - 1; // -1 back, 0, +1 forward
  const row = Math.floor((numpad - 1) / 3); // 0 down, 1 neutral, 2 up
  let bits = buttons & BUTTONS;
  const abs = col * facing;
  if (abs > 0) bits |= RIGHT;
  if (abs < 0) bits |= LEFT;
  if (row === 0) bits |= DOWN;
  if (row === 2) bits |= UP;
  return bits;
}

/**
 * Converts absolute bits to facing-relative ones (RIGHT means forward):
 * how recordings are stored, so a recording made on the left side plays
 * back correctly from the right.
 * @param {number} bits
 * @param {number} facing
 */
export function toRelative(bits, facing) {
  if (facing === 1) return bits;
  const swapped = bits & ~(LEFT | RIGHT);
  return swapped | ((bits & LEFT) ? RIGHT : 0) | ((bits & RIGHT) ? LEFT : 0);
}

/** toRelative is its own inverse. */
export const fromRelative = toRelative;

/**
 * A short readable form for logs and the input display: "3+L", "6", "5+LM".
 * @param {number} bits
 * @param {number} facing
 */
export function describeInput(bits, facing) {
  const dir = toNumpad(bits, facing);
  const names = ['L', 'M', 'H', 'SP'].filter((n) => bits & BUTTON_BITS[/** @type {'L'} */ (n)]);
  return names.length ? `${dir}+${names.join('')}` : `${dir}`;
}
