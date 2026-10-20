/**
 * One room: two seats, the character select, and the matches played in it.
 *
 * The server never runs the game. A match is just a record: the seed it
 * starts from, who plays whom, and its number. The two clients simulate it
 * between themselves (rollback, peer to peer). The room's job is the
 * lifecycle around that:
 *
 *   waiting ──second player──► select ──both ready──► playing ──► over
 *                                 ▲                      │          │
 *                                 └──change characters───┼──────────┤
 *                                                        │ rematch  │
 *                                 playing ◄──────────────┴──────────┘
 *
 * plus a pause while a seat is disconnected (the match is forfeited if they
 * aren't back within `reconnectGraceMs`), and forwarding of signalling and
 * relayed input packets to the other seat.
 *
 * @typedef {object} Member  A socket, in practice.
 * @property {string} id
 * @property {(event: string, payload: unknown) => void} send
 *
 * @typedef {0 | 1} Seat
 */
import { generateToken, hashToken, hashesEqual, randomSeed } from '../security/random.js';
import { CHARACTERS } from '../../shared/protocol.js';

/**
 * @typedef {object} SeatSlot
 * @property {boolean} taken
 * @property {string | null} tokenHash
 * @property {Member | null} member
 * @property {number | null} disconnectedAt
 * @property {(typeof CHARACTERS)[number]} char
 * @property {boolean} ready
 * @property {boolean} rematch
 */

export class Room {
  /**
   * @param {string} code
   * @param {'private'|'quick'} mode
   * @param {number} now
   * @param {import('../config.js').Config} config
   */
  constructor(code, mode, now, config) {
    this.code = code;
    this.mode = mode;
    this.config = config;
    this.createdAt = now;
    /** @type {import('../../shared/protocol.js').RoomInfo['status']} */
    this.status = 'waiting';
    /** @type {[SeatSlot, SeatSlot]} */
    this.seats = [this.slot(CHARACTERS[0]), this.slot(CHARACTERS[1])];
    /** @type {import('../../shared/protocol.js').MatchInfo | null} */
    this.match = null;
    this.matchCount = 0;
    /** @type {{ seat: Seat, forfeitAt: number, resume: 'select' | 'playing' } | null} */
    this.pause = null;
    /** @type {-1 | Seat} */
    this.forfeited = -1;
    this.lastConnectedAt = now;
    /** @type {string | undefined} */
    this.closeReason = undefined;
  }

  /** @param {(typeof CHARACTERS)[number]} char */
  slot(char) {
    return /** @type {SeatSlot} */ ({ taken: false, tokenHash: null, member: null, disconnectedAt: null, char, ready: false, rematch: false });
  }

  // ─── seats ─────────────────────────────────────────────────────────

  /** @returns {Seat | -1} */
  openSeat() {
    if (this.status !== 'waiting') return -1;
    return !this.seats[0].taken ? 0 : !this.seats[1].taken ? 1 : -1;
  }

  /**
   * Seats a member and returns their session token (only its hash is kept).
   * @param {Seat} seat
   * @param {Member} member
   * @param {number} now
   */
  seatHuman(seat, member, now) {
    const token = generateToken();
    const s = this.seats[seat];
    s.taken = true;
    s.tokenHash = hashToken(token);
    s.member = member;
    s.disconnectedAt = null;
    this.lastConnectedAt = now;
    if (this.seats[0].taken && this.seats[1].taken && this.status === 'waiting') this.status = 'select';
    this.sendInfo(now);
    return token;
  }

  /**
   * @param {string} token
   * @returns {Seat | -1}
   */
  seatForToken(token) {
    const hash = hashToken(token);
    for (const seat of /** @type {Seat[]} */ ([0, 1])) {
      const h = this.seats[seat].tokenHash;
      if (h && hashesEqual(h, hash)) return seat;
    }
    return -1;
  }

  /**
   * A returning player (valid token) takes their seat on a new socket.
   * Returns the member who held it before, if they were still connected.
   * @param {Seat} seat
   * @param {Member} member
   * @param {number} now
   */
  reattach(seat, member, now) {
    const s = this.seats[seat];
    const previous = s.member && s.member.id !== member.id && s.disconnectedAt === null ? s.member : null;
    s.member = member;
    s.disconnectedAt = null;
    this.lastConnectedAt = now;
    if (this.pause && this.pause.seat === seat && this.seats[1 - seat].disconnectedAt === null) {
      this.status = this.pause.resume;
      this.pause = null;
    }
    this.sendInfo(now);
    return previous;
  }

  /**
   * The seat's socket went away (it may come back with its token).
   * @param {string} memberId
   * @param {number} now
   */
  disconnected(memberId, now) {
    const seat = this.seatOf(memberId);
    if (seat === -1) return;
    const s = this.seats[seat];
    s.disconnectedAt = now;
    s.member = null;
    if ((this.status === 'playing' || this.status === 'select') && !this.pause) {
      this.pause = { seat, forfeitAt: now + this.config.reconnectGraceMs, resume: this.status };
      this.status = 'paused';
    }
    this.sendInfo(now);
  }

