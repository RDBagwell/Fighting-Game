/**
 * Arcade mode's screens: picking a character (or carrying on a saved
 * run), the screen between fights, the ending, and the clear summary.
 * The ladder itself is src/game/arcade/ladder.js; the fights are ordinary
 * CPU matches (MatchScene) with the ladder's difficulty.
 */
import { h, focusFirst } from '../ui/dom.js';
import { WIDTH, HEIGHT } from '../../engine/render/Screen.js';
import { drawBackdrop, portrait } from './backdrop.js';
import { roster } from '../data/characters/index.js';
import { STAGES } from '../data/stages.js';
import { ARCADE } from '../data/arcade.js';
import {
  LADDER_LENGTH, newRun, nextFight, recordFight, isCleared, loadArcade, saveRun, recordClear, formatTime,
} from '../arcade/ladder.js';
import { VsScene } from './vs.js';
import { TitleScene } from './title.js';

/**
 * The match config for a run's next fight.
 * @param {import('../arcade/ladder.js').Run} run
 * @returns {import('./select.js').MatchConfig}
 */
export function arcadeConfig(run) {
  const next = nextFight(run);
  return { mode: 'arcade', chars: [run.char, next.opponent], cpu: 'normal', level: next.level, stage: next.stage, arcade: { run } };
}

/**
 * Saves the run and goes to its next fight.
 * @param {import('../App.js').App} app
 * @param {import('../arcade/ladder.js').Run} run
 */
function fight(app, run) {
  saveRun(run, roster);
  app.setScene(new VsScene(app, arcadeConfig(run)));
}

export class ArcadeSelectScene {
  /** @param {import('../App.js').App} app */
  constructor(app) {
    this.app = app;
    this.name = 'arcade-select';
    this.time = 0;
    const saved = loadArcade(roster);
    this.run = saved.run;
    this.best = saved.best;
    this.char = this.run?.char ?? roster[0];
  }

  enter() {
    const app = this.app;
    const info = h('p', { class: 'char-info', 'aria-live': 'polite' });
    const cards = h('div', { class: 'cards', role: 'radiogroup', 'aria-label': 'Character' });
    const refresh = () => {
      cards.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === this.char)));
      const ch = app.sim.characters[this.char];
      const best = this.best[this.char];
      const record = best
        ? `Cleared ${best.clears === 1 ? 'once' : `${best.clears} times`}. Best: ${best.continues === 0 ? 'no continues' : `${best.continues} continue${best.continues === 1 ? '' : 's'}`}, ${formatTime(best.frames)}.`
        : 'Not cleared yet.';
      info.replaceChildren(h('strong', {}, `${ch.name}, ${ch.title}`), h('span', { class: 'style' }, record), ch.blurb);
    };
    for (const id of roster) {
      const ch = app.sim.characters[id];
      const cleared = !!this.best[id];
      cards.append(h('button', {
        class: 'card', role: 'radio', 'data-id': id, 'aria-label': `${ch.name} (${ch.style})${cleared ? ', cleared' : ''}`,
        onclick: () => {
          this.char = id;
          app.click('menu');
          refresh();
        },
      }, portrait(app, id), h('span', { class: 'card-name' }, `${cleared ? '✓ ' : ''}${ch.name}`), h('span', { class: 'card-style' }, ch.style)));
    }
    refresh();

    const start = () => {
      app.click('confirm');
      const stages = STAGES.filter((st) => !st.licensed || app.assets?.licensed.background).map((st) => st.id);
      fight(app, newRun(this.char, roster, stages, (Math.random() * 2 ** 31) | 0));
    };
    const run = this.run;
    const carryOn = run
      ? h('section', { class: 'arcade-run' },
        h('p', {}, h('strong', {}, 'Run in progress: '), `${app.sim.characters[run.char].name}, fight ${run.fight + 1} of ${LADDER_LENGTH}, ${run.continues} continue${run.continues === 1 ? '' : 's'} used.`),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => { app.click('confirm'); fight(app, run); } }, 'Continue the run'),
          h('button', { class: 'btn', onclick: () => { app.click('back'); saveRun(null, roster); this.run = null; app.setScene(new ArcadeSelectScene(app)); } }, 'Abandon it')))
      : null;

    const screen = h('div', { class: 'screen select arcade menu-active' },
      h('h2', {}, 'Arcade'),
      h('p', { class: 'fine' }, `Six fights: everyone else, then your rival. The CPU gets tougher each fight, from Easy to Hard. Lose, and you can continue.`),
      carryOn,
      h('section', { class: 'side p1' }, cards, info),
      h('div', { class: 'actions' },
        h('button', { class: `btn${run ? '' : ' primary'}`, 'data-autofocus': !run, onclick: start }, run ? 'Start a new run' : 'Start'),
        h('button', { class: 'btn', 'data-back': true, onclick: () => { app.click('back'); app.setScene(new TitleScene(app)); } }, 'Back')));
    app.ui.append(screen);
    focusFirst(screen);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    this.time += dt;
    drawBackdrop(this.app, ctx, this.time, [this.char], 0.6);
  }
}

