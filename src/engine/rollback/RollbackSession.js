/**
 * Rollback netcode: one player's side of a peer-to-peer match.
 *
 * Both players run the full simulation. The network carries only inputs
 * (one byte per frame). Every 60 Hz tick, `tick(localInput)`:
 *
 *   1. **Receives** the peer's input packets. A packet carries their newest
 *      inputs plus every older one this side hasn't acknowledged
 *      (redundancy covers packet loss); duplicates and late arrivals are
 *      harmless.
 *   2. **Rolls back** if needed. Frames that were simulated with a
 *      *predicted* remote input (their last known input, repeated) are
 *      checked against the real one when it arrives. If any differ, the
 *      state saved just before the earliest wrong frame is loaded and every
 *      frame since is simulated again with the corrected inputs, all inside
 *      this tick. Only the final result is drawn.
 *   3. **Advances** one frame, unless the peer is further behind than the
 *      rollback window (then it waits: a stall), or time sync says this side
 *      is running ahead (then it skips one tick). The local input is
 *      scheduled `inputDelay` frames ahead: a small delay means fewer and
 *      shorter rollbacks.
 *   4. **Sends** its inputs, acknowledges the peer's, and every
 *      `checksumInterval` confirmed frames sends a hash of the state so a
 *      desync is caught on the exact frame.
 *
 * `mode: 'delay'` is the old delay-based netcode, kept for the lab: never
 * predict, just wait until the peer's input for the next frame has
 * arrived.
 *
 * Frame numbering follows the simulation: frame f is the step that makes
 * `state.frame === f`; the input for frame f is what that step reads.
 *
 * docs/ROLLBACK.md explains each part with diagrams.
 */
import { saveState, loadState, hashState } from '../sim/state.js';
import { encodeInput, encodeChecksum, encodePing, decode, INPUT, CHECKSUM, PING, PONG, MAX_INPUTS } from './packets.js';
import { TimeSync } from './TimeSync.js';
import { EventPresenter } from './EventPresenter.js';

const FRAME_MS = 1000 / 60;
/** Ticks of history kept for the lab's meters. */
const HISTORY = 180;

/**
 * @typedef {import('../sim/types.js').MatchState} MatchState
 * @typedef {import('../sim/types.js').SimEvent} SimEvent
 * @typedef {import('../sim/types.js').FighterState} FighterState
 */

/**
 * @typedef {object} TickResult
 * @property {SimEvent[]} events  Events to present (sounds, sparks): each real event exactly once.
 * @property {number} rolledBack  Frames re-simulated this tick.
 * @property {boolean} advanced
 * @property {boolean} stalled  Waited for the peer (beyond the rollback window, or delay mode).
 * @property {boolean} skipped  Time sync gave a frame back.
 * @property {number} resimMs  Time spent re-simulating.
 */

/**
 * @typedef {object} Correction  What a rollback changed, for the lab's ghost.
 * @property {number} tick  `state.frame` when it happened.
 * @property {number} from  First frame re-simulated.
 * @property {number} frames
 * @property {{ x: number, y: number, facing: 1 | -1, char: string, state: string, move: string, moveFrame: number, stateFrame: number, vy: number, crouching: boolean }} predicted
 *   The opponent as the prediction had them, just before the correction.
 */

