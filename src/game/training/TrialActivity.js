/**
 * A combo trial, played in training mode: the panel listing the steps
 * (each with how to do it on the keyboard and controller), progress as
 * each step lands, a demonstration that plays the trial's own inputs, and
 * an automatic reset after each attempt.
 *
 * It plugs into Training through four hooks: the start state, player 1's
 * input (during the demonstration), the dummy's input (standing still),
 * and a look at the state after every step.
 */
import { h } from '../ui/dom.js';
import { howTo } from '../ui/howTo.js';
import { TRIALS } from '../data/trials.js';
import { TrialTracker, trialStartState } from './TrialTracker.js';
import { parseScript, scriptBits } from '../../engine/input/script.js';
import { loadProgress, markDone } from './progress.js';

/** Frames after an attempt ends before the fighters go back to the start. */
const RESET_AFTER = 50;

export class TrialActivity {
  /**
   * @param {import('../App.js').App} app
   * @param {import('./Training.js').Training} training
   * @param {{ char: string, index: number }} which
   */
  constructor(app, training, which) {
    this.app = app;
    this.training = training;
    this.char = which.char;
    this.list = TRIALS[which.char];
    this.index = Math.max(0, Math.min(this.list.length - 1, which.index));
    this.trial = this.list[this.index];
    this.tracker = new TrialTracker(this.trial);
    /** The demonstration's remaining inputs, or null when the player has control. */
    /** @type {Array<{ dir: number, buttons: number }> | null} */
    this.demo = null;
    this.demoFacing = 1;
    /** The current attempt is the demonstration (it doesn't count). */
    this.watching = false;
    /** Frames until the automatic reset, or -1. */
    this.resetIn = -1;
    /** @type {HTMLElement | null} */
    this.panel = null;
    /** @type {HTMLElement | null} */
    this.status = null;
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (this.app.ui.querySelector('.modal')) return;
      if (e.code === 'KeyG') this.demonstrate();
      else if (e.code === 'BracketRight') this.go(this.index + 1);
      else if (e.code === 'BracketLeft') this.go(this.index - 1);
      else return;
      e.preventDefault();
    };
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

  /** Back to the start position, ready for an attempt. */
  restart() {
    const t = this.training;
    t.host.setState(trialStartState(this.app.sim, t.host.config.chars, this.trial, { stage: t.host.config.stage }));
    t.meter.reset();
    t.inputs.reset();
    this.tracker.reset();
    this.resetIn = -1;
    this.watching = false;
    this.refresh();
  }

  /** Plays the trial's inputs for the player, from the start position. */
  demonstrate() {
    this.restart();
    this.demo = parseScript(this.trial.demo);
    this.watching = true;
    this.demoFacing = this.training.host.getState().fighters[0].facing;
    this.say('Watch: the demonstration plays the inputs for you.');
  }

  /** @param {number} index */
  go(index) {
    if (index < 0 || index >= this.list.length) return;
    this.index = index;
    this.trial = this.list[index];
    this.tracker = new TrialTracker(this.trial);
    this.demo = null;
    this.render();
    this.restart();
    this.app.click('menu');
  }

  /** @param {number} bits */
  p1Input(bits) {
    if (!this.demo) return bits;
    const step = this.demo.shift();
    if (!this.demo.length) this.demo = null;
    return step ? scriptBits(step, this.demoFacing) : 0;
  }

  /**
   * The dummy stands still and takes the combo.
   * @param {import('../../engine/sim/types.js').MatchState} _s
   * @param {number} _p1Bits
   */
  dummyInput(_s, _p1Bits) {
    return 0;
  }

