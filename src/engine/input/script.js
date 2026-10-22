/**
 * Input scripts in numpad notation, relative to facing: one token per
 * frame, "token*n" holds it for n frames. "2 3 6+M 5*20" is down,
 * down-forward, forward with Medium, then 20 frames of nothing.
 * Used by the combo trials' demonstrations and the tutorial's dummy.
 */
import { fromNumpad, BUTTON_BITS } from './bits.js';

/**
 * @param {string} script
 * @returns {Array<{ dir: number, buttons: number }>}  One entry per frame.
 */
export function parseScript(script) {
  /** @type {Array<{ dir: number, buttons: number }>} */
  const out = [];
  for (const part of script.trim().split(/\s+/)) {
    if (!part) continue;
    const [token, count = '1'] = part.split('*');
    const [dir, buttons = ''] = token.split('+');
    let b = 0;
    for (const name of /** @type {const} */ (['L', 'M', 'H', 'SP'])) if (buttons.includes(name)) b |= BUTTON_BITS[name];
    const n = Number(count);
    if (!/^[1-9]$/.test(dir) || !Number.isInteger(n) || n < 1) throw new Error(`Bad input script token "${part}"`);
    for (let i = 0; i < n; i++) out.push({ dir: Number(dir), buttons: b });
  }
  return out;
}

/**
 * One frame of a parsed script as an input byte for a fighter facing `facing`.
 * @param {{ dir: number, buttons: number }} step
 * @param {number} facing
 */
export function scriptBits(step, facing) {
  return fromNumpad(step.dir, facing, step.buttons);
}
