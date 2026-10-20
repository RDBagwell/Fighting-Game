/**
 * Replays: the list of recent replays on this device, and the viewer.
 *
 * The viewer plays a replay by stepping the simulation with the recorded
 * inputs from the match's starting state. It saves a snapshot every three
 * seconds when it loads the replay (re-simulating a whole match takes a
 * few tens of milliseconds), so seeking is: load the nearest snapshot
 * before the target, then step forward to it. Training mode's overlays
 * (hitboxes, the frame meter, both players' inputs) work in replays too.
 */
import { h, focusFirst } from '../ui/dom.js';
import { FightRenderer } from '../render/FightRenderer.js';
import { Effects } from '../render/effects.js';
import { Hud, outlined } from '../hud/Hud.js';
import { saveState, loadState } from '../../engine/sim/state.js';
import { FrameMeter } from '../training/FrameMeter.js';
import { InputHistory } from '../training/InputHistory.js';
import { drawBoxes, drawLegend } from '../training/overlays.js';
import { WIDTH } from '../../engine/render/Screen.js';
import { drawBackdrop } from './backdrop.js';
import { SOUNDS } from './match.js';
import { TitleScene } from './title.js';
import { decodeReplay, encodeReplay, initialState, listReplays, deleteReplay } from '../replay/replays.js';

/** Snapshot every 3 seconds of play. */
const SNAPSHOT_EVERY = 180;
/** A replay this short fits in a link. */
const MAX_URL_CHARS = 6000;
const SPEEDS = [1, 0.5, 0.25, 2];

/**
 * @param {string} text
 * @param {string} name
 */
function download(text, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** @param {string} encoded */
export function replayLink(encoded) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = `replay=${encoded}`;
  return u.toString();
}

export class ReplayListScene {
  /** @param {import('../App.js').App} app */
  constructor(app) {
    this.app = app;
    this.name = 'replays';
    this.time = 0;
  }

  enter() {
    const app = this.app;
    const message = h('p', { class: 'fine', 'aria-live': 'polite' });
    const list = h('div', { class: 'replay-list' });
    const open = (/** @type {string} */ text) => {
      try {
        app.setScene(new ReplayViewerScene(app, decodeReplay(text, app.sim)));
      } catch (err) {
        message.textContent = /** @type {Error} */ (err).message;
      }
    };
    const refresh = () => {
      const items = listReplays();
      list.replaceChildren(...(items.length ? items.map((r) => {
        const minutes = r.frames / 3600;
        const title = `${r.names[0]} vs ${r.names[1]} · ${r.mode} · ${minutes >= 1 ? `${minutes.toFixed(1)} min` : `${Math.round(r.frames / 60)} s`}`;
        return h('div', { class: 'replay-item' },
          h('span', {}, h('strong', {}, title), h('small', {}, new Date(r.date).toLocaleString())),
          h('button', { class: 'btn small', onclick: () => open(r.data) }, 'Watch'),
          h('button', { class: 'btn small', onclick: () => download(r.data, `dusk-duel-${r.date.slice(0, 19).replace(/[:T]/g, '-')}.replay.txt`) }, 'Download'),
          r.data.length <= MAX_URL_CHARS ? h('button', { class: 'btn small', onclick: (/** @type {Event} */ e) => { navigator.clipboard?.writeText(replayLink(r.data)); /** @type {HTMLElement} */ (e.currentTarget).textContent = 'Copied'; } }, 'Copy link') : null,
          h('button', { class: 'btn small', onclick: () => { deleteReplay(r.id); refresh(); } }, 'Delete'));
      }) : [h('p', {}, 'No replays yet. Every match you finish (against the CPU, local, online or in the lab) is saved here, on this device only.')]));
    };
    refresh();
    const file = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: '.txt,text/plain', 'aria-label': 'Load a replay file', onchange: async () => {
      const f = file.files?.[0];
      if (!f) return;
      if (f.size > 2_000_000) {
        message.textContent = 'That file is too big to be a replay.';
        return;
      }
      open(await f.text());
    } }));
    const screen = h('div', { class: 'screen menu-active' },
      h('h2', {}, 'Replays'),
      h('p', { class: 'fine' }, 'A replay is the match’s starting point plus both players’ inputs: the deterministic simulation plays it back exactly. Kept on this device (the last 12), never uploaded.'),
      list,
      h('label', { class: 'row' }, h('span', {}, 'Load a replay file'), file),
      message,
      h('nav', { class: 'menu' }, h('button', { class: 'btn', 'data-back': true, onclick: () => app.setScene(new TitleScene(app)) }, 'Back')));
    app.ui.append(screen);
    focusFirst(screen);
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} dt */
  render(ctx, dt) {
    this.time += dt;
    drawBackdrop(this.app, ctx, this.time, ['mack', 'kenji'], 0.65);
  }
}