  /**
   * The player left on purpose: a running match is forfeited and the token dies.
   * @param {string} memberId
   * @param {number} now
   */
  left(memberId, now) {
    const seat = this.seatOf(memberId);
    if (seat === -1) return;
    const s = this.seats[seat];
    s.member = null;
    s.tokenHash = null;
    s.disconnectedAt = now;
    if (this.status === 'waiting') this.close('The room was closed.');
    else if (this.status === 'playing' || this.status === 'paused' || this.status === 'select') this.forfeit(seat);
    else this.close('Your opponent left.');
    this.sendInfo(now);
  }

  /** @param {Seat} seat */
  forfeit(seat) {
    this.forfeited = seat;
    this.pause = null;
    this.status = 'over';
  }

  /** @param {string} reason */
  close(reason) {
    this.status = 'closed';
    this.closeReason = reason;
    this.pause = null;
  }

  // ─── the match lifecycle ───────────────────────────────────────────

  /**
   * @param {Seat} seat
   * @param {(typeof CHARACTERS)[number]} char
   * @param {boolean} ready
   * @param {number} now
   */
  select(seat, char, ready, now) {
    if (this.status !== 'select') return false;
    const s = this.seats[seat];
    s.char = char;
    s.ready = ready;
    if (this.seats[0].ready && this.seats[1].ready) this.startMatch();
    this.sendInfo(now);
    return true;
  }

  startMatch() {
    this.matchCount++;
    this.match = {
      id: this.matchCount,
      seed: randomSeed(),
      chars: [this.seats[0].char, this.seats[1].char],
      stage: 'dusk-shrine',
    };
    this.status = 'playing';
    this.forfeited = -1;
    for (const s of this.seats) {
      s.ready = false;
      s.rematch = false;
    }
  }

  /**
   * @param {Seat} seat
   * @param {number} id
   * @param {number} now
   */
  matchOver(seat, id, now) {
    if (this.status !== 'playing' || !this.match || this.match.id !== id) return false;
    this.status = 'over';
    this.sendInfo(now);
    return true;
  }

  /**
   * @param {Seat} seat
   * @param {number} now
   */
  rematch(seat, now) {
    if (this.status !== 'over' || this.forfeited !== -1) return false;
    this.seats[seat].rematch = true;
    if (this.seats[0].rematch && this.seats[1].rematch) this.startMatch();
    this.sendInfo(now);
    return true;
  }

  /**
   * @param {Seat} seat
   * @param {number} now
   */
  changeCharacters(seat, now) {
    if (this.status !== 'over' || this.forfeited !== -1) return false;
    this.status = 'select';
    for (const s of this.seats) {
      s.ready = false;
      s.rematch = false;
    }
    this.sendInfo(now);
    return true;
  }

  // ─── forwarding ────────────────────────────────────────────────────

  /**
   * The other seat's member, if signalling or relaying to it makes sense now.
   * @param {Seat} seat
   * @param {'signal' | 'relay'} kind
   */
  peerOf(seat, kind) {
    const allowed = kind === 'signal' ? ['select', 'playing', 'paused', 'over'] : ['playing', 'paused', 'over'];
    if (!allowed.includes(this.status)) return null;
    return this.seats[1 - seat].member;
  }

  /**
   * Timeouts: forfeits and closing abandoned rooms. Returns true if the room should be removed.
   * @param {number} now
   */
  tick(now) {
    if (this.pause && now >= this.pause.forfeitAt) {
      this.forfeit(this.pause.seat);
      this.sendInfo(now);
    }
    const anyone = this.seats.some((s) => s.member !== null);
    if (anyone) this.lastConnectedAt = now;
    if (this.status !== 'closed') {
      if (this.status === 'waiting' && now - this.createdAt > this.config.waitingRoomMs) this.close('Nobody joined the room.');
      else if (!anyone && now - this.lastConnectedAt > this.config.emptyRoomMs) this.close('The room was empty.');
    }
    return this.status === 'closed';
  }

  // ─── info ──────────────────────────────────────────────────────────

  /** @param {string} memberId @returns {Seat | -1} */
  seatOf(memberId) {
    if (this.seats[0].member?.id === memberId) return 0;
    if (this.seats[1].member?.id === memberId) return 1;
    return -1;
  }

  /**
   * The room as one seat sees it (never another seat's token).
   * @param {Seat} you
   * @param {number} now
   * @returns {import('../../shared/protocol.js').RoomInfo}
   */
  info(you, now) {
    return {
      code: this.code,
      mode: this.mode,
      status: this.status,
      you,
      seats: /** @type {any} */ (this.seats.map((s) => ({ taken: s.taken, connected: s.member !== null, char: s.char, ready: s.ready, rematch: s.rematch }))),
      match: this.match,
      pause: this.pause ? { seat: this.pause.seat, forfeitInMs: Math.max(0, this.pause.forfeitAt - now) } : null,
      forfeited: this.forfeited,
      ...(this.closeReason ? { reason: this.closeReason } : {}),
    };
  }

  /** @param {number} now */
  sendInfo(now) {
    for (const seat of /** @type {Seat[]} */ ([0, 1])) this.seats[seat].member?.send('room', this.info(seat, now));
  }
}
