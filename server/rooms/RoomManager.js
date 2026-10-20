/**
 * All rooms, the quick-match queue, and the sweep that runs their timeouts.
 */
import { Room } from './Room.js';
import { MatchQueue } from './MatchQueue.js';
import { generateRoomCode } from '../security/random.js';

/**
 * @typedef {{ now: () => number }} Clock
 */

/**
 * @template {import('./MatchQueue.js').QueueEntry} E
 */
export class RoomManager {
  /**
   * @param {import('../config.js').Config} config
   * @param {{ clock?: Clock, log?: (level: string, message: string) => void }} [deps]
   */
  constructor(config, { clock = { now: () => Date.now() }, log = () => {} } = {}) {
    this.config = config;
    this.clock = clock;
    this.log = log;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** @type {MatchQueue<E>} */
    this.queue = new MatchQueue(config.queueGraceMs);
    /** @type {ReturnType<typeof setInterval> | null} */
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this.sweep(), this.config.sweepIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * A new room with an unused code, or null if the server is full.
   * @param {'private'|'quick'} mode
   */
  create(mode) {
    if (this.rooms.size >= this.config.maxRooms) return null;
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    const room = new Room(code, mode, this.clock.now(), this.config);
    this.rooms.set(code, room);
    return room;
  }

  /** @param {string} code */
  get(code) {
    return this.rooms.get(code);
  }

  sweep() {
    const now = this.clock.now();
    for (const [code, room] of this.rooms) {
      try {
        if (room.tick(now)) {
          room.sendInfo(now);
          this.rooms.delete(code);
        }
      } catch (err) {
        this.log('error', `room sweep failed: ${/** @type {Error} */ (err)?.stack || err}`);
        room.close('Something went wrong.');
        this.rooms.delete(code);
      }
    }
    this.queue.sweep(now);
  }
}
