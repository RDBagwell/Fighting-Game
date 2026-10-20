/**
 * Load test for the matchmaking server: N rooms of two players, every
 * player relaying a realistic input stream through the server (the
 * fallback path, the server's heaviest job: 60 input packets a second plus
 * checksums and pings, as RollbackSession sends them). Measures the server
 * process's CPU and memory at each step.
 *
 *   npm run load-test                     0, 10, 25, 50, 100 rooms
 *   npm run load-test -- 0 50 150         chosen room counts
 *
 * The server runs in its own process (tools/load-server.mjs) so the
 * clients' own CPU isn't counted. Direct (WebRTC) matches cost the server
 * nothing per frame; this is the worst case.
 */
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { io } from 'socket.io-client';
import { encodeInput, encodeChecksum, encodePing, PING } from '../src/engine/rollback/packets.js';

const levels = process.argv.slice(2).map(Number).filter((n) => n >= 0);
const LEVELS = levels.length ? levels : [0, 10, 25, 50, 100];
const SETTLE_MS = 5000;
const MEASURE_MS = 15000;
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(process.execPath, ['tools/load-server.mjs'], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: child.stdout });
/** @type {Array<(v: any) => void>} */
const waiting = [];
lines.on('line', (l) => waiting.shift()?.(JSON.parse(l)));
const next = () => new Promise((r) => waiting.push(r));
const { port } = await next();
const url = `http://127.0.0.1:${port}`;
const sample = async () => { const p = next(); child.stdin.write('\n'); return p; };

/** @param {import('socket.io-client').Socket} s @param {string} ev @param {any} [data] */
const ask = (s, ev, data) => new Promise((resolve) => s.emit(ev, data ?? {}, resolve));

/** One room: two sockets, a private room, both ready, then relay traffic. */
async function room() {
  const make = () => io(url, { transports: ['websocket'], extraHeaders: { origin: 'http://load.test' }, reconnection: false });
  const a = make();
  const b = make();
  await Promise.all([a, b].map((s) => new Promise((r) => s.once('connect', () => r(undefined)))));
  const created = /** @type {any} */ (await ask(a, 'createRoom'));
  await ask(b, 'joinRoom', { code: created.code });
  await ask(a, 'select', { char: 'mack', ready: true });
  await ask(b, 'select', { char: 'kenji', ready: true });
  let frame = 0;
  const timer = setInterval(() => {
    frame++;
    for (const [i, s] of [a, b].entries()) {
      // Three redundant inputs per packet, as the session sends on a good line.
      s.emit('relay', encodeInput(frame + 2, frame, 0, frame, [i, i, i]));
      if (frame % 30 === 0) s.emit('relay', encodeChecksum(frame - 30, Math.imul(frame, 2654435761) >>> 0));
      if (frame % 30 === 15) s.emit('relay', encodePing(PING, performance.now()));
    }
  }, 1000 / 60);
  return () => { clearInterval(timer); a.close(); b.close(); };
}

/** @type {Array<() => void>} */
const rooms = [];
const rows = [];
for (const n of LEVELS) {
  while (rooms.length < n) rooms.push(await room());
  while (rooms.length > n) rooms.pop()?.();
  await sleep(SETTLE_MS);
  const s0 = await sample();
  await sleep(MEASURE_MS);
  const s1 = await sample();
  const cpu = ((s1.cpuUs - s0.cpuUs) / 1000 / (s1.t - s0.t)) * 100;
  const pps = ((s1.relayed - s0.relayed) / (s1.t - s0.t)) * 1000;
  rows.push({ n, rooms: s1.rooms, cpu, rss: s1.rss / 2 ** 20, heap: s1.heap / 2 ** 20, pps });
  console.error(`${n} rooms: ${cpu.toFixed(1)}% CPU, ${(s1.rss / 2 ** 20).toFixed(0)} MB RSS, ${pps.toFixed(0)} packets/s relayed`);
}
rooms.forEach((stop) => stop());
child.kill();

console.log(`Machine: ${os.cpus()[0]?.model ?? 'unknown CPU'} (${os.cpus().length} threads), ${(os.totalmem() / 2 ** 30).toFixed(0)} GB, ${os.platform()} ${os.release()}, Node ${process.version}`);
console.log(`Each step: ${SETTLE_MS / 1000} s to settle, then ${MEASURE_MS / 1000} s measured. CPU is the server process's user+system time over wall time (100% = one core).\n`);
console.log('| Rooms (2 players, all relayed) | Packets relayed/s | Server CPU | Server memory (RSS) | JS heap |');
console.log('|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.n} | ${r.pps.toFixed(0)} | ${r.cpu.toFixed(1)}% | ${r.rss.toFixed(0)} MB | ${r.heap.toFixed(1)} MB |`);
const base = rows.find((r) => r.n === 0);
const top = rows[rows.length - 1];
if (base && top.n > 0) console.log(`\nPer room above idle (at ${top.n} rooms): ${((top.cpu - base.cpu) / top.n).toFixed(2)}% of a core, ${((top.rss - base.rss) / top.n).toFixed(2)} MB.`);
