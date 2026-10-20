/**
 * Fixed-point numbers for the simulation.
 *
 * Positions and velocities are integers in **subpixels**: 256 subpixels to
 * one game pixel. Integer maths gives the same answer on every machine and
 * every JavaScript engine, which is what makes replays and rollback possible
 * (docs/FRAME-DATA.md, "Why the simulation must be deterministic").
 *
 * Plain + - * on integers below 2^31 are exact in JavaScript. Division goes
 * through `div`, which truncates, so a result is always an integer. Nothing
 * in the simulation uses Math.sin, Math.sqrt or anything else whose last bit
 * could differ between engines.
 */

/** Subpixels per game pixel. */
export const SUB = 256;

/**
 * Pixels (possibly fractional, as written in the data files) to subpixels.
 * Only used when data modules load, never inside a step.
 * @param {number} pixels
 */
export const px = (pixels) => Math.round(pixels * SUB);

/**
 * Integer division, truncating towards zero.
 * @param {number} a
 * @param {number} b
 */
export const div = (a, b) => Math.trunc(a / b);

/**
 * Subpixels to whole game pixels (floor), for drawing.
 * @param {number} sub
 */
export const toPixels = (sub) => Math.floor(sub / SUB);

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
