/**
 * Separates the simulation's events from their presentation.
 *
 * The simulation reports what happened on each frame (`state.events`: a
 * hit, a block, a KO). Without rollback, each event is presented (a sound,
 * a spark) once, when its frame is simulated. With rollback, frames are
 * simulated again after a correction, and the same hit is reported again:
 * playing it again would double every sound.
 *
 * So the presenter remembers what it has already presented in the last
 * few dozen frames. An event is presented only if no event of the same
 * type, by the same side, with the same move, was presented within
 * `tolerance` frames of it (a correction often moves a hit by a frame).
 * A re-simulated frame that now has an event it didn't have before (a
 * hit the prediction missed) *is* presented, late, exactly once.
 *
 * What it can't do is take back a sound for a hit that the correction
 * removed: that's the honest cost of rollback, kept small by the input
 * delay and the rollback window. The lab counts these.
 */

/**
 * @typedef {import('../sim/types.js').SimEvent} SimEvent
 */

export class EventPresenter {
  /**
   * @param {object} [o]
   * @param {number} [o.memory]  Frames to remember (more than the rollback window).
   * @param {number} [o.tolerance]
   */
  constructor({ memory = 30, tolerance = 2 } = {}) {
    this.memory = memory;
    this.tolerance = tolerance;
    /** @type {Array<{ frame: number, key: string }>} */
    this.presented = [];
    /** Events suppressed as repeats (re-simulation). */
    this.suppressed = 0;
    /** Events presented late (first seen during a re-simulation). */
    this.late = 0;
  }

  /** @param {SimEvent} e */
  static key(e) {
    return `${e.type}|${e.side}|${e.move ?? ''}`;
  }

  /**
   * The events of `frame` that haven't been presented yet.
   * @param {number} frame
   * @param {SimEvent[]} events
   * @param {boolean} resim  This frame is being simulated again.
   * @returns {SimEvent[]}
   */
  filter(frame, events, resim) {
    const fresh = [];
    for (const e of events) {
      const key = EventPresenter.key(e);
      const seen = this.presented.some((p) => p.key === key && Math.abs(p.frame - frame) <= this.tolerance);
      if (seen) {
        this.suppressed++;
        continue;
      }
      this.presented.push({ frame, key });
      if (resim) this.late++;
      fresh.push(e);
    }
    const oldest = frame - this.memory;
    if (this.presented.length > 64) this.presented = this.presented.filter((p) => p.frame >= oldest);
    return fresh;
  }

  reset() {
    this.presented = [];
  }
}
