/**
 * The rollback lab's panel: a drawer beside the fight (the match keeps
 * running) with the network sliders, the netcode switches and the live
 * numbers. Every control says what it shows. Same idea as Netcode Pong's
 * network lab, for the other netcode model.
 *
 * It only changes the *network* (the simulated layer between the two
 * sessions) and each session's own settings (delay, window, mode); the
 * game's rules and state are never touched.
 */
import { h } from '../ui/dom.js';
import { PRESETS } from '../../engine/rollback/presets.js';

export const LAB_WHAT = {
  latency: 'Time for a message to go there and back. Rollback hides it by guessing; delay-based netcode makes you wait for it.',
  jitter: 'How much that time varies. Uneven arrival makes more guesses go wrong.',
  loss: 'Messages that never arrive. Each packet repeats recent inputs, so one lost packet costs nothing.',
  mode: 'Rollback: guess the opponent’s input and fix it later. Delay-based: wait for it (the old way; play a few seconds of each).',
  delay: 'Frames your own input waits before it counts. A little delay means fewer, shorter rollbacks; too much feels sluggish.',
  window: 'The furthest back a correction may go. Beyond it, the game waits for the opponent instead.',
  ghost: 'Where the guess had put the opponent, the moment a correction moved them.',
  meter: 'How many frames were re-simulated on each tick.',
  timeline: 'Each of the opponent’s frames: on time, guessed right, or guessed wrong.',
};

export class LabPanel {
  /**
   * @param {import('../App.js').App} app
   * @param {object} host
   * @param {() => import('../../engine/rollback/NetworkSimulator.js').NetworkConditions} host.getConditions
   * @param {(c: import('../../engine/rollback/NetworkSimulator.js').NetworkConditions) => void} host.setConditions
   * @param {() => import('../../engine/rollback/RollbackSession.js').RollbackSession[]} host.sessions  The sessions the switches apply to.
   * @param {{ ghost: boolean, meter: boolean, timeline: boolean, autoDelay: boolean }} host.show
   * @param {string} host.title
   */
  constructor(app, host) {
    this.app = app;
    this.host = host;
    /** @type {HTMLElement | null} */
    this.root = null;
    /** @type {HTMLElement | null} */
    this.statsEl = null;
    this.open = false;
  }