  /** @param {import('../../engine/sim/types.js').MatchState} s */
  observe(s) {
    if (this.resetIn > 0 && --this.resetIn === 0) {
      this.restart();
      return;
    }
    const change = this.tracker.observe(s);
    if (!change) return;
    if (change === 'done') {
      if (!this.watching) {
        markDone('trials', this.trial.id);
        this.app.sfx.play('confirm');
        this.say(this.index < this.list.length - 1 ? 'Trial complete! Press ] (or the Next button) for the next one.' : 'Trial complete! That was the last one for this character.');
      } else {
        this.say('That’s the whole combo. Now you try (R resets).');
      }
      this.resetIn = RESET_AFTER * 2;
    } else if (change === 'dropped' && !this.watching) {
      const at = this.tracker.droppedAt ?? 0;
      const next = this.trial.steps[at];
      this.say(at > 0 && next
        ? `Dropped after step ${at}. Do ${this.moveName(next)} sooner, while the previous hit is still connecting.`
        : 'Dropped. Try again from the first step.');
      this.resetIn = RESET_AFTER;
    }
    this.refresh();
  }

  /** @param {string} id */
  moveName(id) {
    return this.app.sim.characters[this.char].moves[id]?.name ?? id;
  }

  /** @param {string} text */
  say(text) {
    if (this.status) this.status.textContent = text;
  }

  render() {
    this.panel?.remove();
    const sim = this.app.sim;
    const done = loadProgress().trials;
    const ch = sim.characters[this.char];
    const steps = this.trial.steps.map((id, i) => {
      const mv = ch.moves[id];
      const how = howTo(mv, sim.motions, this.app.settings.controls);
      return h('li', { 'data-step': i },
        h('div', { class: 'coach-step-head' }, h('span', { class: 'coach-tick', 'aria-hidden': 'true' }), h('strong', {}, mv.name), ' ', h('span', { class: 'coach-arrows' }, how.arrows)),
        h('div', { class: 'coach-how' }, h('span', { class: 'how-label' }, 'Keys '), how.keyboard),
        h('div', { class: 'coach-how' }, h('span', { class: 'how-label' }, 'Pad '), how.pad),
        this.trial.stepNotes?.[i] ? h('div', { class: 'coach-note' }, this.trial.stepNotes[i]) : null);
    });
    this.status = h('p', { class: 'coach-status', 'aria-live': 'polite' }, done[this.trial.id] ? 'Completed before. Do it again any time.' : 'Your turn.');
    const btn = (/** @type {string} */ label, /** @type {string} */ title, /** @type {() => void} */ fn, disabled = false) =>
      h('button', { class: 'btn small', title, tabindex: '-1', disabled, onclick: (/** @type {Event} */ e) => { /** @type {HTMLElement} */ (e.currentTarget).blur(); fn(); } }, label);
    this.panel = h('aside', { class: 'coach', 'aria-label': 'Combo trial' },
      h('p', { class: 'coach-kicker' }, `${ch.name} · Combo trial ${this.index + 1} of ${this.list.length}`, done[this.trial.id] ? ' ✓' : ''),
      h('h2', {}, this.trial.name),
      h('ol', { class: 'coach-steps' }, ...steps),
      h('p', { class: 'coach-tip' }, this.trial.tip),
      this.status,
      h('div', { class: 'coach-buttons' },
        btn('◀ Prev', 'Previous trial ([)', () => this.go(this.index - 1), this.index === 0),
        btn('Demonstrate', 'Watch it done (G)', () => this.demonstrate()),
        btn('Reset', 'Back to the start (R)', () => { this.demo = null; this.restart(); }),
        btn('Next ▶', 'Next trial (])', () => this.go(this.index + 1), this.index === this.list.length - 1)),
      h('p', { class: 'fine' }, 'Facing left? Swap left and right. Easy specials count too.'));
    this.app.ui.append(this.panel);
    this.refresh();
  }

  /** Ticks the steps done in the current attempt. */
  refresh() {
    if (!this.panel) return;
    const done = this.tracker.done ? this.trial.steps.length : this.tracker.progress;
    this.panel.querySelectorAll('li[data-step]').forEach((li) => {
      const i = Number(/** @type {HTMLElement} */ (li).dataset.step);
      li.classList.toggle('done', i < done);
      li.classList.toggle('next', i === done && !this.tracker.done);
      const tick = li.querySelector('.coach-tick');
      if (tick) tick.textContent = i < done ? '✓' : String(i + 1);
    });
  }
}
