/**
 * The title screen: the game's name over the animated stage, and the main
 * menu.
 */
import { h, focusFirst } from '../ui/dom.js';
import { drawBackdrop } from './backdrop.js';
import { openSettings, openCredits, openMoveList, openHowToPlay } from './menus.js';
import { SelectScene } from './select.js';

export class TitleScene {
  /** @param {import('../App.js').App} app */
  constructor(app) {
    this.app = app;
    this.name = 'title';
    this.time = 0;
  }

  enter() {
    const app = this.app;
    /** @param {'cpu'|'versus'|'training'} mode */
    const go = (mode) => {
      app.click('confirm');
      app.setScene(new SelectScene(app, mode));
    };
    const screen = h('div', { class: 'screen title menu-active' },
      h('div', { class: 'title-block' },
        h('h1', { class: 'logo' }, 'Dusk ', h('span', {}, 'Duel')),
        h('p', { class: 'tagline' }, 'A 2D fighting game on a deterministic engine, with real frame data and a training mode.')),
      h('nav', { class: 'menu', 'aria-label': 'Main menu' },
        h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => go('cpu') }, 'Versus CPU'),
        h('button', { class: 'btn', onclick: () => go('versus') }, 'Versus (2 players)'),
        h('button', { class: 'btn', onclick: () => go('training') }, 'Training mode'),
        h('button', { class: 'btn', onclick: () => openMoveList(app) }, 'Move list'),
        h('button', { class: 'btn', onclick: () => openHowToPlay(app) }, 'How to play'),
        h('button', { class: 'btn', onclick: () => openSettings(app) }, 'Settings'),
        h('button', { class: 'btn', onclick: () => openCredits(app) }, 'Credits')),
      h('p', { class: 'footer' }, 'Pixel art / character assets by Luiz Melo · Stage and sound made in code'));
    app.ui.append(screen);
    focusFirst(screen);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    this.time += dt;
    drawBackdrop(this.app, ctx, this.time, ['mack', 'kenji'], 0.45);
  }
}
