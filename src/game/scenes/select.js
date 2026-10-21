/**
 * Character select: each side picks a fighter (in versus, each player on
 * their own side), the CPU's difficulty, and the stage.
 */
import { h, focusFirst } from '../ui/dom.js';
import { drawBackdrop, portrait } from './backdrop.js';
import { roster } from '../data/characters/index.js';
import { STAGES } from '../data/stages.js';
import { DIFFICULTIES } from '../cpu/Cpu.js';
import { VsScene } from './vs.js';
import { MatchScene } from './match.js';
import { TitleScene } from './title.js';

/** @typedef {'cpu'|'versus'|'training'} Mode */

/**
 * @typedef {object} MatchConfig
 * @property {Mode} mode
 * @property {[string, string]} chars
 * @property {'easy'|'normal'|'hard'} cpu
 * @property {string} stage
 * @property {{ char: string, index: number }} [trial]  Training: run this combo trial.
 * @property {{ index: number }} [lesson]  Training: run this tutorial lesson.
 */

export class SelectScene {
  /**
   * @param {import('../App.js').App} app
   * @param {Mode} mode
   * @param {Partial<MatchConfig>} [previous]
   */
  constructor(app, mode, previous = {}) {
    this.app = app;
    this.mode = mode;
    this.name = 'select';
    this.time = 0;
    /** @type {[string, string]} */
    this.chars = previous.chars ?? [roster[0], roster[1]];
    this.cpu = previous.cpu ?? app.settings.cpu;
    this.stage = previous.stage ?? STAGES[0].id;
  }

  enter() {
    const app = this.app;
    const labels = { cpu: ['Player 1', 'CPU'], versus: ['Player 1', 'Player 2'], training: ['You', 'Training dummy'] }[this.mode];
    const titles = { cpu: 'Versus CPU', versus: 'Versus: two players', training: 'Free training' };

    /** @param {number} side */
    const sideBlock = (side) => {
      const info = h('p', { class: 'char-info', 'aria-live': 'polite' });
      const cards = h('div', { class: 'cards', role: 'radiogroup', 'aria-label': `${labels[side]}: character` });
      const refresh = () => {
        cards.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === this.chars[side])));
        const ch = app.sim.characters[this.chars[side]];
        info.replaceChildren(h('strong', {}, `${ch.name}, ${ch.title}`), h('span', { class: 'style' }, ch.style), ch.blurb);
      };
      for (const id of roster) {
        const ch = app.sim.characters[id];
        cards.append(h('button', {
          class: 'card', role: 'radio', 'data-id': id, 'aria-label': `${ch.name} (${ch.style})`,
          onclick: () => {
            this.chars[side] = id;
            app.click('menu');
            refresh();
          },
        }, portrait(app, id), h('span', { class: 'card-name' }, ch.name), h('span', { class: 'card-style' }, ch.style)));
      }
      refresh();
      const extra = side === 1 && this.mode === 'cpu'
        ? h('label', { class: 'row' }, h('span', {}, 'Difficulty'),
          (() => {
            const sel = /** @type {HTMLSelectElement} */ (h('select', { onchange: () => { this.cpu = /** @type {'easy'} */ (sel.value); app.settings.cpu = this.cpu; app.saveSettings(); } },
              ...Object.entries(DIFFICULTIES).map(([k, d]) => h('option', { value: k, selected: k === this.cpu }, d.name))));
            return sel;
          })())
        : null;
      return h('section', { class: `side p${side + 1}` }, h('h3', {}, labels[side]), cards, info, extra);
    };

    const stages = STAGES.filter((st) => !st.licensed || app.assets?.licensed.background);
    const stageRow = stages.length > 1
      ? h('label', { class: 'row stage' }, h('span', {}, 'Stage'),
        (() => {
          const sel = /** @type {HTMLSelectElement} */ (h('select', { onchange: () => (this.stage = sel.value) }, ...stages.map((st) => h('option', { value: st.id, selected: st.id === this.stage }, st.name))));
          return sel;
        })())
      : h('p', { class: 'fine' }, `Stage: ${stages[0].name}`);

    const start = () => {
      app.click('confirm');
      /** @type {MatchConfig} */
      const config = { mode: this.mode, chars: [this.chars[0], this.chars[1]], cpu: this.cpu, stage: this.stage };
      if (this.mode === 'training') app.setScene(new MatchScene(app, config));
      else app.setScene(new VsScene(app, config));
    };
    const back = () => {
      app.click('back');
      app.setScene(new TitleScene(app));
    };
    const help = this.mode === 'versus'
      ? 'Player 1: WASD + J K L (or the first gamepad). Player 2: arrows + numpad 1 2 3 (or the second gamepad).'
      : 'Every keyboard set and gamepad controls you.';

    const screen = h('div', { class: 'screen select menu-active' },
      h('h2', {}, titles[this.mode]),
      h('div', { class: 'select-grid' }, sideBlock(0), h('div', { class: 'vs-mark', 'aria-hidden': 'true' }, 'VS'), sideBlock(1)),
      stageRow,
      h('p', { class: 'fine' }, help),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', 'data-autofocus': true, onclick: start }, this.mode === 'training' ? 'Start training' : 'Fight!'),
        h('button', { class: 'btn', 'data-back': true, onclick: back }, 'Back')));
    app.ui.append(screen);
    focusFirst(screen);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    this.time += dt;
    drawBackdrop(this.app, ctx, this.time, this.chars, 0.6);
  }
}
