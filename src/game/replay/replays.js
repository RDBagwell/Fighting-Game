/**
 * Replays. Because the simulation is deterministic, a replay is just the
 * match's starting options (characters, seed, stage) and both players'
 * inputs, frame by frame: replaying them reproduces the match exactly.
 *
 * Encoded as text, so it can be a file or part of a URL:
 *
 *   DD1.<header>.<inputs>
 *
 * - header: base64url JSON (format version, game version, mode, names,
 *   characters, seed, stage, date, frame count);
 * - inputs: base64url of a run-length encoding: (run length, P1 byte, P2
 *   byte) triplets. Inputs change every few frames, so a minute of play is
 *   about 2–4 KB.
 *
 * A loaded replay is untrusted input: `decodeReplay` validates the header
 * with zod, bounds every length, and refuses a replay made with a
 * different **game version** (a hash of the character data and rules): after
 * a balance change, an old replay would silently play out differently.
 *
 * Recent replays are kept on this device only (localStorage, versioned key),
 * never on a server.
 */
import { z } from 'zod';
import { hashState, saveState, loadState } from '../../engine/sim/state.js';

export const REPLAY_FORMAT = 1;
const PREFIX = `DD${REPLAY_FORMAT}.`;
const STORE = 'dusk-duel-replays-v1';
const KEEP = 12;
/** 20 minutes at 60 fps: longer than any match can be. */
const MAX_FRAMES = 60 * 60 * 20;

/**
 * The simulation code's version. Bump it whenever a change to the engine
 * (not the data) changes how a match plays out; the golden-hash test in
 * tests/determinism.test.js fails until you do.
 */
export const ENGINE_VERSION = 2;

/**
 * The version of the rules a replay needs: a hash of the engine version,
 * every character's data, the shared rules and the motion table. Any
 * balance change changes it.
 * @param {import('../../engine/sim/step.js').Simulation} sim
 */
export function gameVersion(sim) {
  return hashState({ engine: ENGINE_VERSION, characters: sim.characters, config: sim.config, motions: sim.motions }).toString(16).padStart(8, '0');
}

const headerSchema = z.strictObject({
  format: z.literal(REPLAY_FORMAT),
  game: z.string().regex(/^[0-9a-f]{8}$/),
  mode: z.enum(['cpu', 'versus', 'online', 'lab']),
  names: z.tuple([z.string().max(40), z.string().max(40)]),
  chars: z.tuple([z.string().max(20), z.string().max(20)]),
  seed: z.number().int().min(0).max(2 ** 32),
  stage: z.string().max(40),
  date: z.string().max(40),
  frames: z.number().int().min(1).max(MAX_FRAMES),
});

/**
 * @typedef {{ format: number, game: string, mode: 'cpu'|'versus'|'online'|'lab', names: [string, string], chars: [string, string], seed: number, stage: string, date: string, frames: number }} ReplayHeader
 * @typedef {{ header: ReplayHeader, inputs: Array<[number, number]> }} Replay
 */

// ─── making replays ────────────────────────────────────────────────

/**
 * @param {import('../../engine/sim/step.js').Simulation} sim
 * @param {{ chars: [string, string], seed: number, stage: string }} options
 * @param {Array<[number, number]>} inputs
 * @param {{ mode: ReplayHeader['mode'], names: [string, string] }} meta
 * @returns {Replay}
 */
export function makeReplay(sim, options, inputs, meta) {
  return {
    header: {
      format: REPLAY_FORMAT,
      game: gameVersion(sim),
      mode: meta.mode,
      names: meta.names,
      chars: options.chars,
      seed: options.seed >>> 0,
      stage: options.stage,
      date: new Date().toISOString(),
      frames: inputs.length,
    },
    inputs: inputs.map(([a, b]) => [a & 0xff, b & 0xff]),
  };
}

/**
 * From a rollback session: its confirmed input log (online and lab
 * matches), with the options the match was created from.
 * @param {import('../../engine/sim/step.js').Simulation} sim
 * @param {import('../../engine/rollback/RollbackSession.js').RollbackSession} session
 * @param {{ chars: [string, string], seed: number, stage: string }} options
 * @param {{ mode: ReplayHeader['mode'], names: [string, string] }} meta
 */
export function replayFromSession(sim, session, options, meta) {
  return makeReplay(sim, options, session.log, meta);
}

/**
 * Plays a replay from the start: the initial state for its options.
 * @param {import('../../engine/sim/step.js').Simulation} sim
 * @param {Replay} replay
 */
export function initialState(sim, replay) {
  const h = replay.header;
  return sim.createMatch({ chars: h.chars, seed: h.seed, stage: h.stage });
}

/** Frames between seek snapshots: three seconds, a few milliseconds to replay. */
export const SNAPSHOT_EVERY = 180;

/**
 * Plays a replay straight through once, keeping a snapshot every
 * SNAPSHOT_EVERY frames (the state *before* that frame) for seeking.
 * @param {import('../../engine/sim/step.js').Simulation} sim
 * @param {Replay} replay
 */
