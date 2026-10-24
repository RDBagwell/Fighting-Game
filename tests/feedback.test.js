/**
 * The feedback link: the beta form's address with its hidden fields filled
 * in from the match, the browser described briefly, and a replay linked
 * only when it fits.
 */
import { describe, it, expect } from 'vitest';
import { sim } from './helpers/harness.js';
import { site } from '../site.config.js';
import { feedbackUrl, describeBrowser, resultText, MAX_REPLAY_LINK } from '../src/game/feedback.js';
import { makeReplay, decodeReplay, encodeReplay } from '../src/game/replay/replays.js';

const env = { version: 'abc12345', device: 'gamepad', browser: 'Chrome 141 / Windows', base: 'https://rdbagwell.github.io/dusk-duel/?x=1#old' };

/** @param {number} frames */
function replayOf(frames) {
  /** @type {Array<[number, number]>} */
  const inputs = Array.from({ length: frames }, (_, i) => [(i * 7919) & 0xff, (i * 104729) & 0xff]);
  return makeReplay(sim, { chars: ['mack', 'reroe'], seed: 3, stage: 'dusk-shrine' }, inputs, { mode: 'cpu', names: ['Mack', 'Reroe'] });
}

describe('the feedback link', () => {
  it('is the beta form with the match in its hidden fields, and nothing empty', () => {
    const u = new URL(feedbackUrl(env, { mode: 'cpu', p1: 'Mack', p2: 'Reroe', cpu: 'Hard', result: 'Mack won 2–1' }));
    expect(`${u.origin}${u.pathname}`).toBe(site.feedbackForm);
    expect(Object.fromEntries(u.searchParams)).toEqual({
      version: 'abc12345', mode: 'cpu', p1: 'Mack', p2: 'Reroe', cpu: 'Hard', result: 'Mack won 2–1', device: 'gamepad', browser: 'Chrome 141 / Windows',
    });
    expect([...new URL(feedbackUrl(env)).searchParams.keys()]).toEqual(['version', 'device', 'browser']);
  });

  it('links a short replay, which opens the same match in the viewer; a long one is left out', () => {
    const short = replayOf(600);
    const link = new URL(/** @type {string} */ (new URL(feedbackUrl(env, { replay: short })).searchParams.get('replay')));
    expect(`${link.origin}${link.pathname}${link.search}`).toBe('https://rdbagwell.github.io/dusk-duel/');
    const back = decodeReplay(link.hash.slice('#replay='.length), sim);
    expect(back.inputs).toEqual(short.inputs);

    const long = replayOf(60 * 60 * 3);
    expect(encodeReplay(long).length).toBeGreaterThan(MAX_REPLAY_LINK);
    expect(new URL(feedbackUrl(env, { replay: long })).searchParams.has('replay')).toBe(false);
  });

  it('describes browsers briefly', () => {
    const cases = {
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36': 'Chrome 141 / Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0': 'Edge 141 / Windows',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0': 'Firefox 144 / macOS',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1': 'Safari 18 / iOS',
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36': 'Chrome 141 / Android',
      'SomethingElse/1.0': 'Other browser / other',
    };
    for (const [ua, want] of Object.entries(cases)) expect(describeBrowser(ua), ua).toBe(want);
  });

  it('says who won', () => {
    expect(resultText(['Mack', 'Reroe'], 0, [2, 1])).toBe('Mack won 2–1');
    expect(resultText(['Mack', 'Reroe'], 1, [0, 2])).toBe('Reroe won 2–0');
    expect(resultText(['Mack', 'Reroe'], 2, [1, 1])).toBe('Draw 1–1');
  });
});
