/**
 * Captions for the sounds that carry information: a short line of text
 * when a round starts, a fighter is knocked out, a throw is escaped, a
 * super or a fireball comes out, and so on. Off by default
 * (Settings > Accessibility > Captions for sounds).
 *
 * Shown in the DOM, in a live region, so screen readers announce them too.
 * Hits and blocks are not captioned: they happen several times a second
 * and the hit sparks and health bars already show them.
 */
import { h } from '../ui/dom.js';

/** @type {Record<string, (e: import('../../engine/sim/types.js').SimEvent) => string>} */
const TEXT = {
  round: () => '[Bell] Round start',
  fight: () => '[Gong] Fight!',
  ko: (e) => (e.side === -1 ? '[Crash] Double K.O.' : `[Crash] K.O.: ${side(e)} wins the round`),
  timeout: (e) => (e.side === -1 ? '[Buzzer] Time: a draw' : `[Buzzer] Time: ${side(e)} wins the round`),
  super: (e) => `[Super flash] ${side(e)} super`,
  throw: (e) => `[Thud] ${side(e)} throws`,
  tech: () => '[Clack] Throw escaped',
  clash: () => '[Clang] Clash',
  projectile: (e) => `[Whoosh] ${side(e)} fireball`,
  knockdown: (e) => `[Thump] ${side(e)} knocked down`,
};

/** @param {import('../../engine/sim/types.js').SimEvent} e */
function side(e) {
  return e.side === 0 ? 'P1' : 'P2';
}

const SHOW_MS = 2200;

export class Captions {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.enabled = false;
    /** @type {HTMLElement | null} */
    this.el = null;
  }

  /** @param {import('../../engine/sim/types.js').SimEvent[]} events */
  show(events) {
    if (!this.enabled) return;
    for (const e of events) {
      const text = TEXT[e.type]?.(e);
      if (text) this.add(text);
    }
  }

  /** @param {string} text */
  add(text) {
    if (!this.el || !this.el.isConnected) {
      this.el = h('div', { class: 'captions', 'aria-live': 'polite', role: 'log' });
      this.root.append(this.el);
    }
    const line = h('p', {}, text);
    this.el.append(line);
    while (this.el.childElementCount > 3) this.el.firstElementChild?.remove();
    setTimeout(() => line.remove(), SHOW_MS);
  }
}
