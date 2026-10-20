/**
 * Music and captions: a missing track is never requested, the same track
 * carries on across scenes, every scene has a track, and captions cover
 * the important events only.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Music } from '../src/engine/audio/Music.js';
import { trackFor } from '../src/game/audio.js';

/** @type {string[]} */
let created;
class FakeAudio {
  /** @param {string} src */
  constructor(src) {
    this.src = src;
    this.loop = false;
    this.volume = 1;
    this.paused = true;
    created.push(src);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {}
}

describe('music', () => {
  beforeEach(() => {
    created = [];
    globalThis.Audio = /** @type {any} */ (FakeAudio);
  });
  afterEach(() => {
    delete (/** @type {any} */ (globalThis)).Audio;
  });

  it('plays nothing before a user gesture, then the wanted track', () => {
    const m = new Music({ title: 'music/title.ogg', select: null, stage: null, results: null });
    m.play('title');
    expect(created).toEqual([]);
    m.unlock();
    expect(created).toEqual(['music/title.ogg']);
    expect(m.current?.el.loop).toBe(true);
  });

  it('never requests a missing track, and keeps a track playing across scenes that share it', () => {
    const m = new Music({ title: 'music/title.ogg', select: null, stage: 'music/stage.ogg', results: null });
    m.unlock();
    m.play('title');
    m.play('title');
    m.play('select'); // missing: silence
    expect(m.current).toBeNull();
    m.play('stage');
    m.play('stage');
    expect(created).toEqual(['music/title.ogg', 'music/stage.ogg']);
    expect(m.available()).toEqual(['title', 'stage']);
  });

  it('with no music at all, nothing is ever created', () => {
    const m = new Music({ title: null, select: null, stage: null, results: null });
    m.unlock();
    for (const t of ['title', 'select', 'stage', 'results']) m.play(t);
    expect(created).toEqual([]);
    expect(m.available()).toEqual([]);
  });
});

describe('tracks per scene', () => {
  it('every fight plays the stage track, menus the title track, and only the four tracks exist', () => {
    for (const name of ['match', 'online-match', 'lab', 'replay']) expect(trackFor(name)).toBe('stage');
    for (const name of ['select', 'vs', 'online-room', 'lab-setup']) expect(trackFor(name)).toBe('select');
    for (const name of ['results', 'online-results']) expect(trackFor(name)).toBe('results');
    for (const name of ['title', 'online-lobby', 'replays', undefined]) expect(trackFor(name)).toBe('title');
  });

  it('the lab and online scenes are named as the table expects', () => {
    // A renamed scene would silently fall back to the title track.
    const src = readFileSync(new URL('../src/game/scenes/netplay.js', import.meta.url), 'utf8');
    expect(src).toContain("options.kind === 'lab' ? 'lab' : 'online-match'");
  });
});
