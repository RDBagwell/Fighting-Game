/**
 * Mav, the heavy: the most health, long reach and the biggest
 * damage, paid for with the slowest walk, jump and buttons. A command grab
 * (214 + button) that can't be escaped punishes blocking; a stepping
 * cleave closes distance. Sprites: "Medieval King Pack 2" by Luiz Melo
 * (CC0), drawn facing right in 160×111 frames.
 *
 * Units as in mack.js: boxes in pixels relative to the feet, facing right.
 */
import { px } from '../../../engine/sim/fixed.js';
import { hit, deepFreeze, strike, frames, guardCancel, burst } from './build.js';

/** @typedef {import('../../../engine/sim/types.js').MoveData} MoveData */

/**
 * Royal Decree: the command grab (214). Can't be escaped and beats
 * blocking; longer range with heavier buttons, but slow and very
 * punishable when it misses.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function royalDecree(b) {
  const startup = { L: 8, M: 9, H: 10 }[b];
  const reach = { L: 54, M: 60, H: 66 }[b];
  return {
    name: `Royal Decree (${b})`,
    kind: 'special',
    notation: `214+${b}`,
    stance: 'stand',
    button: b,
    motion: 'qcb',
    priority: 2,
    easy: b === 'M' ? '4' : b === 'L' ? '2' : undefined,
    startup,
    active: 2,
    recovery: 34,
    anim: strike({ windup: frames('attack2', 0, 1), impact: [['attack1', 3]], recover: [['attack2', 3], ['idle', 0]] }, startup, 2, 34),
    throw: { box: [0, -94, reach, 94], damage: { L: 120, M: 130, H: 140 }[b], techable: false, launch: [px(3), px(-5.5)], recovery: 20 },
    description: 'A command grab that can’t be escaped. Beats blocking; very punishable if it misses.',
  };
}

/**
 * Crown Cleave: a stepping overhand slash (236). Heavier buttons step
 * further and hit harder; H knocks down.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function crownCleave(b) {
  const startup = { L: 14, M: 15, H: 16 }[b];
  const speed = { L: px(3), M: px(4), H: px(5) }[b];
  return {
    name: `Crown Cleave (${b})`,
    kind: 'special',
    notation: `236+${b}`,
    stance: 'stand',
    button: b,
    motion: 'qcf',
    priority: 1,
    easy: b === 'M' ? '5' : b === 'H' ? '6' : undefined,
    startup,
    active: 4,
    recovery: 22,
    velocity: [[1, speed, 0], [startup, 0, 0]],
    anim: strike({ windup: [...frames('run', 0, 5), ['attack2', 0], ['attack2', 1]], impact: [['attack2', 2]], recover: [['attack2', 3], ['idle', 0]] }, startup, 4, 22),
    hits: [hit([startup, startup + 3], [[0, -104, 100, 74]], {
      damage: { L: 90, M: 100, H: 115 }[b], chip: 14, hitstun: 22, blockstun: 15, hitstop: 13, push: 13,
      knockdown: b === 'H',
    })],
    cancel: { on: 'hit', into: ['super'], frames: [startup, startup + 6] },
    description: 'Steps in with a heavy cleave. Covers ground; about -9 on block.',
  };
}

/** @typedef {import('../../../engine/sim/types.js').CharacterData} CharacterData */

