/**
 * The tutorial: short lessons against the training dummy. You play Mack
 * against Kenji. Each lesson is a few steps; each step says what to do (in
 * the player's own keys, via `c`), sets up the dummy, and checks the
 * simulation's events after every frame to count successes.
 *
 * A check only reads the state; `mem` is the step's own scratch memory.
 * tests/lessons.test.js plays every step with scripted inputs and checks
 * that doing it right passes and doing nothing doesn't.
 *
 * @typedef {{ dir: (d: string) => string, button: (b: 'L'|'M'|'H'|'throw'|'SP') => string, move: (id: string) => string }} Labels  Key names for the texts (howTo.js keyLabels); `move` takes a move id.
 * @typedef {import('../../engine/sim/types.js').MatchState} MatchState
 *
 * @typedef {object} DummyAttacks  The dummy walks in until it's within `range` pixels, then does the next attack every `every` frames.
 * @property {string[]} attacks  Numpad tokens, e.g. "2+M", "5+LM" (a throw).
 * @property {number} range
 * @property {number} every
 *
 * @typedef {object} LessonStep
 * @property {(c: Labels) => string} text  What to do.
 * @property {string} goal  Short, e.g. "Block 3 attacks".
 * @property {number} count  Successes needed.
 * @property {number} [gap]  Pixels between the fighters at the start (default 90).
 * @property {boolean} [corner]  Player 1 starts with their back to the wall (so holding back can't walk away).
 * @property {boolean} [meter]  A full super meter.
 * @property {{ stance?: 'stand'|'crouch', block?: 'none'|'all', tech?: boolean }} [dummy]
 * @property {DummyAttacks} [attacks]
 * @property {(s: MatchState, mem: Record<string, number>) => number} check  Successes this frame; a negative number starts the count over ("in a row").
 * @property {string} [demo]  Player 1's inputs that pass this step (numpad, from the start position); used by the tests.
 *
 * @typedef {object} Lesson
 * @property {string} id
 * @property {string} name
 * @property {string} summary
 * @property {LessonStep[]} steps
 */

const SUB = 256;

/**
 * Successes: player 1's events of a type (and move test) this frame.
 * @param {MatchState} s
 * @param {string} type
 * @param {(move: string) => boolean} [move]
 */
function mine(s, type, move = () => true) {
  return s.events.filter((e) => e.type === type && e.side === 0 && move(e.move ?? '')).length;
}

/**
 * Blocks by player 1 of the dummy's attacks this frame; a hit taken resets the streak
 * when `streak` is set.
 * @param {MatchState} s
 * @param {Record<string, number>} mem
 * @param {(move: string) => boolean} [move]
 * @param {boolean} [streak]
 */
function blocked(s, mem, move = () => true, streak = false) {
  let n = 0;
  for (const e of s.events) {
    if (e.side !== 1) continue;
    if (e.type === 'block' && move(e.move ?? '')) n++;
    if (e.type === 'hit' && streak) mem.reset = 1;
  }
  return n;
}

