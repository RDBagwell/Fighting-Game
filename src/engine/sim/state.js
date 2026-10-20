/**
 * The match state: creating it, saving and loading it, hashing it.
 *
 * Everything the simulation knows is in one plain object (types.js,
 * `MatchState`). That is what makes these three functions trivial and
 * fast, and what session 2's rollback netcode needs:
 *
 * - `saveState(state)` returns an independent copy;
 * - `loadState(saved)` returns a fresh copy to continue from (the saved
 *   copy stays untouched, so it can be loaded again);
 * - `hashState(state)` returns a 32-bit checksum, so two machines (or two
 *   runs) can compare states cheaply and spot a desync on the exact frame.
 *
 * `tests/determinism.test.js` checks that a state saved mid-match and
 * loaded again carries on identically.
 */
import { SUB } from './fixed.js';
import { makeSeed } from './rng.js';

export const STATE_VERSION = 1;

/**
 * @typedef {object} SimConfig  Rules shared by every character (src/game/data/config.js).
 * @property {{ width: number, wall: number, maxSeparation: number, start: number }} stage  Pixels.
 * @property {number} roundsToWin
 * @property {number} roundFrames
 * @property {number} introFrames
 * @property {number} koFrames
 * @property {number} timeoutFrames
 * @property {number} gravity  Subpixels/frame².
 * @property {number} jumpSquat
 * @property {number} landRecovery
 * @property {number} knockdownFrames
 * @property {number} wakeupFrames
 * @property {number} throwProtect
 * @property {number} techWindow
 * @property {number} techRecoil
 * @property {number} techPush  Pixels.
 * @property {number} buffer
 * @property {number} historyLength
 * @property {number} chargeGrace
 * @property {number} juggleLimit
 * @property {number[]} scaling  Percent per hit of a combo (the last entry repeats).
 * @property {number} easyScale  Percent damage for moves done with the easy-specials button.
 * @property {number} meterMax
 * @property {number} superFreeze
 * @property {number} pushStep  Pixels of pushback per frame.
 * @property {[number, number]} airReset  [vx, vy] for a non-launching hit on an airborne fighter.
 * @property {number} proximityGuard  Pixels: holding back this close to an attack blocks instead of walking.
 * @property {number} refillDelay  Training: frames after a combo before health refills.
 * @property {{ hit: number, block: number, taken: number }} meterGain  Percent of damage turned into meter.
 */

/**
 * A fighter at the start of a round.
 * @param {import('./types.js').CharacterData} ch
 * @param {number} side
 * @param {SimConfig} config
 * @param {number} [meter=0]
 * @returns {import('./types.js').FighterState}
 */
export function createFighter(ch, side, config, meter = 0) {
  const centre = Math.trunc(config.stage.width / 2);
  const x = (side === 0 ? centre - config.stage.start : centre + config.stage.start) * SUB;
  return {
    char: ch.id,
    side,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing: side === 0 ? 1 : -1,
    health: ch.stats.health,
    meter,
    state: 'stand',
    stateFrame: 0,
    stun: 0,
    move: '',
    moveFrame: 0,
    contact: 0,
    hitsDone: 0,
    queued: '',
    jumpDir: 0,
    airAttack: false,
    knockdownOnLand: false,
    crouching: false,
    combo: 0,
    comboDamage: 0,
    juggle: 0,
    throwProtect: 0,
    push: 0,
    pushTransfer: false,
    hist: new Array(config.historyLength).fill(0),
    used: -1,
    charge: 0,
    chargeGrace: 0,
    motion: '',
    motionFrame: -1,
    easy: false,
    refill: 0,
    throwBack: false,
  };
}

/**
 * A new match.
 * @param {Record<string, import('./types.js').CharacterData>} characters
 * @param {SimConfig} config
 * @param {import('./types.js').MatchOptions} options
 * @returns {import('./types.js').MatchState}
 */
export function createMatch(characters, config, options) {
  const [a, b] = options.chars;
  if (!characters[a] || !characters[b]) throw new Error(`Unknown character: ${!characters[a] ? a : b}`);
  const training = !!options.training;
  return {
    version: STATE_VERSION,
    frame: 0,
    rng: makeSeed(options.seed ?? 1),
    phase: training ? 'fight' : 'intro',
    phaseFrame: 0,
    round: 1,
    wins: [0, 0],
    timer: config.roundFrames,
    freeze: 0,
    flash: -1,
    roundWinner: -1,
    matchWinner: -1,
    fighters: [createFighter(characters[a], 0, config), createFighter(characters[b], 1, config)],
    projectiles: [],
    events: [],
    options: { training, infiniteMeter: !!options.infiniteMeter, stage: options.stage ?? 'dusk-shrine' },
  };
}

/**
 * A deep copy of plain data. Faster than structuredClone for the small,
 * flat objects the state is made of, and it only has to know about arrays
 * and plain objects because that's all the state may contain.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function clonePlain(value) {
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = clonePlain(value[i]);
    return /** @type {T} */ (/** @type {unknown} */ (out));
  }
  if (value !== null && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key in value) out[key] = clonePlain(/** @type {Record<string, unknown>} */ (value)[key]);
    return /** @type {T} */ (out);
  }
  return value;
}

/**
 * A snapshot of the state that later steps can't change.
 * @param {import('./types.js').MatchState} state
 */
export function saveState(state) {
  return clonePlain(state);
}

/**
 * A state to carry on from, copied from a snapshot (which stays usable).
 * @param {import('./types.js').MatchState} saved
 */
export function loadState(saved) {
  if (saved.version !== STATE_VERSION) throw new Error(`Saved state version ${saved.version}, expected ${STATE_VERSION}`);
  return clonePlain(saved);
}

/**
 * A 32-bit FNV-1a hash of the state. Keys are visited in the order they
 * were created, which is fixed by createMatch/createFighter, so equal
 * states always hash equally. (The hash never decides anything in the
 * simulation; it's only compared.)
 * @param {unknown} state
 */
export function hashState(state) {
  let h = 0x811c9dc5;
  /** @param {number} n */
  const mix = (n) => {
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  /** @param {string} s */
  const mixString = (s) => {
    mix(s.length);
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
  };
  /** @param {unknown} v */
  const visit = (v) => {
    if (typeof v === 'number') mix(v | 0);
    else if (typeof v === 'string') mixString(v);
    else if (typeof v === 'boolean') mix(v ? 1 : 2);
    else if (Array.isArray(v)) {
      mix(v.length);
      for (const item of v) visit(item);
    } else if (v && typeof v === 'object') {
      for (const key in v) {
        mixString(key);
        visit(/** @type {Record<string, unknown>} */ (v)[key]);
      }
    } else mix(0);
  };
  visit(state);
  return h >>> 0;
}
