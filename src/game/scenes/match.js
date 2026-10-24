/**
 * A match: versus CPU, local versus, or training. Each 60 Hz step it
 * samples both players' inputs (devices, the CPU or the training dummy),
 * advances the simulation, then turns the step's events into sound and
 * effects. Rendering draws the latest state.
 */
import { h, focusFirst } from '../ui/dom.js';
import { FightRenderer } from '../render/FightRenderer.js';
import { Effects } from '../render/effects.js';
import { Hud } from '../hud/Hud.js';
import { Cpu, DIFFICULTIES } from '../cpu/Cpu.js';
import { Training } from '../training/Training.js';
import { openMoveList, openSettings } from './menus.js';
import { ResultsScene } from './results.js';
import { TitleScene } from './title.js';
import { SelectScene } from './select.js';
import { saveReplay, makeReplay } from '../replay/replays.js';
import { LearnScene } from './learn.js';
import { arcadeMatchOver, ArcadeSelectScene } from './arcade.js';
import { feedbackButton } from '../feedback.js';

/** Frames after the match is decided before the results screen. */
const RESULTS_DELAY = 150;

/** Simulation events to sounds. */
export class MatchScene {
  /**
   * @param {import('../App.js').App} app
   * @param {import('./select.js').MatchConfig} config
   */
  constructor(app, config) {
    this.app = app;
    this.config = config;
    this.name = 'match';
    this.touch = true;
    this.paused = false;
    /** @type {HTMLElement | null} */
    this.pauseMenu = null;
    const training = config.mode === 'training';
    this.seed = ((Math.random() * 2 ** 31) | 0) >>> 0;
    this.state = app.sim.createMatch({ chars: config.chars, training, stage: config.stage, seed: this.seed });
    /** Both players' inputs, frame by frame: the replay (not recorded in training). */
    /** @type {Array<[number, number]>} */
    this.log = [];
    this.renderer = new FightRenderer(/** @type {NonNullable<typeof app.assets>} */ (app.assets), app.sim);
    this.effects = new Effects();
    this.hud = new Hud();
    const level = config.level ?? DIFFICULTIES[config.cpu];
    this.cpu = config.mode === 'cpu' || config.mode === 'arcade' ? new Cpu(1, level, app.sim, (Math.random() * 2 ** 31) | 0) : null;
    this.training = training
      ? new Training(app, { getState: () => this.state, setState: (s) => (this.state = s), config, openPauseMenu: () => this.onPause() })
      : null;
    const names = config.chars.map((c) => app.sim.characters[c].name);
    this.names = /** @type {[string, string]} */ (names);
    this.tags = /** @type {[string, string]} */ ({ cpu: ['P1', `CPU ${level.name}`], arcade: ['P1', `CPU ${level.name}`], versus: ['P1', 'P2'], training: ['YOU', 'DUMMY'] }[config.mode]);
  }

  enter() {
    this.training?.mount();
    // A pause button for mouse users (touch has its own).
    this.app.ui.append(h('button', { class: 'pause-btn', 'aria-label': 'Pause', tabindex: '-1', onclick: (/** @type {Event} */ e) => { /** @type {HTMLElement} */ (e.currentTarget).blur(); this.onPause(); } }, 'II'));
  }

  exit() {
    this.training?.unmount();
  }

  /** Which devices drive which player. */
  devices() {
    if (this.config.mode !== 'versus') {
      return /** @type {import('../../engine/input/InputManager.js').Device[][]} */ ([['kbA', 'kbB', 'pad0', 'pad1', 'touch'], []]);
    }
    const swap = this.app.settings.swapPads;
    return /** @type {import('../../engine/input/InputManager.js').Device[][]} */ ([
      ['kbA', swap ? 'pad1' : 'pad0', 'touch'],
      ['kbB', swap ? 'pad0' : 'pad1'],
    ]);
  }

