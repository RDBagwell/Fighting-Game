/**
 * Small helpers that keep the character files readable. They only fill in
 * defaults; the result is plain data (`MoveData`, `HitData`), frozen.
 */

/** @typedef {import('../../../engine/sim/types.js').HitData} HitData */
/** @typedef {import('../../../engine/sim/types.js').MoveData} MoveData */
/** @typedef {import('../../../engine/sim/types.js').Box} Box */

/**
 * One hit. Everything not given takes the default below.
 * @param {[number, number]} frames
 * @param {Box[]} boxes
 * @param {Partial<HitData> & { damage: number, hitstun: number, blockstun: number }} props
 * @returns {HitData}
 */
export function hit(frames, boxes, props) {
  return { frames, boxes, chip: 0, hitstop: 10, guard: 'mid', push: 8, ...props };
}

/**
 * Freezes data deeply, so nothing at runtime can change a character.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}
