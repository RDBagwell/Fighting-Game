/**
 * Reroe, the spear zoner: the longest pokes in the game, a thrown spear,
 * a retreating sweep that pokes while backing away, and a volley of spears
 * for a super. Fast on her feet but light on health: keep the opponent at
 * the end of the spear. Sprites: "Huntress" by Luiz Melo (CC0), drawn
 * facing right; the thrown spear is the pack's own spear art.
 *
 * Units as in mack.js: boxes in pixels relative to the feet, facing right.
 */
import { px } from '../../../engine/sim/fixed.js';
import { hit, deepFreeze, strike, frames, guardCancel, burst } from './build.js';

/** @typedef {import('../../../engine/sim/types.js').MoveData} MoveData */

/**
 * Hunting Spear: a thrown spear (236). L is slow (walk behind it), H fast.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function huntingSpear(b) {
  const startup = 15;
  const recovery = 27;
  return {
    name: `Hunting Spear (${b})`,
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
    anim: strike({ windup: frames('attack3', 3, 5), impact: [['attack3', 6]], recover: [['attack3', 6], ['idle', 0]] }, startup, 1, recovery),
    projectile: {
      frame: startup,
      x: 40,
      y: -84,
      vx: { L: px(5), M: px(7), H: px(9) }[b],
      life: 120,
      box: [-26, -6, 52, 12],
      hits: 1,
      look: 'spear',
      hit: { damage: 75, chip: 10, hitstun: 18, blockstun: 14, hitstop: 9, guard: 'mid', push: 10 },
    },
    description: 'Throws a spear across the screen. Only one in the air at a time.',
  };
}

/**
 * Fading Sweep: a retreating spear sweep (214). Hops back as it pokes, so
 * it's hard to punish; L stays closest, H backs off furthest.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function fadingSweep(b) {
  const back = { L: px(-2.5), M: px(-3.5), H: px(-4.5) }[b];
  const startup = 10;
  return {
    name: `Fading Sweep (${b})`,
    kind: 'special',
    notation: `214+${b}`,
    stance: 'stand',
    button: b,
    motion: 'qcb',
    priority: 1,
    easy: b === 'M' ? '2' : b === 'L' ? '4' : undefined,
    startup,
    active: 3,
    recovery: 18,
    velocity: [[1, back, 0], [startup + 3, 0, 0]],
    anim: strike({ windup: frames('attack1', 0, 2), impact: [['attack1', 3]], recover: [['attack1', 4], ['idle', 0]] }, startup, 3, 18),
    hits: [hit([startup, startup + 2], [[6, -96, 112, 82]], { damage: { L: 60, M: 65, H: 70 }[b], chip: 8, hitstun: 19, blockstun: 15, hitstop: 10, push: 12 })],
    cancel: { on: 'hit', into: ['super'], frames: [startup, startup + 6] },
    description: 'Hops back while sweeping the spear: pokes and keeps the distance. Hard to punish.',
  };
}

/** @typedef {import('../../../engine/sim/types.js').CharacterData} CharacterData */