  update() {
    if (this.paused) return;
    const s = this.state;
    const [d1, d2] = this.devices();
    const raw1 = this.app.input.sample(d1);
    let p1 = raw1;
    let p2 = 0;
    if (this.config.mode === 'versus') p2 = this.app.input.sample(d2);
    else if (this.cpu) p2 = this.cpu.think(s);
    else if (this.training) {
      p2 = this.training.dummyInput(s, raw1);
      p1 = this.training.p1Input(raw1);
    }
    this.app.input.endFrame();
    const frozen = s.freeze > 0;
    this.app.sim.step(s, [p1, p2]);
    if (!this.training) this.log.push([p1, p2]);

    this.effects.reducedMotion = this.app.settings.reducedMotion;
    this.effects.onEvents(s.events, s);
    this.app.presentSounds(s.events);
    this.effects.update();
    this.training?.record(s, frozen);

    if (s.phase === 'intro' && s.phaseFrame === 1) this.hud.reset();
    if (s.phase === 'matchEnd' && s.phaseFrame >= RESULTS_DELAY) {
      /** @type {import('../replay/replays.js').Replay | undefined} */
      let replay;
      if (!this.training) {
        try {
          replay = makeReplay(this.app.sim, { chars: this.config.chars, seed: this.seed, stage: this.config.stage }, this.log, { mode: this.config.mode === 'versus' ? 'versus' : 'cpu', names: this.names });
          saveReplay(replay);
        } catch {
          // Never block the results on storage.
        }
      }
      if (this.config.arcade) arcadeMatchOver(this.app, this.config, s.matchWinner, [s.wins[0], s.wins[1]], s.frame, replay);
      else this.app.setScene(new ResultsScene(this.app, this.config, s.matchWinner, [s.wins[0], s.wins[1]], replay));
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    const s = this.state;
    const training = this.training;
    this.renderer.draw(ctx, s, {
      dt: this.paused || this.app.loop.frozen ? 0 : dt * this.app.loop.timeScale,
      reducedMotion: this.app.settings.reducedMotion,
      effects: this.effects,
      overlay: training ? (c, camX) => training.drawOverlay(c, camX) : undefined,
      hud: (c) => {
        this.hud.draw(c, s, { names: this.names, tags: this.tags, characters: this.app.sim.characters, roundsToWin: this.app.sim.config.roundsToWin });
        training?.drawPanels(c);
      },
    });
  }

  /** @param {import('../../engine/input/InputManager.js').MenuAction} action */
  onMenu(action) {
    if (this.app.ui.querySelector('.modal') || this.pauseMenu) return false;
    if (action === 'back') this.onPause();
    else if (action === 'select' && this.training) this.training.reset(this.training.position);
    // Otherwise the buttons belong to the fight, not to menus.
    return true;
  }

  onPause() {
    if (this.app.ui.querySelector('.modal')) return;
    if (this.pauseMenu) return this.resume();
    this.paused = true;
    this.app.sfx.play('menu');
    const app = this.app;
    const quit = (/** @type {'title'|'select'} */ where) => {
      app.setScene(where === 'title' ? new TitleScene(app) : new SelectScene(app, this.config.mode, this.config));
    };
    this.pauseMenu = h('div', { class: 'screen pause menu-active', role: 'dialog', 'aria-label': 'Paused' },
      h('h2', {}, 'Paused'),
      h('nav', { class: 'menu' },
        h('button', { class: 'btn primary', 'data-back': true, onclick: () => this.resume() }, 'Resume'),
        this.training ? h('button', { class: 'btn', onclick: () => { this.resume(); this.training?.openPanel(); } }, 'Training menu') : null,
        h('button', { class: 'btn', onclick: () => openMoveList(app, this.config.chars[0]) }, 'Move list'),
        h('button', { class: 'btn', onclick: () => openSettings(app) }, 'Settings'),
        feedbackButton(app, () => this.feedback()),
        // In arcade, losing costs a continue: no free restarts.
        this.config.arcade ? null : h('button', { class: 'btn', onclick: () => { this.resume(); app.setScene(new MatchScene(app, this.config)); } }, this.training ? 'Restart training' : 'Restart match'),
        this.config.arcade
          ? h('button', { class: 'btn', onclick: () => app.setScene(new ArcadeSelectScene(app)) }, 'Arcade menu (the run is saved)')
          : this.config.trial || this.config.lesson
          ? h('button', { class: 'btn', onclick: () => app.setScene(new LearnScene(app, this.config.trial ? 'trials' : 'lessons', this.config.trial?.char)) }, this.config.trial ? 'Back to combo trials' : 'Back to the tutorial')
          : h('button', { class: 'btn', onclick: () => quit('select') }, 'Character select'),
        h('button', { class: 'btn', onclick: () => quit('title') }, 'Quit to title')));
    app.ui.append(this.pauseMenu);
    focusFirst(this.pauseMenu);
  }

  /** The match so far, for the feedback form. */
  feedback() {
    const s = this.state;
    const level = this.cpu ? this.tags[1].replace(/^CPU /, '') : undefined;
    return {
      mode: this.config.mode, p1: this.names[0], p2: this.names[1], cpu: level,
      result: `In progress, round ${s.round}: ${this.names[0]} ${s.wins[0]}–${s.wins[1]} ${this.names[1]}`,
    };
  }

  resume() {
    this.pauseMenu?.remove();
    this.pauseMenu = null;
    this.paused = false;
  }
}
