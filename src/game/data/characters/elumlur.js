/**
 * Elumlur, the all-rounder: long-reaching energy slashes, a storm wave
 * thrown across the screen, an invincible rising lightning slash to get
 * out of pressure, and a lightning-arc super. Good at every range, best at
 * none. Sprites: "Fantasy Warrior" by Luiz Melo (CC0), drawn facing right.
 *
 * Units as in mack.js: boxes in pixels relative to the feet, facing right.
 */
import { px } from '../../../engine/sim/fixed.js';
import { hit, deepFreeze, strike, frames } from './build.js';

/** @typedef {import('../../../engine/sim/types.js').MoveData} MoveData */

/**
 * Storm Wave: a wave of energy thrown forward (236). L is slow (walk
 * behind it), H fast.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function stormWave(b) {
  const startup = 14;
  const recovery = 26;
  return {
    name: `Storm Wave (${b})`,
    kind: 'special',
    notation: `236+${b}`,
    stance: 'stand',
    button: b,
    motion: 'qcf',
    priority: 1,
    easy: b === 'M' ? '5' : b === 'H' ? '6' : undefined,
    startup,
    active: 1,
    recovery,
    anim: strike({ windup: frames('attack1', 1, 3), impact: [['attack1', 4]], recover: frames('attack1', 5, 6) }, startup, 1, recovery),
    projectile: {
      frame: startup,
      x: 44,
      y: -60,
      vx: { L: px(4.5), M: px(6), H: px(7.5) }[b],
      life: 140,
      box: [-14, -16, 28, 32],
      hits: 1,
      look: 'wave',
      hit: { damage: 70, chip: 10, hitstun: 18, blockstun: 14, hitstop: 9, guard: 'mid', push: 10 },
    },
    description: 'Throws a wave of storm energy. Only one on screen at a time.',
  };
}

/**
 * Thunder Rise: the rising lightning slash (623). Invincible as it starts
 * (H: to everything); very punishable if blocked.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function thunderRise(b) {
  const windup = frames('attack3', 1, 3);
  /** @type {Record<string, MoveData>} */
  const v = {
    L: {
      name: 'Thunder Rise (L)', kind: 'special', notation: '623+L', stance: 'stand', button: 'L', motion: 'dp', priority: 2, easy: '4',
      startup: 5, active: 6, recovery: 24,
      velocity: [[3, px(1.25), px(-7)]],
      invuln: [{ frames: [1, 4], kind: 'strike' }],
      anim: strike({ windup, impact: [['attack3', 4]], recover: [['attack3', 5], ['fall', 0], ['fall', 1]] }, 5, 6, 24),
      hits: [hit([5, 10], [[-8, -136, 64, 136]], { damage: 85, chip: 12, hitstun: 30, blockstun: 16, hitstop: 12, launch: [px(1), px(-7)], knockdown: true })],
      cancel: { on: 'hit', into: ['super'], frames: [5, 9] },
      description: 'A rising lightning slash, invincible to strikes for frames 1-4.',
    },
    M: {
      name: 'Thunder Rise (M)', kind: 'special', notation: '623+M', stance: 'stand', button: 'M', motion: 'dp', priority: 2, easy: '2',
      startup: 5, active: 8, recovery: 26,
      velocity: [[3, px(1.25), px(-8)]],
      invuln: [{ frames: [1, 6], kind: 'strike' }],
      anim: strike({ windup, impact: [['attack3', 4]], recover: [['attack3', 5], ['fall', 0], ['fall', 1]] }, 5, 8, 26),
      hits: [hit([5, 12], [[-8, -140, 64, 140]], { damage: 105, chip: 14, hitstun: 30, blockstun: 16, hitstop: 12, launch: [px(1), px(-7.5)], knockdown: true })],
      cancel: { on: 'hit', into: ['super'], frames: [5, 10] },
      description: 'Higher and longer; invincible to strikes for frames 1-6.',
    },
    H: {
      name: 'Thunder Rise (H)', kind: 'special', notation: '623+H', stance: 'stand', button: 'H', motion: 'dp', priority: 2,
      startup: 6, active: 8, recovery: 28,
      velocity: [[3, px(1.25), px(-9)]],
      invuln: [{ frames: [1, 9], kind: 'all' }],
      anim: strike({ windup, impact: [['attack3', 4], ['attack3', 6]], recover: [['attack3', 5], ['fall', 0], ['fall', 1]] }, 6, 8, 28),
      hits: [
        hit([6, 8], [[-8, -126, 64, 126]], { damage: 65, chip: 8, hitstun: 30, blockstun: 16, hitstop: 8, launch: [px(0.5), px(-9)], knockdown: true }),
        hit([9, 13], [[-8, -156, 70, 146]], { damage: 60, chip: 8, hitstun: 30, blockstun: 16, hitstop: 12, launch: [px(1), px(-7)], knockdown: true }),
      ],
      description: 'Two hits, fully invincible for frames 1-9: the reversal.',
    },
  };
  return v[b];
}

