/**
 * Arcade mode: a ladder of six CPU fights for one character. The other
 * five fighters in a random order, then the character's rival, with the
 * CPU climbing from Easy to Hard. Losing costs a continue and refights the
 * same opponent. The run in progress and each character's best clear are
 * kept in this browser only (versioned localStorage key), read back
 * defensively like the settings: a broken store just means no run.
 */
import { DIFFICULTIES } from '../cpu/Cpu.js';
import { ARCADE } from '../data/arcade.js';

const KEY = 'dusk-duel-arcade-v1';

/** Fights in a ladder: everyone else once, then the rival. */
export const LADDER_LENGTH = 6;

/**
 * Where each fight's CPU sits between Easy (0), Normal (0.5) and Hard (1).
 * @type {Array<[number, string]>}
 */
const RAMP = [[0, 'Easy'], [0.25, 'Easy+'], [0.5, 'Normal'], [0.65, 'Normal+'], [0.8, 'Hard−'], [1, 'Hard']];

/**
 * @typedef {object} Run
 * @property {string} char
 * @property {string[]} opponents  One per fight.
 * @property {string[]} stages  One per fight.
 * @property {number} fight  The next fight, 0-based (LADDER_LENGTH when cleared).
 * @property {number} continues
 * @property {number} roundsLost
 * @property {number} frames  Time spent fighting, in simulation frames.
 *
 * @typedef {object} Best
 * @property {number} clears
 * @property {number} continues  The best clear's (fewest continues, then fastest).
 * @property {number} frames
 */

/**
 * The CPU for one fight of the ladder: each number between the fixed
 * levels on either side of its place on the ramp.
 * @param {number} fight  0-based
 * @returns {import('../cpu/Cpu.js').Difficulty}
 */
export function ladderDifficulty(fight) {
  const [t, name] = RAMP[Math.max(0, Math.min(RAMP.length - 1, fight))];
  const [a, b, u] = t <= 0.5 ? [DIFFICULTIES.easy, DIFFICULTIES.normal, t / 0.5] : [DIFFICULTIES.normal, DIFFICULTIES.hard, (t - 0.5) / 0.5];
  /** @type {Record<string, unknown>} */
  const level = { name };
  for (const key of /** @type {Array<keyof typeof a>} */ (Object.keys(a))) {
    if (key === 'name') continue;
    const v = /** @type {number} */ (a[key]) + (/** @type {number} */ (b[key]) - /** @type {number} */ (a[key])) * u;
    // Frame counts stay whole frames.
    level[key] = key === 'reaction' || key === 'think' ? Math.round(v) : Math.round(v * 1000) / 1000;
  }
  return /** @type {import('../cpu/Cpu.js').Difficulty} */ (level);
}

/**
 * A new ladder for `char`.
 * @param {string} char
 * @param {string[]} roster
 * @param {string[]} stages  The stage ids this device can show.
 * @param {number} seed
 * @returns {Run}
 */
export function newRun(char, roster, stages, seed) {
  let x = (seed >>> 0) || 1;
  const random = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
  const others = roster.filter((c) => c !== char);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const opponents = [...others.slice(0, LADDER_LENGTH - 1), ARCADE[char].rival];
  return {
    char,
    opponents,
    stages: opponents.map(() => stages[Math.floor(random() * stages.length)]),
    fight: 0,
    continues: 0,
    roundsLost: 0,
    frames: 0,
  };
}

/**
 * The next fight of a run.
 * @param {Run} run
 */
export function nextFight(run) {
  return {
    number: run.fight + 1,
    opponent: run.opponents[run.fight],
    stage: run.stages[run.fight],
    level: ladderDifficulty(run.fight),
    rival: run.fight === LADDER_LENGTH - 1,
  };
}

/**
 * Records a finished match. A win moves up the ladder; a loss costs a
 * continue; a draw is fought again for free.
 * @param {Run} run
 * @param {{ winner: number, roundsLost: number, frames: number }} result  winner: 0 (you), 1 (the CPU) or 2 (draw)
 * @returns {Run}
 */
