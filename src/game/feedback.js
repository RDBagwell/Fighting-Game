/**
 * "Send feedback": opens the beta feedback form (a Tally form, see
 * site.config.js) in a new tab, with the match already filled in through
 * the form's hidden fields. Nothing is sent from the game itself: the
 * tester sees the form and decides whether to submit it.
 */
import { site } from '../../site.config.js';
import { h } from './ui/dom.js';
import { gameVersion, encodeReplay } from './replay/replays.js';

/** A replay this short fits in a link (the same limit as the replay viewer's). */
export const MAX_REPLAY_LINK = 6000;

/**
 * @typedef {object} FeedbackContext  What the tester was doing. Every field is optional.
 * @property {'cpu'|'arcade'|'versus'|'online'|'training'} [mode]
 * @property {string} [p1]  Character names
 * @property {string} [p2]
 * @property {string} [cpu]  The CPU's level, e.g. "Hard"
 * @property {string} [result]  e.g. "Mack won 2–1"
 * @property {import('./replay/replays.js').Replay} [replay]  Linked if short enough
 */

/**
 * The browser and system, briefly: "Chrome 141 / Windows".
 * @param {string} ua  navigator.userAgent
 */
export function describeBrowser(ua) {
  const browser = [
    ['Edge', /Edg\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Firefox', /Firefox\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/], ['Safari', /Version\/(\d+)[\d.]* .*Safari/],
  ].map(([name, re]) => [name, ua.match(/** @type {RegExp} */ (re))]).find(([, m]) => m);
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'other';
  return `${browser ? `${browser[0]} ${/** @type {RegExpMatchArray} */ (browser[1])[1]}` : 'Other browser'} / ${os}`;
}

/**
 * Who won, in words: "Mack won 2–1", "Draw 1–1".
 * @param {[string, string]} names
 * @param {number} winner  0, 1 or 2 (draw)
 * @param {[number, number]} wins
 */
export function resultText(names, winner, wins) {
  if (winner === 2) return `Draw ${wins[0]}–${wins[1]}`;
  return `${names[winner]} won ${wins[winner]}–${wins[1 - winner]}`;
}

/**
 * The form's address with the hidden fields filled in.
 * @param {{ version: string, device: string, browser: string, base: string }} env
 * @param {FeedbackContext} context
 */
export function feedbackUrl(env, context = {}) {
  const u = new URL(site.feedbackForm);
  /** @type {Record<string, string | undefined>} */
  const fields = {
    version: env.version,
    mode: context.mode,
    p1: context.p1,
    p2: context.p2,
    cpu: context.cpu,
    result: context.result,
    device: env.device,
    browser: env.browser,
  };
  if (context.replay) {
    const encoded = encodeReplay(context.replay);
    if (encoded.length <= MAX_REPLAY_LINK) {
      const link = new URL(env.base);
      link.search = '';
      link.hash = `replay=${encoded}`;
      fields.replay = link.toString();
    }
  }
  for (const [k, v] of Object.entries(fields)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * A "Send feedback" button for any menu.
 * @param {import('./App.js').App} app
 * @param {FeedbackContext | (() => FeedbackContext)} [context]  A function is read when clicked.
 */
export function feedbackButton(app, context = {}) {
  return h('button', {
    class: 'btn', 'data-feedback': true,
    onclick: () => {
      app.click('confirm');
      const env = { version: gameVersion(app.sim), device: app.input.lastDevice, browser: describeBrowser(navigator.userAgent), base: location.href };
      window.open(feedbackUrl(env, typeof context === 'function' ? context() : context), '_blank', 'noopener');
    },
  }, 'Send feedback');
}
