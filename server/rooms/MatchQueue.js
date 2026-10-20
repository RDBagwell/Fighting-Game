/**
 * Quick-match queue: first come, first served. Ported from Netcode Pong,
 * plus tickets so a place in the queue survives a dropped connection.
 *
 * - Entries are keyed by member (socket) id, so a socket is queued at most
 *   once and can never be paired with itself.
 * - Joining the queue returns a **ticket** (a 256-bit secret; only its hash
 *   is kept). If the socket drops, the entry is kept for `graceMs` but can't
 *   be paired; a new socket presenting the ticket takes the place back.
 * - Every pairing re-checks `isAlive()`, so nobody is ever matched with a
 *   dead socket.
 *
 * @typedef {object} QueueEntry
 * @property {import('./Room.js').Member} member
 * @property {() => boolean} isAlive
 * @property {string} version  Only entries of the same game version are paired.
 * @property {string} ticketHash
 * @property {number | null} [lostAt]
 */
import { generateToken, hashToken, hashesEqual } from '../security/random.js';

/**
 * @template {QueueEntry} E
 */
export class MatchQueue {
  /**
   * @param {number} graceMs
   */
  constructor(graceMs) {
    this.graceMs = graceMs;
    /** @type {Map<string, E>} */
    this.entries = new Map();
  }

  /**
   * Adds an entry (or replaces this member's). Returns its ticket.
   * @param {Omit<E, 'ticketHash'>} entry
   */
  enqueue(entry) {
    const ticket = generateToken();
    this.entries.set(entry.member.id, /** @type {E} */ ({ ...entry, ticketHash: hashToken(ticket), lostAt: null }));
    return ticket;
  }

  /**
   * A new socket takes back the place of the entry holding `ticket`, keeping
   * its position. Returns false if no entry has that ticket.
   * @param {string} ticket
   * @param {Omit<E, 'ticketHash'>} entry
   */
  reclaim(ticket, entry) {
    const hash = hashToken(ticket);
    for (const [id, e] of this.entries) {
      if (!hashesEqual(e.ticketHash, hash)) continue;
      // Rebuild the map so the reclaimed entry keeps its place in line.
      const rebuilt = new Map();
      for (const [k, v] of this.entries) {
        if (k === id) rebuilt.set(entry.member.id, /** @type {E} */ ({ ...entry, ticketHash: e.ticketHash, lostAt: null }));
        else if (k !== entry.member.id) rebuilt.set(k, v);
      }
      this.entries = rebuilt;
      return true;
    }
    return false;
  }

  /**
   * The socket went away: keep the place for a while, unpairable.
   * @param {string} memberId
   * @param {number} now
   */
  lost(memberId, now) {
    const e = this.entries.get(memberId);
    if (e) e.lostAt = now;
  }

  /** @param {string} memberId */
  remove(memberId) {
    return this.entries.delete(memberId);
  }

  /** @param {string} memberId */
  has(memberId) {
    return this.entries.has(memberId);
  }

  get size() {
    return this.entries.size;
  }

  /**
   * Drops entries whose socket has been gone longer than the grace period.
   * @param {number} now
   */
  sweep(now) {
    for (const [id, e] of this.entries) if (e.lostAt !== null && e.lostAt !== undefined && now - e.lostAt > this.graceMs) this.entries.delete(id);
  }

  /**
   * Takes the longest-waiting live entry that has a live partner of the
   * same game version, and that partner; or null if there's no such pair.
   * @returns {[E, E] | null}
   */
  takePair() {
    /** @type {Map<string, E>} the first live entry seen of each version */
    const waiting = new Map();
    for (const entry of this.entries.values()) {
      if (entry.lostAt !== null && entry.lostAt !== undefined) continue;
      if (!entry.isAlive()) continue;
      const first = waiting.get(entry.version);
      if (!first) {
        waiting.set(entry.version, entry);
        continue;
      }
      this.entries.delete(first.member.id);
      this.entries.delete(entry.member.id);
      return [first, entry];
    }
    return null;
  }

  /**
   * Puts entries back at the front (used when a room couldn't be created).
   * @param {E[]} entries
   */
  requeueFront(entries) {
    const rest = [...this.entries.values()];
    this.entries.clear();
    for (const e of [...entries, ...rest]) if (e.isAlive()) this.entries.set(e.member.id, e);
  }
}
