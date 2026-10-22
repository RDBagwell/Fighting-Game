/**
 * A tutorial lesson, played in training mode: the panel with the lesson's
 * steps (the current one with its instructions, in the player's own keys),
 * a live count, and moving on to the next step and lesson. The logic is in
 * LessonRunner; this draws it and connects it to Training.
 */
import { h } from '../ui/dom.js';
import { keyLabels } from '../ui/howTo.js';
import { LESSONS } from '../data/lessons.js';
import { LessonRunner } from './LessonRunner.js';
import { loadProgress, markDone } from './progress.js';

/** Frames to show "done" before the next step starts. */
const NEXT_AFTER = 60;

export class LessonActivity {
  /**
   * @param {import('../App.js').App} app
   * @param {import('./Training.js').Training} training
   * @param {{ index: number }} which
   */
  constructor(app, training, which) {
    this.app = app;
    this.training = training;
    this.index = Math.max(0, Math.min(LESSONS.length - 1, which.index));
    this.runner = new LessonRunner(app.sim, LESSONS[this.index]);
    /** Frames until the next step's start position, or -1. */
    this.nextIn = -1;
    /** @type {HTMLElement | null} */
    this.panel = null;
    /** @type {HTMLElement | null} */
    this.status = null;
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (this.app.ui.querySelector('.modal')) return;
      if (e.code === 'BracketRight') this.go(this.index + 1);
      else if (e.code === 'BracketLeft') this.go(this.index - 1);
      else return;
      e.preventDefault();
    };
  }

  get lesson() {
    return LESSONS[this.index];
  }

  mount() {
    window.addEventListener('keydown', this.onKey);
    this.render();
    this.restart();
  }

  unmount() {
    window.removeEventListener('keydown', this.onKey);
    this.panel?.remove();
  }

  /** The current step from its start position, with its count reset. */
  restart() {
    const t = this.training;
    this.runner.restartStep();
    t.host.setState(this.runner.startState(t.host.config.chars, t.host.config.stage));
    t.meter.reset();
    t.inputs.reset();
    this.nextIn = -1;
    this.render();
  }

  /** @param {number} index */
  go(index) {
    if (index < 0 || index >= LESSONS.length) return;
    this.index = index;
    this.runner = new LessonRunner(this.app.sim, LESSONS[index]);
    this.app.click('menu');
    this.restart();
  }

  /** @param {number} bits */
  p1Input(bits) {
    return bits;
  }

  /**
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @param {number} _p1Bits
   */
  dummyInput(s, _p1Bits) {
    return this.runner.dummyInput(s);
  }

  /** @param {import('../../engine/sim/types.js').MatchState} s */
  observe(s) {
    if (this.nextIn > 0 && --this.nextIn === 0) {
      // The next step begins from its own start position.
      const t = this.training;
      t.host.setState(this.runner.startState(t.host.config.chars, t.host.config.stage));
      this.render();
      return;
    }
    const change = this.runner.observe(s);
    if (!change) return;
    if (change === 'step') {
      this.app.sfx.play('confirm');
      this.nextIn = NEXT_AFTER;
      this.render();
      this.say('Done! Next step…');
    } else if (change === 'done') {
      markDone('lessons', this.lesson.id);
      this.app.sfx.play('confirm');
      this.render();
      this.say(this.index < LESSONS.length - 1 ? `Lesson complete! Press ] (or Next lesson) for “${LESSONS[this.index + 1].name}”.` : 'Tutorial complete! Try the combo trials next (pause menu → Back to training).');
    } else if (change === 'reset') {
      this.render();
      this.say('A hit got through: the count starts over.');
    } else {
      this.render();
    }
  }

  /** @param {string} text */
  say(text) {
    if (this.status) this.status.textContent = text;
  }

  render() {
    const sim = this.app.sim;
    const k = keyLabels(this.app.settings.controls);
    const moves = sim.characters[this.training.host.config.chars[0]].moves;
    const c = { ...k, move: (/** @type {string} */ id) => k.move(moves[id], sim.motions) };
    const r = this.runner;
    const done = loadProgress().lessons;
    const steps = this.lesson.steps.map((st, i) => {
      const finished = r.done || i < r.stepIndex;
      const current = !r.done && i === r.stepIndex;
      return h('li', { class: `${finished ? 'done' : ''} ${current ? 'next' : ''}` },
        h('div', { class: 'coach-step-head' }, h('span', { class: 'coach-tick', 'aria-hidden': 'true' }, finished ? '✓' : String(i + 1)), h('strong', {}, st.goal),
          current && st.count > 1 ? h('span', { class: 'coach-count' }, ` ${r.count} / ${st.count}`) : null),
        current ? h('p', { class: 'coach-text' }, st.text(c)) : null);
    });
    const keepStatus = this.status?.textContent ?? '';
    this.status = h('p', { class: 'coach-status', 'aria-live': 'polite' }, keepStatus);
    const btn = (/** @type {string} */ label, /** @type {string} */ title, /** @type {() => void} */ fn, disabled = false) =>
      h('button', { class: 'btn small', title, tabindex: '-1', disabled, onclick: (/** @type {Event} */ e) => { /** @type {HTMLElement} */ (e.currentTarget).blur(); fn(); } }, label);
    const panel = h('aside', { class: 'coach', 'aria-label': 'Tutorial lesson' },
      h('p', { class: 'coach-kicker' }, `Tutorial · Lesson ${this.index + 1} of ${LESSONS.length}`, done[this.lesson.id] ? ' ✓' : ''),
      h('h2', {}, this.lesson.name),
      h('ol', { class: 'coach-steps' }, ...steps),
      this.status,
      h('div', { class: 'coach-buttons' },
        btn('◀ Prev', 'Previous lesson ([)', () => this.go(this.index - 1), this.index === 0),
        btn('Restart step', 'This step from the start (R)', () => this.restart()),
        btn(r.done ? 'Next lesson ▶' : 'Skip ▶', 'Next lesson (])', () => this.go(this.index + 1), this.index === LESSONS.length - 1)));
    if (this.panel) this.panel.replaceWith(panel);
    else this.app.ui.append(panel);
    this.panel = panel;
  }
}
