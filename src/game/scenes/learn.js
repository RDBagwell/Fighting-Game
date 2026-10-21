/**
 * Training mode's front door: free training, the tutorial, and the combo
 * trials, with a ✓ on what the player has completed (kept in this browser).
 */
import { h, focusFirst } from '../ui/dom.js';
import { drawBackdrop } from './backdrop.js';
import { TitleScene } from './title.js';
import { SelectScene } from './select.js';
import { MatchScene } from './match.js';
import { roster } from '../data/characters/index.js';
import { TRIALS } from '../data/trials.js';
import { LESSONS } from '../data/lessons.js';
import { loadProgress } from '../training/progress.js';
import { howTo } from '../ui/howTo.js';

/** @typedef {'menu'|'trials'|'lessons'} View */

export class LearnScene {
  /**
   * @param {import('../App.js').App} app
   * @param {View} [view]
   * @param {string} [char]  The character whose trials to show.
   */
  constructor(app, view = 'menu', char = roster[0]) {
    this.app = app;
    this.name = 'learn';
    this.view = view;
    this.char = char;
    this.time = 0;
  }

  enter() {
    this.show(this.view);
  }

  /** @param {View} view */
  show(view) {
    this.view = view;
    const app = this.app;
    app.ui.replaceChildren();
    const back = (/** @type {() => void} */ fn) => h('button', { class: 'btn', 'data-back': true, onclick: () => { app.click('back'); fn(); } }, 'Back');
    /** @type {HTMLElement} */
    let screen;
    if (view === 'menu') {
      const p = loadProgress();
      const lessonsDone = LESSONS.filter((l) => p.lessons[l.id]).length;
      const trialsAll = Object.values(TRIALS).flat();
      const trialsDone = trialsAll.filter((t) => p.trials[t.id]).length;
      screen = h('div', { class: 'screen learn menu-active' },
        h('h2', {}, 'Training'),
        h('nav', { class: 'menu learn-menu', 'aria-label': 'Training' },
          h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => { app.click('confirm'); this.show('lessons'); } },
            h('span', {}, 'Tutorial'), h('small', {}, `New to fighting games? Start here. ${lessonsDone} of ${LESSONS.length} done.`)),
          h('button', { class: 'btn', onclick: () => { app.click('confirm'); this.show('trials'); } },
            h('span', {}, 'Combo trials'), h('small', {}, `Learn each character’s combos, one step at a time. ${trialsDone} of ${trialsAll.length} done.`)),
          h('button', { class: 'btn', onclick: () => { app.click('confirm'); app.setScene(new SelectScene(app, 'training')); } },
            h('span', {}, 'Free training'), h('small', {}, 'The dummy, hitboxes, frame data and frame-by-frame stepping.')),
          back(() => app.setScene(new TitleScene(app)))));
    } else if (view === 'lessons') {
      const done = loadProgress().lessons;
      screen = h('div', { class: 'screen learn menu-active' },
        h('h2', {}, 'Tutorial'),
        h('p', { class: 'fine learn-intro' }, 'Short lessons against the training dummy. Each one checks that you did it, then moves on. You play Mack; the keys shown are your own (Settings → Controls).'),
        h('nav', { class: 'menu learn-list', 'aria-label': 'Lessons' },
          ...LESSONS.map((l, i) => h('button', { class: `btn ${i === 0 ? 'primary' : ''}`, 'data-autofocus': i === 0 ? true : undefined, onclick: () => this.start({ lesson: { index: i } }, 'mack') },
            h('span', {}, `${done[l.id] ? '✓ ' : ''}${i + 1}. ${l.name}`), h('small', {}, l.summary)))),
        h('nav', { class: 'menu' }, back(() => this.show('menu'))));
    } else {
      const done = loadProgress().trials;
      const sim = app.sim;
      const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Character' },
        ...roster.map((id) => h('button', { class: 'btn tab', role: 'tab', 'aria-selected': String(id === this.char), onclick: () => { this.char = id; app.click('menu'); this.show('trials'); } }, sim.characters[id].name)));
      const ch = sim.characters[this.char];
      screen = h('div', { class: 'screen learn menu-active' },
        h('h2', {}, 'Combo trials'),
        tabs,
        h('nav', { class: 'menu learn-list', 'aria-label': `${ch.name}’s combo trials` },
          ...TRIALS[this.char].map((t, i) => h('button', { class: `btn ${i === 0 ? 'primary' : ''}`, 'data-autofocus': i === 0 ? true : undefined, onclick: () => this.start({ trial: { char: this.char, index: i } }, this.char) },
            h('span', {}, `${done[t.id] ? '✓ ' : ''}${i + 1}. ${t.name}`),
            h('small', {}, t.steps.map((s) => `${ch.moves[s].name} (${howTo(ch.moves[s], sim.motions, app.settings.controls).arrows})`).join(' → '))))),
        h('nav', { class: 'menu' }, back(() => this.show('menu'))));
    }
    app.ui.append(screen);
    focusFirst(screen);
  }

  /**
   * @param {{ trial?: { char: string, index: number }, lesson?: { index: number } }} what
   * @param {string} char
   */
  start(what, char) {
    const app = this.app;
    app.click('confirm');
    const opponent = roster.find((c) => c !== char) ?? char;
    app.setScene(new MatchScene(app, { mode: 'training', chars: [char, opponent], cpu: 'normal', stage: 'dusk-shrine', ...what }));
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    this.time += dt;
    drawBackdrop(this.app, ctx, this.time, ['mack', 'kenji'], 0.6);
  }
}
