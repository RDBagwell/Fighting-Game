/**
 * Time sync: keeps the two peers' simulations at the same frame.
 *
 * The problem: if one machine starts a little later, or its clock runs a
 * little slow, it is always behind. Then the machine ahead keeps
 * predicting the other's inputs and is the one rolling back all the time,
 * while the one behind never has to. Over a long match the gap can grow
 * until the session stalls.
 *
 * How (the GGPO approach): each side estimates its **frame advantage**,
 * how many frames ahead of the other it is:
 *
 *   advantage = my frame − (their last reported frame + one-way latency in frames)
 *
 * and sends it with every input packet. Each side averages its own and the
 * peer's reported advantage over the last `window` packets. If mine is
 * larger than theirs by more than `threshold`, I'm ahead: I skip one frame
 * (simulate nothing for one tick), at most once every `cooldown` frames.
 * Halving the difference is the share each side should make up, so both
 * end up close to zero and rollbacks are shared evenly.
 */

export class TimeSync {
  /**
   * @param {object} [o]
   * @param {number} [o.window]  Samples averaged.
   * @param {number} [o.threshold]  Frames of (my − their)/2 before skipping.
   * @param {number} [o.cooldown]  Frames between skips.
   */
  constructor({ window = 40, threshold = 1, cooldown = 20 } = {}) {
    this.window = window;
    this.threshold = threshold;
    this.cooldown = cooldown;
    /** @type {number[]} */
    this.local = [];
    /** @type {number[]} */
    this.remote = [];
    this.lastSkip = -Infinity;
    this.skips = 0;
  }

  /**
   * @param {number[]} list
   * @param {number} value
   */
  push(list, value) {
    list.push(value);
    if (list.length > this.window) list.shift();
  }

  /**
   * Record one sample of each side's advantage.
   * @param {number} mine
   * @param {number} theirs
   */
  sample(mine, theirs) {
    this.push(this.local, mine);
    this.push(this.remote, theirs);
  }

  /** (my average advantage − theirs) / 2: frames I should give back. */
  imbalance() {
    if (this.local.length < 8 || this.remote.length < 8) return 0;
    const avg = (/** @type {number[]} */ l) => l.reduce((a, b) => a + b, 0) / l.length;
    return (avg(this.local) - avg(this.remote)) / 2;
  }

  /**
   * Should this frame be skipped?
   * @param {number} frame
   */
  shouldSkip(frame) {
    if (frame - this.lastSkip < this.cooldown) return false;
    if (this.imbalance() < this.threshold) return false;
    this.lastSkip = frame;
    this.skips++;
    // A skip changes the advantage by one frame: forget the old samples.
    this.local.length = 0;
    this.remote.length = 0;
    return true;
  }
}
