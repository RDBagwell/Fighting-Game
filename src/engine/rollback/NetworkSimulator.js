/**
 * A simulated bad network, for the rollback lab and the tests. Ported from
 * Netcode Pong's NetworkSimulator, plus duplication.
 *
 * Every message is delayed by half the round-trip latency plus a random
 * 0..jitter, dropped with probability `loss`, and duplicated with
 * probability `duplicate`. Because each message gets its own delay,
 * messages overtake each other, just as datagrams on a WebRTC data channel
 * (unordered, no retransmits) or UDP do.
 *
 * There are no timers: `pump(now)` releases whatever is due, so the browser
 * pumps it every frame and the tests pump it on a virtual clock. It takes
 * its randomness as a function, so tests are reproducible from a seed.
 */

/**
 * @typedef {object} NetworkConditions
 * @property {number} latencyMs  Added round-trip latency (half each way).
 * @property {number} jitterMs  Extra random delay per message, 0..jitterMs, each way.
 * @property {number} loss  Probability (0..1) a message is lost.
 * @property {number} [duplicate]  Probability (0..1) a message arrives twice.
 */

/** @type {NetworkConditions} */
export const PERFECT_NETWORK = { latencyMs: 0, jitterMs: 0, loss: 0, duplicate: 0 };

/**
 * A small seeded generator (mulberry32) for reproducible network weather.
 * @param {number} seed
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 */
export class NetworkSimulator {
  /**
   * @param {NetworkConditions} [conditions]
   * @param {() => number} [random]
   */
  constructor(conditions = PERFECT_NETWORK, random = Math.random) {
    /** @type {NetworkConditions} */
    this.conditions = { ...PERFECT_NETWORK, ...conditions };
    this.random = random;
    /** @type {Array<{ at: number, order: number, message: T }>} */
    this.queue = [];
    this.order = 0;
    this.sent = 0;
    this.dropped = 0;
    this.duplicated = 0;
  }

  /**
   * Schedules a message; it comes out of `pump` once due (never, if lost).
   * @param {number} now  ms
   * @param {T} message
   */
  transmit(now, message) {
    this.sent++;
    const { latencyMs, jitterMs, loss, duplicate = 0 } = this.conditions;
    if (loss > 0 && this.random() < loss) {
      this.dropped++;
      return;
    }
    const copies = duplicate > 0 && this.random() < duplicate ? 2 : 1;
    if (copies === 2) this.duplicated++;
    for (let i = 0; i < copies; i++) {
      const delay = Math.max(0, latencyMs / 2) + Math.max(0, jitterMs) * this.random();
      this.queue.push({ at: now + delay, order: this.order++, message });
    }
  }

  /**
   * Every message due by `now`, in arrival order.
   * @param {number} now
   * @returns {T[]}
   */
  pump(now) {
    if (!this.queue.length) return [];
    const due = [];
    const later = [];
    for (const q of this.queue) (q.at <= now ? due : later).push(q);
    if (!due.length) return [];
    this.queue = later;
    due.sort((a, b) => a.at - b.at || a.order - b.order);
    return due.map((q) => q.message);
  }

  get inFlight() {
    return this.queue.length;
  }
}