export class ReplayViewerScene {
  /**
   * A viewer for a replay given as text (a shared link): falls back to the
   * replay list with the error if it doesn't validate.
   * @param {import('../App.js').App} app
   * @param {string} text
   */
  static fromText(app, text) {
    try {
      return new ReplayViewerScene(app, decodeReplay(text, app.sim));
    } catch (err) {
      const list = new ReplayListScene(app);
      const enter = list.enter.bind(list);
      list.enter = () => {
        enter();
        app.ui.querySelector('.fine[aria-live]')?.append(/** @type {Error} */ (err).message);
      };
      return list;
    }
  }

  /**
   * @param {import('../App.js').App} app
   * @param {import('../replay/replays.js').Replay} replay
   */
  constructor(app, replay) {
    this.app = app;
    this.replay = replay;
    this.name = 'replay';
    this.renderer = new FightRenderer(/** @type {NonNullable<typeof app.assets>} */ (app.assets), app.sim);
    this.effects = new Effects();
    this.hud = new Hud();
    this.meter = new FrameMeter(app.sim);
    this.inputs = new InputHistory();
    this.show = { boxes: false, meter: true, inputs: true };
    this.playing = true;
    this.speed = 0;
    this.carry = 0;
    // Snapshots for seeking: one every SNAPSHOT_EVERY frames.
    /** @type {import('../../engine/sim/types.js').MatchState[]} */
    this.snapshots = [];
    const s = initialState(app.sim, replay);
    for (let i = 0; i < replay.inputs.length; i++) {
      if (i % SNAPSHOT_EVERY === 0) this.snapshots.push(saveState(s));
      app.sim.step(s, replay.inputs[i]);
    }
    this.final = s;
    this.state = loadState(this.snapshots[0]);
    /** @type {HTMLInputElement | null} */
    this.seekBar = null;
  }

  get frames() {
    return this.replay.inputs.length;
  }

