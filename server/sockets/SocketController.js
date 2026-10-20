/**
 * The Socket.io boundary, as in Netcode Pong. Everything that arrives here
 * is hostile until proven otherwise: the event must be known, the payload
 * must pass its zod schema, the socket must be within its rate limits, and
 * identity comes only from `socket.data.membership`, which only the server
 * sets.
 *
 * The server never runs or reads the game. `signal` and `relay` payloads
 * are size-checked and forwarded to the other seat of the sender's own
 * room, nothing more.
 */
import crypto from 'node:crypto';
import { clientEventSchemas, validateClientEvent, validateRelay, normalizeRoomCode } from '../../shared/protocol.js';
import { KeyedRateLimiter, TokenBucket } from '../security/rateLimit.js';

/** Every error a client can see. A small fixed set, so errors never reveal internals. */
export const ERRORS = {
  invalid: 'Invalid request.',
  rateLimited: 'Slow down a little.',
  notFound: "That room doesn't exist, is full, or has already started.",
  serverFull: 'The server is full right now. Try again later.',
  expired: 'That session has expired.',
  notAllowed: "That's not possible right now.",
  replaced: 'This seat was opened in another tab.',
  generic: 'Something went wrong.',
};

const SESSION_EVENTS = new Set(['createRoom', 'joinRoom', 'quickMatch', 'cancelQueue', 'resume', 'leaveRoom', 'select', 'matchOver', 'rematch', 'changeCharacters']);
const KNOWN_EVENTS = new Set([...Object.keys(clientEventSchemas), 'relay']);

/**
 * @typedef {object} SocketData
 * @property {string} ip
 * @property {boolean} counted
 * @property {number} violations
 * @property {TokenBucket} bucket
 * @property {TokenBucket} sessionBucket
 * @property {TokenBucket} signalBucket
 * @property {import('../rooms/Room.js').Member} member
 * @property {{ code: string, seat: 0 | 1 } | null} membership
 *
 * @typedef {import('socket.io').Socket & { data: SocketData }} GameSocket
 * @typedef {import('../rooms/MatchQueue.js').QueueEntry & { socket: GameSocket }} QuickEntry
 * @typedef {{ ok: boolean, error?: string, code?: string, seat?: 0 | 1, token?: string, queued?: boolean, ticket?: string }} Ack  What every session request answers (ackSchema in shared/protocol.js).
 * @typedef {(result: Ack) => void} Reply
 */

export class SocketController {
  /**
   * @param {import('socket.io').Server} io
   * @param {import('../rooms/RoomManager.js').RoomManager<QuickEntry>} manager
   * @param {import('../config.js').Config} config
   * @param {(level: string, message: string) => void} [log]
   */
  constructor(io, manager, config, log = () => {}) {
    this.io = io;
    this.manager = manager;
    this.config = config;
    this.log = log;
    const now = () => this.now();
    this.joinLimiter = new KeyedRateLimiter(config.limits.joinPerIp, now);
    this.createLimiter = new KeyedRateLimiter(config.limits.createPerIp, now);
    this.connectLimiter = new KeyedRateLimiter(config.limits.connectPerIp, now);
    /** @type {Map<string, number>} */
    this.connectionsPerIp = new Map();
    this.pruner = setInterval(() => {
      for (const limiter of [this.joinLimiter, this.createLimiter, this.connectLimiter]) limiter.prune();
    }, 60_000);
    this.pruner.unref?.();
    /** Relayed bytes and packets, for the load test. */
    this.relayed = { packets: 0, bytes: 0 };

    io.use((socket, next) => this.admit(/** @type {GameSocket} */ (socket), next));
    io.on('connection', (socket) => this.register(/** @type {GameSocket} */ (socket)));
  }

  stop() {
    clearInterval(this.pruner);
  }

  // ─── admission ─────────────────────────────────────────────────────

