/**
 * The matchmaking and signalling server: Express (health check, nothing
 * else) and Socket.io (rooms, signalling, relay). Built without listening,
 * so tests can start isolated instances. Same structure as Netcode Pong's
 * server/app.ts; the client is served by GitHub Pages, not from here.
 */
import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { loadConfig } from './config.js';
import { RoomManager } from './rooms/RoomManager.js';
import { SocketController } from './sockets/SocketController.js';

/**
 * @param {string} level
 * @param {string} message
 */
export function defaultLog(level, message) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line);
  else console.log(line);
}

/**
 * @param {object} [o]
 * @param {import('./config.js').Config} [o.config]
 * @param {(level: string, message: string) => void} [o.log]
 * @param {import('./rooms/RoomManager.js').Clock} [o.clock]
 */
export function createServer({ config = loadConfig(), log = defaultLog, clock } = {}) {
  const allowed = new Set(config.allowedOrigins);
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxyHops) app.set('trust proxy', config.trustProxyHops);
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: config.isProduction ? { maxAge: 31536000 } : false,
      xFrameOptions: { action: 'deny' },
    }),
  );
  // CORS: only allow-listed origins, never "*".
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
    }
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });
  app.get('/healthz', (_req, res) => void res.json({ ok: true }));
  app.use((_req, res) => void res.status(404).type('text/plain').send('Not found'));
  app.use((/** @type {Error} */ err, /** @type {any} */ _req, /** @type {express.Response} */ res, /** @type {any} */ _next) => {
    log('error', `http error: ${err?.message}`);
    res.status(500).type('text/plain').send('Server error');
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    serveClient: false,
    transports: ['websocket'],
    maxHttpBufferSize: config.maxHttpBufferSize,
    cors: { origin: [...allowed], methods: ['GET', 'POST'] },
    // WebSocket upgrades are not covered by CORS, so check Origin here too.
    allowRequest: (req, callback) => callback(null, allowed.has(String(req.headers.origin))),
  });

  /** @type {RoomManager<import('./sockets/SocketController.js').QuickEntry>} */
  const manager = new RoomManager(config, { clock, log });
  const sockets = new SocketController(io, manager, config, log);
  manager.start();

  return {
    app,
    httpServer,
    io,
    manager,
    sockets,
    config,
    /** @param {number} [port] @returns {Promise<number>} */
    listen(port = config.port) {
      return new Promise((resolve) =>
        httpServer.listen(port, () => {
          const address = httpServer.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        }),
      );
    },
    async close() {
      manager.stop();
      sockets.stop();
      await new Promise((resolve) => io.close(() => resolve(undefined)));
    },
  };
}

/** @typedef {ReturnType<typeof createServer>} GameServer */