export class RollbackSession {
  /**
   * @param {object} o
   * @param {import('../sim/step.js').Simulation} o.sim
   * @param {MatchState} o.state  The starting state (usually frame 0). The session steps it in place.
   * @param {number} o.localSide  0 or 1
   * @param {import('./transport.js').Transport} o.transport
   * @param {number} [o.inputDelay]
   * @param {number} [o.maxRollback]
   * @param {'rollback'|'delay'} [o.mode]
   * @param {number} [o.checksumInterval]
   * @param {() => number} [o.now]  ms
   */
  constructor({ sim, state, localSide, transport, inputDelay = 2, maxRollback = 8, mode = 'rollback', checksumInterval = 30, now = () => performance.now() }) {
    this.sim = sim;
    this.state = state;
    this.localSide = localSide;
    this.remoteSide = 1 - localSide;
    this.transport = transport;
    this.inputDelay = inputDelay;
    this.maxRollback = maxRollback;
    this.mode = mode;
    this.checksumInterval = checksumInterval;
    this.now = now;

    /** The state the session started from, for replays and desync logs. */
    this.initial = saveState(state);
    this.startFrame = state.frame;

    /** @type {Map<number, number>} Local inputs by frame. */
    this.local = new Map();
    /** @type {Map<number, number>} Confirmed remote inputs by frame. */
    this.remote = new Map();
    /** @type {Map<number, number>} The remote input each frame was last simulated with. */
    this.simulatedRemote = new Map();
    /** @type {Map<number, MatchState>} State saved before each recent frame. */
    this.snapshots = new Map();

    this.lastLocalFrame = this.startFrame;
    // The first `inputDelay` frames have no input yet: they're neutral on both sides.
    for (let f = this.startFrame + 1; f <= this.startFrame + inputDelay; f++) this.local.set(f, 0);
    this.lastLocalFrame = this.startFrame + inputDelay;
    /** Every remote frame up to here has arrived (no gaps). */
    this.lastRemote = this.startFrame;
    /** The peer has every local frame up to here. */
    this.remoteHasLocal = this.startFrame;
    /** The peer's last reported frame and frame advantage. */
    this.remoteFrame = this.startFrame;
    this.remoteAdvantage = 0;
    this.rollbackFrom = Infinity;

    this.timeSync = new TimeSync();
    this.presenter = new EventPresenter({ memory: maxRollback + 30 });

    /** Round trip, from pings (smoothed). */
    this.rttMs = 0;
    this.lastPing = -Infinity;

    /** @type {Map<number, number>} */
    this.localHashes = new Map();
    /** @type {Map<number, number>} */
    this.remoteHashes = new Map();
    this.lastChecksumFrame = this.startFrame;
    /** @type {Map<number, number>} A hash of every recent confirmed frame, for the desync log. */
    this.frameHashes = new Map();
    this.lastHashedFrame = this.startFrame;
    /** @type {{ frame: number, local: number, remote: number } | null} The first checksum that didn't match. */
    this.desync = null;

    /** Confirmed inputs for both players, frame by frame from startFrame + 1: the replay. */
    /** @type {Array<[number, number]>} */
    this.log = [];

    /** @type {Correction | null} */
    this.lastCorrection = null;

    this.stats = {
      ticks: 0,
      rollbacks: 0,
      resimFrames: 0,
      longestRollback: 0,
      predictedFrames: 0,
      predictionMisses: 0,
      stalls: 0,
      skips: 0,
      lastResimMs: 0,
      maxResimMs: 0,
    };
    /** Per tick, newest last: frames re-simulated (-1 = stalled, -2 = skipped). For the rollback meter. */
    /** @type {number[]} */
    this.meter = [];
    /**
     * Per remote frame, how it went: when its input arrived relative to the
     * frame we'd reached, and whether we'd predicted it and got it wrong.
     * For the lab's input timeline.
     * @type {Map<number, { lateBy: number, predicted: boolean, miss: boolean }>}
     */
    this.arrivals = new Map();
  }

  /** The highest frame both players' inputs are known for. */
  get confirmedFrame() {
    return Math.min(this.lastRemote, this.lastLocalFrame, this.state.frame);
  }

  /** Frames this side is ahead of the peer, by its own estimate. */
  get localAdvantage() {
    return this.state.frame - (this.remoteFrame + this.rttMs / 2 / FRAME_MS);
  }

  /**
   * @param {number} n
   */
  setInputDelay(n) {
    this.inputDelay = Math.max(0, Math.min(15, Math.round(n)));
  }

  /**
   * One 60 Hz tick.
   * @param {number} localBits  This player's input byte for this tick.
   * @returns {TickResult}
   */
  tick(localBits) {
    this.stats.ticks++;
    this.receiveAll();

    /** @type {SimEvent[]} */
    const events = [];
    let rolledBack = 0;
    let resimMs = 0;
    if (this.rollbackFrom <= this.state.frame) {
      const t0 = this.now();
      rolledBack = this.rollback(events);
      resimMs = this.now() - t0;
      this.stats.lastResimMs = resimMs;
      this.stats.maxResimMs = Math.max(this.stats.maxResimMs, resimMs);
    }
    this.rollbackFrom = Infinity;

    const next = this.state.frame + 1;
    let stalled = false;
    let skipped = false;
    if (this.mode === 'delay' && !this.remote.has(next)) stalled = true;
    else if (this.mode === 'rollback' && next - this.lastRemote > this.maxRollback) stalled = true;
    else if (this.timeSync.shouldSkip(next)) skipped = true;

    if (stalled) this.stats.stalls++;
    if (skipped) this.stats.skips++;
    if (!stalled && !skipped) {
      this.scheduleLocal(next, localBits);
      events.push(...this.simulateNext(false));
    }

    this.recordLog();
    this.sendInputs();
    this.checksums();
    this.ping();
    this.timeSync.sample(this.localAdvantage, this.remoteAdvantage);
    this.prune();

    this.meter.push(stalled ? -1 : skipped ? -2 : rolledBack);
    if (this.meter.length > HISTORY) this.meter.shift();
    return { events, rolledBack, advanced: !stalled && !skipped, stalled, skipped, resimMs };
  }

