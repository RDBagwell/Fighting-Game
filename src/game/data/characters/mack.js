/**
 * Mack, the rushdown character: fast normals that are plus on block, a
 * dashing slash to close distance, an invincible rising slash to stop
 * jumps, and a rushing super. Sprites: "Martial Hero" by Luiz Melo (CC0).
 *
 * Units: boxes in pixels relative to the feet, facing right ([x, y, w, h],
 * y negative is up); speeds in subpixels/frame via px(); time in frames.
 * Every move's frame data is checked by tests/characters.test.js and
 * measured against the simulation by tests/frameData.test.js.
 */
import { px } from '../../../engine/sim/fixed.js';
import { hit, deepFreeze } from './build.js';

/** @typedef {import('../../../engine/sim/types.js').MoveData} MoveData */

/**
 * Shippu: a dashing slash. L, M and H travel further and hit harder; H
 * knocks down.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function shippu(b) {
  const speed = { L: px(3.5), M: px(4.5), H: px(5.5) }[b];
  return {
    name: `Shippū (${b})`,
    kind: 'special',
    notation: `236+${b}`,
    stance: 'stand',
    button: b,
    motion: 'qcf',
    priority: 1,
    easy: b === 'M' ? '5' : b === 'H' ? '6' : undefined,
    startup: 12,
    active: 4,
    recovery: 18,
    velocity: [[1, speed, 0], [12, Math.trunc(speed / 2), 0], [16, 0, 0]],
    anim: [['run', 0, 3], ['run', 2, 3], ['run', 4, 3], ['run', 6, 2], ['attack1', 4, 4], ['attack1', 5, 8], ['attack1', 3, 10]],
    hits: [hit([12, 15], [[0, -84, 72, 30]], {
      damage: { L: 80, M: 90, H: 100 }[b], chip: 10, hitstun: 20, blockstun: 14, hitstop: 11, push: 12,
      knockdown: b === 'H',
    })],
    cancel: { on: 'hit', into: ['super'], frames: [12, 18] },
    description: 'Dashes in with a slash. Closes distance; about -7 on block, so space it.',
  };
}

/**
 * Tenkū: the rising slash ("dragon punch"). Invincible to strikes as it
 * starts (H: to everything), so it beats jump-ins; hugely punishable if
 * blocked or whiffed.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function tenku(b) {
  /** @type {Record<string, MoveData>} */
  const v = {
    L: {
      name: 'Tenkū (L)', kind: 'special', notation: '623+L', stance: 'stand', button: 'L', motion: 'dp', priority: 2, easy: '4',
      startup: 5, active: 6, recovery: 24,
      velocity: [[3, px(1.5), px(-7)]],
      invuln: [{ frames: [1, 4], kind: 'strike' }],
      anim: [['attack2', 0, 2], ['attack2', 2, 2], ['attack2', 4, 6], ['attack2', 5, 8], ['fall', 0, 8], ['fall', 1, 8]],
      hits: [hit([5, 10], [[-4, -128, 60, 128]], { damage: 90, chip: 12, hitstun: 30, blockstun: 16, hitstop: 12, launch: [px(1), px(-7)], knockdown: true })],
      cancel: { on: 'hit', into: ['super'], frames: [5, 9] },
      description: 'Rising anti-air slash, invincible to strikes for frames 1-4.',
    },
    M: {
      name: 'Tenkū (M)', kind: 'special', notation: '623+M', stance: 'stand', button: 'M', motion: 'dp', priority: 2, easy: '2',
      startup: 5, active: 8, recovery: 26,
      velocity: [[3, px(1.5), px(-8)]],
      invuln: [{ frames: [1, 6], kind: 'strike' }],
      anim: [['attack2', 0, 2], ['attack2', 2, 2], ['attack2', 4, 8], ['attack2', 5, 8], ['fall', 0, 9], ['fall', 1, 9]],
      hits: [hit([5, 12], [[-4, -132, 60, 132]], { damage: 110, chip: 14, hitstun: 30, blockstun: 16, hitstop: 12, launch: [px(1), px(-7.5)], knockdown: true })],
      cancel: { on: 'hit', into: ['super'], frames: [5, 10] },
      description: 'Higher and longer; invincible to strikes for frames 1-6.',
    },
    H: {
      name: 'Tenkū (H)', kind: 'special', notation: '623+H', stance: 'stand', button: 'H', motion: 'dp', priority: 2,
      startup: 6, active: 8, recovery: 28,
      velocity: [[3, px(1.5), px(-9)]],
      invuln: [{ frames: [1, 9], kind: 'all' }],
      anim: [['attack2', 0, 3], ['attack2', 2, 2], ['attack2', 4, 8], ['attack2', 5, 8], ['fall', 0, 10], ['fall', 1, 10]],
      hits: [
        hit([6, 8], [[-4, -120, 60, 120]], { damage: 70, chip: 8, hitstun: 30, blockstun: 16, hitstop: 8, launch: [px(0.5), px(-9)], knockdown: true }),
        hit([9, 13], [[-4, -150, 64, 140]], { damage: 60, chip: 8, hitstun: 30, blockstun: 16, hitstop: 12, launch: [px(1), px(-7)], knockdown: true }),
      ],
      description: 'Two hits, fully invincible for frames 1-9: the reversal to get out of pressure.',
    },
  };
  return v[b];
}

