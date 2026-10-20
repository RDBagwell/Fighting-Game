/**
 * Token buckets, as in Chat Mafia and Netcode Pong.
 *
 * @typedef {{ capacity: number, windowMs: number }} BucketOptions
 */

/**
 * `capacity` tokens, refilled continuously so that `capacity` tokens come
 * back every `windowMs`.
 */
export class TokenBucket {
  /**
   * @param {BucketOptions} options
   * @param {() => number} [now]
   */
  constructor({ capacity, windowMs }, now = Date.now) {
    this.capacity = capacity;
    this.refillPerMs = capacity / windowMs;
    this.tokens = capacity;
    this.now = now;
    this.updatedAt = now();
  }

  take(cost = 1) {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + (t - this.updatedAt) * this.refillPerMs);
    this.updatedAt = t;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }

  isFull() {
    this.take(0);
    return this.tokens >= this.capacity;
  }
}

/** One bucket per key (IP address, socket id...), with periodic pruning. */
export class KeyedRateLimiter {
  /**
   * @param {BucketOptions} options
   * @param {() => number} [now]
   */
  constructor(options, now = Date.now) {
    this.options = options;
    this.now = now;
    /** @type {Map<string, TokenBucket>} */
    this.buckets = new Map();
  }

  /**
   * @param {string} key
   * @param {number} [cost]
   */
  take(key, cost = 1) {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.options, this.now);
      this.buckets.set(key, bucket);
    }
    return bucket.take(cost);
  }

  /** Drops buckets that have fully refilled, so memory stays bounded. */
  prune() {
    for (const [key, bucket] of this.buckets) if (bucket.isFull()) this.buckets.delete(key);
  }

  get size() {
    return this.buckets.size;
  }
}