  // ─── inputs ──────────────────────────────────────────────────────

  /**
   * Puts this tick's input on frame `next + inputDelay`, filling any gap
   * (the delay was raised) with the previous input. If the delay was
   * lowered, the frames are already filled and this input waits.
   * @param {number} next
   * @param {number} bits
   */
  scheduleLocal(next, bits) {
    const target = next + this.inputDelay;
    if (target <= this.lastLocalFrame) return;
    const previous = this.local.get(this.lastLocalFrame) ?? 0;
    for (let f = this.lastLocalFrame + 1; f < target; f++) this.local.set(f, previous);
    this.local.set(target, bits & 0xff);
    this.lastLocalFrame = target;
  }

  /** The guess for a remote frame we don't have: their last confirmed input. */
  predict() {
    return this.remote.get(this.lastRemote) ?? 0;
  }

  // ─── simulation ──────────────────────────────────────────────────

  /**
   * Saves the state, then simulates the next frame.
   * @param {boolean} resim
   * @returns {SimEvent[]}
   */
  simulateNext(resim) {
    const f = this.state.frame + 1;
    this.snapshots.set(f, saveState(this.state));
    const localBits = this.local.get(f) ?? 0;
    const confirmed = this.remote.has(f);
    const remoteBits = confirmed ? /** @type {number} */ (this.remote.get(f)) : this.predict();
    if (!confirmed && !resim) this.stats.predictedFrames++;
    this.simulatedRemote.set(f, remoteBits);
    const inputs = this.localSide === 0 ? [localBits, remoteBits] : [remoteBits, localBits];
    this.sim.step(this.state, inputs);
    return this.presenter.filter(f, this.state.events, resim);
  }

  /**
   * Loads the state from before the earliest mispredicted frame and
   * re-simulates up to where we were.
   * @param {SimEvent[]} events  Late events (new after the correction) are added here.
   */
  rollback(events) {
    const target = this.state.frame;
    const from = this.rollbackFrom;
    const saved = this.snapshots.get(from);
    if (!saved) throw new Error(`Rollback to frame ${from}: no saved state (window too small)`);
    const before = this.state.fighters[this.remoteSide];
    this.lastCorrection = {
      tick: target,
      from,
      frames: target - from + 1,
      predicted: { x: before.x, y: before.y, facing: before.facing, char: before.char, state: before.state, move: before.move, moveFrame: before.moveFrame, stateFrame: before.stateFrame, vy: before.vy, crouching: before.crouching },
    };
    this.state = loadState(saved);
    let n = 0;
    while (this.state.frame < target) {
      events.push(...this.simulateNext(true));
      n++;
    }
    this.stats.rollbacks++;
    this.stats.resimFrames += n;
    this.stats.longestRollback = Math.max(this.stats.longestRollback, n);
    return n;
  }

  // ─── network ─────────────────────────────────────────────────────

  receiveAll() {
    for (const data of this.transport.receive()) {
      const p = decode(data);
      if (!p) continue;
      if (p.type === INPUT) this.receiveInputs(p);
      else if (p.type === CHECKSUM) {
        if (!this.remoteHashes.has(p.frame)) this.remoteHashes.set(p.frame, p.hash);
        this.compare(p.frame);
      } else if (p.type === PING) this.transport.send(encodePing(PONG, p.time));
      else if (p.type === PONG) {
        const rtt = Math.max(0, this.now() - p.time);
        this.rttMs = this.rttMs === 0 ? rtt : this.rttMs * 0.8 + rtt * 0.2;
      }
    }
  }

  /**
   * @param {import('./packets.js').InputPacket} p
   */
  receiveInputs(p) {
    if (p.frame > this.remoteFrame) {
      this.remoteFrame = p.frame;
      this.remoteAdvantage = p.advantage;
    }
    if (p.ack > this.remoteHasLocal) this.remoteHasLocal = Math.min(p.ack, this.lastLocalFrame);
    for (let i = 0; i < p.inputs.length; i++) {
      const f = p.start + i;
      if (f <= this.startFrame || f <= this.lastRemote || this.remote.has(f)) continue;
      // An impossible frame (far beyond anything the peer could have reached) is ignored.
      if (f > this.state.frame + 600) continue;
      const bits = p.inputs[i];
      this.remote.set(f, bits);
      const simulated = this.simulatedRemote.get(f);
      const wasSimulated = simulated !== undefined && f <= this.state.frame;
      const miss = wasSimulated && simulated !== bits;
      this.arrivals.set(f, { lateBy: this.state.frame - f, predicted: wasSimulated, miss });
      if (miss) {
        this.stats.predictionMisses++;
        this.rollbackFrom = Math.min(this.rollbackFrom, f);
      }
    }
    while (this.remote.has(this.lastRemote + 1)) this.lastRemote++;
  }

