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

/**
 * An attack's animation, exactly as long as the move (the validator checks):
 * the wind-up frames spread over the startup (before the first active
 * frame), the impact frames over the active frames, the follow-through
 * over the recovery. Each phase lists [sheet, frame] pairs; when a phase is
 * shorter than its frames, only the first ones show.
 * @param {{ windup: Array<[string, number]>, impact: Array<[string, number]>, recover: Array<[string, number]> }} frames
 * @param {number} startup
 * @param {number} active
 * @param {number} recovery
 * @returns {Array<[string, number, number]>}
 */
export function strike(frames, startup, active, recovery) {
  /** @type {Array<[string, number, number]>} */
  const out = [];
  /** @param {Array<[string, number]>} list @param {number} duration */
  const spread = (list, duration) => {
    const n = Math.min(list.length, duration);
    if (n === 0) return;
    const base = Math.floor(duration / n);
    let extra = duration - base * n;
    for (let i = 0; i < n; i++) {
      const d = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      out.push([list[i][0], list[i][1], d]);
    }
  };
  spread(frames.windup, startup - 1);
  spread(frames.impact, active);
  spread(frames.recover, recovery);
  return out;
}

/**
 * [sheet, frame] pairs for frames `from`..`to` of a sheet.
 * @param {string} sheet
 * @param {number} from
 * @param {number} to
 * @returns {Array<[string, number]>}
 */
export function frames(sheet, from, to) {
  /** @type {Array<[string, number]>} */
  const out = [];
  for (let i = from; i <= to; i++) out.push([sheet, i]);
  return out;
}