/**
 * An arcade match is over: record it, then the ending after the last
 * fight, or the screen between fights.
 * @param {import('../App.js').App} app
 * @param {import('./select.js').MatchConfig} config
 * @param {number} winner  0 (you), 1 (the CPU) or 2 (draw)
 * @param {[number, number]} wins
 * @param {number} frames  How long the match took
 */
export function arcadeMatchOver(app, config, winner, wins, frames) {
  const before = /** @type {NonNullable<typeof config.arcade>} */ (config.arcade).run;
  const run = recordFight(before, { winner, roundsLost: wins[1], frames });
  if (isCleared(run)) {
    app.setScene(new EndingScene(app, run, recordClear(run, roster)));
  } else {
    saveRun(run, roster);
    app.setScene(new ArcadeResultScene(app, config, run, winner, before.fight));
  }
}

/** Between fights: on to the next one, or continue after a loss. */
export class ArcadeResultScene {
  /**
   * @param {import('../App.js').App} app
   * @param {import('./select.js').MatchConfig} config  The match just played
   * @param {import('../arcade/ladder.js').Run} run  The run after it
   * @param {number} winner
   * @param {number} fought  The fight just played, 0-based
   */
  constructor(app, config, run, winner, fought) {
    this.app = app;
    this.config = config;
    this.run = run;
    this.winner = winner;
    this.fought = fought;
    this.name = 'results';
    this.time = 0;
  }

  enter() {
    const app = this.app;
    const run = this.run;
    const opponent = app.sim.characters[this.config.chars[1]].name;
    const quit = () => {
      app.click('back');
      app.setScene(new TitleScene(app));
    };
    /** @type {[string, string, HTMLElement]} */
    let parts;
    if (this.winner === 0) {
      parts = [`Fight ${this.fought + 1} of ${LADDER_LENGTH} cleared`, `${opponent} is down. Next: ${app.sim.characters[run.opponents[run.fight]].name}${run.fight === LADDER_LENGTH - 1 ? ', your rival' : ''}.`,
        h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => { app.click('confirm'); fight(app, run); } }, 'Next fight')];
    } else if (this.winner === 1) {
      parts = ['Continue?', `${opponent} wins this one. Continue to fight again (continues used: ${run.continues}).`,
        h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => { app.click('confirm'); fight(app, run); } }, 'Continue')];
    } else {
      parts = ['Draw game', `A draw with ${opponent}: fight again, no continue needed.`,
        h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => { app.click('confirm'); fight(app, run); } }, 'Fight again')];
    }
    const [headline, sub, primary] = parts;
    const screen = h('div', { class: 'screen results menu-active' },
      h('h2', { class: 'headline' }, headline),
      h('p', {}, sub),
      h('nav', { class: 'menu' },
        primary,
        this.winner === 1
          ? h('button', { class: 'btn', 'data-back': true, onclick: () => { saveRun(null, roster); quit(); } }, 'Give up the run')
          : h('button', { class: 'btn', 'data-back': true, onclick: quit }, 'Save and quit')));
    app.ui.append(screen);
    focusFirst(screen);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    this.time += dt;
    drawBackdrop(this.app, ctx, this.time, this.config.chars, 0.55);
  }
}

