/**
 * Server security, with a real server and real socket.io-client
 * connections: origins, validation, size limits, rate limits, tokens, and
 * what is (and isn't) forwarded to the other player.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { startServer, privateRoom, startedMatch, sleep, waitFor } from './helpers.js';
import { encodeInput } from '../../src/engine/rollback/packets.js';

/** @type {import('./helpers.js').TestEnv} */
let env;
afterEach(async () => {
  await env?.close();
});

describe('connections', () => {
  it('refuses foreign origins, a missing origin and long-polling', async () => {
    env = await startServer();
    for (const opts of [{ origin: 'https://evil.example' }, { origin: null }, { transports: ['polling'] }]) {
      const c = env.connect(opts);
      await expect(c.connected).rejects.toBeTruthy();
    }
    const ok = env.connect();
    await ok.connected;
  });

  it('caps concurrent connections per IP', async () => {
    env = await startServer({ config: { limits: { maxConcurrentPerIp: 3 } } });
    const clients = [env.connect(), env.connect(), env.connect()];
    await Promise.all(clients.map((c) => c.connected));
    await expect(env.connect().connected).rejects.toBeTruthy();
  });

  it('caps the number of rooms', async () => {
    env = await startServer({ config: { maxRooms: 2 } });
    const clients = [env.connect(), env.connect(), env.connect()];
    await Promise.all(clients.map((c) => c.connected));
    expect((await clients[0].request('createRoom')).ok).toBe(true);
    expect((await clients[1].request('createRoom')).ok).toBe(true);
    expect(await clients[2].request('createRoom')).toEqual({ ok: false, error: 'The server is full right now. Try again later.' });
  });
});

describe('validation', () => {
  it('rejects malformed payloads, extra fields and unknown events with a generic error', async () => {
    env = await startServer();
    const { a } = await privateRoom(env);
    expect(await a.request('joinRoom', { code: 42 })).toEqual({ ok: false, error: 'Invalid request.' });
    expect(await a.request('select', { char: 'ryu', ready: true })).toEqual({ ok: false, error: 'Invalid request.' });
    expect(await a.request('select', { char: 'mack', ready: true, health: 1 })).toEqual({ ok: false, error: 'Invalid request.' });
    a.socket.emit('setHealth', { value: 0 });
    a.socket.emit('gameState', { fighters: [] });
    await waitFor(() => a.errors.length >= 2, 2000, 'errors');
    for (const e of a.errors) expect(e).toBe('Invalid request.');
  });

  it('disconnects a socket that sends an oversized frame', async () => {
    env = await startServer();
    const a = env.connect();
    await a.connected;
    let gone = false;
    a.socket.on('disconnect', () => (gone = true));
    a.socket.emit('signal', { kind: 'offer', data: 'x'.repeat(20_000) });
    await waitFor(() => gone, 3000, 'disconnect');
  });

  it('relays only well-formed binary packets of the right size, only to the other seat, only in a match', async () => {
    env = await startServer();
    const { a, b } = await privateRoom(env);
    const packet = encodeInput(10, 8, 0, 9, [1, 2]);
    a.socket.emit('relay', packet);
    await sleep(100);
    expect(b.relays).toHaveLength(0); // no match yet
    await a.request('select', { char: 'mack', ready: true });
    await b.request('select', { char: 'kenji', ready: true });
    await b.waitForRoom((r) => r.status === 'playing');
    a.socket.emit('relay', packet);
    a.socket.emit('relay', new Uint8Array(500)); // too big
    a.socket.emit('relay', 'text'); // not binary
    a.socket.emit('relay', new Uint8Array(3)); // too small
    await waitFor(() => b.relays.length === 1, 2000, 'relay');
    await sleep(100);
    expect(b.relays).toHaveLength(1);
    expect([...b.relays[0]]).toEqual([...packet]);
    expect(a.relays).toHaveLength(0);
  });

  it('signalling goes only to the other seat of your own room', async () => {
    env = await startServer();
    const one = await privateRoom(env);
    const two = await privateRoom(env);
    one.a.socket.emit('signal', { kind: 'offer', data: 'v=0 sdp' });
    await waitFor(() => one.b.signals.length === 1, 2000, 'signal');
    await sleep(50);
    expect(two.a.signals).toHaveLength(0);
    expect(two.b.signals).toHaveLength(0);
    expect(one.a.signals).toHaveLength(0);
    // Not in a room: nothing to forward to.
    const loner = env.connect();
    await loner.connected;
    loner.socket.emit('signal', { kind: 'ice', data: 'candidate' });
    await sleep(50);
    expect(one.a.signals.length + one.b.signals.length).toBe(1);
  });
});

describe('rate limits', () => {
  it('throttles session events, then disconnects a flooder', async () => {
    env = await startServer({ config: { limits: { sessionEvents: { capacity: 3, windowMs: 10_000 }, maxViolations: 5 } } });
    const a = env.connect();
    await a.connected;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await a.request('cancelQueue'));
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3]).toEqual({ ok: false, error: 'Slow down a little.' });
    let gone = false;
    a.socket.on('disconnect', () => (gone = true));
    for (let i = 0; i < 10; i++) a.socket.emit('cancelQueue', {});
    await waitFor(() => gone, 2000, 'disconnect');
  });

  it('limits room-code guesses per IP', async () => {
    env = await startServer({ config: { limits: { joinPerIp: { capacity: 5, windowMs: 60_000 } } } });
    const a = env.connect();
    await a.connected;
    const answers = [];
    for (let i = 0; i < 7; i++) answers.push((await a.request('joinRoom', { code: 'ABCDEF' })).error);
    expect(answers.slice(0, 5).every((e) => e === "That room doesn't exist, is full, or has already started.")).toBe(true);
    expect(answers[6]).toBe('Slow down a little.');
  });
});

describe('sessions and tokens', () => {
  it('a forged or foreign token can\'t take a seat', async () => {
    env = await startServer();
    const { code } = await startedMatch(env);
    const other = await privateRoom(env);
    const thief = env.connect();
    await thief.connected;
    const forged = 'A'.repeat(43);
    expect(await thief.request('resume', { code, token: forged })).toEqual({ ok: false, error: 'That session has expired.' });
    expect(await thief.request('resume', { code, token: other.tokens[0] })).toEqual({ ok: false, error: 'That session has expired.' });
    expect(await thief.request('select', { char: 'mack', ready: true })).toEqual({ ok: false, error: "That's not possible right now." });
  });

  it('tokens are never sent to anyone but their owner', async () => {
    env = await startServer();
    const { a, b, tokens } = await startedMatch(env);
    const text = (/** @type {import('./helpers.js').TestClient} */ c) => JSON.stringify(c.raw);
    expect(text(b)).not.toContain(tokens[0]);
    expect(text(a)).not.toContain(tokens[1]);
  });

  it('a join with a full or unknown room gets the same message', async () => {
    env = await startServer();
    const { code } = await privateRoom(env);
    const c = env.connect();
    await c.connected;
    const full = await c.request('joinRoom', { code });
    const unknown = await c.request('joinRoom', { code: 'ZZZZZZ' });
    expect(full).toEqual(unknown);
  });
});
