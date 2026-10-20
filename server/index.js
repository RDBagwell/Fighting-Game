/**
 * Starts the server: `npm start` (production) or `npm run dev:server`.
 */
import { createServer, defaultLog } from './app.js';
import { loadConfig } from './config.js';

// Node 22 reads a .env file without a dependency.
try {
  process.loadEnvFile();
} catch {
  // No .env file: use the real environment.
}

const config = loadConfig();
const server = createServer({ config });
const port = await server.listen(config.port);
defaultLog('info', `Dusk Duel matchmaking server listening on port ${port}`);
defaultLog('info', `Allowed origins: ${config.allowedOrigins.join(', ')}`);

process.on('uncaughtException', (err) => defaultLog('error', `uncaught: ${err?.stack || err}`));
process.on('unhandledRejection', (err) => defaultLog('error', `unhandled rejection: ${/** @type {Error} */ (err)?.stack || err}`));
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