  mount(openNow = false) {
    const app = this.app;
    const host = this.host;
    const c = host.getConditions();
    /** @type {Record<string, HTMLInputElement>} */
    const sliders = {};
    /**
     * @param {string} key
     * @param {string} label
     * @param {number} min
     * @param {number} max
     * @param {number} step
     * @param {number} value
     * @param {(v: number) => string} fmt
     * @param {(v: number) => void} onChange
     * @param {string} what
     */
    const slider = (key, label, min, max, step, value, fmt, onChange, what) => {
      const out = h('output', {}, fmt(value));
      const input = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min, max, step, value, 'aria-label': label,
        oninput: () => {
          out.textContent = fmt(Number(input.value));
          onChange(Number(input.value));
        } }));
      sliders[key] = input;
      return h('label', { class: 'lab-row' }, h('span', { class: 'lab-label' }, label, ' ', out), input, h('small', { class: 'what' }, what));
    };
    const setCond = (/** @type {Partial<import('../../engine/rollback/NetworkSimulator.js').NetworkConditions>} */ patch) => host.setConditions({ ...host.getConditions(), ...patch });
    const s0 = host.sessions()[0];

    /** @param {string} text @param {boolean} checked @param {(v: boolean) => void} set @param {string} what */
    const check = (text, checked, set, what) => {
      const input = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked, onchange: () => set(input.checked) }));
      return h('label', { class: 'row check' }, input, h('span', {}, text, h('small', { class: 'what' }, what)));
    };
    const modeGroup = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Netcode' });
    for (const [mode, label] of /** @type {const} */ ([['rollback', 'Rollback'], ['delay', 'Delay-based']])) {
      modeGroup.append(h('button', { class: 'btn seg-btn', role: 'radio', 'aria-checked': String(s0.mode === mode), onclick: (/** @type {Event} */ e) => {
        for (const s of host.sessions()) s.mode = mode;
        modeGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
        app.click('menu');
      } }, label));
    }
    const presets = h('div', { class: 'seg' }, ...Object.entries(PRESETS).map(([, p]) => h('button', { class: 'btn seg-btn', onclick: () => {
      host.setConditions({ ...p.conditions });
      sliders.latency.value = String(p.conditions.latencyMs);
      sliders.jitter.value = String(p.conditions.jitterMs);
      sliders.loss.value = String(Math.round(p.conditions.loss * 100));
      for (const k of ['latency', 'jitter', 'loss']) sliders[k].dispatchEvent(new Event('input'));
      app.click('menu');
    } }, p.label)));

    const autoRow = check('Automatic input delay (from the round trip)', host.show.autoDelay, (v) => (host.show.autoDelay = v), 'About half the one-way latency, 1 to 4 frames.');
    const autoBox = /** @type {HTMLInputElement} */ (autoRow.querySelector('input'));
    this.statsEl = h('div', { class: 'lab-stats', 'aria-live': 'off' });
    this.root = h('aside', { class: 'lab', 'aria-label': 'Rollback lab' },
      h('div', { class: 'lab-head' }, h('h2', {}, host.title), h('button', { class: 'btn small', onclick: () => this.toggle(false), 'aria-label': 'Close the lab' }, 'Close (Tab)')),
      h('section', {}, h('h3', {}, 'Network'), presets,
        slider('latency', 'Round trip', 0, 250, 5, c.latencyMs, (v) => `${v} ms`, (v) => setCond({ latencyMs: v }), LAB_WHAT.latency),
        slider('jitter', 'Jitter', 0, 100, 2, c.jitterMs, (v) => `${v} ms`, (v) => setCond({ jitterMs: v }), LAB_WHAT.jitter),
        slider('loss', 'Packet loss', 0, 20, 1, Math.round(c.loss * 100), (v) => `${v}%`, (v) => setCond({ loss: v / 100 }), LAB_WHAT.loss)),
      h('section', {}, h('h3', {}, 'Netcode'), modeGroup, h('small', { class: 'what' }, LAB_WHAT.mode),
        slider('delay', 'Input delay', 0, 8, 1, s0.inputDelay, (v) => `${v} frames`, (v) => {
          host.show.autoDelay = false;
          autoBox.checked = false;
          for (const s of host.sessions()) s.setInputDelay(v);
        }, LAB_WHAT.delay),
        autoRow,
        slider('window', 'Rollback window', 1, 12, 1, s0.maxRollback, (v) => `${v} frames`, (v) => {
          for (const s of host.sessions()) s.maxRollback = v;
        }, LAB_WHAT.window)),
      h('section', {}, h('h3', {}, 'Show'),
        check('Ghost of the guess', host.show.ghost, (v) => (host.show.ghost = v), LAB_WHAT.ghost),
        check('Rollback meter', host.show.meter, (v) => (host.show.meter = v), LAB_WHAT.meter),
        check('Input timeline', host.show.timeline, (v) => (host.show.timeline = v), LAB_WHAT.timeline)),
      h('section', {}, h('h3', {}, 'Live'), this.statsEl),
      h('p', { class: 'fine' }, 'How it works: docs/ROLLBACK.md in the repository.'));
    // In the page, not over the game: on a wide screen the game shrinks to sit beside it.
    app.root.append(this.root);
    this.toggle(openNow);
  }

  /** @param {boolean} [force] */
  toggle(force) {
    this.open = force ?? !this.open;
    this.root?.classList.toggle('open', this.open);
    this.app.root.classList.toggle('lab-open', this.open);
    const screen = this.app.screen;
    const wide = window.innerWidth >= 900;
    screen.reserveRight = this.open && wide && this.root ? Math.min(380, window.innerWidth * 0.36) : 0;
    this.root?.style.setProperty('width', screen.reserveRight ? `${screen.reserveRight}px` : '');
    screen.resize();
  }

  /**
   * @param {Array<[string, string]>} rows
   */
  setStats(rows) {
    if (!this.statsEl || !this.open) return;
    this.statsEl.replaceChildren(...rows.map(([k, v]) => h('div', { class: 'lab-stat' }, h('span', {}, k), h('b', {}, v))));
  }

  unmount() {
    this.root?.remove();
    this.app.root.classList.remove('lab-open');
    this.app.screen.reserveRight = 0;
    this.app.screen.resize();
  }
}
