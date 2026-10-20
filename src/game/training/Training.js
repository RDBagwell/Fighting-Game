/**
 * Training mode: the dummy, the overlays, frame stepping and slow motion,
 * and the panel and toolbar that control them. The match scene asks it for
 * player 2's input and calls it after every step; it draws on top of the
 * fight. It never writes to the match state: resetting the position or
 * switching infinite meter builds a new state, the way loading one would.
 */
import { h, focusFirst } from '../ui/dom.js';
import { Dummy } from './Dummy.js';
import { FrameMeter, FRAME_STYLE } from './FrameMeter.js';
import { InputHistory } from './InputHistory.js';
import { drawBoxes, drawLegend, drawFrameData } from './overlays.js';
import { outlined } from '../hud/Hud.js';
import { WIDTH } from '../../engine/render/Screen.js';
import { SUB } from '../../engine/sim/fixed.js';
import { saveState, loadState } from '../../engine/sim/state.js';

/**
 * A coloured legend key. Set through the CSSOM, not a style attribute, so
 * the page's CSP (style-src 'self') allows it.
 * @param {string} color
 * @param {string} mark
 */
function swatch(color, mark) {
  const el = h('i', {}, mark);
  el.style.background = color;
  return el;
}
import { openModal, openMoveList } from '../scenes/menus.js';

/** One line each, for someone who has never played a fighting game. */
export const WHAT_THIS_SHOWS = {
  boxes: 'Where each attack can hit (red, hatched) and where each fighter can be hit (green). A hit lands only when red touches green.',
  frameMeter: 'Every frame of both fighters side by side: why one attack beat another, and who could act first afterwards.',
  frameData: 'How many frames a move takes to come out, stays out and recovers, and how far ahead (+) or behind (−) you are when it hits or is blocked.',
  inputs: 'Exactly what the game received each frame, and which special-move motions it recognised.',
  block: 'Whether a string of attacks has gaps (block after the first hit) and what is safe when blocked (block all).',
  record: 'Record the dummy doing something, then practise your answer to it on repeat.',
  step: 'Freeze the fight and advance it one frame at a time, to see exactly when boxes appear and disappear.',
  reset: 'Back to the middle or into a corner, where pushback works differently.',
  movelist: 'Every move’s numbers, computed from the same data the game runs on.',
};

const SPEEDS = [1, 0.5, 0.25];

