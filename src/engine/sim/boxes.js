/**
 * Hitboxes, hurtboxes, throw boxes and pushboxes.
 *
 * - **Hurtbox**: where a fighter can be hit. Several per frame (head, body,
 *   an outstretched sword arm).
 * - **Hitbox**: where an attack hits, on its active frames only.
 * - **Throw box**: a throw's reach; it checks the opponent's pushbox.
 * - **Pushbox**: the body. Two pushboxes never overlap; walking into the
 *   opponent pushes them.
 *
 * Boxes are written in the data in pixels, facing right, relative to the
 * feet (`Box`). Here they become world rectangles in subpixels
 * [left, top, right, bottom], mirrored for a fighter facing left. The sim
 * and the training overlay both call `fighterBoxes`, so what you see is
 * exactly what is tested.
 */
import { SUB } from './fixed.js';

/** @typedef {import('./types.js').Box} Box */
/** @typedef {[number, number, number, number]} Rect  [left, top, right, bottom] in subpixels */

/**
 * @param {Box} box
 * @param {number} x  Origin, subpixels
 * @param {number} y
 * @param {number} facing
 * @returns {Rect}
 */
export function toWorld(box, x, y, facing) {
  const [bx, by, bw, bh] = box;
  const left = facing === 1 ? x + bx * SUB : x - (bx + bw) * SUB;
  const top = y + by * SUB;
  return [left, top, left + bw * SUB, top + bh * SUB];
}

/**
 * Strict overlap (touching edges don't count).
 * @param {Rect} a
 * @param {Rect} b
 */
export function overlaps(a, b) {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/**
 * The centre of the overlap of two rectangles (where to draw the hit spark).
 * @param {Rect} a
 * @param {Rect} b
 * @returns {[number, number]}
 */
export function overlapCentre(a, b) {
  const l = Math.max(a[0], b[0]);
  const r = Math.min(a[2], b[2]);
  const t = Math.max(a[1], b[1]);
  const btm = Math.min(a[3], b[3]);
  return [Math.trunc((l + r) / 2), Math.trunc((t + btm) / 2)];
}

/**
 * Which stance's boxes apply to a fighter right now.
 * @param {import('./types.js').FighterState} f
 * @param {import('./types.js').CharacterData} ch
 * @returns {'stand'|'crouch'|'air'|'down'}
 */
export function stanceOf(f, ch) {
  if (f.state === 'knockdown' || f.state === 'wakeup' || (f.state === 'ko' && f.y === 0)) return 'down';
  if (f.y < 0 || f.state === 'air' || f.state === 'airHit') return 'air';
  if (f.state === 'crouch') return 'crouch';
  if (f.state === 'blockstun' || f.state === 'hitstun' || f.state === 'parry') return f.crouching ? 'crouch' : 'stand';
  if (f.state === 'move') {
    const move = ch.moves[f.move];
    if (move && move.stance === 'crouch') return 'crouch';
  }
  return 'stand';
}

/**
 * @typedef {object} FighterBoxes
 * @property {Rect} push
 * @property {Rect[]} hurt
 * @property {Array<{ rect: Rect, hit: number }>} hit  Active hitboxes with the index of their hit in the move.
 * @property {Rect | null} throwBox
 */

/**
 * Every box of a fighter on this frame, in world space.
 * @param {import('./types.js').FighterState} f
 * @param {import('./types.js').CharacterData} ch
 * @returns {FighterBoxes}
 */
export function fighterBoxes(f, ch) {
  const stance = stanceOf(f, ch);
  const base = ch.boxes[stance];
  const push = toWorld(base.push, f.x, f.y, f.facing);
  const hurt = base.hurt.map((b) => toWorld(b, f.x, f.y, f.facing));
  /** @type {Array<{ rect: Rect, hit: number }>} */
  const hit = [];
  /** @type {Rect | null} */
  let throwBox = null;
  if (f.state === 'move') {
    const move = ch.moves[f.move];
    const t = f.moveFrame;
    for (const extra of move.hurt ?? []) {
      if (t >= extra.frames[0] && t <= extra.frames[1]) for (const b of extra.boxes) hurt.push(toWorld(b, f.x, f.y, f.facing));
    }
    (move.hits ?? []).forEach((h, i) => {
      if (t >= h.frames[0] && t <= h.frames[1]) for (const b of h.boxes) hit.push({ rect: toWorld(b, f.x, f.y, f.facing), hit: i });
    });
    if (move.throw && t >= move.startup && t < move.startup + move.active) throwBox = toWorld(move.throw.box, f.x, f.y, f.facing);
  }
  return { push, hurt, hit, throwBox };
}

/**
 * A projectile's hitbox in world space.
 * @param {import('./types.js').ProjectileState} p
 * @param {import('./types.js').ProjectileData} data
 */
export function projectileBox(p, data) {
  return toWorld(data.box, p.x, p.y, p.facing);
}
