// The server process for tools/load-test.mjs: the production server and
// configuration, except that the per-IP connection caps are raised (every
// load-test client comes from 127.0.0.1). Prints its own CPU time, memory
// and relay counters as one JSON line whenever it receives a line on stdin.
import { createServer } from '../server/app.js';
import { loadConfig } from '../server/config.js';

const base = loadConfig({ ALLOWED_ORIGINS: 'http://load.test', MAX_ROOMS: '1000' });
const config = {
  ...base,
  limits: {
    ...base.limits,
    joinPerIp: { capacity: 1e6, windowMs: 1000 },
    createPerIp: { capacity: 1e6, windowMs: 1000 },
    connectPerIp: { capacity: 1e6, windowMs: 1000 },
    maxConcurrentPerIp: 1e6,
  },
};
const server = createServer({ config, log: () => {} });
const port = await server.listen(0);
process.stdout.write(`${JSON.stringify({ port })}\n`);
process.stdin.on('data', () => {
  const cpu = process.cpuUsage();
  const mem = process.memoryUsage();
  process.stdout.write(`${JSON.stringify({ cpuUs: cpu.user + cpu.system, rss: mem.rss, heap: mem.heapUsed, rooms: server.manager.rooms.size, relayed: server.sockets.relayed.packets, t: performance.now() })}\n`);
});
