/**
 * Deka, the brawler: big, heavy slashes with the highest damage of the
 * sword-fighters, a lunging sweep that closes distance, a rising crescent
 * that stops jumps, and an overhead chop to open up crouching opponents.
 * Average speed: slower than Mack, harder hitting. Sprites: "Martial Hero 3"
 * by Luiz Melo (CC0), drawn facing right.
 *
 * Units as in mack.js: boxes in pixels relative to the feet, facing right.
 */
import { px } from '../../../engine/sim/fixed.js';
import { hit, deepFreeze, strike, frames, guardCancel, burst } from './build.js';

/** @typedef {import('../../../engine/sim/types.js').MoveData} MoveData */

/**
 * Crescent Rush: a lunging sweep (236). L, M and H travel further and hit
 * harder; H knocks down.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function crescentRush(b) {
  const speed = { L: px(3.5), M: px(4.5), H: px(5.5) }[b];
  const startup = 13;
  const active = 4;
  const recovery = 19;
  return {
    name: `Crescent Rush (${b})`,
    kind: 'special',
    notation: `236+${b}`,
    stance: 'stand',
    button: b,
    motion: 'qcf',
    priority: 1,
    easy: b === 'M' ? '5' : b === 'H' ? '6' : undefined,
    startup,
    active,
    recovery,
    velocity: [[1, speed, 0], [startup, Math.trunc(speed / 2), 0], [startup + active, 0, 0]],
    anim: strike({ windup: [...frames('run', 0, 5), ['attack3', 4], ['attack3', 5]], impact: [['attack3', 6]], recover: frames('attack3', 7, 8) }, startup, active, recovery),
    hits: [hit([startup, startup + active - 1], [[0, -78, 82, 34]], {
      damage: { L: 85, M: 95, H: 110 }[b], chip: 11, hitstun: 21, blockstun: 14, hitstop: 12, push: 12,
      knockdown: b === 'H',
    })],
    cancel: { on: 'hit', into: ['super'], frames: [startup, startup + 6] },
    description: 'Lunges in with a low, wide sweep. Covers ground; about -7 on block.',
  };
}

/**
 * Rising Crescent: the anti-air (623). Invincible to strikes as it starts
 * (H: to everything); very punishable if blocked.
 * @param {'L'|'M'|'H'} b
 * @returns {MoveData}
 */
function risingCrescent(b) {
  const up = frames('attack2', 0, 2);
  /** @type {Record<string, MoveData>} */
  const v = {
    L: {
      name: 'Rising Crescent (L)', kind: 'special', notation: '623+L', stance: 'stand', button: 'L', motion: 'dp', priority: 2, easy: '4',
      startup: 6, active: 6, recovery: 25,
      velocity: [[4, px(1.5), px(-7)]],
      invuln: [{ frames: [1, 5], kind: 'strike' }],
      anim: strike({ windup: up, impact: [['attack2', 3]], recover: [['attack2', 4], ['fall', 0], ['fall', 1]] }, 6, 6, 25),
      hits: [hit([6, 11], [[-4, -132, 64, 132]], { damage: 95, chip: 12, hitstun: 30, blockstun: 16, hitstop: 12, launch: [px(1), px(-7)], knockdown: true })],
      cancel: { on: 'hit', into: ['super'], frames: [6, 10] },
      description: 'Rising crescent slash, invincible to strikes for frames 1-5.',
    },
    M: {
      name: 'Rising Crescent (M)', kind: 'special', notation: '623+M', stance: 'stand', button: 'M', motion: 'dp', priority: 2, easy: '2',
      startup: 6, active: 8, recovery: 27,
      velocity: [[4, px(1.5), px(-8)]],
      invuln: [{ frames: [1, 6], kind: 'strike' }],
      anim: strike({ windup: up, impact: [['attack2', 3]], recover: [['attack2', 4], ['fall', 0], ['fall', 1]] }, 6, 8, 27),
      hits: [hit([6, 13], [[-4, -136, 64, 136]], { damage: 115, chip: 14, hitstun: 30, blockstun: 16, hitstop: 12, launch: [px(1), px(-7.5)], knockdown: true })],
      cancel: { on: 'hit', into: ['super'], frames: [6, 11] },
      description: 'Higher and longer; invincible to strikes for frames 1-6.',
    },
    H: {
      name: 'Rising Crescent (H)', kind: 'special', notation: '623+H', stance: 'stand', button: 'H', motion: 'dp', priority: 2,
      startup: 7, active: 8, recovery: 29,
      velocity: [[4, px(1.5), px(-9)]],
      invuln: [{ frames: [1, 9], kind: 'all' }],
      anim: strike({ windup: up, impact: [['attack2', 3], ['attack2', 4]], recover: [['attack2', 5], ['fall', 0], ['fall', 1]] }, 7, 8, 29),
      hits: [
        hit([7, 9], [[-4, -124, 64, 124]], { damage: 75, chip: 8, hitstun: 30, blockstun: 16, hitstop: 8, launch: [px(0.5), px(-9)], knockdown: true }),
        hit([10, 14], [[-4, -152, 68, 142]], { damage: 65, chip: 8, hitstun: 30, blockstun: 16, hitstop: 12, launch: [px(1), px(-7)], knockdown: true }),
      ],
      description: 'Two hits, fully invincible for frames 1-9: the reversal.',
    },
  };
  return v[b];
}