/** The light over each ending panel. */
const LIGHT = { dusk: 'rgba(0,0,0,0)', night: 'rgba(10,14,48,0.5)', dawn: 'rgba(255,170,90,0.18)' };

/** The character's ending: captioned panels over the stage. */
export class EndingScene {
  /**
   * @param {import('../App.js').App} app
   * @param {import('../arcade/ladder.js').Run} run
   * @param {{ newBest: boolean, best: import('../arcade/ladder.js').Best }} clear
   */
  constructor(app, run, clear) {
    this.app = app;
    this.run = run;
    this.clear = clear;
    this.name = 'ending';
    this.time = 0;
    this.panel = 0;
    this.panels = ARCADE[run.char].ending;
  }

  enter() {
    this.caption = h('p', { class: 'ending-text', 'aria-live': 'polite' });
    this.next = h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => this.advance() }, 'Next');
    const screen = h('div', { class: 'screen ending menu-active' },
      h('div', { class: 'ending-box' }, this.caption,
        h('div', { class: 'actions' }, this.next,
          h('button', { class: 'btn', 'data-back': true, onclick: () => this.finish() }, 'Skip'))));
    this.app.ui.append(screen);
    this.show();
    focusFirst(screen);
  }

  show() {
    const last = this.panel === this.panels.length - 1;
    /** @type {HTMLElement} */ (this.caption).textContent = this.panels[this.panel].text;
    /** @type {HTMLElement} */ (this.next).textContent = last ? 'The end' : 'Next';
  }

  advance() {
    this.app.click('confirm');
    if (this.panel === this.panels.length - 1) return this.finish();
    this.panel++;
    this.time = 0;
    this.show();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.app.setScene(new ArcadeClearScene(this.app, this.run, this.clear));
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    this.time += dt;
    const p = this.panels[this.panel];
    drawBackdrop(this.app, ctx, this.time, p.cast, 0.15, false);
    ctx.fillStyle = LIGHT[p.light ?? 'dusk'];
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Fade each panel in.
    const fade = this.app.settings.reducedMotion ? 0 : Math.max(0, 1 - this.time * 2);
    if (fade > 0) {
      ctx.fillStyle = `rgba(14,9,22,${fade})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }
}

/** The summary after the ending. */
export class ArcadeClearScene {
  /**
   * @param {import('../App.js').App} app
   * @param {import('../arcade/ladder.js').Run} run
   * @param {{ newBest: boolean, best: import('../arcade/ladder.js').Best }} clear
   */
  constructor(app, run, clear) {
    this.app = app;
    this.run = run;
    this.clear = clear;
    this.name = 'results';
    this.time = 0;
  }

  enter() {
    const app = this.app;
    const run = this.run;
    const name = app.sim.characters[run.char].name;
    const row = (/** @type {string} */ label, /** @type {string} */ value) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, value));
    const screen = h('div', { class: 'screen results menu-active' },
      h('h2', { class: 'headline' }, `${name} clears arcade mode!`),
      this.clear.newBest && this.clear.best.clears > 1 ? h('p', { class: 'new-best' }, 'New best!') : null,
      h('table', { class: 'arcade-summary' },
        row('Fight time', formatTime(run.frames)),
        row('Continues', String(run.continues)),
        row('Rounds lost', String(run.roundsLost)),
        row(`${name}’s clears`, String(this.clear.best.clears))),
      h('nav', { class: 'menu' },
        h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => { app.click('confirm'); app.setScene(new ArcadeSelectScene(app)); } }, 'Arcade again'),
        h('button', { class: 'btn', 'data-back': true, onclick: () => { app.click('back'); app.setScene(new TitleScene(app)); } }, 'Title screen')));
    app.ui.append(screen);
    focusFirst(screen);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    this.time += dt;
    drawBackdrop(this.app, ctx, this.time, [this.run.char], 0.55);
  }
}