/** @type {Lesson[]} */
export const LESSONS = [
  {
    id: 'moving', name: 'Moving', summary: 'Walk, jump and dash.',
    steps: [
      {
        text: (c) => `Walk forward: hold ${c.dir('6')}. Forward is always toward your opponent.`,
        goal: 'Walk forward', count: 1, gap: 200,
        check: (s, mem) => {
          mem.start ??= s.fighters[0].x;
          return Math.abs(s.fighters[0].x - mem.start) > 50 * SUB && Math.sign(s.fighters[0].x - mem.start) === s.fighters[0].facing ? 1 : 0;
        },
        demo: '6*40',
      },
      {
        text: (c) => `Walk back: hold ${c.dir('4')}. Holding back is also how you block.`,
        goal: 'Walk back', count: 1, gap: 120,
        check: (s, mem) => {
          mem.start ??= s.fighters[0].x;
          return Math.abs(s.fighters[0].x - mem.start) > 40 * SUB && Math.sign(s.fighters[0].x - mem.start) === -s.fighters[0].facing ? 1 : 0;
        },
        demo: '4*40',
      },
      {
        text: (c) => `Jump: press ${c.dir('8')}. Hold ${c.dir('9')} or ${c.dir('7')} to jump forward or back.`,
        goal: 'Jump 3 times', count: 3, gap: 200,
        check: (s) => mine(s, 'jump'),
        demo: '8 5*50 9 5*50 7 5*50',
      },
      {
        text: (c) => `Dash: tap ${c.dir('6')} twice, quickly. A dash covers ground faster than walking.`,
        goal: 'Dash twice', count: 2, gap: 250,
        check: (s) => mine(s, 'dash'),
        demo: '6 5 6 5*40 6 5 6 5*40',
      },
    ],
  },
  {
    id: 'attacks', name: 'Attacks', summary: 'Light, Medium and Heavy, standing and crouching.',
    steps: [
      {
        text: (c) => `Press ${c.button('L')}. Lights are fast but short and weak.`,
        goal: 'Hit with Light twice', count: 2, gap: 55,
        check: (s) => mine(s, 'hit', (m) => m === '5L'),
        demo: '5+L 5*30 5+L 5*30',
      },
      {
        text: (c) => `Press ${c.button('M')}. Mediums reach further.`,
        goal: 'Hit with Medium twice', count: 2, gap: 55,
        check: (s) => mine(s, 'hit', (m) => m === '5M'),
        demo: '5+M 5*40 5+M 5*40',
      },
      {
        text: (c) => `Press ${c.button('H')}. Heavies hit hardest but are slow: if they miss, you’re open.`,
        goal: 'Hit with Heavy twice', count: 2, gap: 55,
        check: (s) => mine(s, 'hit', (m) => m === '5H'),
        demo: '5+H 5*50 5+H 5*50',
      },
      {
        text: (c) => `Crouching attacks: hold ${c.dir('2')} and press any attack button. Crouching Light and Medium hit low.`,
        goal: '3 crouching hits', count: 3, gap: 55,
        check: (s) => mine(s, 'hit', (m) => m.startsWith('2')),
        demo: '2+L 2*30 2+M 2*40 2+L 2*30',
      },
    ],
  },
  {
    id: 'blocking', name: 'Blocking', summary: 'Hold back to block.',
    steps: [
      {
        text: (c) => `Kenji will attack. Hold ${c.dir('4')}, away from him, and don’t press anything else. Blocking takes only a little damage (chip).`,
        goal: 'Block 3 attacks', count: 3, gap: 90, corner: true,
        attacks: { attacks: ['5+M'], range: 75, every: 60 },
        check: (s, mem) => blocked(s, mem),
        demo: '4*600',
      },
    ],
  },
  {
    id: 'high-low', name: 'High and low', summary: 'Crouch-block lows, stand-block overheads.',
    steps: [
      {
        text: (c) => `Kenji’s crouching Medium hits low: a standing block won’t stop it. Hold ${c.dir('1')} (back and down) to block crouching.`,
        goal: 'Block 3 lows', count: 3, gap: 90, corner: true,
        attacks: { attacks: ['2+M'], range: 75, every: 60 },
        check: (s, mem) => blocked(s, mem, (m) => m === '2M'),
        demo: '1*600',
      },
      {
        text: (c) => `Kenji’s Helm Splitter (forward + Medium) is an overhead: it hits crouchers. Hold ${c.dir('4')} and stand to block it. Jump-ins are overheads too.`,
        goal: 'Block 2 overheads', count: 2, gap: 90, corner: true,
        attacks: { attacks: ['6+M'], range: 70, every: 70 },
        check: (s, mem) => blocked(s, mem, (m) => m === '6M'),
        demo: '4*600',
      },
      {
        text: (c) => `Now he mixes them. Watch for the overhead’s wind-up: crouch-block (${c.dir('1')}) by default, stand (${c.dir('4')}) when you see it coming.`,
        goal: 'Block 4 in a row', count: 4, gap: 90, corner: true,
        attacks: { attacks: ['2+M', '6+M', '2+M', '2+M', '6+M'], range: 70, every: 70 },
        check: (s, mem) => {
          const n = blocked(s, mem, () => true, true);
          if (mem.reset) {
            mem.reset = 0;
            return -1; // a hit: start the streak over
          }
          return n;
        },
      },
    ],
  },
  {
    id: 'throws', name: 'Throws', summary: 'Beat blocking with a throw, and escape throws.',
    steps: [
      {
        text: (c) => `Kenji is blocking everything. Walk up close and throw: ${c.button('throw')} (or Light + Medium together). Throws can’t be blocked.`,
        goal: 'Throw twice', count: 2, gap: 70, dummy: { block: 'all' },
        check: (s) => mine(s, 'throw'),
        demo: '6*12 5+LM 5*90 6*30 5+LM 5*60',
      },
      {
        text: (c) => `Now Kenji will try to throw you. When he grabs you, press ${c.button('throw')} straight away to escape (a tech).`,
        goal: 'Escape 2 throws', count: 2, gap: 90, corner: true,
        attacks: { attacks: ['5+LM'], range: 40, every: 80 },
        check: (s) => s.events.filter((e) => e.type === 'tech').length,
      },
    ],
  },
  {
    id: 'specials', name: 'Special moves', summary: 'Motions: Shippū and Tenkū.',
    steps: [
      {
        text: (c) => `Shippū, a dashing slash: ${c.move('236M')}. Roll from down to forward in one smooth motion and press the button at the end.`,
        goal: 'Do Shippū twice', count: 2, gap: 120,
        check: (s) => mine(s, 'special', (m) => m.startsWith('236') && m !== '236236H'),
        demo: '2 3 6+M 5*60 2 3 6+L 5*60',
      },
      {
        text: (c) => `Tenkū, a rising slash that’s invincible as it starts (it beats jump-ins): ${c.move('623M')}.`,
        goal: 'Do Tenkū twice', count: 2, gap: 120,
        check: (s) => mine(s, 'special', (m) => m.startsWith('623')),
        demo: '6 2 3+M 5*80 6 2 3+L 5*80',
      },
      {
        text: (c) => `Stuck on a motion? The Special button does specials without one: ${c.button('SP')} alone is Shippū, ${c.button('SP')} with ${c.dir('2')} is Tenkū (80% damage). Do any special twice.`,
        goal: 'Any special twice', count: 2, gap: 120,
        check: (s) => mine(s, 'special'),
        demo: '5+SP 5*60 5+SP 5*60',
      },
    ],
  },
  {
    id: 'cancels', name: 'Cancels and combos', summary: 'Join a normal and a special into one combo.',
    steps: [
      {
        text: (c) => `Press ${c.button('M')}, and while it hits, do Shippū (${c.move('236M')}). The special interrupts the Medium, so both hits land as one combo.`,
        goal: 'Land the 2-hit combo', count: 1, gap: 55,
        check: (s) => s.events.filter((e) => e.type === 'hit' && e.side === 0 && s.fighters[1].combo >= 2 && (e.move ?? '').startsWith('236')).length,
        demo: '5+M 5*9 2 3 6+M 5*90',
      },
    ],
  },
  {
    id: 'super', name: 'The super', summary: 'Spend a full meter.',
    steps: [
      {
        text: (c) => `Your meter (bottom of the screen) fills as you attack and get hit. It’s full now. The super: ${c.move('236236H')}. Or ${c.button('SP')} + ${c.button('H')} for the easy version.`,
        goal: 'Land the super', count: 1, gap: 60, meter: true,
        check: (s) => mine(s, 'hit', (m) => m === '236236H') ? 1 : 0,
        demo: '2 3 6 2 3 6+H 5*90',
      },
      {
        text: (c) => `Finish a combo with it: ${c.button('M')}, Shippū, then the super as Shippū hits.`,
        goal: 'Combo into the super', count: 1, gap: 50, meter: true,
        check: (s) => s.events.some((e) => e.type === 'hit' && e.side === 0 && e.move === '236236H' && s.fighters[1].combo >= 3) ? 1 : 0,
        demo: '5+M 5*9 2 3 6+M 5*10 2 3 6 2 3 6+H 5*80',
      },
    ],
  },
];