/** @typedef {import('../../../engine/sim/types.js').CharacterData} CharacterData */

export const deka = deepFreeze(/** @type {CharacterData} */ ({
  id: 'deka',
  name: 'Deka',
  title: 'The Wild Crescent',
  style: 'Brawler',
  blurb: 'Every swing is a crescent of steel. Slower than the others, but nothing hits harder: land one big slash and the round swings with it.',
  nativeFacing: /** @type {1} */ (1),
  sprites: {
    dir: 'sprites/deka/',
    frameSize: 126,
    anchor: /** @type {[number, number]} */ ([69, 82]),
    scale: 2.6,
    sheets: { idle: 10, run: 8, jump: 3, fall: 3, attack1: 7, attack2: 6, attack3: 9, 'take-hit': 3, death: 11 },
    // Martial Hero 3 draws its jump and fall frames lower in the frame than the others.
    offsets: { jump: [0, 14], fall: [0, 14] },
    frameShift: { 'attack1:2': -8, 'attack1:3': -7, 'take-hit:0': -8, 'take-hit:1': -7 },
    color: '#c98a3a',
  },
  stats: {
    health: 1050,
    walkForward: px(2.25),
    walkBack: px(1.9),
    jumpVx: px(3.1),
    jumpVy: px(-8.9),
    dash: { frames: 17, speed: px(6.5) },
    backdash: { frames: 21, speed: px(6), invuln: 6 },
  },
  boxes: {
    stand: { push: [-15, -94, 30, 94], hurt: [[-12, -104, 26, 22], [-18, -84, 38, 84]] },
    crouch: { push: [-16, -66, 32, 66], hurt: [[-18, -72, 38, 72]] },
    air: { push: [-15, -96, 30, 64], hurt: [[-17, -100, 36, 76]] },
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
    knockdown: { sheet: 'death', len: 3 },
    wakeup: { sheet: 'death', len: 2, reverse: true },
    ko: { sheet: 'death', len: 4 },
    throwHold: { sheet: 'attack1', len: 1, frame: 1 },
    thrown: { sheet: 'take-hit', len: 1, frame: 1 },
    recover: { sheet: 'idle', len: 1, frame: 0 },
    parry: { sheet: 'attack1', len: 1, frame: 0 },
    win: { sheet: 'idle', len: 9 },
  },
  moves: {
    // ── Normals ──────────────────────────────────────────────────────
    '5L': {
      name: 'Short Arc', kind: 'normal', notation: '5L', stance: 'stand', button: 'L',
      startup: 6, active: 2, recovery: 10,
      anim: strike({ windup: frames('attack3', 4, 5), impact: [['attack3', 6]], recover: frames('attack3', 7, 8) }, 6, 2, 10),
      hits: [hit([6, 7], [[10, -82, 60, 22]], { damage: 35, hitstun: 14, blockstun: 11, hitstop: 8, push: 7 })],
      hurt: [{ frames: [6, 11], boxes: [[14, -80, 30, 16]] }],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [6, 11] },
      description: 'Deka’s fastest button. +1 on block.',
    },
    '5M': {
      name: 'Crescent Cut', kind: 'normal', notation: '5M', stance: 'stand', button: 'M',
      startup: 9, active: 3, recovery: 15,
      velocity: [[1, px(2), 0], [9, 0, 0]],
      anim: strike({ windup: frames('attack1', 0, 3), impact: [['attack1', 4]], recover: frames('attack1', 5, 6) }, 9, 3, 15),
      hits: [hit([9, 11], [[10, -92, 80, 40]], { damage: 65, hitstun: 18, blockstun: 14, hitstop: 11, push: 9 })],
      hurt: [{ frames: [9, 17], boxes: [[14, -88, 44, 24]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [9, 17] },
      description: 'Steps in with a falling crescent. Cancel it into Crescent Rush.',
    },
    '5H': {
      name: 'Moon Splitter', kind: 'normal', notation: '5H', stance: 'stand', button: 'H',
      startup: 13, active: 4, recovery: 22,
      anim: strike({ windup: frames('attack2', 0, 2), impact: [['attack2', 3]], recover: frames('attack2', 4, 5) }, 13, 4, 22),
      hits: [hit([13, 16], [[6, -122, 96, 92]], { damage: 105, hitstun: 22, blockstun: 16, hitstop: 13, push: 14 })],
      hurt: [{ frames: [13, 24], boxes: [[14, -104, 54, 44]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [13, 21] },
      description: 'A huge rising crescent: the hardest-hitting normal in the game. -8 on block.',
    },
    '2L': {
      name: 'Shin Cut', kind: 'normal', notation: '2L', stance: 'crouch', button: 'L',
      startup: 6, active: 2, recovery: 10,
      anim: strike({ windup: frames('attack3', 4, 5), impact: [['attack3', 6]], recover: frames('attack3', 7, 8) }, 6, 2, 10),
      hits: [hit([6, 7], [[10, -30, 58, 16]], { damage: 30, hitstun: 13, blockstun: 10, hitstop: 8, push: 7, guard: 'low' })],
      cancel: { on: 'contact', into: ['special', 'super', '5L', '2L'], frames: [6, 11] },
      description: 'Fast low. Must be blocked crouching.',
    },
    '2M': {
      name: 'Low Crescent', kind: 'normal', notation: '2M', stance: 'crouch', button: 'M',
      startup: 9, active: 3, recovery: 16,
      anim: strike({ windup: frames('attack3', 0, 3), impact: [['attack3', 6]], recover: frames('attack3', 7, 8) }, 9, 3, 16),
      hits: [hit([9, 11], [[12, -26, 84, 20]], { damage: 55, hitstun: 17, blockstun: 13, hitstop: 10, push: 9, guard: 'low' })],
      hurt: [{ frames: [9, 18], boxes: [[14, -26, 46, 16]] }],
      cancel: { on: 'contact', into: ['special', 'super'], frames: [9, 17] },
      description: 'Long low sweep of the blade. Cancels into specials.',
    },
    '2H': {
      name: 'Rising Moon', kind: 'normal', notation: '2H', stance: 'crouch', button: 'H',
      startup: 10, active: 4, recovery: 25,
      anim: strike({ windup: frames('attack2', 0, 2), impact: [['attack2', 3]], recover: frames('attack2', 4, 5) }, 10, 4, 25),
      hits: [hit([10, 13], [[-6, -140, 70, 124]], { damage: 80, hitstun: 24, blockstun: 14, hitstop: 12, push: 10, launch: [px(1.5), px(-8)], knockdown: true })],
      cancel: { on: 'hit', into: ['special', 'super'], frames: [10, 15] },
      description: 'Anti-air and launcher. Very unsafe on block.',
    },
    '6M': {
      name: 'Crashing Moon', kind: 'normal', notation: '6M', stance: 'stand', button: 'M', dir: 6,
      startup: 19, active: 3, recovery: 14,
      velocity: [[1, px(1.5), 0], [18, 0, 0]],
      anim: strike({ windup: frames('attack1', 0, 3), impact: [['attack1', 4]], recover: frames('attack1', 5, 6) }, 19, 3, 14),
      hits: [hit([19, 21], [[10, -120, 66, 98]], { damage: 75, hitstun: 20, blockstun: 14, hitstop: 12, push: 9, guard: 'high' })],
      description: 'Overhead chop: must be blocked standing. Mix it with 2M.',
    },
    'j.L': {
      name: 'Air Arc', kind: 'normal', notation: 'j.L', stance: 'air', button: 'L',
      startup: 5, active: 4, recovery: 10, landing: 3,
      anim: strike({ windup: frames('attack3', 4, 5), impact: [['attack3', 6]], recover: [['attack3', 7]] }, 5, 4, 10),
      hits: [hit([5, 8], [[4, -70, 54, 26]], { damage: 40, hitstun: 12, blockstun: 9, hitstop: 8, push: 6, guard: 'high' })],
      description: 'Fast air slash; beats other jumps.',
    },
    'j.M': {
      name: 'Diving Crescent', kind: 'normal', notation: 'j.M', stance: 'air', button: 'M',
      startup: 7, active: 5, recovery: 12, landing: 3,
      anim: strike({ windup: frames('attack1', 2, 3), impact: [['attack1', 4]], recover: [['attack1', 5]] }, 7, 5, 12),
      hits: [hit([7, 11], [[-22, -58, 84, 48]], { damage: 60, hitstun: 16, blockstun: 12, hitstop: 10, push: 7, guard: 'high' })],
      description: 'Sweeps behind you too: the cross-up.',
    },
    'j.H': {
      name: 'Falling Moon', kind: 'normal', notation: 'j.H', stance: 'air', button: 'H',
      startup: 10, active: 4, recovery: 16, landing: 4,
      anim: strike({ windup: frames('attack2', 1, 2), impact: [['attack2', 3]], recover: [['attack2', 4]] }, 10, 4, 16),
      hits: [hit([10, 13], [[4, -84, 86, 74]], { damage: 90, hitstun: 20, blockstun: 15, hitstop: 12, push: 8, guard: 'high' })],
      description: 'Big jump-in that leads to a full combo on landing.',
    },
    throw: {
      name: 'Headbutt Toss', kind: 'throw', notation: 'L+M (4L+M: back)', stance: 'stand',
      startup: 5, active: 2, recovery: 22,
      anim: [['attack1', 0, 4], ['attack1', 1, 3], ['attack1', 6, 21]],
      throw: { box: [0, -86, 50, 86], damage: 120, techable: true, launch: [px(2.5), px(-5)], recovery: 18 },
      description: 'Beats blocking. Escape by pressing L+M as it grabs you.',
    },

    // ── Specials ─────────────────────────────────────────────────────
    '236L': crescentRush('L'),
    '236M': crescentRush('M'),
    '236H': crescentRush('H'),
    '623L': risingCrescent('L'),
    '623M': risingCrescent('M'),
    '623H': risingCrescent('H'),

    // ── Super ────────────────────────────────────────────────────────
    '236236H': {
      name: 'Thousand Crescents', kind: 'super', notation: '236236+H', stance: 'stand', button: 'H', motion: 'qcf2',
      easy: 'H', meterCost: 1000,
      startup: 7, active: 16, recovery: 31,
      velocity: [[1, px(6.5), 0], [17, px(1), 0], [23, 0, 0]],
      invuln: [{ frames: [1, 11], kind: 'all' }],
      anim: [['run', 0, 3], ['run', 4, 3], ['attack1', 4, 4], ['attack3', 6, 4], ['attack2', 3, 4], ['attack1', 4, 4], ['attack2', 3, 8], ['attack2', 4, 10], ['attack2', 5, 13]],
      hits: [
        hit([7, 8], [[-10, -112, 88, 112]], { damage: 55, chip: 10, hitstun: 30, blockstun: 20, hitstop: 4, push: 1 }),
        hit([11, 12], [[-10, -112, 88, 112]], { damage: 55, chip: 10, hitstun: 30, blockstun: 20, hitstop: 4, push: 1 }),
        hit([15, 16], [[-10, -112, 88, 112]], { damage: 55, chip: 10, hitstun: 30, blockstun: 20, hitstop: 4, push: 1 }),
        hit([19, 22], [[-10, -130, 100, 130]], { damage: 160, chip: 20, hitstun: 30, blockstun: 16, hitstop: 18, push: 16, launch: [px(3), px(-8)], knockdown: true }),
      ],
      description: 'Four crescents in a rush, the last one huge. Invincible as it starts. Costs the full meter.',
    },

    // ── Universal (the same frames for everyone, config.js) ─────────
    GC: guardCancel({ windup: frames('attack2', 0, 2), impact: [['attack2', 3]], recover: frames('attack2', 4, 5) }, [6, -122, 96, 92], 'A wild crescent out of a block. Costs half the meter.'),
    burst: burst({ windup: [['take-hit', 0], ['attack3', 0]], impact: frames('attack3', 3, 5), recover: frames('attack3', 6, 8) }),
  },
}));
