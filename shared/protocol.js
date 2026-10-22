/**
 * The client–server protocol: every message either side can send, and its
 * zod schema. Same structure as Netcode Pong's `shared/protocol.ts`.
 *
 * The server never runs the game. It pairs players, holds their seats,
 * relays WebRTC signalling, and relays input packets when a direct
 * connection can't be made. So there is no message here that carries
 * game state: no position, no health, no result the server acts on.
 *
 * - **Session** events (rooms, character select, rematch) are reliable and
 *   acknowledged.
 * - **Signalling** (`signal`) carries WebRTC offers, answers and ICE
 *   candidates to the other seat, as opaque, size-capped strings.
 * - **Relay** (`relay`) carries the rollback input packets
 *   (src/engine/rollback/packets.js) to the other seat when the direct path
 *   failed: small binary frames, forwarded unread.
 *
 * Both directions are validated: the server treats every client message as
 * hostile, and the client checks what it receives too.
 */
import { z } from 'zod';

/** No 0/O, 1/I/L: codes are read aloud and typed on phones. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** The characters the server lets players pick (must match the game's roster). */
export const CHARACTERS = /** @type {const} */ (['mack', 'kenji', 'deka', 'elumlur', 'mav', 'reroe']);
export const STAGES = /** @type {const} */ (['dusk-shrine']);

/**
 * The game version a client reports when it connects (socket.io `auth`):
 * a hash of the rules and character data (src/game/replay/replays.js
 * gameVersion). Two different versions would desync on the first frame,
 * so the server only puts players of the same version together.
 */
export const GAME_VERSION_PATTERN = /^[0-9a-f]{8}$/;

/**
 * @param {unknown} auth  The handshake's `auth` object.
 * @returns {string}  The version, or 'unknown' (old clients, tests).
 */
export function readGameVersion(auth) {
  const v = auth && typeof auth === 'object' ? /** @type {Record<string, unknown>} */ (auth).version : undefined;
  return typeof v === 'string' && GAME_VERSION_PATTERN.test(v) ? v : 'unknown';
}

/** Largest relayed input packet (packets.js: 16 bytes + up to 64 inputs). */
export const MAX_RELAY_BYTES = 80;
/** Largest signalling payload (an SDP offer is typically 1–4 KB). */
export const MAX_SIGNAL_CHARS = 6000;

/**
 * Accepts "abc-def", " ABCDEF " etc. Returns null for anything that can't be a code.
 * @param {unknown} raw
 */
export function normalizeRoomCode(raw) {
  if (typeof raw !== 'string' || raw.length > 16) return null;
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

const roomCode = z.string().max(16);
const token = z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);
const empty = z.strictObject({});

/** Every event a client may send, and exactly the fields it may carry. */
export const clientEventSchemas = {
  // Session (reliable, acknowledged)
  createRoom: empty,
  joinRoom: z.strictObject({ code: roomCode }),
  quickMatch: z.strictObject({ ticket: token.optional() }),
  cancelQueue: empty,
  resume: z.strictObject({ code: roomCode, token }),
  leaveRoom: empty,
  select: z.strictObject({ char: z.enum(CHARACTERS), ready: z.boolean() }),
  /** The match ended on this client (it can't be verified; it only unlocks the rematch buttons). */
  matchOver: z.strictObject({ id: z.number().int().min(0).max(2 ** 31) }),
  rematch: empty,
  changeCharacters: empty,
  // Signalling and relay (forwarded to the other seat, never interpreted)
  signal: z.strictObject({ kind: z.enum(['offer', 'answer', 'ice']), data: z.string().min(1).max(MAX_SIGNAL_CHARS) }),
};

/** Events that carry no ack and are rate-limited as game traffic. */
export const TRAFFIC_EVENTS = new Set(['signal', 'relay']);

/**
 * Returns `{ ok: true, data }` or `{ ok: false }`. Never exposes zod internals.
 * @param {string} event
 * @param {unknown} payload
 * @returns {{ ok: true, data: any } | { ok: false }}
 */
export function validateClientEvent(event, payload) {
  if (!Object.hasOwn(clientEventSchemas, event)) return { ok: false };
  const schema = clientEventSchemas[/** @type {keyof typeof clientEventSchemas} */ (event)];
  const result = schema.safeParse(payload === undefined ? {} : payload);
  return result.success ? { ok: true, data: result.data } : { ok: false };
}

/**
 * A relay payload: a binary frame of the right size, or null.
 * @param {unknown} payload
 * @returns {Uint8Array | null}
 */
export function validateRelay(payload) {
  /** @type {Uint8Array | null} */
  let bytes = null;
  if (payload instanceof Uint8Array) bytes = payload;
  else if (payload instanceof ArrayBuffer) bytes = new Uint8Array(payload);
  if (!bytes || bytes.length < 9 || bytes.length > MAX_RELAY_BYTES) return null;
  return bytes;
}

// ── Server → client ──────────────────────────────────────────────────

export const ackSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    code: z.string().optional(),
    seat: z.union([z.literal(0), z.literal(1)]).optional(),
    token: z.string().optional(),
    queued: z.boolean().optional(),
    ticket: z.string().optional(),
  }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
]);

export const ROOM_STATUSES = /** @type {const} */ (['waiting', 'select', 'playing', 'paused', 'over', 'closed']);

const seatInfoSchema = z.strictObject({
  taken: z.boolean(),
  connected: z.boolean(),
  char: z.enum(CHARACTERS),
  ready: z.boolean(),
  rematch: z.boolean(),
});

/** A match the two clients run between them: the server only picks the seed and records who plays whom. */
export const matchInfoSchema = z.strictObject({
  id: z.number().int().min(0),
  seed: z.number().int().min(1).max(2 ** 32),
  chars: z.tuple([z.enum(CHARACTERS), z.enum(CHARACTERS)]),
  stage: z.enum(STAGES),
});

export const roomInfoSchema = z.strictObject({
  code: z.string(),
  mode: z.enum(['private', 'quick']),
  status: z.enum(ROOM_STATUSES),
  you: z.union([z.literal(0), z.literal(1)]),
  seats: z.tuple([seatInfoSchema, seatInfoSchema]),
  match: matchInfoSchema.nullable(),
  /** While paused: who is missing and when the match is forfeited. */
  pause: z.strictObject({ seat: z.union([z.literal(0), z.literal(1)]), forfeitInMs: z.number() }).nullable(),
  forfeited: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  reason: z.string().optional(),
});

export const seatedSchema = z.strictObject({ code: z.string(), seat: z.union([z.literal(0), z.literal(1)]), token: z.string() });
export const signalSchema = clientEventSchemas.signal;
export const serverErrorSchema = z.strictObject({ message: z.string() });

// The types the schemas produce, written out (zod's inferred tuples don't
// survive JSDoc checking without strict mode).
/**
 * @typedef {{ id: number, seed: number, chars: [string, string], stage: string }} MatchInfo
 * @typedef {{ taken: boolean, connected: boolean, char: string, ready: boolean, rematch: boolean }} SeatInfo
 * @typedef {{ code: string, mode: 'private' | 'quick', status: (typeof ROOM_STATUSES)[number], you: 0 | 1,
 *   seats: [SeatInfo, SeatInfo], match: MatchInfo | null, pause: { seat: 0 | 1, forfeitInMs: number } | null,
 *   forfeited: -1 | 0 | 1, reason?: string }} RoomInfo
 * @typedef {{ ok: boolean, error?: string, code?: string, seat?: 0 | 1, token?: string, queued?: boolean, ticket?: string }} Ack
 */