  /** @param {GameSocket} socket */
  clientIp(socket) {
    const direct = socket.handshake.address;
    const header = this.config.clientIpHeader;
    if (header) {
      const value = String(socket.handshake.headers[header] || '').trim();
      if (/^[0-9a-fA-F:.]{2,45}$/.test(value)) return value;
    }
    const hops = this.config.trustProxyHops;
    if (!hops) return direct;
    const forwarded = String(socket.handshake.headers['x-forwarded-for'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // Each trusted proxy appends the address it saw; entries before those are client-controlled.
    return forwarded[Math.max(0, forwarded.length - hops)] || direct;
  }

  /**
   * @param {GameSocket} socket
   * @param {(err?: Error) => void} next
   */
  admit(socket, next) {
    const ip = this.clientIp(socket);
    socket.data.ip = ip;
    const open = this.connectionsPerIp.get(ip) || 0;
    if (open >= this.config.limits.maxConcurrentPerIp || !this.connectLimiter.take(ip)) return next(new Error('Too many connections'));
    this.connectionsPerIp.set(ip, open + 1);
    socket.data.counted = true;
    next();
  }

  /** @param {GameSocket} socket */
  register(socket) {
    const now = () => this.now();
    socket.data.violations = 0;
    socket.data.bucket = new TokenBucket(this.config.limits.socketEvents, now);
    socket.data.sessionBucket = new TokenBucket(this.config.limits.sessionEvents, now);
    socket.data.signalBucket = new TokenBucket(this.config.limits.signalEvents, now);
    socket.data.membership = null;
    socket.data.member = { id: socket.id, send: (event, payload) => socket.emit(event, payload) };

    socket.onAny((event) => {
      if (!KNOWN_EVENTS.has(event)) this.violation(socket, ERRORS.invalid);
    });
    for (const event of Object.keys(clientEventSchemas)) {
      socket.on(event, (payload, ack) => this.dispatch(socket, event, payload, ack));
    }
    socket.on('relay', (payload) => this.safe('relay', () => this.relay(socket, payload)));
    socket.on('disconnect', () =>
      this.safe('disconnect', () => {
        if (socket.data.counted) {
          const ip = socket.data.ip;
          const left = (this.connectionsPerIp.get(ip) || 1) - 1;
          if (left > 0) this.connectionsPerIp.set(ip, left);
          else this.connectionsPerIp.delete(ip);
        }
        this.manager.queue.lost(socket.id, this.now());
        const m = socket.data.membership;
        if (m) this.manager.get(m.code)?.disconnected(socket.id, this.now());
        socket.data.membership = null;
      }),
    );
  }

  // ─── dispatch ──────────────────────────────────────────────────────

  /**
   * @param {GameSocket} socket
   * @param {string} event
   * @param {unknown} payload
   * @param {unknown} ack
   */
  dispatch(socket, event, payload, ack) {
    // Allow emit(event, ack) with no payload.
    if (typeof payload === 'function' && ack === undefined) {
      ack = payload;
      payload = undefined;
    }
    /** @type {Reply} */
    const reply = (result) => {
      if (typeof ack === 'function') ack(result);
      else if (!result.ok) socket.emit('serverError', { message: result.error });
    };
    this.safe(
      event,
      () => {
        if (!socket.data.bucket.take()) return reply(this.violation(socket, ERRORS.rateLimited, false));
        const valid = validateClientEvent(event, payload);
        if (!valid.ok) return reply(this.violation(socket, ERRORS.invalid, false));
        if (event === 'signal') {
          if (!socket.data.signalBucket.take()) return reply(this.violation(socket, ERRORS.rateLimited, false));
          return this.signal(socket, valid.data);
        }
        if (SESSION_EVENTS.has(event)) {
          if (!socket.data.sessionBucket.take()) return reply(this.violation(socket, ERRORS.rateLimited, false));
          return reply(this.session(socket, event, valid.data));
        }
        reply({ ok: false, error: ERRORS.invalid });
      },
      reply,
    );
  }

  /**
   * Counts abuse; persistent offenders are disconnected.
   * @param {GameSocket} socket
   * @param {string} error
   * @param {boolean} [emit]
   * @returns {{ ok: false, error: string }}
   */
  violation(socket, error, emit = true) {
    socket.data.violations++;
    if (socket.data.violations > this.config.limits.maxViolations) {
      this.log('warn', 'disconnecting socket after repeated invalid or excessive events');
      socket.disconnect(true);
    } else if (emit) {
      socket.emit('serverError', { message: error });
    }
    return { ok: false, error };
  }

  /**
   * @param {GameSocket} socket
   * @param {string} event
   * @param {any} data
   * @returns {Ack}
   */
  session(socket, event, data) {
    switch (event) {
      case 'createRoom': return this.createRoom(socket);
      case 'joinRoom': return this.joinRoom(socket, data.code);
      case 'quickMatch': return this.quickMatch(socket, data.ticket);
      case 'cancelQueue':
        this.manager.queue.remove(socket.id);
        return { ok: true };
      case 'resume': return this.resume(socket, data.code, data.token);
      case 'leaveRoom':
        this.release(socket);
        return { ok: true };
      case 'select': return this.inRoom(socket, (room, seat) => room.select(seat, data.char, data.ready, this.now()));
      case 'matchOver': return this.inRoom(socket, (room, seat) => room.matchOver(seat, data.id, this.now()));
      case 'rematch': return this.inRoom(socket, (room, seat) => room.rematch(seat, this.now()));
      case 'changeCharacters': return this.inRoom(socket, (room, seat) => room.changeCharacters(seat, this.now()));
      default: return { ok: false, error: ERRORS.invalid };
    }
  }

  // ─── session events ────────────────────────────────────────────────

  /** @param {GameSocket} socket */
  createRoom(socket) {
    if (!this.createLimiter.take(socket.data.ip)) return { ok: false, error: ERRORS.rateLimited };
    this.release(socket);
    const room = this.manager.create('private');
    if (!room) return { ok: false, error: ERRORS.serverFull };
    const token = this.seat(socket, room, 0);
    this.log('info', 'private room created');
    return { ok: true, code: room.code, seat: /** @type {0} */ (0), token };
  }

  /**
   * @param {GameSocket} socket
   * @param {string} code
   */
  joinRoom(socket, code) {
    if (!this.joinLimiter.take(socket.data.ip)) return { ok: false, error: ERRORS.rateLimited };
    const room = this.findRoom(code);
    const seat = room ? room.openSeat() : -1;
    if (!room || seat === -1) return { ok: false, error: ERRORS.notFound };
    this.release(socket);
    const token = this.seat(socket, room, seat);
    return { ok: true, code: room.code, seat, token };
  }

  /**
   * @param {GameSocket} socket
   * @param {string | undefined} ticket
   */
  quickMatch(socket, ticket) {
    const entry = { member: socket.data.member, socket, isAlive: () => socket.connected };
    if (ticket) {
      // Taking back a place in line after a dropped connection.
      if (!this.joinLimiter.take(socket.data.ip)) return { ok: false, error: ERRORS.rateLimited };
      if (!this.manager.queue.reclaim(ticket, entry)) return { ok: false, error: ERRORS.expired };
      this.pairQueue();
      return { ok: true, queued: true, ticket };
    }
    this.release(socket);
    const fresh = this.manager.queue.enqueue(entry);
    this.pairQueue();
    return { ok: true, queued: true, ticket: fresh };
  }

  /** Pairs everyone who can be paired. Each pair gets a fresh room with randomly assigned sides. */
  pairQueue() {
    for (let pair = this.manager.queue.takePair(); pair; pair = this.manager.queue.takePair()) {
      const room = this.manager.create('quick');
      if (!room) {
        this.manager.queue.requeueFront(pair);
        for (const entry of pair) entry.socket.emit('serverError', { message: ERRORS.serverFull });
        return;
      }
      const first = /** @type {0 | 1} */ (crypto.randomInt(2));
      pair.forEach((entry, i) => {
        const seat = /** @type {0 | 1} */ (i === 0 ? first : 1 - first);
        const token = this.seat(entry.socket, room, seat);
        entry.socket.emit('seated', { code: room.code, seat, token });
      });
    }
  }

  /**
   * @param {GameSocket} socket
   * @param {string} code
   * @param {string} token
   */
  resume(socket, code, token) {
    if (!this.joinLimiter.take(socket.data.ip)) return { ok: false, error: ERRORS.rateLimited };
    const room = this.findRoom(code);
    const seat = room ? room.seatForToken(token) : -1;
    if (!room || seat === -1) return { ok: false, error: ERRORS.expired };
    const current = socket.data.membership;
    if (!(current?.code === room.code && current.seat === seat)) this.release(socket);
    const previous = room.reattach(seat, socket.data.member, this.now());
    if (previous) {
      const old = /** @type {GameSocket | undefined} */ (this.io.sockets.sockets.get(previous.id));
      if (old) {
        old.data.membership = null;
        old.emit('serverError', { message: ERRORS.replaced });
      }
    }
    socket.data.membership = { code: room.code, seat };
    return { ok: true, code: room.code, seat };
  }

  /**
   * @param {GameSocket} socket
   * @param {(room: import('../rooms/Room.js').Room, seat: 0 | 1) => boolean} fn
   */
  inRoom(socket, fn) {
    const { room, seat } = this.current(socket);
    if (!room || seat === -1 || !fn(room, seat)) return { ok: false, error: ERRORS.notAllowed };
    return { ok: true };
  }

  // ─── forwarding (no acks: fire and forget) ─────────────────────────

  /**
   * @param {GameSocket} socket
   * @param {{ kind: string, data: string }} data
   */
  signal(socket, data) {
    const { room, seat } = this.current(socket);
    const peer = room && seat !== -1 ? room.peerOf(seat, 'signal') : null;
    if (!peer) return void this.violation(socket, ERRORS.notAllowed, false);
    peer.send('signal', { kind: data.kind, data: data.data });
  }

  /**
   * @param {GameSocket} socket
   * @param {unknown} payload
   */
  relay(socket, payload) {
    if (!socket.data.bucket.take()) return void this.violation(socket, ERRORS.rateLimited, false);
    const bytes = validateRelay(payload);
    if (!bytes) return void this.violation(socket, ERRORS.invalid, false);
    const { room, seat } = this.current(socket);
    const peer = room && seat !== -1 ? room.peerOf(seat, 'relay') : null;
    if (!peer) return; // the peer is away: packets are allowed to be lost
    this.relayed.packets++;
    this.relayed.bytes += bytes.length;
    peer.send('relay', bytes);
  }

  // ─── helpers ───────────────────────────────────────────────────────

  /**
   * @param {GameSocket} socket
   * @param {import('../rooms/Room.js').Room} room
   * @param {0 | 1} seat
   */
  seat(socket, room, seat) {
    const token = room.seatHuman(seat, socket.data.member, this.now());
    socket.data.membership = { code: room.code, seat };
    return token;
  }

  /**
   * A socket holds at most one seat; taking a new one releases the old.
   * @param {GameSocket} socket
   */
  release(socket) {
    this.manager.queue.remove(socket.id);
    const m = socket.data.membership;
    socket.data.membership = null;
    if (m) this.manager.get(m.code)?.left(socket.id, this.now());
  }

  /**
   * @param {GameSocket} socket
   * @returns {{ room: import('../rooms/Room.js').Room | null, seat: 0 | 1 | -1 }}
   */
  current(socket) {
    const m = socket.data.membership;
    const room = m ? this.manager.get(m.code) : undefined;
    if (!m || !room || room.status === 'closed') return { room: null, seat: -1 };
    return { room, seat: m.seat };
  }

  /** @param {string} raw */
  findRoom(raw) {
    const code = normalizeRoomCode(raw);
    const room = code ? this.manager.get(code) : undefined;
    return room && room.status !== 'closed' ? room : null;
  }

  now() {
    return this.manager.clock.now();
  }

  /**
   * Errors never crash the process and never reach the client verbatim.
   * @param {string} event
   * @param {() => void} fn
   * @param {Reply} [reply]
   */
  safe(event, fn, reply) {
    try {
      fn();
    } catch (err) {
      this.log('error', `handler "${event}" failed: ${/** @type {Error} */ (err)?.stack || err}`);
      reply?.({ ok: false, error: ERRORS.generic });
    }
  }
}
