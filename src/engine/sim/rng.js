/**
 * A seeded random number generator whose whole state is one integer kept in
 * the simulation state (`state.rng`), so saving the state saves the RNG and
 * loading it replays the same "random" numbers. xorshift32: fast, small,
 * and integer-only. The simulation never calls Math.random.
 */

/**
 * Advances the generator stored in `holder.rng` and returns the next value,
 * an integer in [0, 2^32).
 * @param {{ rng: number }} holder
 */
export function nextRandom(holder) {
  let x = holder.rng | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  holder.rng = x >>> 0;
  return holder.rng;
}

/**
 * An integer in [0, n).
 * @param {{ rng: number }} holder
 * @param {number} n
 */
export function randomInt(holder, n) {
  return nextRandom(holder) % n;
}

/**
 * A non-zero seed from any integer (xorshift's one forbidden state is 0).
 * @param {number} seed
 */
export function makeSeed(seed) {
  const s = (seed ^ 0x9e3779b9) >>> 0;
  return s === 0 ? 0x6d2b79f5 : s;
}
