/**
 * Small helpers that keep the character files readable. They only fill in
 * defaults; the result is plain data (`MoveData`, `HitData`), frozen.
 */

import { config } from '../config.js';
import { px } from '../../../engine/sim/fixed.js';

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

/**
 * A character's guard cancel (M+H while blocking): the same frames and
 * damage for everyone (config.guardCancel), invincible until its last
 * active frame, a knockdown on hit, very punishable on block. Only the
 * animation and the hitbox are the character's own.
 * @param {{ windup: Array<[string, number]>, impact: Array<[string, number]>, recover: Array<[string, number]> }} art
 * @param {Box} box
 * @param {string} description
 * @returns {MoveData}
 */
export function guardCancel(art, box, description) {
  const { startup, active, recovery, damage } = config.guardCancel;
  const last = startup + active - 1;
  return {
    name: 'Guard Cancel', kind: 'guardCancel', notation: 'M+H (blocking)', stance: 'stand',
    startup, active, recovery,
    invuln: [{ frames: [1, last], kind: 'all' }],
    anim: strike(art, startup, active, recovery),
    hits: [hit([startup, last], [box], { damage, hitstun: 20, blockstun: 12, hitstop: 10, push: 16, knockdown: true })],
    description,
  };
}

/**
 * A character's burst (L+M+H while being hit, once a round): the same
 * frames for everyone (config.burst). Invincible until its last active
 * frame, a wide hitbox all around (reaching down, for a burst in the air)
 * that knocks the attacker away without damage. It can be blocked, and
 * then it's very punishable.
 * @param {{ windup: Array<[string, number]>, impact: Array<[string, number]>, recover: Array<[string, number]> }} art
 * @returns {MoveData}
 */
export function burst(art) {
  const { startup, active, recovery } = config.burst;
  const last = startup + active - 1;
  return {
    name: 'Burst', kind: 'burst', notation: 'L+M+H (being hit)', stance: 'stand',
    startup, active, recovery,
    invuln: [{ frames: [1, last], kind: 'all' }],
    anim: strike(art, startup, active, recovery),
    hits: [hit([startup, last], [[-80, -180, 160, 260]], { damage: 0, hitstun: 20, blockstun: 20, hitstop: 14, push: 40, launch: [px(4), px(-7)], knockdown: true })],
    description: 'Breaks out of a combo: invincible, and knocks the attacker away. Once a round. It can be blocked, and then you are wide open.',
  };
}