export const reroe = deepFreeze(/** @type {CharacterData} */ ({
  id: 'reroe',
  name: 'Reroe',
  title: 'The Huntress',
  style: 'Spear zoner',
  blurb: 'A hunter who never lets prey get close. The longest reach of anyone, a spear to throw, and quick feet; but if you get past the spear, she can’t take much.',
  nativeFacing: /** @type {1} */ (1),
  sprites: {
    dir: 'sprites/reroe/',
    frameSize: 150,
    anchor: /** @type {[number, number]} */ ([76, 97]),
    scale: 2.5,
    sheets: { idle: 8, run: 8, jump: 2, fall: 2, attack1: 5, attack2: 5, attack3: 7, 'take-hit': 3, death: 8 },
    offsets: { jump: [0, -3] },
    projectiles: {
      spear: { file: 'spear-move', w: 60, h: 20, frames: 4, anchor: [31, 10], scale: 2 },
      volley: { file: 'spear-move', w: 60, h: 20, frames: 4, anchor: [31, 10], scale: 3.5 },
    },
    color: '#8fb33a',
  },
  stats: {
    health: 1000,
    walkForward: px(2.75),
    walkBack: px(2.5),
    jumpVx: px(3.25),
    jumpVy: px(-9.25),
    dash: { frames: 15, speed: px(7.5) },
    backdash: { frames: 20, speed: px(7), invuln: 7 },
  },
  boxes: {
    stand: { push: [-13, -92, 26, 92], hurt: [[-11, -104, 24, 22], [-15, -84, 32, 84]] },
    crouch: { push: [-14, -64, 28, 64], hurt: [[-15, -70, 34, 70]] },
    air: { push: [-13, -94, 26, 62], hurt: [[-15, -98, 32, 74]] },
    down: { push: [-22, -20, 44, 20], hurt: [] },
  },
  anims: {
    stand: { sheet: 'idle', len: 7 },
    walkF: { sheet: 'run', len: 4 },
    walkB: { sheet: 'run', len: 5, reverse: true },
    crouch: { sheet: 'idle', len: 9 },
    guard: { sheet: 'take-hit', len: 1, frame: 0 },
    jumpSquat: { sheet: 'idle', len: 1, frame: 0 },
    jump: { sheet: 'jump', len: 6 },
    fall: { sheet: 'fall', len: 6 },
    land: { sheet: 'idle', len: 1, frame: 0 },
    dashF: { sheet: 'run', len: 2 },
    dashB: { sheet: 'jump', len: 1, frame: 0 },
    hitstun: { sheet: 'take-hit', len: 5 },
    blockstun: { sheet: 'take-hit', len: 1, frame: 0 },
    airHit: { sheet: 'take-hit', len: 1, frame: 1 },
    knockdown: { sheet: 'death', len: 4 },
    wakeup: { sheet: 'death', len: 3, reverse: true },
    ko: { sheet: 'death', len: 5 },
    throwHold: { sheet: 'attack3', len: 1, frame: 1 },
    thrown: { sheet: 'take-hit', len: 1, frame: 1 },
    recover: { sheet: 'idle', len: 1, frame: 0 },
    parry: { sheet: 'attack2', len: 1, frame: 0 },
    win: { sheet: 'idle', len: 10 },
  },
  moves: {
    // ── Normals ──────────────────────────────────────────────────────
    '5L': {
      name: 'Quick Jab', kind: 'normal', notation: '5L', stance: 'stand', button: 'L',
      startup: 6, active: 2, recovery: 10,
      anim: strike({ windup: [['attack3', 1]], impact: [['attack3', 2]], recover: [['attack3', 1], ['idle', 0]] }, 6, 2, 10),
      hits: [hit([6, 7], [[10, -82, 70, 18]], { damage: 28, hitstun: 14, blockstun: 11, hitstop: 8, push: 8 })],
      hurt: [{ frames: [6, 11], boxes: [[14, -80, 36, 12]] }],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [6, 11] },
      description: 'A quick spear jab with a light’s speed and a medium’s reach.',
    },
    '5M': {
      name: 'Long Thrust', kind: 'normal', notation: '5M', stance: 'stand', button: 'M',
      startup: 10, active: 3, recovery: 15,
      anim: strike({ windup: frames('attack3', 0, 1), impact: [['attack3', 2]], recover: [['attack3', 1], ['idle', 0]] }, 10, 3, 15),
      hits: [hit([10, 12], [[12, -86, 104, 20]], { damage: 62, hitstun: 18, blockstun: 14, hitstop: 10, push: 10 })],
      hurt: [{ frames: [10, 18], boxes: [[14, -84, 60, 14]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [10, 18] },
      description: 'The full length of the spear. Her main poke; cancel it into a thrown spear.',
    },
    '5H': {
      name: 'Hunter’s Arc', kind: 'normal', notation: '5H', stance: 'stand', button: 'H',
      startup: 13, active: 4, recovery: 22,
      anim: strike({ windup: frames('attack1', 0, 2), impact: [['attack1', 3]], recover: [['attack1', 4]] }, 13, 4, 22),
      hits: [hit([13, 16], [[0, -124, 106, 100]], { damage: 85, hitstun: 22, blockstun: 16, hitstop: 12, push: 14 })],
      hurt: [{ frames: [13, 24], boxes: [[14, -104, 56, 44]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [13, 21] },
      description: 'A wide overhand sweep of the spear that also catches jumps. -8 on block.',
    },
    '2L': {
      name: 'Low Jab', kind: 'normal', notation: '2L', stance: 'crouch', button: 'L',
      startup: 6, active: 2, recovery: 10,
      anim: strike({ windup: [['attack3', 1]], impact: [['attack3', 2]], recover: [['attack3', 1], ['idle', 0]] }, 6, 2, 10),
      hits: [hit([6, 7], [[10, -30, 66, 16]], { damage: 24, hitstun: 13, blockstun: 10, hitstop: 8, push: 8, guard: 'low' })],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [6, 11] },
      description: 'A long, fast low. Must be blocked crouching.',
    },
    '2M': {
      name: 'Ground Thrust', kind: 'normal', notation: '2M', stance: 'crouch', button: 'M',
      startup: 10, active: 3, recovery: 16,
      anim: strike({ windup: frames('attack3', 0, 1), impact: [['attack3', 2]], recover: [['attack3', 1], ['idle', 0]] }, 10, 3, 16),
      hits: [hit([10, 12], [[12, -26, 104, 18]], { damage: 54, hitstun: 17, blockstun: 13, hitstop: 10, push: 10, guard: 'low' })],
      hurt: [{ frames: [10, 18], boxes: [[14, -26, 60, 14]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [10, 18] },
      description: 'A low thrust at full reach. Cancels into specials.',
    },
    '2H': {
      name: 'Skyward Spear', kind: 'normal', notation: '2H', stance: 'crouch', button: 'H',
      startup: 9, active: 4, recovery: 24,
      anim: strike({ windup: frames('attack2', 0, 2), impact: [['attack2', 3]], recover: [['attack2', 4]] }, 9, 4, 24),
      hits: [hit([9, 12], [[-6, -144, 74, 128]], { damage: 66, hitstun: 24, blockstun: 14, hitstop: 12, push: 10, launch: [px(1.5), px(-8)], knockdown: true })],
      cancel: { on: 'hit', into: ['special', 'super'], frames: [9, 14] },
      description: 'Anti-air and launcher. Very unsafe on block.',
    },
    '6M': {
      name: 'Falling Spear', kind: 'normal', notation: '6M', stance: 'stand', button: 'M', dir: 6,
      startup: 18, active: 3, recovery: 14,
      velocity: [[1, px(1.5), 0], [17, 0, 0]],
      anim: strike({ windup: frames('attack2', 0, 2), impact: [['attack2', 3]], recover: [['attack2', 4]] }, 18, 3, 14),
      hits: [hit([18, 20], [[10, -120, 72, 98]], { damage: 55, hitstun: 20, blockstun: 14, hitstop: 11, push: 9, guard: 'high' })],
      description: 'Overhead: must be blocked standing.',
    },
    'j.L': {
      name: 'Air Jab', kind: 'normal', notation: 'j.L', stance: 'air', button: 'L',
      startup: 5, active: 4, recovery: 10, landing: 3,
      anim: strike({ windup: [['attack3', 1]], impact: [['attack3', 2]], recover: [['attack3', 1]] }, 5, 4, 10),
      hits: [hit([5, 8], [[4, -70, 62, 22]], { damage: 32, hitstun: 12, blockstun: 9, hitstop: 8, push: 6, guard: 'high' })],
      description: 'Long air jab; beats other jumps.',
    },
    'j.M': {
      name: 'Diving Sweep', kind: 'normal', notation: 'j.M', stance: 'air', button: 'M',
      startup: 7, active: 5, recovery: 12, landing: 3,
      anim: strike({ windup: frames('attack1', 1, 2), impact: [['attack1', 3]], recover: [['attack1', 4]] }, 7, 5, 12),
      hits: [hit([7, 11], [[-22, -58, 86, 48]], { damage: 50, hitstun: 16, blockstun: 12, hitstop: 10, push: 7, guard: 'high' })],
      description: 'Sweeps behind you too: the cross-up.',
    },
    'j.H': {
      name: 'Plunging Spear', kind: 'normal', notation: 'j.H', stance: 'air', button: 'H',
      startup: 10, active: 4, recovery: 16, landing: 4,
      anim: strike({ windup: frames('attack2', 1, 2), impact: [['attack2', 3]], recover: [['attack2', 4]] }, 10, 4, 16),
      hits: [hit([10, 13], [[4, -84, 88, 74]], { damage: 75, hitstun: 20, blockstun: 15, hitstop: 12, push: 8, guard: 'high' })],
      description: 'A big jump-in with the spear’s reach.',
    },
    throw: {
      name: 'Hunter’s Trip', kind: 'throw', notation: 'L+M (4L+M: back)', stance: 'stand',
      startup: 5, active: 2, recovery: 22,
      anim: [['attack3', 0, 4], ['attack3', 1, 3], ['attack1', 4, 21]],
      throw: { box: [0, -84, 50, 84], damage: 100, techable: true, launch: [px(2.5), px(-5)], recovery: 18 },
      description: 'Beats blocking. Escape by pressing L+M as it grabs you.',
    },

    // ── Specials ─────────────────────────────────────────────────────
    '236L': huntingSpear('L'),
    '236M': huntingSpear('M'),
    '236H': huntingSpear('H'),
    '214L': fadingSweep('L'),
    '214M': fadingSweep('M'),
    '214H': fadingSweep('H'),

    // ── Super ────────────────────────────────────────────────────────
    '236236H': {
      name: 'Hunter’s Volley', kind: 'super', notation: '236236+H', stance: 'stand', button: 'H', motion: 'qcf2',
      easy: 'H', meterCost: 1000,
      startup: 11, active: 1, recovery: 34,
      invuln: [{ frames: [1, 10], kind: 'all' }],
      anim: strike({ windup: frames('attack3', 3, 5), impact: [['attack3', 6]], recover: [['attack3', 6], ['idle', 0]] }, 11, 1, 34),
      projectile: {
        frame: 11,
        x: 44,
        y: -84,
        vx: px(9),
        life: 100,
        box: [-44, -14, 88, 28],
        hits: 4,
        interval: 5,
        look: 'volley',
        hit: { damage: 70, chip: 15, hitstun: 32, blockstun: 22, hitstop: 6, guard: 'mid', push: 5 },
      },
      description: 'A huge spear thrown with everything she has: crosses the screen and hits four times. Invincible as it starts.',
    },

    // ── Universal (the same frames for everyone, config.js) ─────────
    GC: guardCancel({ windup: frames('attack1', 0, 2), impact: [['attack1', 3]], recover: [['attack1', 4]] }, [0, -124, 106, 100], 'A spear thrust out of a block. Costs half the meter.'),
    burst: burst({ windup: [['take-hit', 0], ['attack3', 0]], impact: frames('attack3', 2, 4), recover: frames('attack3', 5, 6) }),
  },
}));
