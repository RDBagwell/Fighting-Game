/**
 * Kenji, the footsies and zoning character: long, slow pokes that control
 * the space in front of him, a thrown kunai, a charge dash for whiff
 * punishes, and a projectile super. Sprites: "Martial Hero 2" by Luiz Melo
 * (CC0). His sheets face left (`nativeFacing: -1`).
 *
 * Units as in mack.js: boxes in pixels relative to the feet, facing right.
 */
import { px } from '../../../engine/sim/fixed.js';
import { hit, deepFreeze, strike, frames, guardCancel, burst } from './build.js';

/** @typedef {import('../../../engine/sim/types.js').MoveData} MoveData */

/**
 * Kunai: a thrown blade. L is slow (walk behind it), H fast.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function kunai(b) {
  return {
    name: `Kunai (${b})`,
    kind: 'special',
    notation: `236+${b}`,
    stance: 'stand',
    button: b,
    motion: 'qcf',
    priority: 1,
    easy: b === 'M' ? '5' : b === 'L' ? '2' : undefined,
    startup: 13,
    active: 1,
    recovery: 27,
    anim: [['attack1', 0, 6], ['attack1', 2, 6], ['attack1', 1, 4], ['attack1', 3, 24]],
    projectile: {
      frame: 13,
      x: 40,
      y: -78,
      vx: { L: px(4), M: px(6), H: px(8) }[b],
      life: 150,
      box: [-12, -6, 24, 12],
      hits: 1,
      look: 'kunai',
      hit: { damage: 65, chip: 8, hitstun: 18, blockstun: 14, hitstop: 8, guard: 'mid', push: 10 },
    },
    description: 'Throws a kunai. Only one on screen at a time.',
  };
}

/**
 * Iai Rush: a charge dash-thrust ([4]6). Covers half the screen; H knocks
 * down.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function iai(b) {
  const startup = { L: 9, M: 10, H: 11 }[b];
  const speed = { L: px(6), M: px(7), H: px(8) }[b];
  const run = { L: [3, 3, 2], M: [3, 3, 3], H: [3, 3, 4] }[b];
  return {
    name: `Iai Rush (${b})`,
    kind: 'special',
    notation: `[4]6+${b}`,
    stance: 'stand',
    button: b,
    motion: 'chargeBF',
    priority: 3,
    easy: b === 'M' ? '6' : b === 'H' ? '4' : undefined,
    startup,
    active: 4,
    recovery: 20,
    velocity: [[1, speed, 0], [startup + 4, 0, 0]],
    anim: [['run', 0, run[0]], ['run', 3, run[1]], ['run', 6, run[2]], ['attack1', 1, 4], ['attack1', 2, 10], ['attack1', 3, 10]],
    hits: [hit([startup, startup + 3], [[0, -78, 92, 18]], {
      damage: { L: 80, M: 90, H: 100 }[b], chip: 10, hitstun: 22, blockstun: 16, hitstop: 11, push: 12, knockdown: b === 'H',
    })],
    cancel: { on: 'hit', into: ['super'], frames: [startup, startup + 6] },
    description: 'Hold back, then forward + a button: a dashing thrust that punishes whiffs from far away.',
  };
}

/** @typedef {import('../../../engine/sim/types.js').CharacterData} CharacterData */