export const mav = deepFreeze(/** @type {CharacterData} */ ({
  id: 'mav',
  name: 'Mav',
  title: 'The Iron King',
  style: 'Heavy grappler',
  blurb: 'A king who settles disputes himself. Slow to move and slow to swing, but he can take the most punishment, and a blocked opponent is one grab away from losing the round.',
  nativeFacing: /** @type {1} */ (1),
  sprites: {
    dir: 'sprites/mav/',
    frameSize: 160,
    frameHeight: 111,
    anchor: /** @type {[number, number]} */ ([79, 105]),
    scale: 2,
    sheets: { idle: 8, run: 8, jump: 2, fall: 2, attack1: 4, attack2: 4, attack3: 4, 'take-hit': 4, death: 6 },
    offsets: { fall: [0, -5] },
    // Measured from the feet in each frame: his big swings step through.
    frameShift: { 'attack1:3': 8, 'attack2:0': 8, 'attack2:1': 7, 'attack2:2': -15, 'attack2:3': -22, 'attack3:0': -13, 'attack3:1': -13 },
    color: '#d8b13a',
  },
  stats: {
    health: 1100,
    walkForward: px(1.75),
    walkBack: px(1.5),
    jumpVx: px(2.75),
    jumpVy: px(-8.25),
    dash: { frames: 20, speed: px(5.5) },
    backdash: { frames: 24, speed: px(5), invuln: 5 },
  },
  boxes: {
    stand: { push: [-16, -100, 32, 100], hurt: [[-13, -112, 28, 24], [-19, -90, 40, 90]] },
    crouch: { push: [-17, -70, 34, 70], hurt: [[-19, -76, 40, 76]] },
    air: { push: [-16, -100, 32, 66], hurt: [[-18, -104, 38, 80]] },
    down: { push: [-26, -20, 52, 20], hurt: [] },
  },
  anims: {
    stand: { sheet: 'idle', len: 7 },
    walkF: { sheet: 'run', len: 6 },
    walkB: { sheet: 'run', len: 7, reverse: true },
    crouch: { sheet: 'idle', len: 9 },
    guard: { sheet: 'take-hit', len: 1, frame: 0 },
    jumpSquat: { sheet: 'idle', len: 1, frame: 0 },
    jump: { sheet: 'jump', len: 7 },
    fall: { sheet: 'fall', len: 7 },
    land: { sheet: 'idle', len: 1, frame: 0 },
    dashF: { sheet: 'run', len: 3 },
    dashB: { sheet: 'jump', len: 1, frame: 0 },
    hitstun: { sheet: 'take-hit', len: 4 },
    blockstun: { sheet: 'take-hit', len: 1, frame: 0 },
    airHit: { sheet: 'take-hit', len: 1, frame: 1 },
    knockdown: { sheet: 'death', len: 5 },
    wakeup: { sheet: 'death', len: 4, reverse: true },
    ko: { sheet: 'death', len: 7 },
    throwHold: { sheet: 'attack1', len: 1, frame: 3 },
    thrown: { sheet: 'take-hit', len: 1, frame: 1 },
    recover: { sheet: 'idle', len: 1, frame: 0 },
    parry: { sheet: 'attack1', len: 1, frame: 0 },
    win: { sheet: 'idle', len: 10 },
  },
  moves: {
    // ── Normals ──────────────────────────────────────────────────────
    '5L': {
      name: 'Pommel Strike', kind: 'normal', notation: '5L', stance: 'stand', button: 'L',
      startup: 7, active: 2, recovery: 11,
      anim: strike({ windup: [['attack1', 1]], impact: [['attack1', 2]], recover: [['attack1', 3]] }, 7, 2, 11),
      hits: [hit([7, 8], [[10, -86, 66, 22]], { damage: 40, hitstun: 15, blockstun: 11, hitstop: 9, push: 8 })],
      hurt: [{ frames: [7, 12], boxes: [[14, -84, 34, 16]] }],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [7, 12] },
      description: 'Slow for a light, but long and hard-hitting.',
    },
    '5M': {
      name: 'Kingsguard Sweep', kind: 'normal', notation: '5M', stance: 'stand', button: 'M',
      startup: 11, active: 3, recovery: 17,
      anim: strike({ windup: frames('attack1', 0, 1), impact: [['attack1', 2]], recover: [['attack1', 3]] }, 11, 3, 17),
      hits: [hit([11, 13], [[12, -92, 96, 34]], { damage: 75, hitstun: 19, blockstun: 14, hitstop: 11, push: 10 })],
      hurt: [{ frames: [11, 20], boxes: [[14, -90, 56, 26]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [11, 19] },
      description: 'A wide, long horizontal slash. Cancel it into Crown Cleave.',
    },
    '5H': {
      name: 'Sovereign’s Arc', kind: 'normal', notation: '5H', stance: 'stand', button: 'H',
      startup: 15, active: 4, recovery: 24,
      anim: strike({ windup: frames('attack3', 0, 1), impact: [['attack3', 2]], recover: [['attack3', 3]] }, 15, 4, 24),
      hits: [hit([15, 18], [[4, -136, 110, 108]], { damage: 110, hitstun: 23, blockstun: 17, hitstop: 14, push: 15 })],
      hurt: [{ frames: [15, 26], boxes: [[14, -112, 60, 50]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [15, 23] },
      description: 'An enormous crescent. Slow, and -9 on block, but it reaches nearly half a screen.',
    },
    '2L': {
      name: 'Low Pommel', kind: 'normal', notation: '2L', stance: 'crouch', button: 'L',
      startup: 7, active: 2, recovery: 11,
      anim: strike({ windup: [['attack1', 1]], impact: [['attack1', 2]], recover: [['attack1', 3]] }, 7, 2, 11),
      hits: [hit([7, 8], [[10, -30, 62, 18]], { damage: 35, hitstun: 14, blockstun: 10, hitstop: 9, push: 8, guard: 'low' })],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [7, 12] },
      description: 'A low. Must be blocked crouching.',
    },
    '2M': {
      name: 'Royal Reap', kind: 'normal', notation: '2M', stance: 'crouch', button: 'M',
      startup: 11, active: 3, recovery: 18,
      anim: strike({ windup: frames('attack2', 0, 1), impact: [['attack2', 2]], recover: [['attack2', 3]] }, 11, 3, 18),
      hits: [hit([11, 13], [[12, -28, 96, 22]], { damage: 65, hitstun: 18, blockstun: 13, hitstop: 11, push: 10, guard: 'low' })],
      hurt: [{ frames: [11, 20], boxes: [[14, -28, 56, 18]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [11, 19] },
      description: 'A long low reap. Cancels into specials.',
    },
    '2H': {
      name: 'Rising Crown', kind: 'normal', notation: '2H', stance: 'crouch', button: 'H',
      startup: 11, active: 4, recovery: 27,
      anim: strike({ windup: frames('attack3', 0, 1), impact: [['attack3', 2]], recover: [['attack3', 3]] }, 11, 4, 27),
      hits: [hit([11, 14], [[-8, -150, 78, 134]], { damage: 90, hitstun: 24, blockstun: 14, hitstop: 13, push: 11, launch: [px(1.5), px(-8)], knockdown: true })],
      cancel: { on: 'hit', into: ['special', 'super'], frames: [11, 16] },
      description: 'Anti-air and launcher with a huge arc. Very unsafe on block.',
    },
    '6M': {
      name: 'Royal Chop', kind: 'normal', notation: '6M', stance: 'stand', button: 'M', dir: 6,
      startup: 21, active: 3, recovery: 15,
      velocity: [[1, px(1.25), 0], [20, 0, 0]],
      anim: strike({ windup: frames('attack1', 0, 1), impact: [['attack1', 2]], recover: [['attack1', 3]] }, 21, 3, 15),
      hits: [hit([21, 23], [[10, -124, 70, 100]], { damage: 90, hitstun: 20, blockstun: 14, hitstop: 13, push: 10, guard: 'high' })],
      description: 'Overhead: must be blocked standing. Very slow, very heavy.',
    },
    'j.L': {
      name: 'Air Pommel', kind: 'normal', notation: 'j.L', stance: 'air', button: 'L',
      startup: 6, active: 4, recovery: 11, landing: 3,
      anim: strike({ windup: [['attack1', 1]], impact: [['attack1', 2]], recover: [['attack1', 3]] }, 6, 4, 11),
      hits: [hit([6, 9], [[4, -72, 56, 28]], { damage: 45, hitstun: 12, blockstun: 9, hitstop: 9, push: 6, guard: 'high' })],
      description: 'Air button; slower than most, but long.',
    },
    'j.M': {
      name: 'Descending Sweep', kind: 'normal', notation: 'j.M', stance: 'air', button: 'M',
      startup: 8, active: 5, recovery: 13, landing: 4,
      anim: strike({ windup: frames('attack2', 0, 1), impact: [['attack2', 2]], recover: [['attack2', 3]] }, 8, 5, 13),
      hits: [hit([8, 12], [[-24, -60, 90, 50]], { damage: 65, hitstun: 16, blockstun: 12, hitstop: 11, push: 7, guard: 'high' })],
      description: 'Sweeps behind you too: the cross-up.',
    },
    'j.H': {
      name: 'Throne Breaker', kind: 'normal', notation: 'j.H', stance: 'air', button: 'H',
      startup: 11, active: 4, recovery: 17, landing: 5,
      anim: strike({ windup: frames('attack3', 0, 1), impact: [['attack3', 2]], recover: [['attack3', 3]] }, 11, 4, 17),
      hits: [hit([11, 14], [[4, -90, 92, 80]], { damage: 100, hitstun: 20, blockstun: 15, hitstop: 13, push: 8, guard: 'high' })],
      description: 'The heaviest jump-in.',
    },
    throw: {
      name: 'Royal Toss', kind: 'throw', notation: 'L+M (4L+M: back)', stance: 'stand',
      startup: 5, active: 2, recovery: 22,
      anim: [['attack2', 0, 4], ['attack2', 1, 3], ['attack1', 3, 21]],
      throw: { box: [0, -90, 52, 90], damage: 125, techable: true, launch: [px(2.5), px(-5)], recovery: 18 },
      description: 'Beats blocking. Escape by pressing L+M as it grabs you.',
    },

    // ── Specials ─────────────────────────────────────────────────────
    '214L': royalDecree('L'),
    '214M': royalDecree('M'),
    '214H': royalDecree('H'),
    '236L': crownCleave('L'),
    '236M': crownCleave('M'),
    '236H': crownCleave('H'),

    // ── Super ────────────────────────────────────────────────────────
    '236236H': {
      name: 'Regicide', kind: 'super', notation: '236236+H', stance: 'stand', button: 'H', motion: 'qcf2',
      easy: 'H', meterCost: 1000,
      startup: 9, active: 14, recovery: 32,
      velocity: [[1, px(5), 0], [9, px(1), 0], [16, 0, 0]],
      invuln: [{ frames: [1, 11], kind: 'all' }],
      anim: [['run', 0, 3], ['run', 4, 3], ['attack2', 1, 2], ['attack2', 2, 6], ['attack1', 2, 4], ['attack3', 1, 4], ['attack3', 2, 10], ['attack3', 3, 22]],
      hits: [
        hit([9, 10], [[-10, -120, 104, 120]], { damage: 80, chip: 14, hitstun: 30, blockstun: 20, hitstop: 6, push: 1 }),
        hit([14, 15], [[-10, -120, 104, 120]], { damage: 80, chip: 14, hitstun: 30, blockstun: 20, hitstop: 6, push: 1 }),
        hit([19, 22], [[-10, -150, 120, 150]], { damage: 160, chip: 24, hitstun: 30, blockstun: 16, hitstop: 20, push: 16, launch: [px(3), px(-8)], knockdown: true }),
      ],
      description: 'Three royal strikes, the last one enormous. Invincible as it starts. Costs the full meter.',
    },

    // ── Universal (the same frames for everyone, config.js) ─────────
    GC: guardCancel({ windup: frames('attack3', 0, 1), impact: [['attack3', 2]], recover: [['attack3', 3]] }, [4, -136, 110, 108], 'A royal backhand out of a block. Costs half the meter.'),
    burst: burst({ windup: [['take-hit', 0], ['attack2', 0]], impact: frames('attack2', 1, 2), recover: [['attack2', 3]] }),
  },
}));
