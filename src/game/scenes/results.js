/**
 * The results screen: who won, and what next.
 */
import { h, focusFirst } from '../ui/dom.js';
import { drawBackdrop } from './backdrop.js';
import { VsScene } from './vs.js';
import { SelectScene } from './select.js';
import { TitleScene } from './title.js';

export class ResultsScene {
  /**
   * @param {import('../App.js').App} app
   * @param {import('./select.js').MatchConfig} config
   * @param {number} winner  0, 1, or 2 for a draw
   * @param {[number, number]} wins
   */
  constructor(app, config, winner, wins) {
    this.app = app;
    this.config = config;
    this.winner = winner;
    this.wins = wins;
    this.name = 'results';
    this.time = 0;
  }

  enter() {
    const app = this.app;
    const names = this.config.chars.map((c) => app.sim.characters[c].name);
    const who = this.config.mode === 'cpu' ? ['You', 'The CPU'] : ['Player 1', 'Player 2'];
    const headline = this.winner === 2 ? 'Draw game' : `${who[this.winner]} win${this.winner === 0 && this.config.mode === 'cpu' ? '' : 's'}!`;
    const sub = this.winner === 2 ? `${names[0]} and ${names[1]} split the rounds.` : `${names[this.winner]} takes the match ${Math.max(...this.wins)}–${Math.min(...this.wins)}.`;
    const go = (/** @type {'rematch'|'select'|'title'} */ where) => {
      app.click('confirm');
      if (where === 'rematch') app.setScene(new VsScene(app, this.config));
      else if (where === 'select') app.setScene(new SelectScene(app, this.config.mode, this.config));
      else app.setScene(new TitleScene(app));
    };
    const screen = h('div', { class: 'screen results menu-active' },
      h('h2', { class: 'headline' }, headline),
      h('p', {}, sub),
      h('nav', { class: 'menu' },
        h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => go('rematch') }, 'Rematch'),
        h('button', { class: 'btn', onclick: () => go('select') }, 'Character select'),
        h('button', { class: 'btn', 'data-back': true, onclick: () => go('title') }, 'Title screen')));
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