  sendInputs() {
    let from = Math.max(this.remoteHasLocal + 1, this.lastLocalFrame - MAX_INPUTS + 1);
    if (from > this.lastLocalFrame) from = this.lastLocalFrame; // still send one, so acks and frames flow
    const inputs = [];
    for (let f = from; f <= this.lastLocalFrame; f++) inputs.push(this.local.get(f) ?? 0);
    this.transport.send(encodeInput(this.state.frame, this.lastRemote, this.localAdvantage, from, inputs));
  }

  ping() {
    const t = this.now();
    if (t - this.lastPing < 500) return;
    this.lastPing = t;
    this.transport.send(encodePing(PING, t));
  }

  // ─── desync detection ────────────────────────────────────────────

  /**
   * Hashes every newly confirmed frame (kept for the desync log), and every
   * `checksumInterval`-th one is sent to the peer to compare.
   */
  checksums() {
    const confirmed = this.confirmedFrame;
    for (let f = this.lastHashedFrame + 1; f <= confirmed; f++) {
      const after = this.stateAfter(f);
      if (!after) continue;
      const hash = hashState(after);
      this.frameHashes.set(f, hash);
      this.lastHashedFrame = f;
      if (f % this.checksumInterval === 0) {
        this.localHashes.set(f, hash);
        this.transport.send(encodeChecksum(f, hash));
        this.compare(f);
        this.lastChecksumFrame = f;
      }
    }
    // Resend the latest few checksums now and then: they travel unreliably too.
    if (this.stats.ticks % 10 === 0) {
      const recent = [...this.localHashes.keys()].slice(-3);
      for (const f of recent) this.transport.send(encodeChecksum(f, /** @type {number} */ (this.localHashes.get(f))));
    }
  }

  /** @param {number} frame */
  compare(frame) {
    if (this.desync) return;
    const mine = this.localHashes.get(frame);
    const theirs = this.remoteHashes.get(frame);
    if (mine === undefined || theirs === undefined) return;
    if (mine !== theirs) this.desync = { frame, local: mine, remote: theirs };
  }

  // ─── bookkeeping ─────────────────────────────────────────────────

  /** Appends newly confirmed frames to the input log. */
  recordLog() {
    const confirmed = Math.min(this.lastRemote, this.lastLocalFrame);
    for (let f = this.startFrame + 1 + this.log.length; f <= confirmed; f++) {
      const l = this.local.get(f) ?? 0;
      const r = this.remote.get(f) ?? 0;
      this.log.push(this.localSide === 0 ? [l, r] : [r, l]);
    }
  }

  /** Forgets what can no longer matter. */
  prune() {
    const keepFrom = Math.min(this.lastRemote, this.state.frame) - 2;
    const inputFrom = Math.min(keepFrom, this.remoteHasLocal, this.startFrame + this.log.length) - 2;
    for (const f of this.snapshots.keys()) if (f < keepFrom) this.snapshots.delete(f);
    for (const f of this.simulatedRemote.keys()) if (f < keepFrom) this.simulatedRemote.delete(f);
    for (const f of this.local.keys()) if (f < inputFrom) this.local.delete(f);
    for (const f of this.remote.keys()) if (f < inputFrom) this.remote.delete(f);
    for (const f of this.arrivals.keys()) if (f < this.state.frame - HISTORY) this.arrivals.delete(f);
    for (const [map, keep] of /** @type {Array<[Map<number, number>, number]>} */ ([[this.localHashes, 64], [this.remoteHashes, 64], [this.frameHashes, 600]])) {
      if (map.size > keep + 32) for (const f of [...map.keys()].slice(0, map.size - keep)) map.delete(f);
    }
  }

  /**
   * The state after frame f, if it's still saved.
   * @param {number} f
   */
  stateAfter(f) {
    if (f === this.state.frame) return this.state;
    return this.snapshots.get(f + 1) ?? null;
  }

  /**
   * Everything needed to reproduce this side of the match: the starting
   * state, both players' confirmed inputs, and the checksums both sides
   * reported. `tools/desync.mjs` replays it.
   */
  desyncLog() {
    return {
      kind: 'dusk-duel-desync-log',
      version: 1,
      side: this.localSide,
      startFrame: this.startFrame,
      initial: this.initial,
      inputs: this.log.slice(),
      localHashes: Object.fromEntries(this.localHashes),
      remoteHashes: Object.fromEntries(this.remoteHashes),
      frameHashes: Object.fromEntries(this.frameHashes),
      desync: this.desync,
    };
  }
}
