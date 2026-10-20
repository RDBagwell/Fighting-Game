/**
 * All server tunables in one place, from environment variables. Tests
 * override fields as needed. Same shape as Netcode Pong's config.
 */

/** The Vite dev server (5173), the preview server (4173), both spellings of localhost. */
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];

/**
 * @param {string | undefined} value
 * @param {number} fallback
 */
function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

/** @param {string | undefined} value */
function list(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * @typedef {import('./security/rateLimit.js').BucketOptions} BucketOptions
 * @typedef {ReturnType<typeof loadConfig>} Config
 */

/** @param {Record<string, string | undefined>} [env] */
export function loadConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const allowedOrigins = list(env.ALLOWED_ORIGINS);
  if (allowedOrigins.includes('*')) throw new Error("ALLOWED_ORIGINS must list explicit origins; '*' is not allowed");
  if (isProduction && allowedOrigins.length === 0) throw new Error('ALLOWED_ORIGINS is required in production');
  if (isProduction && allowedOrigins.some((o) => !o.startsWith('https://'))) throw new Error('In production every ALLOWED_ORIGINS entry must be https://');

  return {
    port: int(env.PORT, 3000),
    isProduction,
    allowedOrigins: allowedOrigins.length ? allowedOrigins : DEV_ORIGINS,
    /** Number of reverse proxies in front of the app, for reading the client IP from X-Forwarded-For. */
    trustProxyHops: int(env.TRUST_PROXY_HOPS, 0),
    /** A header set (and overwritten) by the edge in front of the app, e.g. "true-client-ip". */
    clientIpHeader: (env.CLIENT_IP_HEADER || '').toLowerCase().trim() || null,

    maxRooms: int(env.MAX_ROOMS, 300),
    /** Socket.io frame limit: the largest legal message is a WebRTC offer (6,000 characters). */
    maxHttpBufferSize: 8 * 1024,

    /** How long a disconnected player's seat is held before the match is forfeited. */
    reconnectGraceMs: int(env.RECONNECT_GRACE_MS, 30_000),
    /** How long a quick-match ticket survives its socket dropping. */
    queueGraceMs: 15_000,
    /** A private room nobody joined is closed after this. */
    waitingRoomMs: 30 * 60_000,
    /** A room with nobody connected is closed after this. */
    emptyRoomMs: 2 * 60_000,
    sweepIntervalMs: 1_000,

    limits: {
      /** Every event per socket: relayed inputs (60/s) plus checksums, pings and signalling fit easily. */
      socketEvents: { capacity: 300, windowMs: 2_000 },
      sessionEvents: { capacity: 20, windowMs: 10_000 },
      signalEvents: { capacity: 60, windowMs: 10_000 },
      joinPerIp: { capacity: 20, windowMs: 60_000 },
      createPerIp: { capacity: 10, windowMs: 10 * 60_000 },
      connectPerIp: { capacity: 30, windowMs: 60_000 },
      maxConcurrentPerIp: int(env.MAX_CONNECTIONS_PER_IP, 20),
      /** Invalid or excessive events tolerated before a socket is disconnected. */
      maxViolations: 20,
    },
  };
}
