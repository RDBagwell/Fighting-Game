/**
 * Real server instances and real socket.io-client connections for the
 * integration tests (Netcode Pong's tests/helpers.ts, in JS).
 */
import { io as ioClient } from 'socket.io-client';
import { createServer } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { roomInfoSchema } from '../../shared/protocol.js';

export const ORIGIN = 'http://localhost:5173';

/**
 * @param {any} [overrides]
 * @returns {import('../../server/config.js').Config}
 */
export function testConfig(overrides = {}) {
  const base = loadConfig({});
  return {
    ...base,
    ...overrides,
    limits: {
      ...base.limits,
      // Generous by default so tests aren't throttled; limit tests override.
      joinPerIp: { capacity: 1000, windowMs: 1000 },
      createPerIp: { capacity: 1000, windowMs: 1000 },
      connectPerIp: { capacity: 1000, windowMs: 1000 },
      sessionEvents: { capacity: 1000, windowMs: 1000 },
      maxConcurrentPerIp: 1000,
      ...overrides.limits,
    },
  };
}

/** @param {number} ms */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {() => boolean} predicate
 * @param {number} [timeout]
 * @param {string} [what]
 */
export async function waitFor(predicate, timeout = 3000, what = 'condition') {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${what}`);
    await sleep(5);
  }
}

/** Wraps a socket.io-client socket and records everything it receives. */
export class TestClient {
  /** @param {import('socket.io-client').Socket} socket */
  constructor(socket) {
    this.socket = socket;
    /** @type {import('../../shared/protocol.js').RoomInfo[]} */
    this.rooms = [];
    /** @type {string[]} */
    this.errors = [];
    /** @type {Array<{ code: string, seat: 0 | 1, token: string }>} */
    this.seated = [];
    /** @type {Array<{ kind: string, data: string }>} */
    this.signals = [];
    /** @type {Uint8Array[]} */
    this.relays = [];
    /** @type {Array<{ event: string, payload: unknown }>} */
    this.raw = [];
    this.connectError = /** @type {Error | null} */ (null);
    socket.onAny((event, payload) => {
      this.raw.push({ event, payload });
      if (event === 'room') this.rooms.push(roomInfoSchema.parse(payload));
      if (event === 'serverError') this.errors.push(payload.message);
      if (event === 'seated') this.seated.push(payload);
      if (event === 'signal') this.signals.push(payload);
      if (event === 'relay') this.relays.push(new Uint8Array(payload));
    });
    this.connected = new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(undefined));
      socket.on('connect_error', (err) => {
        this.connectError = err;
        reject(err);
      });
    });
    this.connected.catch(() => {});
  }

  get room() {
    return this.rooms[this.rooms.length - 1] ?? null;
  }

  /**
   * Emits and resolves with the ack.
   * @param {string} event
   * @param {unknown} [payload]
   * @returns {Promise<any>}
   */
  request(event, payload = {}) {
    return this.socket.timeout(2000).emitWithAck(event, payload);
  }

  /**
   * @param {(room: import('../../shared/protocol.js').RoomInfo) => boolean} predicate
   */
  async waitForRoom(predicate, timeout = 3000) {
    await waitFor(() => this.rooms.some(predicate), timeout, 'room info');
    return /** @type {import('../../shared/protocol.js').RoomInfo} */ ([...this.rooms].reverse().find(predicate));
  }
}

/**
 * @param {{ config?: any }} [options]
 */
export async function startServer({ config } = {}) {
  const server = createServer({ log: () => {}, config: testConfig(config) });
  const port = await server.listen(0);
  const url = `http://127.0.0.1:${port}`;
  /** @type {TestClient[]} */
  const clients = [];

  /**
   * @param {{ origin?: string | null, transports?: string[] }} [o]
   */
  function connect({ origin = ORIGIN, transports = ['websocket'] } = {}) {
    const socket = ioClient(url, { transports, forceNew: true, reconnection: false, extraHeaders: origin ? { origin } : {} });
    const client = new TestClient(socket);
    clients.push(client);
    return client;
  }

  async function close() {
    for (const c of clients) c.socket.disconnect();
    await server.close();
  }

  return { server, url, connect, close };
}

/** @typedef {Awaited<ReturnType<typeof startServer>>} TestEnv */

/**
 * Two connected clients in a private room, both seated.
 * @param {TestEnv} env
 */
export async function privateRoom(env) {
  const a = env.connect();
  const b = env.connect();
  await Promise.all([a.connected, b.connected]);
  const created = await a.request('createRoom');
  const joined = await b.request('joinRoom', { code: created.code });
  await a.waitForRoom((r) => r.status === 'select');
  return { a, b, code: created.code, tokens: [created.token, joined.token] };
}

/**
 * Two clients in a room with a match started.
 * @param {TestEnv} env
 */
export async function startedMatch(env) {
  const room = await privateRoom(env);
  await room.a.request('select', { char: 'mack', ready: true });
  await room.b.request('select', { char: 'kenji', ready: true });
  await room.a.waitForRoom((r) => r.status === 'playing');
  await room.b.waitForRoom((r) => r.status === 'playing');
  return room;
}