export function snapshotReplay(sim, replay) {
  /** @type {import('../../engine/sim/types.js').MatchState[]} */
  const snapshots = [];
  const s = initialState(sim, replay);
  for (let i = 0; i < replay.inputs.length; i++) {
    if (i % SNAPSHOT_EVERY === 0) snapshots.push(saveState(s));
    sim.step(s, replay.inputs[i]);
  }
  return { snapshots, final: s };
}

/**
 * The state at `frame` (after that many steps): the nearest snapshot at or
 * before it, then forward. `onStep` sees each state stepped on the way.
 * @param {import('../../engine/sim/step.js').Simulation} sim
 * @param {Replay} replay
 * @param {import('../../engine/sim/types.js').MatchState[]} snapshots
 * @param {number} frame
 * @param {(s: import('../../engine/sim/types.js').MatchState, frozen: boolean, target: number) => void} [onStep]
 */
export function seekState(sim, replay, snapshots, frame, onStep) {
  const target = Math.max(0, Math.min(replay.inputs.length, Math.round(frame)));
  const s = loadState(snapshots[Math.floor(target / SNAPSHOT_EVERY)]);
  while (s.frame < target) {
    const frozen = s.freeze > 0;
    sim.step(s, replay.inputs[s.frame]);
    onStep?.(s, frozen, target);
  }
  return s;
}

// ─── encoding ──────────────────────────────────────────────────────

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} text */
function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('not base64url');
  const b = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/**
 * @param {Replay} replay
 * @returns {string}
 */
export function encodeReplay(replay) {
  /** @type {number[]} */
  const rle = [];
  const ins = replay.inputs;
  for (let i = 0; i < ins.length; ) {
    const [a, b] = ins[i];
    let run = 1;
    while (run < 255 && i + run < ins.length && ins[i + run][0] === a && ins[i + run][1] === b) run++;
    rle.push(run, a, b);
    i += run;
  }
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify(replay.header)));
  return `${PREFIX}${header}.${toBase64Url(Uint8Array.from(rle))}`;
}

/**
 * Parses and validates a replay. Throws an Error with a message fit to
 * show the player for anything wrong.
 * @param {string} text
 * @param {import('../../engine/sim/step.js').Simulation} sim
 * @returns {Replay}
 */
export function decodeReplay(text, sim) {
  if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('That is not a Dusk Duel replay.');
  const parts = text.trim().split('.');
  if (parts.length !== 3 || `${parts[0]}.` !== PREFIX) {
    if (/^DD\d+$/.test(parts[0])) throw new Error('That replay was made with a different version of the replay format.');
    throw new Error('That is not a Dusk Duel replay.');
  }
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
  } catch {
    throw new Error('That replay is damaged.');
  }
  const parsed = headerSchema.safeParse(raw);
  if (!parsed.success) throw new Error('That replay is damaged.');
  const header = /** @type {ReplayHeader} */ (parsed.data);
  if (header.game !== gameVersion(sim)) throw new Error('That replay was recorded with a different version of the game (the moves or rules have changed since), so it would not play back the same.');
  for (const c of header.chars) if (!Object.hasOwn(sim.characters, c)) throw new Error('That replay uses a character this version doesn’t have.');
  if (!['dusk-shrine', 'oak-woods'].includes(header.stage)) throw new Error('That replay is damaged.');
  /** @type {Uint8Array} */
  let rle;
  try {
    rle = fromBase64Url(parts[2]);
  } catch {
    throw new Error('That replay is damaged.');
  }
  if (rle.length % 3 !== 0) throw new Error('That replay is damaged.');
  /** @type {Array<[number, number]>} */
  const inputs = [];
  for (let i = 0; i < rle.length; i += 3) {
    const run = rle[i];
    if (run === 0 || inputs.length + run > header.frames) throw new Error('That replay is damaged.');
    for (let k = 0; k < run; k++) inputs.push([rle[i + 1], rle[i + 2]]);
  }
  if (inputs.length !== header.frames) throw new Error('That replay is damaged.');
  return { header, inputs };
}

// ─── on this device ────────────────────────────────────────────────

/**
 * @typedef {{ id: string, date: string, mode: string, names: [string, string], frames: number, data: string }} StoredReplay
 */

/** @returns {StoredReplay[]} */
export function listReplays() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.data === 'string' && typeof r.id === 'string').slice(0, KEEP) : [];
  } catch {
    return [];
  }
}

/**
 * Keeps a replay (the newest first, at most 12).
 * @param {Replay} replay
 */
export function saveReplay(replay) {
  const entry = {
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    date: replay.header.date,
    mode: replay.header.mode,
    names: replay.header.names,
    frames: replay.header.frames,
    data: encodeReplay(replay),
  };
  const list = [entry, ...listReplays()].slice(0, KEEP);
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    // Storage full or blocked: keep fewer.
    try {
      localStorage.setItem(STORE, JSON.stringify(list.slice(0, 3)));
    } catch {
      // Not available: replays can still be downloaded from the results screen.
    }
  }
  return entry;
}

/** @param {string} id */
export function deleteReplay(id) {
  try {
    localStorage.setItem(STORE, JSON.stringify(listReplays().filter((r) => r.id !== id)));
  } catch {
    // ignore
  }
}