/** @typedef {import('../../../engine/sim/types.js').CharacterData} CharacterData */

export const elumlur = deepFreeze(/** @type {CharacterData} */ ({
  id: 'elumlur',
  name: 'Elumlur',
  title: 'The Storm Blade',
  style: 'All-rounder',
  blurb: 'A wandering swordsman whose blade carries the storm. A wave to throw, reach to poke, and lightning to answer anyone who jumps in.',
  nativeFacing: /** @type {1} */ (1),
  sprites: {
    dir: 'sprites/elumlur/',
    frameSize: 162,
    anchor: /** @type {[number, number]} */ ([82, 101]),
    scale: 2.3,
    sheets: { idle: 10, run: 8, jump: 3, fall: 3, attack1: 7, attack2: 7, attack3: 8, 'take-hit': 3, death: 7 },
    offsets: { jump: [0, 2] },
    // Measured from the feet in each frame (ASSETS.md): his attacks step back as they wind up.
    frameShift: { 'attack1:1': -12, 'attack1:2': -17, 'attack1:3': -16, 'attack2:2': -23, 'attack2:3': -13, 'attack2:4': -16, 'attack2:5': -12, 'attack2:6': -12, 'attack3:0': -14, 'attack3:1': -15, 'attack3:2': -16, 'attack3:3': -14 },
    color: '#3fc6d8',
  },
  stats: {
    health: 1060,
    walkForward: px(2.25),
    walkBack: px(2),
    jumpVx: px(3.1),
    jumpVy: px(-9),
    dash: { frames: 16, speed: px(6.75) },
    backdash: { frames: 21, speed: px(6.25), invuln: 6 },
  },
  boxes: {
    stand: { push: [-14, -96, 28, 96], hurt: [[-12, -108, 26, 24], [-16, -86, 34, 86]] },
    crouch: { push: [-15, -68, 30, 68], hurt: [[-16, -74, 36, 74]] },
    air: { push: [-14, -98, 28, 66], hurt: [[-16, -102, 34, 78]] },
    down: { push: [-24, -20, 48, 20], hurt: [] },
  },
  anims: {
    stand: { sheet: 'idle', len: 6 },
    walkF: { sheet: 'run', len: 5 },
    walkB: { sheet: 'run', len: 6, reverse: true },
    crouch: { sheet: 'idle', len: 8 },
    guard: { sheet: 'take-hit', len: 1, frame: 0 },
    jumpSquat: { sheet: 'idle', len: 1, frame: 0 },
    jump: { sheet: 'jump', len: 5 },
    fall: { sheet: 'fall', len: 5 },
    land: { sheet: 'idle', len: 1, frame: 0 },
    dashF: { sheet: 'run', len: 2 },
    dashB: { sheet: 'jump', len: 1, frame: 0 },
    hitstun: { sheet: 'take-hit', len: 5 },
    blockstun: { sheet: 'take-hit', len: 1, frame: 0 },
    airHit: { sheet: 'take-hit', len: 1, frame: 1 },
    knockdown: { sheet: 'death', len: 4 },
    wakeup: { sheet: 'death', len: 3, reverse: true },
    ko: { sheet: 'death', len: 6 },
    throwHold: { sheet: 'attack1', len: 1, frame: 1 },
    thrown: { sheet: 'take-hit', len: 1, frame: 1 },
    recover: { sheet: 'idle', len: 1, frame: 0 },
    win: { sheet: 'idle', len: 9 },
  },
  moves: {
    // ── Normals ──────────────────────────────────────────────────────
    '5L': {
      name: 'Spark Cut', kind: 'normal', notation: '5L', stance: 'stand', button: 'L',
      startup: 5, active: 2, recovery: 10,
      anim: strike({ windup: [['attack1', 1]], impact: [['attack1', 4]], recover: frames('attack1', 5, 6) }, 5, 2, 10),
      hits: [hit([5, 6], [[10, -82, 58, 20]], { damage: 32, hitstun: 14, blockstun: 11, hitstop: 8, push: 7 })],
      hurt: [{ frames: [5, 10], boxes: [[14, -80, 30, 14]] }],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [5, 10] },
      description: 'Fast and even on block.',
    },
    '5M': {
      name: 'Arc Slash', kind: 'normal', notation: '5M', stance: 'stand', button: 'M',
      startup: 9, active: 3, recovery: 15,
      anim: strike({ windup: frames('attack1', 1, 3), impact: [['attack1', 4]], recover: frames('attack1', 5, 6) }, 9, 3, 15),
      hits: [hit([9, 11], [[12, -88, 90, 28]], { damage: 64, hitstun: 18, blockstun: 14, hitstop: 10, push: 9 })],
      hurt: [{ frames: [9, 17], boxes: [[14, -86, 50, 20]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [9, 17] },
      description: 'The energy trail gives it long reach. Cancel it into Storm Wave.',
    },
    '5H': {
      name: 'Cyclone Edge', kind: 'normal', notation: '5H', stance: 'stand', button: 'H',
      startup: 12, active: 4, recovery: 21,
      anim: strike({ windup: frames('attack2', 0, 1), impact: frames('attack2', 2, 3), recover: frames('attack2', 4, 6) }, 12, 4, 21),
      hits: [hit([12, 15], [[0, -112, 100, 92]], { damage: 95, hitstun: 22, blockstun: 16, hitstop: 12, push: 14 })],
      hurt: [{ frames: [12, 22], boxes: [[14, -100, 50, 40]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [12, 20] },
      description: 'A spinning storm slash with a wide arc. -7 on block.',
    },
    '2L': {
      name: 'Low Spark', kind: 'normal', notation: '2L', stance: 'crouch', button: 'L',
      startup: 5, active: 2, recovery: 10,
      anim: strike({ windup: [['attack1', 1]], impact: [['attack1', 4]], recover: frames('attack1', 5, 6) }, 5, 2, 10),
      hits: [hit([5, 6], [[10, -30, 56, 16]], { damage: 27, hitstun: 13, blockstun: 10, hitstop: 8, push: 7, guard: 'low' })],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [5, 10] },
      description: 'Fast low. Must be blocked crouching.',
    },
    '2M': {
      name: 'Ground Current', kind: 'normal', notation: '2M', stance: 'crouch', button: 'M',
      startup: 9, active: 3, recovery: 16,
      anim: strike({ windup: frames('attack2', 0, 1), impact: [['attack2', 2]], recover: frames('attack2', 3, 4) }, 9, 3, 16),
      hits: [hit([9, 11], [[12, -26, 88, 20]], { damage: 50, hitstun: 17, blockstun: 13, hitstop: 10, push: 9, guard: 'low' })],
      hurt: [{ frames: [9, 17], boxes: [[14, -26, 48, 16]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [9, 17] },
      description: 'Long low arc of energy. Cancels into specials.',
    },
    '2H': {
      name: 'Updraft', kind: 'normal', notation: '2H', stance: 'crouch', button: 'H',
      startup: 9, active: 4, recovery: 24,
      anim: strike({ windup: frames('attack3', 1, 3), impact: [['attack3', 4]], recover: frames('attack3', 5, 7) }, 9, 4, 24),
      hits: [hit([9, 12], [[-8, -140, 70, 124]], { damage: 72, hitstun: 24, blockstun: 14, hitstop: 12, push: 10, launch: [px(1.5), px(-8)], knockdown: true })],
      cancel: { on: 'hit', into: ['special', 'super'], frames: [9, 14] },
      description: 'Anti-air and launcher. Very unsafe on block.',
    },
    '6M': {
      name: 'Thunderclap', kind: 'normal', notation: '6M', stance: 'stand', button: 'M', dir: 6,
      startup: 18, active: 3, recovery: 14,
      velocity: [[1, px(1.5), 0], [17, 0, 0]],
      anim: strike({ windup: frames('attack3', 0, 3), impact: [['attack3', 4]], recover: frames('attack3', 5, 7) }, 18, 3, 14),
      hits: [hit([18, 20], [[10, -118, 64, 96]], { damage: 62, hitstun: 20, blockstun: 14, hitstop: 11, push: 9, guard: 'high' })],
      description: 'Overhead: must be blocked standing.',
    },
    'j.L': {
      name: 'Air Spark', kind: 'normal', notation: 'j.L', stance: 'air', button: 'L',
      startup: 5, active: 4, recovery: 10, landing: 3,
      anim: strike({ windup: [['attack1', 1]], impact: [['attack1', 4]], recover: [['attack1', 5]] }, 5, 4, 10),
      hits: [hit([5, 8], [[4, -70, 52, 26]], { damage: 35, hitstun: 12, blockstun: 9, hitstop: 8, push: 6, guard: 'high' })],
      description: 'Fast air button; beats other jumps.',
    },
    'j.M': {
      name: 'Gale Turn', kind: 'normal', notation: 'j.M', stance: 'air', button: 'M',
      startup: 7, active: 5, recovery: 12, landing: 3,
      anim: strike({ windup: frames('attack2', 0, 1), impact: [['attack2', 2]], recover: [['attack2', 3]] }, 7, 5, 12),
      hits: [hit([7, 11], [[-22, -58, 84, 48]], { damage: 55, hitstun: 16, blockstun: 12, hitstop: 10, push: 7, guard: 'high' })],
      description: 'A spinning slash that hits behind you too: the cross-up.',
    },
    'j.H': {
      name: 'Falling Storm', kind: 'normal', notation: 'j.H', stance: 'air', button: 'H',
      startup: 10, active: 4, recovery: 16, landing: 4,
      anim: strike({ windup: frames('attack3', 2, 3), impact: [['attack3', 4]], recover: [['attack3', 5]] }, 10, 4, 16),
      hits: [hit([10, 13], [[4, -84, 84, 74]], { damage: 82, hitstun: 20, blockstun: 15, hitstop: 12, push: 8, guard: 'high' })],
      description: 'Big jump-in that leads to a full combo on landing.',
    },
    throw: {
      name: 'Storm Grip', kind: 'throw', notation: 'L+M (4L+M: back)', stance: 'stand',
      startup: 5, active: 2, recovery: 22,
      anim: [['attack1', 0, 4], ['attack1', 1, 3], ['attack1', 6, 21]],
      throw: { box: [0, -86, 50, 86], damage: 110, techable: true, launch: [px(2.5), px(-5)], recovery: 18 },
      description: 'Beats blocking. Escape by pressing L+M as it grabs you.',
    },

    // ── Specials ─────────────────────────────────────────────────────
    '236L': stormWave('L'),
    '236M': stormWave('M'),
    '236H': stormWave('H'),
    '623L': thunderRise('L'),
    '623M': thunderRise('M'),
    '623H': thunderRise('H'),

    // ── Super ────────────────────────────────────────────────────────
    '236236H': {
      name: 'Storm Arc', kind: 'super', notation: '236236+H', stance: 'stand', button: 'H', motion: 'qcf2',
      easy: 'H', meterCost: 1000,
      startup: 8, active: 18, recovery: 30,
      invuln: [{ frames: [1, 12], kind: 'all' }],
      anim: [['attack3', 1, 3], ['attack3', 3, 4], ['attack3', 4, 6], ['attack2', 2, 6], ['attack3', 6, 6], ['attack3', 4, 6], ['attack3', 5, 12], ['attack3', 7, 12]],
      hits: [
        hit([8, 9], [[-30, -170, 140, 170]], { damage: 55, chip: 10, hitstun: 30, blockstun: 20, hitstop: 4, push: 1 }),
        hit([13, 14], [[-30, -170, 140, 170]], { damage: 55, chip: 10, hitstun: 30, blockstun: 20, hitstop: 4, push: 1 }),
        hit([18, 19], [[-30, -170, 140, 170]], { damage: 55, chip: 10, hitstun: 30, blockstun: 20, hitstop: 4, push: 1 }),
        hit([23, 25], [[-30, -180, 150, 180]], { damage: 135, chip: 20, hitstun: 30, blockstun: 16, hitstop: 18, push: 16, launch: [px(2.5), px(-9)], knockdown: true }),
      ],
      description: 'Lightning arcs all around him: four hits, invincible as it starts, and it catches jumps too. Costs the full meter.',
    },
  },
}));