/** @typedef {import('../../../engine/sim/types.js').CharacterData} CharacterData */

export const mack = deepFreeze(/** @type {CharacterData} */ ({
  id: 'mack',
  name: 'Mack',
  title: 'The Crimson Gale',
  style: 'Rushdown',
  blurb: 'Fast, plus on block, and always coming forward. Dash in, keep the pressure on, and stop jumps with the rising slash.',
  nativeFacing: /** @type {1} */ (1),
  sprites: {
    dir: 'sprites/mack/',
    frameSize: 200,
    anchor: /** @type {[number, number]} */ ([95, 122]),
    scale: 2,
    sheets: { idle: 8, run: 8, jump: 2, fall: 2, attack1: 6, attack2: 6, 'take-hit': 4, death: 6 },
    color: '#d8433a',
  },
  stats: {
    health: 1000,
    walkForward: px(2.5),
    walkBack: px(2),
    jumpVx: px(3.25),
    jumpVy: px(-9),
    dash: { frames: 16, speed: px(7) },
    backdash: { frames: 20, speed: px(6), invuln: 6 },
  },
  boxes: {
    stand: { push: [-14, -92, 28, 92], hurt: [[-12, -106, 26, 24], [-16, -84, 34, 84]] },
    crouch: { push: [-15, -66, 30, 66], hurt: [[-16, -72, 36, 72]] },
    air: { push: [-14, -96, 28, 64], hurt: [[-16, -100, 34, 76]] },
    down: { push: [-24, -20, 48, 20], hurt: [] },
  },
  anims: {
    stand: { sheet: 'idle', len: 6 },
    walkF: { sheet: 'run', len: 5 },
    walkB: { sheet: 'run', len: 6, reverse: true },
    crouch: { sheet: 'idle', len: 8 },
    guard: { sheet: 'take-hit', len: 1, frame: 0 },
    jumpSquat: { sheet: 'idle', len: 1, frame: 0 },
    jump: { sheet: 'jump', len: 6 },
    fall: { sheet: 'fall', len: 6 },
    land: { sheet: 'idle', len: 1, frame: 0 },
    dashF: { sheet: 'run', len: 2 },
    dashB: { sheet: 'jump', len: 1, frame: 0 },
    hitstun: { sheet: 'take-hit', len: 4 },
    blockstun: { sheet: 'take-hit', len: 1, frame: 0 },
    airHit: { sheet: 'take-hit', len: 1, frame: 1 },
    knockdown: { sheet: 'death', len: 5 },
    wakeup: { sheet: 'death', len: 4, reverse: true },
    ko: { sheet: 'death', len: 7 },
    throwHold: { sheet: 'attack1', len: 1, frame: 1 },
    thrown: { sheet: 'take-hit', len: 1, frame: 1 },
    recover: { sheet: 'idle', len: 1, frame: 0 },
    win: { sheet: 'idle', len: 9 },
  },
  moves: {
    // ── Normals ──────────────────────────────────────────────────────
    '5L': {
      name: 'Quick Cut', kind: 'normal', notation: '5L', stance: 'stand', button: 'L',
      startup: 5, active: 2, recovery: 9,
      anim: [['attack1', 1, 2], ['attack1', 3, 2], ['attack1', 4, 2], ['attack1', 5, 4], ['attack1', 3, 5]],
      hits: [hit([5, 6], [[10, -80, 58, 18]], { damage: 30, hitstun: 14, blockstun: 11, hitstop: 8, push: 7 })],
      hurt: [{ frames: [5, 10], boxes: [[14, -78, 30, 14]] }],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [5, 10] },
      description: 'Your fastest button. +1 on block: keep pressing.',
    },
    '5M': {
      name: 'Stepping Slash', kind: 'normal', notation: '5M', stance: 'stand', button: 'M',
      startup: 8, active: 3, recovery: 14,
      velocity: [[1, px(2.5), 0], [8, 0, 0]],
      anim: [['attack1', 0, 3], ['attack1', 2, 4], ['attack1', 4, 3], ['attack1', 5, 7], ['attack1', 3, 7]],
      hits: [hit([8, 10], [[12, -86, 72, 22]], { damage: 55, hitstun: 18, blockstun: 14, hitstop: 10, push: 9 })],
      hurt: [{ frames: [8, 16], boxes: [[14, -84, 40, 18]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [8, 16] },
      description: 'Steps forward as it slashes. The button to cancel into Shippū.',
    },
    '5H': {
      name: 'Gale Cleave', kind: 'normal', notation: '5H', stance: 'stand', button: 'H',
      startup: 12, active: 4, recovery: 20,
      anim: [['attack2', 0, 4], ['attack2', 1, 4], ['attack2', 2, 3], ['attack2', 4, 4], ['attack2', 5, 10], ['attack2', 3, 10]],
      hits: [hit([12, 15], [[8, -112, 92, 72]], { damage: 90, hitstun: 22, blockstun: 16, hitstop: 12, push: 14 })],
      hurt: [{ frames: [12, 22], boxes: [[14, -100, 50, 40]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [12, 20] },
      description: 'A huge arc. Slow and -7 on block; a punish starter.',
    },
    '2L': {
      name: 'Low Cut', kind: 'normal', notation: '2L', stance: 'crouch', button: 'L',
      startup: 5, active: 2, recovery: 9,
      anim: [['attack1', 1, 2], ['attack1', 3, 2], ['attack1', 4, 2], ['attack1', 5, 4], ['attack1', 3, 5]],
      hits: [hit([5, 6], [[10, -30, 56, 16]], { damage: 25, hitstun: 13, blockstun: 10, hitstop: 8, push: 7, guard: 'low' })],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [5, 10] },
      description: 'Fast low. Must be blocked crouching.',
    },
    '2M': {
      name: 'Ankle Slash', kind: 'normal', notation: '2M', stance: 'crouch', button: 'M',
      startup: 8, active: 3, recovery: 15,
      anim: [['attack1', 0, 3], ['attack1', 2, 4], ['attack1', 4, 3], ['attack1', 5, 8], ['attack1', 3, 7]],
      hits: [hit([8, 10], [[12, -24, 80, 18]], { damage: 45, hitstun: 17, blockstun: 13, hitstop: 10, push: 9, guard: 'low' })],
      hurt: [{ frames: [8, 16], boxes: [[14, -26, 44, 16]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [8, 16] },
      description: 'Long low poke that cancels into specials.',
    },
    '2H': {
      name: 'Rising Gale', kind: 'normal', notation: '2H', stance: 'crouch', button: 'H',
      startup: 9, active: 4, recovery: 24,
      anim: [['attack2', 0, 4], ['attack2', 2, 4], ['attack2', 4, 4], ['attack2', 5, 12], ['attack2', 3, 12]],
      hits: [hit([9, 12], [[-6, -136, 66, 120]], { damage: 70, hitstun: 24, blockstun: 14, hitstop: 12, push: 10, launch: [px(1.5), px(-8)], knockdown: true })],
      cancel: { on: 'hit', into: ['special', 'super'], frames: [9, 14] },
      description: 'Anti-air and launcher: hits above you and knocks down. Very unsafe on block.',
    },
    '6M': {
      name: 'Falling Crescent', kind: 'normal', notation: '6M', stance: 'stand', button: 'M', dir: 6,
      startup: 18, active: 3, recovery: 14,
      velocity: [[1, px(1.5), 0], [17, 0, 0]],
      anim: [['attack2', 0, 6], ['attack2', 1, 6], ['attack2', 2, 5], ['attack2', 4, 3], ['attack2', 5, 8], ['attack2', 3, 6]],
      hits: [hit([18, 20], [[10, -116, 60, 92]], { damage: 60, hitstun: 20, blockstun: 14, hitstop: 11, push: 9, guard: 'high' })],
      description: 'Overhead: must be blocked standing. Slow, so mix it with 2M.',
    },
    'j.L': {
      name: 'Air Cut', kind: 'normal', notation: 'j.L', stance: 'air', button: 'L',
      startup: 5, active: 4, recovery: 10, landing: 3,
      anim: [['attack1', 3, 4], ['attack1', 4, 4], ['attack1', 5, 10]],
      hits: [hit([5, 8], [[4, -70, 52, 26]], { damage: 35, hitstun: 12, blockstun: 9, hitstop: 8, push: 6, guard: 'high' })],
      description: 'Fast air button; beats other jumps.',
    },
    'j.M': {
      name: 'Diving Slash', kind: 'normal', notation: 'j.M', stance: 'air', button: 'M',
      startup: 7, active: 5, recovery: 12, landing: 3,
      anim: [['attack1', 2, 6], ['attack1', 4, 5], ['attack1', 5, 12]],
      hits: [hit([7, 11], [[-22, -56, 82, 46]], { damage: 55, hitstun: 16, blockstun: 12, hitstop: 10, push: 7, guard: 'high' })],
      description: 'Hits a little behind you too: the cross-up.',
    },
    'j.H': {
      name: 'Skyfall Cleave', kind: 'normal', notation: 'j.H', stance: 'air', button: 'H',
      startup: 10, active: 4, recovery: 16, landing: 4,
      anim: [['attack2', 1, 5], ['attack2', 2, 4], ['attack2', 4, 4], ['attack2', 5, 16]],
      hits: [hit([10, 13], [[4, -80, 82, 70]], { damage: 80, hitstun: 20, blockstun: 15, hitstop: 12, push: 8, guard: 'high' })],
      description: 'Big jump-in that leads to a full combo on landing.',
    },
    throw: {
      name: 'Shoulder Throw', kind: 'throw', notation: 'L+M (4L+M: back)', stance: 'stand',
      startup: 5, active: 2, recovery: 22,
      anim: [['attack1', 0, 4], ['attack1', 1, 3], ['attack1', 3, 21]],
      throw: { box: [0, -84, 50, 84], damage: 110, techable: true, launch: [px(2.5), px(-5)], recovery: 18 },
      description: 'Beats blocking. Escape by pressing L+M as it grabs you.',
    },

    // ── Specials ─────────────────────────────────────────────────────
    '236L': shippu('L'),
    '236M': shippu('M'),
    '236H': shippu('H'),
    '623L': tenku('L'),
    '623M': tenku('M'),
    '623H': tenku('H'),

    // ── Super ────────────────────────────────────────────────────────
    '236236H': {
      name: 'Kazekiri: Hundred Gales', kind: 'super', notation: '236236+H', stance: 'stand', button: 'H', motion: 'qcf2',
      easy: 'H', meterCost: 1000,
      startup: 6, active: 15, recovery: 30,
      velocity: [[1, px(7), 0], [16, px(1), 0], [21, 0, 0]],
      invuln: [{ frames: [1, 10], kind: 'all' }],
      anim: [['run', 0, 2], ['run', 4, 3], ['attack1', 4, 3], ['attack1', 5, 3], ['attack2', 4, 3], ['attack2', 5, 3], ['attack2', 4, 3], ['attack2', 5, 12], ['attack1', 3, 18]],
      hits: [
        hit([6, 7], [[-10, -110, 84, 110]], { damage: 50, chip: 10, hitstun: 30, blockstun: 20, hitstop: 4, push: 1 }),
        hit([9, 10], [[-10, -110, 84, 110]], { damage: 50, chip: 10, hitstun: 30, blockstun: 20, hitstop: 4, push: 1 }),
        hit([12, 13], [[-10, -110, 84, 110]], { damage: 50, chip: 10, hitstun: 30, blockstun: 20, hitstop: 4, push: 1 }),
        hit([15, 16], [[-10, -110, 84, 110]], { damage: 50, chip: 10, hitstun: 30, blockstun: 20, hitstop: 4, push: 1 }),
        hit([18, 20], [[-10, -120, 96, 120]], { damage: 130, chip: 20, hitstun: 30, blockstun: 16, hitstop: 18, push: 16, launch: [px(3), px(-8)], knockdown: true }),
      ],
      description: 'A five-hit rush, invincible as it starts. Costs the full meter.',
    },
  },
}));