export const kenji = deepFreeze(/** @type {CharacterData} */ ({
  id: 'kenji',
  name: 'Kenji',
  title: 'The Patient Blade',
  style: 'Footsies and zoning',
  blurb: 'Long reach and a thrown kunai. Keep the opponent at the tip of the sword and punish them for walking in.',
  nativeFacing: /** @type {-1} */ (-1),
  sprites: {
    dir: 'sprites/kenji/',
    frameSize: 200,
    anchor: /** @type {[number, number]} */ ([102, 128]),
    scale: 2,
    sheets: { idle: 4, run: 8, jump: 2, fall: 2, attack1: 4, attack2: 4, 'take-hit': 3, death: 7 },
    color: '#3f6fd8',
  },
  stats: {
    health: 1050,
    walkForward: px(2),
    walkBack: px(2),
    jumpVx: px(3),
    jumpVy: px(-8.75),
    dash: { frames: 18, speed: px(6) },
    backdash: { frames: 22, speed: px(6.5), invuln: 7 },
  },
  boxes: {
    stand: { push: [-14, -96, 28, 96], hurt: [[-12, -112, 26, 24], [-16, -90, 34, 90]] },
    crouch: { push: [-15, -70, 30, 70], hurt: [[-16, -76, 36, 76]] },
    air: { push: [-14, -100, 28, 66], hurt: [[-16, -104, 34, 80]] },
    down: { push: [-24, -20, 48, 20], hurt: [] },
  },
  anims: {
    stand: { sheet: 'idle', len: 9 },
    walkF: { sheet: 'run', len: 6 },
    walkB: { sheet: 'run', len: 6, reverse: true },
    crouch: { sheet: 'idle', len: 12 },
    guard: { sheet: 'take-hit', len: 1, frame: 0 },
    jumpSquat: { sheet: 'idle', len: 1, frame: 0 },
    jump: { sheet: 'jump', len: 6 },
    fall: { sheet: 'fall', len: 6 },
    land: { sheet: 'idle', len: 1, frame: 0 },
    dashF: { sheet: 'run', len: 3 },
    dashB: { sheet: 'jump', len: 1, frame: 0 },
    hitstun: { sheet: 'take-hit', len: 5 },
    blockstun: { sheet: 'take-hit', len: 1, frame: 0 },
    airHit: { sheet: 'take-hit', len: 1, frame: 1 },
    knockdown: { sheet: 'death', len: 4 },
    wakeup: { sheet: 'death', len: 3, reverse: true },
    ko: { sheet: 'death', len: 6 },
    throwHold: { sheet: 'attack1', len: 1, frame: 0 },
    thrown: { sheet: 'take-hit', len: 1, frame: 1 },
    recover: { sheet: 'idle', len: 1, frame: 0 },
    parry: { sheet: 'attack1', len: 1, frame: 0 },
    win: { sheet: 'idle', len: 12 },
  },
  moves: {
    // ── Normals ──────────────────────────────────────────────────────
    '5L': {
      name: 'Needle', kind: 'normal', notation: '5L', stance: 'stand', button: 'L',
      startup: 6, active: 2, recovery: 10,
      anim: [['idle', 0, 2], ['attack1', 0, 3], ['attack1', 1, 2], ['attack1', 2, 5], ['attack1', 3, 5]],
      hits: [hit([6, 7], [[10, -80, 70, 14]], { damage: 28, hitstun: 14, blockstun: 11, hitstop: 8, push: 7 })],
      hurt: [{ frames: [6, 11], boxes: [[14, -80, 36, 12]] }],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [6, 12] },
      description: 'Quick jab with good reach for a light.',
    },
    '5M': {
      name: 'Long Thrust', kind: 'normal', notation: '5M', stance: 'stand', button: 'M',
      startup: 10, active: 3, recovery: 16,
      anim: [['idle', 0, 4], ['attack1', 0, 5], ['attack1', 1, 3], ['attack1', 1, 4], ['attack1', 2, 6], ['attack1', 3, 6]],
      hits: [hit([10, 12], [[10, -82, 124, 16]], { damage: 60, hitstun: 18, blockstun: 13, hitstop: 10, push: 10 })],
      hurt: [{ frames: [10, 22], boxes: [[14, -82, 70, 14]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [10, 18] },
      description: 'His best poke: huge reach. The sword arm can be hit while it is out.',
    },
    '5H': {
      name: 'Crescent Moon', kind: 'normal', notation: '5H', stance: 'stand', button: 'H',
      startup: 13, active: 4, recovery: 22,
      anim: [['idle', 0, 4], ['attack2', 0, 8], ['attack2', 1, 4], ['attack2', 1, 4], ['attack2', 2, 9], ['attack2', 3, 9]],
      hits: [hit([13, 16], [[0, -124, 128, 96]], { damage: 95, hitstun: 24, blockstun: 16, hitstop: 12, push: 16 })],
      hurt: [{ frames: [13, 24], boxes: [[14, -110, 60, 40]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [13, 21] },
      description: 'Wide arc that also catches jumps at range.',
    },
    '2L': {
      name: 'Shin Prick', kind: 'normal', notation: '2L', stance: 'crouch', button: 'L',
      startup: 6, active: 2, recovery: 10,
      anim: [['idle', 0, 2], ['attack1', 0, 3], ['attack1', 1, 2], ['attack1', 2, 5], ['attack1', 3, 5]],
      hits: [hit([6, 7], [[10, -28, 64, 14]], { damage: 24, hitstun: 13, blockstun: 10, hitstop: 8, push: 7, guard: 'low' })],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [6, 12] },
      description: 'Fast low.',
    },
    '2M': {
      name: 'Low Thrust', kind: 'normal', notation: '2M', stance: 'crouch', button: 'M',
      startup: 10, active: 3, recovery: 17,
      anim: [['idle', 0, 4], ['attack1', 0, 5], ['attack1', 1, 3], ['attack1', 1, 4], ['attack1', 2, 6], ['attack1', 3, 7]],
      hits: [hit([10, 12], [[10, -28, 112, 16]], { damage: 50, hitstun: 20, blockstun: 14, hitstop: 10, push: 10, guard: 'low' })],
      hurt: [{ frames: [10, 22], boxes: [[14, -28, 60, 14]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [10, 18] },
      description: 'Long low poke; cancel into a kunai so the opponent can’t walk in.',
    },
    '2H': {
      name: 'Rising Moon', kind: 'normal', notation: '2H', stance: 'crouch', button: 'H',
      startup: 8, active: 5, recovery: 22,
      anim: [['attack2', 0, 7], ['attack2', 1, 5], ['attack2', 1, 4], ['attack2', 2, 9], ['attack2', 3, 9]],
      hits: [hit([8, 12], [[-10, -146, 84, 126]], { damage: 75, hitstun: 24, blockstun: 14, hitstop: 12, push: 10, launch: [px(1.5), px(-7.5)], knockdown: true })],
      cancel: { on: 'hit', into: ['special', 'super'], frames: [8, 14] },
      description: 'Anti-air with a tall hitbox. Knocks down; very unsafe on block.',
    },
    '6M': {
      name: 'Helm Splitter', kind: 'normal', notation: '6M', stance: 'stand', button: 'M', dir: 6,
      startup: 20, active: 3, recovery: 12,
      anim: [['idle', 0, 8], ['attack2', 0, 11], ['attack2', 1, 3], ['attack2', 2, 6], ['attack2', 3, 6]],
      hits: [hit([20, 22], [[10, -124, 70, 100]], { damage: 55, hitstun: 18, blockstun: 12, hitstop: 11, push: 9, guard: 'high' })],
      description: 'Overhead: must be blocked standing.',
    },
    'j.L': {
      name: 'Air Needle', kind: 'normal', notation: 'j.L', stance: 'air', button: 'L',
      startup: 6, active: 4, recovery: 9, landing: 3,
      anim: [['attack1', 0, 5], ['attack1', 1, 4], ['attack1', 2, 9]],
      hits: [hit([6, 9], [[4, -72, 60, 18]], { damage: 32, hitstun: 12, blockstun: 9, hitstop: 8, push: 6, guard: 'high' })],
      description: 'Air-to-air poke.',
    },
    'j.M': {
      name: 'Falling Thrust', kind: 'normal', notation: 'j.M', stance: 'air', button: 'M',
      startup: 8, active: 5, recovery: 11, landing: 3,
      anim: [['attack1', 0, 7], ['attack1', 1, 5], ['attack1', 2, 11]],
      hits: [hit([8, 12], [[6, -48, 84, 30]], { damage: 55, hitstun: 16, blockstun: 12, hitstop: 10, push: 7, guard: 'high' })],
      description: 'Angled down-forward: a long-range jump-in.',
    },
    'j.H': {
      name: 'Moon Drop', kind: 'normal', notation: 'j.H', stance: 'air', button: 'H',
      startup: 11, active: 4, recovery: 15, landing: 4,
      anim: [['attack2', 0, 10], ['attack2', 1, 4], ['attack2', 2, 15]],
      hits: [hit([11, 14], [[0, -84, 90, 76]], { damage: 80, hitstun: 20, blockstun: 15, hitstop: 12, push: 8, guard: 'high' })],
      description: 'Big jump-in.',
    },
    throw: {
      name: 'Hip Toss', kind: 'throw', notation: 'L+M (4L+M: back)', stance: 'stand',
      startup: 5, active: 2, recovery: 22,
      anim: [['attack1', 0, 4], ['attack1', 1, 3], ['attack1', 3, 21]],
      throw: { box: [0, -88, 48, 88], damage: 100, techable: true, launch: [px(3), px(-4.5)], recovery: 16 },
      description: 'Beats blocking. Escape by pressing L+M as it grabs you.',
    },

    // ── Specials ─────────────────────────────────────────────────────
    '236L': kunai('L'),
    '236M': kunai('M'),
    '236H': kunai('H'),
    '46L': iai('L'),
    '46M': iai('M'),
    '46H': iai('H'),

    // ── Super ────────────────────────────────────────────────────────
    '236236H': {
      name: 'Tsukiotoshi: Falling Moon', kind: 'super', notation: '236236+H', stance: 'stand', button: 'H', motion: 'qcf2',
      easy: 'H', meterCost: 1000,
      startup: 10, active: 1, recovery: 34,
      invuln: [{ frames: [1, 9], kind: 'all' }],
      anim: [['attack2', 0, 9], ['attack2', 1, 6], ['attack2', 2, 15], ['attack2', 3, 14]],
      projectile: {
        frame: 10,
        x: 50,
        y: -64,
        vx: px(7),
        life: 100,
        box: [-34, -60, 68, 120],
        hits: 4,
        interval: 5,
        look: 'moon',
        hit: { damage: 70, chip: 15, hitstun: 32, blockstun: 22, hitstop: 6, guard: 'mid', push: 5 },
      },
      description: 'A crescent of light that crosses the screen and hits four times. Invincible as it starts.',
    },

    // ── Universal (the same frames for everyone, config.js) ─────────
    GC: guardCancel({ windup: [['attack2', 0], ['attack2', 1]], impact: [['attack2', 2]], recover: [['attack2', 3]] }, [0, -124, 128, 96], 'A quick draw out of a block. Costs half the meter.'),
    burst: burst({ windup: [['take-hit', 0], ['idle', 0]], impact: [['attack1', 2]], recover: [['attack1', 3], ['idle', 0]] }),
  },
}));