export class Training {
  /**
   * @param {import('../App.js').App} app
   * @param {{ getState: () => import('../../engine/sim/types.js').MatchState, setState: (s: import('../../engine/sim/types.js').MatchState) => void, config: import('../scenes/select.js').MatchConfig, openPauseMenu: () => void }} host
   */
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.sim = app.sim;
    this.dummy = new Dummy(app.sim);
    this.meter = new FrameMeter(app.sim);
    this.inputs = new InputHistory();
    this.show = { ...app.settings.training };
    this.speed = 0;
    /** @type {'mid'|'left'|'right'} */
    this.position = 'mid';
    /** The move player 1 did last, for the frame data display. */
    this.lastMove = '';
    /** @type {HTMLElement | null} */
    this.toolbar = null;
    this.onKey = (/** @type {KeyboardEvent} */ e) => this.key(e);
  }

  mount() {
    const tb = (/** @type {string} */ label, /** @type {string} */ title, /** @type {() => void} */ fn, /** @type {string} */ id) =>
      h('button', { class: 'tbtn', title, 'aria-label': title, 'data-tb': id, tabindex: '-1', onclick: (/** @type {Event} */ e) => { fn(); /** @type {HTMLElement} */ (e.currentTarget).blur(); this.refreshToolbar(); } }, label);
    this.toolbar = h('div', { class: 'training-bar', role: 'toolbar', 'aria-label': 'Training controls' },
      tb('Pause', 'Pause / play (P)', () => this.togglePause(), 'pause'),
      tb('Step', 'Advance one frame (N)', () => this.step(), 'step'),
      tb('1×', 'Slow motion: 1×, ½×, ¼× (T)', () => this.cycleSpeed(), 'speed'),
      tb('Reset', 'Reset position (R; gamepad View/Share)', () => this.reset(this.position), 'reset'),
      tb('Rec', 'Record the dummy: you control it (O)', () => this.toggleRecord(), 'rec'),
      tb('Replay', 'Play the recording on a loop (Y)', () => this.togglePlayback(), 'play'),
      tb('Menu', 'Training menu (Tab)', () => this.openPanel(), 'menu'),
      tb('Exit', 'Pause menu: restart, character select, quit (Esc)', () => this.host.openPauseMenu(), 'exit'));
    this.app.ui.append(this.toolbar);
    // The toolbar's Exit replaces the touch pause button, which would cover the frame meter.
    this.app.root.classList.add('training-on');
    window.addEventListener('keydown', this.onKey);
    this.refreshToolbar();
  }

  unmount() {
    window.removeEventListener('keydown', this.onKey);
    this.toolbar?.remove();
    this.app.root.classList.remove('training-on');
    this.app.loop.setFrozen(false);
    this.app.loop.timeScale = 1;
  }

  /** @param {KeyboardEvent} e */
  key(e) {
    if (this.app.input.capture || this.app.ui.querySelector('.modal')) return;
    const actions = /** @type {Record<string, () => void>} */ ({
      KeyP: () => this.togglePause(),
      KeyN: () => this.step(),
      KeyT: () => this.cycleSpeed(),
      KeyR: () => this.reset(this.position),
      KeyO: () => this.toggleRecord(),
      KeyY: () => this.togglePlayback(),
      Tab: () => this.openPanel(),
      Digit1: () => (this.show.boxes = !this.show.boxes),
      Digit2: () => (this.show.frameMeter = !this.show.frameMeter),
      Digit3: () => (this.show.inputs = !this.show.inputs),
      Digit4: () => (this.show.frameData = !this.show.frameData),
    });
    const fn = actions[e.code];
    if (!fn) return;
    e.preventDefault();
    fn();
    this.refreshToolbar();
  }

  refreshToolbar() {
    const tb = this.toolbar;
    if (!tb) return;
    const set = (/** @type {string} */ id, /** @type {string} */ text, /** @type {boolean} */ on) => {
      const b = /** @type {HTMLElement | null} */ (tb.querySelector(`[data-tb="${id}"]`));
      if (!b) return;
      b.textContent = text;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    };
    set('pause', this.app.loop.frozen ? 'Play' : 'Pause', this.app.loop.frozen);
    set('speed', ['1×', '½×', '¼×'][this.speed], this.speed > 0);
    set('rec', this.dummy.mode === 'recording' ? 'Stop rec' : 'Rec', this.dummy.mode === 'recording');
    set('play', this.dummy.mode === 'playing' ? 'Stop' : 'Replay', this.dummy.mode === 'playing');
    const step = /** @type {HTMLButtonElement | null} */ (tb.querySelector('[data-tb="step"]'));
    if (step) step.disabled = !this.app.loop.frozen;
  }

  togglePause() {
    this.app.loop.setFrozen(!this.app.loop.frozen);
  }

  step() {
    if (!this.app.loop.frozen) this.app.loop.setFrozen(true);
    else this.app.loop.stepOnce();
  }

  cycleSpeed() {
    this.speed = (this.speed + 1) % SPEEDS.length;
    this.app.loop.timeScale = SPEEDS[this.speed];
  }

  toggleRecord() {
    if (this.dummy.mode === 'recording') this.dummy.stopRecording();
    else {
      this.dummy.stopPlayback();
      this.dummy.startRecording();
    }
  }

  togglePlayback() {
    if (this.dummy.mode === 'playing') this.dummy.stopPlayback();
    else {
      if (this.dummy.mode === 'recording') this.dummy.stopRecording();
      this.dummy.startPlayback();
    }
  }

  /**
   * A fresh state with the fighters in the middle or a corner (player 1
   * on the open side, so the dummy is the one in the corner).
   * @param {'mid'|'left'|'right'} where
   */
  reset(where) {
    this.position = where;
    const old = this.host.getState();
    const s = this.sim.createMatch({ chars: this.host.config.chars, training: true, infiniteMeter: old.options.infiniteMeter, stage: old.options.stage, seed: 1 });
    const wall = this.sim.config.stage.wall;
    const width = this.sim.config.stage.width;
    if (where === 'left') {
      s.fighters[1].x = (wall + 20) * SUB;
      s.fighters[0].x = (wall + 110) * SUB;
    } else if (where === 'right') {
      s.fighters[1].x = (width - wall - 20) * SUB;
      s.fighters[0].x = (width - wall - 110) * SUB;
    }
    s.fighters[0].facing = s.fighters[0].x < s.fighters[1].x ? 1 : -1;
    s.fighters[1].facing = s.fighters[0].facing === 1 ? -1 : 1;
    this.host.setState(s);
    this.meter.reset();
    this.inputs.reset();
    this.app.sfx.play('back');
  }

  /** @param {boolean} on */
  setInfiniteMeter(on) {
    const next = loadState(saveState(this.host.getState()));
    next.options.infiniteMeter = on;
    this.host.setState(next);
  }

  /**
   * Player 2's input this frame.
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @param {number} p1Bits
   */
  dummyInput(s, p1Bits) {
    return this.dummy.think(s, p1Bits);
  }

  /**
   * Player 1's input this frame (none while their controller drives the dummy).
   * @param {number} bits
   */
  p1Input(bits) {
    return this.dummy.mode === 'recording' ? 0 : bits;
  }

  /**
   * After every step.
   * @param {import('../../engine/sim/types.js').MatchState} s
   * @param {boolean} frozen
   */
  record(s, frozen) {
    this.meter.record(s, frozen);
    if (!frozen) this.inputs.record(s, this.sim.motions);
    const p1 = s.fighters[0];
    if (p1.state === 'move') this.lastMove = p1.move;
    if (this.dummy.mode === 'recording' && this.toolbar && this.dummy.recording.length % 30 === 0) this.refreshToolbar();
  }

  /**
   * Drawn over the fighters, in stage space.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX
   */
  drawOverlay(ctx, camX) {
    if (this.show.boxes) drawBoxes(ctx, this.sim, this.host.getState(), camX);
  }

  /**
   * Drawn over everything, in screen space.
   * @param {CanvasRenderingContext2D} ctx
   */
  drawPanels(ctx) {
    const s = this.host.getState();
    if (this.show.frameMeter) this.meter.draw(ctx, 50);
    if (this.show.frameData) drawFrameData(ctx, this.sim, s.fighters[0].char, this.lastMove, 8, 92, '');
    if (this.show.boxes) drawLegend(ctx, WIDTH - 142, 92);
    if (this.show.inputs) {
      this.inputs.draw(ctx, 0, 4, 160);
      this.inputs.draw(ctx, 1, WIDTH - 4, 160);
    }
    const status = [];
    if (this.app.loop.frozen) status.push('PAUSED: N = next frame');
    if (this.speed > 0) status.push(`${['', '½', '¼'][this.speed]} SPEED`);
    if (this.dummy.mode === 'recording') status.push(`● RECORDING DUMMY ${Math.ceil(this.dummy.recording.length / 60)}s (you control it)`);
    if (this.dummy.mode === 'playing') status.push('▶ PLAYBACK');
    if (status.length) outlined(ctx, status.join('   '), WIDTH / 2, 150, { size: 11, align: 'center', color: this.dummy.mode === 'recording' ? '#ff8a8a' : '#c7f4ff' });
  }

  /** The training menu. */
  openPanel() {
    const app = this.app;
    const wasFrozen = app.loop.frozen;
    app.loop.setFrozen(true);
    /**
     * @param {string} label
     * @param {Array<[string, string]>} options
     * @param {() => string} get
     * @param {(v: string) => void} set
     * @param {string} what
     */
    const radios = (label, options, get, set, what) => {
      const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
      const refresh = () => group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === get())));
      for (const [v, text] of options) group.append(h('button', { class: 'btn seg-btn', role: 'radio', 'data-v': v, onclick: () => { set(v); refresh(); app.click('menu'); } }, text));
      refresh();
      return h('div', { class: 'row col' }, h('span', { class: 'label' }, label), group, h('small', { class: 'what' }, h('b', {}, 'What this shows: '), what));
    };
    /**
     * @param {string} label
     * @param {() => boolean} get
     * @param {(v: boolean) => void} set
     * @param {string} [what]
     */
    const toggle = (label, get, set, what) => {
      const input = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: get(), onchange: () => set(input.checked) }));
      return h('label', { class: 'row check' }, input, h('span', {}, label, what ? h('small', { class: 'what' }, h('b', {}, 'What this shows: '), what) : null));
    };
    const recStatus = h('span', { class: 'fine' });
    const refreshRec = () => {
      recStatus.textContent = this.dummy.recording.length ? `Recording: ${(this.dummy.recording.length / 60).toFixed(1)} s` : 'Nothing recorded yet.';
    };
    refreshRec();
    const legend = h('div', { class: 'legend' }, ...Object.values(FRAME_STYLE).map((st) => h('span', {}, swatch(st.color, st.mark), st.label)));

    const body = h('div', { class: 'training-panel' },
      h('section', {}, h('h3', {}, 'Dummy'),
        radios('Stance', [['stand', 'Stand'], ['crouch', 'Crouch'], ['jump', 'Jump']], () => this.dummy.stance, (v) => (this.dummy.stance = /** @type {any} */ (v)), 'Practise against a standing, crouching or jumping opponent (crouching has a smaller hurtbox).'),
        radios('Block', [['none', 'None'], ['all', 'All'], ['after-first', 'After first hit']], () => this.dummy.block, (v) => (this.dummy.block = /** @type {any} */ (v)), WHAT_THIS_SHOWS.block),
        toggle('Escape throws', () => this.dummy.techThrows, (v) => (this.dummy.techThrows = v)),
        h('div', { class: 'row col' }, h('span', { class: 'label' }, 'Record and play back'),
          h('div', { class: 'seg' },
            h('button', { class: 'btn seg-btn', onclick: () => { this.toggleRecord(); refreshRec(); this.refreshToolbar(); close(); } }, this.dummy.mode === 'recording' ? 'Stop recording' : 'Record (you control the dummy)'),
            h('button', { class: 'btn seg-btn', onclick: () => { this.togglePlayback(); this.refreshToolbar(); close(); } }, this.dummy.mode === 'playing' ? 'Stop playback' : 'Play back on a loop')),
          recStatus,
          h('small', { class: 'what' }, h('b', {}, 'What this shows: '), WHAT_THIS_SHOWS.record))),
      h('section', {}, h('h3', {}, 'Position'),
        h('div', { class: 'seg' },
          h('button', { class: 'btn seg-btn', onclick: () => { this.reset('mid'); close(); } }, 'Midscreen'),
          h('button', { class: 'btn seg-btn', onclick: () => { this.reset('left'); close(); } }, 'Left corner'),
          h('button', { class: 'btn seg-btn', onclick: () => { this.reset('right'); close(); } }, 'Right corner')),
        h('small', { class: 'what' }, h('b', {}, 'What this shows: '), WHAT_THIS_SHOWS.reset)),
      h('section', {}, h('h3', {}, 'Display'),
        toggle('Hitboxes and hurtboxes (1)', () => this.show.boxes, (v) => (this.show.boxes = v), WHAT_THIS_SHOWS.boxes),
        toggle('Frame meter (2)', () => this.show.frameMeter, (v) => (this.show.frameMeter = v), WHAT_THIS_SHOWS.frameMeter),
        toggle('Input display (3)', () => this.show.inputs, (v) => (this.show.inputs = v), WHAT_THIS_SHOWS.inputs),
        toggle('Frame data (4)', () => this.show.frameData, (v) => (this.show.frameData = v), WHAT_THIS_SHOWS.frameData),
        h('p', { class: 'fine' }, 'Frame meter colours (each also has a letter):'), legend),
      h('section', {}, h('h3', {}, 'Time'),
        h('div', { class: 'seg' },
          h('button', { class: 'btn seg-btn', onclick: () => { this.speed = 2; this.cycleSpeed(); close(); } }, 'Normal speed'),
          h('button', { class: 'btn seg-btn', onclick: () => { this.speed = 0; this.cycleSpeed(); close(); } }, 'Half speed'),
          h('button', { class: 'btn seg-btn', onclick: () => { this.speed = 1; this.cycleSpeed(); close(); } }, 'Quarter speed')),
        h('small', { class: 'what' }, h('b', {}, 'What this shows: '), WHAT_THIS_SHOWS.step, ' Pause with P, then N advances one frame.'),
        toggle('Infinite super meter', () => this.host.getState().options.infiniteMeter, (v) => this.setInfiniteMeter(v)),
        h('button', { class: 'btn', onclick: () => openMoveList(app, this.host.config.chars[0]) }, 'Move list'),
        h('small', { class: 'what' }, h('b', {}, 'What this shows: '), WHAT_THIS_SHOWS.movelist)),
      h('section', { class: 'span' }, h('h3', {}, 'Keyboard shortcuts'),
        h('p', { class: 'fine' }, 'P pause · N next frame · T speed · R reset · O record · Y replay · 1–4 overlays · Tab this menu · Esc pause menu. Gamepad: View/Share resets.')));
    const { close } = openModal(app, 'Training menu', body, () => {
      app.loop.setFrozen(wasFrozen);
      this.refreshToolbar();
    }, 'wide');
    focusFirst(body);
  }
}