  enter() {
    const tb = (/** @type {string} */ label, /** @type {string} */ title, /** @type {() => void} */ fn) =>
      h('button', { class: 'tbtn', title, 'aria-label': title, tabindex: '-1', onclick: (/** @type {Event} */ e) => { fn(); /** @type {HTMLElement} */ (e.currentTarget).blur(); this.refresh(); } }, label);
    this.seekBar = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: 0, max: this.frames, value: 0, step: 1, class: 'seek', 'aria-label': 'Seek',
      oninput: () => this.seek(Number(this.seekBar?.value ?? 0)) }));
    this.bar = h('div', { class: 'training-bar replay-bar', role: 'toolbar', 'aria-label': 'Replay controls' },
      tb('Pause', 'Play / pause (P)', () => (this.playing = !this.playing)),
      tb('Step', 'One frame forward (N)', () => this.stepOne()),
      tb('Back', 'One frame back (B)', () => this.seek(this.state.frame - 1)),
      tb('1×', 'Speed (T)', () => (this.speed = (this.speed + 1) % SPEEDS.length)),
      tb('Boxes', 'Hitboxes (1)', () => (this.show.boxes = !this.show.boxes)),
      tb('Meter', 'Frame meter (2)', () => (this.show.meter = !this.show.meter)),
      tb('Inputs', 'Input display (3)', () => (this.show.inputs = !this.show.inputs)),
      tb('Share', 'Download this replay, or copy a link if it is short', () => this.share()),
      tb('Exit', 'Back to the replay list', () => this.app.setScene(new ReplayListScene(this.app))),
      this.seekBar);
    this.app.ui.append(this.bar);
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      const map = /** @type {Record<string, () => void>} */ ({
        KeyP: () => (this.playing = !this.playing),
        KeyN: () => this.stepOne(),
        KeyB: () => this.seek(this.state.frame - 1),
        KeyT: () => (this.speed = (this.speed + 1) % SPEEDS.length),
        Digit1: () => (this.show.boxes = !this.show.boxes),
        Digit2: () => (this.show.meter = !this.show.meter),
        Digit3: () => (this.show.inputs = !this.show.inputs),
      });
      const fn = map[e.code];
      if (fn) {
        e.preventDefault();
        fn();
        this.refresh();
      }
    };
    window.addEventListener('keydown', this.onKey);
    this.refresh();
  }

  exit() {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
  }

  refresh() {
    const bar = this.bar;
    if (!bar) return;
    const buttons = bar.querySelectorAll('button');
    buttons[0].textContent = this.playing ? 'Pause' : 'Play';
    buttons[3].textContent = ['1×', '½×', '¼×', '2×'][this.speed];
    buttons[4].classList.toggle('on', this.show.boxes);
    buttons[5].classList.toggle('on', this.show.meter);
    buttons[6].classList.toggle('on', this.show.inputs);
  }

  share() {
    const text = encodeReplay(this.replay);
    download(text, `dusk-duel-${this.replay.header.date.slice(0, 19).replace(/[:T]/g, '-')}.replay.txt`);
    if (text.length <= MAX_URL_CHARS) navigator.clipboard?.writeText(replayLink(text));
  }

  /** One frame forward, with sound, effects and the overlays' records. */
  stepOne() {
    const s = this.state;
    if (s.frame >= this.frames) {
      this.playing = false;
      return;
    }
    const frozen = s.freeze > 0;
    this.app.sim.step(s, this.replay.inputs[s.frame]);
    this.effects.onEvents(s.events, s);
    for (const e of s.events) {
      const sound = SOUNDS[e.type];
      if (sound) this.app.sfx.play(sound, e.strength);
    }
    this.effects.update();
    this.meter.record(s, frozen);
    if (!frozen) this.inputs.record(s, this.app.sim.motions);
  }

  /**
   * Jumps to a frame: the nearest snapshot before it, then forward.
   * @param {number} frame
   */
  seek(frame) {
    const target = Math.max(0, Math.min(this.frames, Math.round(frame)));
    const snap = this.snapshots[Math.floor(target / SNAPSHOT_EVERY)];
    this.state = loadState(snap);
    // Rebuild the last couple of seconds of the overlays' history on the way.
    this.meter.reset();
    this.inputs.reset();
    this.effects.clear();
    while (this.state.frame < target) {
      const s = this.state;
      const frozen = s.freeze > 0;
      this.app.sim.step(s, this.replay.inputs[s.frame]);
      if (target - s.frame < 120) {
        this.meter.record(s, frozen);
        if (!frozen) this.inputs.record(s, this.app.sim.motions);
      }
    }
    this.playing = false;
    this.refresh();
  }

  update() {
    this.app.input.endFrame();
    if (!this.playing) return;
    this.carry += SPEEDS[this.speed];
    while (this.carry >= 1) {
      this.carry -= 1;
      this.stepOne();
    }
    if (this.seekBar && this.state.frame % 6 === 0) this.seekBar.value = String(this.state.frame);
  }

  /** @param {import('../../engine/input/InputManager.js').MenuAction} action */
  onMenu(action) {
    if (action === 'back') this.app.setScene(new ReplayListScene(this.app));
    return true;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    const s = this.state;
    const h0 = this.replay.header;
    this.renderer.draw(ctx, s, {
      dt: this.playing ? dt : 0,
      reducedMotion: this.app.settings.reducedMotion,
      effects: this.effects,
      overlay: (c, camX) => {
        if (this.show.boxes) drawBoxes(c, this.app.sim, s, camX);
      },
      hud: (c) => {
        this.hud.draw(c, s, { names: h0.names, tags: ['P1', 'P2'], characters: this.app.sim.characters, roundsToWin: this.app.sim.config.roundsToWin });
        if (this.show.meter) this.meter.draw(c, 50);
        if (this.show.boxes) drawLegend(c, WIDTH - 142, 92);
        if (this.show.inputs) {
          this.inputs.draw(c, 0, 4, 160);
          this.inputs.draw(c, 1, WIDTH - 4, 160);
        }
        const secs = (n) => `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}`;
        outlined(c, `REPLAY · ${h0.mode} · frame ${s.frame} / ${this.frames} · ${secs(s.frame)} / ${secs(this.frames)}${this.playing ? '' : ' · paused'}`, WIDTH / 2, 140, { size: 10, align: 'center', color: '#c7f4ff' });
      },
    });
  }
}