export function recordFight(run, { winner, roundsLost, frames }) {
  return {
    ...run,
    fight: winner === 0 ? run.fight + 1 : run.fight,
    continues: run.continues + (winner === 1 ? 1 : 0),
    roundsLost: run.roundsLost + roundsLost,
    frames: run.frames + frames,
  };
}

/** @param {Run} run */
export function isCleared(run) {
  return run.fight >= LADDER_LENGTH;
}

/**
 * Is `a` a better clear than `b`? Fewer continues first, then faster.
 * @param {{ continues: number, frames: number }} a
 * @param {{ continues: number, frames: number } | undefined} b
 */
export function isBetter(a, b) {
  if (!b) return true;
  return a.continues < b.continues || (a.continues === b.continues && a.frames < b.frames);
}

/**
 * A stored run, if it is a valid one for this roster.
 * @param {unknown} raw
 * @param {string[]} roster
 * @returns {Run | null}
 */
export function sanitiseRun(raw, roster) {
  if (!raw || typeof raw !== 'object') return null;
  const r = /** @type {Record<string, any>} */ (raw);
  const count = (/** @type {unknown} */ v) => (Number.isInteger(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) < 1e9 ? /** @type {number} */ (v) : null);
  const ids = (/** @type {unknown} */ v) => Array.isArray(v) && v.length === LADDER_LENGTH && v.every((s) => typeof s === 'string' && s.length < 40);
  if (!roster.includes(r.char) || !ids(r.opponents) || !ids(r.stages)) return null;
  if (!r.opponents.every((/** @type {string} */ c) => roster.includes(c))) return null;
  const fight = count(r.fight);
  const continues = count(r.continues);
  const roundsLost = count(r.roundsLost);
  const frames = count(r.frames);
  if (fight === null || fight >= LADDER_LENGTH || continues === null || roundsLost === null || frames === null) return null;
  return { char: r.char, opponents: [...r.opponents], stages: [...r.stages], fight, continues, roundsLost, frames };
}

/**
 * @param {string[]} roster
 * @returns {{ run: Run | null, best: Record<string, Best> }}
 */
export function loadArcade(roster) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    /** @type {Record<string, Best>} */
    const best = {};
    const src = raw?.best && typeof raw.best === 'object' ? raw.best : {};
    for (const char of roster) {
      const b = src[char];
      if (b && [b.clears, b.continues, b.frames].every((v) => Number.isInteger(v) && v >= 0) && b.clears > 0) {
        best[char] = { clears: b.clears, continues: b.continues, frames: b.frames };
      }
    }
    return { run: sanitiseRun(raw?.run, roster), best };
  } catch {
    return { run: null, best: {} };
  }
}

/**
 * @param {{ run: Run | null, best: Record<string, Best> }} data
 */
function store(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage blocked: the run lasts for this visit only.
  }
}

/**
 * Saves the run in progress (null: none).
 * @param {Run | null} run
 * @param {string[]} roster
 */
export function saveRun(run, roster) {
  store({ ...loadArcade(roster), run });
}

/**
 * Records a cleared run and clears the run in progress.
 * @param {Run} run
 * @param {string[]} roster
 * @returns {{ newBest: boolean, best: Best }}
 */
export function recordClear(run, roster) {
  const data = loadArcade(roster);
  const old = data.best[run.char];
  const newBest = isBetter(run, old);
  const best = {
    clears: (old?.clears ?? 0) + 1,
    continues: newBest ? run.continues : /** @type {Best} */ (old).continues,
    frames: newBest ? run.frames : /** @type {Best} */ (old).frames,
  };
  store({ run: null, best: { ...data.best, [run.char]: best } });
  return { newBest, best };
}

/**
 * Frames as m:ss.
 * @param {number} frames
 */
export function formatTime(frames) {
  const seconds = Math.floor(frames / 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
