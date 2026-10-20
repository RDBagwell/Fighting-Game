/**
 * The browser's connection to the matchmaking server (Socket.io,
 * WebSocket only). It keeps the session going across dropped connections:
 * when the socket comes back it resumes the seat with the session token
 * (kept in sessionStorage), or takes back its place in the quick-match
 * queue with its ticket.
 *
 * Everything the server sends is validated with the same zod schemas the
 * server uses (shared/protocol.js) before the game looks at it.
 */
import { io } from 'socket.io-client';
import { ackSchema, roomInfoSchema, seatedSchema, signalSchema, serverErrorSchema } from '../../../shared/protocol.js';

const STORE = 'dusk-duel-online-v1';

/**
 * The server address for this build: VITE_SERVER_URL at build time, or the
 * local dev server.
 */
export function serverUrl() {
  const fromBuild = import.meta.env.VITE_SERVER_URL;
  if (fromBuild) return String(fromBuild);
  if (import.meta.env.DEV) return 'http://localhost:3000';
  return '';
}

/**
 * @typedef {import('../../../shared/protocol.js').RoomInfo} RoomInfo
 */

export class OnlineClient extends EventTarget {
  /**
   * @param {string} url
   */
  constructor(url) {
    super();
    this.url = url;
    /** @type {RoomInfo | null} */
    this.room = null;
    /** @type {{ code: string, seat: 0 | 1, token: string } | null} */
    this.session = this.load()?.session ?? null;
    /** @type {string | null} */
    this.ticket = null;
    this.queued = false;
    /** @type {'connecting' | 'online' | 'offline'} */
    this.status = 'connecting';
    /** @type {((data: Uint8Array) => void) | null} */
    this.onRelay = null;
    /** @type {((signal: { kind: string, data: string }) => void) | null} */
    this.onSignal = null;
    this.socket = io(url, { transports: ['websocket'], reconnectionDelay: 500, reconnectionDelayMax: 3000, timeout: 8000 });
    this.socket.on('connect', () => this.connected());
    this.socket.on('disconnect', () => this.setStatus('offline'));
    this.socket.on('connect_error', () => this.setStatus('offline'));
    this.socket.on('room', (payload) => {
      const r = roomInfoSchema.safeParse(payload);
      if (!r.success) return;
      const room = /** @type {RoomInfo} */ (r.data);
      this.room = room;
      if (room.status === 'closed') this.forget();
      this.emit('room', room);
    });
    this.socket.on('seated', (payload) => {
      const r = seatedSchema.safeParse(payload);
      if (!r.success) return;
      this.queued = false;
      this.ticket = null;
      this.remember(/** @type {{ code: string, seat: 0 | 1, token: string }} */ (r.data));
      this.emit('seated', r.data);
    });
    this.socket.on('signal', (payload) => {
      const r = signalSchema.safeParse(payload);
      if (r.success) this.onSignal?.(r.data);
    });
    this.socket.on('relay', (payload) => {
      if (payload instanceof ArrayBuffer) this.onRelay?.(new Uint8Array(payload));
      else if (payload instanceof Uint8Array) this.onRelay?.(payload);
    });
    this.socket.on('serverError', (payload) => {
      const r = serverErrorSchema.safeParse(payload);
      if (r.success) this.emit('error', r.data.message);
    });
  }

  /**
   * @param {string} type
   * @param {unknown} detail
   */
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** @param {'connecting' | 'online' | 'offline'} s */
  setStatus(s) {
    this.status = s;
    this.emit('status', s);
  }

  async connected() {
    this.setStatus('online');
    // Back after a dropped connection: take the seat (or the queue place) back.
    if (this.session) {
      const r = await this.request('resume', { code: this.session.code, token: this.session.token });
      if (!r.ok) this.forget();
    } else if (this.queued && this.ticket) {
      const r = await this.request('quickMatch', { ticket: this.ticket });
      if (!r.ok) this.queued = false;
    }
    this.emit('ready', null);
  }

  /**
   * A session request; resolves with the validated ack (or a generic failure).
   * @param {string} event
   * @param {object} [payload]
   * @returns {Promise<import('../../../shared/protocol.js').Ack>}
   */
  async request(event, payload = {}) {
    try {
      const raw = await this.socket.timeout(6000).emitWithAck(event, payload);
      const r = ackSchema.safeParse(raw);
      return r.success ? /** @type {import('../../../shared/protocol.js').Ack} */ (r.data) : { ok: false, error: 'Unexpected reply from the server.' };
    } catch {
      return { ok: false, error: "Couldn't reach the server." };
    }
  }

  async createRoom() {
    const r = await this.request('createRoom');
    if (r.ok && r.code && r.token && r.seat !== undefined) this.remember({ code: r.code, seat: r.seat, token: r.token });
    return r;
  }

  /** @param {string} code */
  async joinRoom(code) {
    const r = await this.request('joinRoom', { code });
    if (r.ok && r.code && r.token && r.seat !== undefined) this.remember({ code: r.code, seat: r.seat, token: r.token });
    return r;
  }

  async quickMatch() {
    this.forget();
    const r = await this.request('quickMatch');
    if (r.ok && r.ticket) {
      this.ticket = r.ticket;
      this.queued = true;
    }
    return r;
  }

  async cancelQueue() {
    this.queued = false;
    this.ticket = null;
    return this.request('cancelQueue');
  }

  async leave() {
    this.forget();
    return this.request('leaveRoom');
  }

  /**
   * @param {string} char
   * @param {boolean} ready
   */
  select(char, ready) {
    return this.request('select', { char, ready });
  }

  /** @param {number} id */
  matchOver(id) {
    return this.request('matchOver', { id });
  }

  rematch() {
    return this.request('rematch');
  }

  changeCharacters() {
    return this.request('changeCharacters');
  }

  /**
   * @param {'offer' | 'answer' | 'ice'} kind
   * @param {string} data
   */
  signal(kind, data) {
    this.socket.emit('signal', { kind, data });
  }

  /** @param {Uint8Array} data */
  relay(data) {
    this.socket.emit('relay', data);
  }

  /** @param {{ code: string, seat: 0 | 1, token: string }} session */
  remember(session) {
    this.session = session;
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ session }));
    } catch {
      // Storage blocked: reconnecting after a reload won't work, the rest does.
    }
  }

  forget() {
    this.session = null;
    try {
      sessionStorage.removeItem(STORE);
    } catch {
      // ignore
    }
  }

  /** @returns {{ session: { code: string, seat: 0 | 1, token: string } } | null} */
  load() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(STORE) ?? 'null');
      const s = raw?.session;
      if (s && typeof s.code === 'string' && (s.seat === 0 || s.seat === 1) && typeof s.token === 'string') return { session: s };
    } catch {
      // ignore
    }
    return null;
  }

  close() {
    this.socket.disconnect();
  }
}
