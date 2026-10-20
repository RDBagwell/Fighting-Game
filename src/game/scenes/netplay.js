/**
 * A rollback match: online against another player, or the offline rollback
 * lab against the CPU.
 *
 * **The lab** runs the real netcode twice in this browser: your session
 * (player 1) and the CPU's session (player 2), each with its own copy of
 * the game, joined by a simulated network (latency, jitter, loss). Exactly
 * what happens online, with the network under your control, and no second
 * player or server needed.
 *
 * **Online**, there is one session, joined to the other player's browser by
 * a PeerLink (WebRTC, or the server's relay).
 *
 * Either way, each tick: sample input, `session.tick(input)`, present the
 * events it returns (each real event once, even across rollbacks), and draw
 * the session's state. docs/ROLLBACK.md explains the rest.
 */
import { h, focusFirst } from '../ui/dom.js';
import { FightRenderer } from '../render/FightRenderer.js';
import { Effects } from '../render/effects.js';
import { Hud, outlined } from '../hud/Hud.js';
import { Cpu, DIFFICULTIES } from '../cpu/Cpu.js';
import { RollbackSession } from '../../engine/rollback/RollbackSession.js';
import { createLinkedPair, withSimulator } from '../../engine/rollback/transport.js';
import { PRESETS } from '../../engine/rollback/presets.js';
import { SUB } from '../../engine/sim/fixed.js';
import { WIDTH, HEIGHT } from '../../engine/render/Screen.js';
import { LabPanel } from '../online/LabPanel.js';
import { drawRollbackMeter, drawInputTimeline, drawStatsLine, autoInputDelay } from '../online/labOverlay.js';
import { SOUNDS } from './match.js';
import { TitleScene } from './title.js';
import { saveReplay, replayFromSession } from '../replay/replays.js';

const RESULTS_DELAY = 150;
const DEVICES = /** @type {import('../../engine/input/InputManager.js').Device[]} */ (['kbA', 'kbB', 'pad0', 'pad1', 'touch']);

/**
 * @typedef {object} LabOptions
 * @property {'lab'} kind
 * @property {[string, string]} chars
 * @property {'easy'|'normal'|'hard'} cpu
 *
 * @typedef {object} OnlineOptions
 * @property {'online'} kind
 * @property {import('../../../shared/protocol.js').MatchInfo} match
 * @property {0 | 1} seat
 * @property {import('../online/OnlineClient.js').OnlineClient} client
 * @property {import('../online/PeerLink.js').PeerLink} link
 * @property {(winner: number, forfeit: boolean) => void} onEnd
 */

export class NetplayScene {
  /**
   * @param {import('../App.js').App} app
   * @param {LabOptions | OnlineOptions} options
   */
  constructor(app, options) {
    this.app = app;
    this.options = options;
    this.name = options.kind === 'lab' ? 'lab' : 'online-match';
    this.touch = true;
    this.renderer = new FightRenderer(/** @type {NonNullable<typeof app.assets>} */ (app.assets), app.sim);
    this.effects = new Effects();
    this.hud = new Hud();
    this.show = { ghost: true, meter: true, timeline: true, autoDelay: false };
    /** @type {import('../../engine/rollback/NetworkSimulator.js').NetworkConditions} */
    this.conditions = options.kind === 'lab' ? { ...PRESETS.acrossCountry.conditions } : { ...PRESETS.perfect.conditions };
    const now = () => performance.now();

    if (options.kind === 'lab') {
      const match = { chars: options.chars, seed: (Math.random() * 2 ** 31) | 1, stage: 'dusk-shrine' };
      const [ta, tb] = createLinkedPair({ conditions: this.conditions, now });
      this.nets = [ta.net, tb.net];
      this.session = new RollbackSession({ sim: app.sim, state: app.sim.createMatch(match), localSide: 0, transport: ta, now });
      this.remote = new RollbackSession({ sim: app.sim, state: app.sim.createMatch(match), localSide: 1, transport: tb, now });
      this.cpu = new Cpu(1, DIFFICULTIES[options.cpu], app.sim, (Math.random() * 2 ** 31) | 0);
      this.names = /** @type {[string, string]} */ (options.chars.map((c) => app.sim.characters[c].name));
      this.tags = /** @type {[string, string]} */ (['YOU', `CPU ${DIFFICULTIES[options.cpu].name}`]);
      this.matchOptions = match;
    } else {
      const m = options.match;
      const chars = /** @type {[string, string]} */ (m.chars);
      this.transport = withSimulator(options.link, { conditions: this.conditions, now });
      this.session = new RollbackSession({ sim: app.sim, state: app.sim.createMatch({ chars, seed: m.seed, stage: m.stage }), localSide: options.seat, transport: this.transport, now });
      this.remote = null;
      this.cpu = null;
      this.names = /** @type {[string, string]} */ (chars.map((c) => app.sim.characters[c].name));
      this.tags = /** @type {[string, string]} */ (options.seat === 0 ? ['YOU', 'OPPONENT'] : ['OPPONENT', 'YOU']);
      this.matchOptions = { chars, seed: m.seed, stage: m.stage };
    }

    this.panel = new LabPanel(app, {
      title: options.kind === 'lab' ? 'Rollback lab' : 'Rollback lab (online)',
      getConditions: () => this.conditions,
      setConditions: (c) => this.setConditions(c),
      sessions: () => (this.remote ? [this.session, this.remote] : [this.session]),
      show: this.show,
    });
    /** @type {{ snapshot: NonNullable<RollbackSession['lastCorrection']>['predicted'], ticks: number } | null} */
    this.ghost = null;
    this.paused = false;
    this.stalledTicks = 0;
    this.finished = false;
    this.desyncShown = false;
    this.rate = { rollbackFrames: 0, kbUp: 0, kbDown: 0 };
    this.rateMark = { t: performance.now(), resim: 0, up: 0, down: 0 };
    /** @type {HTMLElement | null} */
    this.menu = null;
    /** @type {import('../../../shared/protocol.js').RoomInfo | null} */
    this.room = null;
    this.onRoom = (/** @type {Event} */ e) => {
      this.room = /** @type {CustomEvent} */ (e).detail;
      const r = this.room;
      if (!r || options.kind !== 'online') return;
      if (r.status === 'over' && r.forfeited !== -1 && !this.finished) this.finish(r.forfeited === options.seat ? 1 - options.seat : options.seat, true);
      if (r.status === 'closed' && !this.finished) this.finish(-1, true);
    };
  }

  enter() {
    this.panel.mount(this.options.kind === 'lab');
    this.app.ui.append(h('button', { class: 'pause-btn', 'aria-label': 'Menu', tabindex: '-1', onclick: (/** @type {Event} */ e) => { /** @type {HTMLElement} */ (e.currentTarget).blur(); this.onPause(); } }, 'II'),
      h('button', { class: 'lab-btn', tabindex: '-1', onclick: (/** @type {Event} */ e) => { /** @type {HTMLElement} */ (e.currentTarget).blur(); this.panel.toggle(); } }, 'Rollback lab'));
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this.panel.toggle();
      }
    };
    window.addEventListener('keydown', this.onKey);
    if (this.options.kind === 'online') this.options.client.addEventListener('room', this.onRoom);
  }

  exit() {
    this.panel.unmount();
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    if (this.options.kind === 'online') this.options.client.removeEventListener('room', this.onRoom);
  }

  /** @param {import('../../engine/rollback/NetworkSimulator.js').NetworkConditions} c */
  setConditions(c) {
    this.conditions = c;
    if (this.nets) for (const n of this.nets) n.conditions = { ...c };
    this.transport?.setConditions(c);
  }

  /** The path the packets take, for the badge and the stats. */
  path() {
    if (this.options.kind === 'lab') return 'Simulated network (in this browser)';
    return this.options.link.kind === 'direct' ? 'Direct (WebRTC)' : 'Relay (through the server)';
  }

  update() {
    const app = this.app;
    const raw = app.input.sample(DEVICES);
    app.input.endFrame();
    if (this.finished) return;
    if (this.paused && this.options.kind === 'lab') return;

    const s = this.session;
    if (this.show.autoDelay && s.stats.ticks % 60 === 0 && s.rttMs > 0) {
      const d = autoInputDelay(s.rttMs);
      for (const x of this.remote ? [s, this.remote] : [s]) x.setInputDelay(d);
    }
    const r = s.tick(this.paused ? 0 : raw);
    if (this.remote && this.cpu) this.remote.tick(this.cpu.think(this.remote.state));
    this.stalledTicks = r.stalled ? this.stalledTicks + 1 : 0;

    this.effects.reducedMotion = app.settings.reducedMotion;
    this.effects.onEvents(r.events, s.state);
    for (const e of r.events) {
      const sound = SOUNDS[e.type];
      if (sound) app.sfx.play(sound, e.strength);
    }
    this.effects.update();

    // The ghost: where the prediction had the opponent before the correction.
    const c = s.lastCorrection;
    if (r.rolledBack > 0 && c) {
      const now = s.state.fighters[s.remoteSide];
      const moved = Math.abs(now.x - c.predicted.x) > 2 * SUB || Math.abs(now.y - c.predicted.y) > 2 * SUB || now.state !== c.predicted.state || now.move !== c.predicted.move;
      if (moved) this.ghost = { snapshot: c.predicted, ticks: 30 };
    } else if (this.ghost && --this.ghost.ticks <= 0) this.ghost = null;

    this.updateRates();
    if (s.desync && !this.desyncShown) this.showDesync();
    if (s.state.phase === 'matchEnd' && s.state.phaseFrame >= RESULTS_DELAY && s.confirmedFrame >= s.state.frame - 1) this.finish(s.state.matchWinner, false);
  }

  updateRates() {
    const s = this.session;
    const t = performance.now();
    const dt = (t - this.rateMark.t) / 1000;
    if (dt < 0.5) return;
    const st = this.transport?.stats ?? /** @type {any} */ (s.transport).stats;
    this.rate = {
      rollbackFrames: (s.stats.resimFrames - this.rateMark.resim) / dt,
      kbUp: (st.bytesSent - this.rateMark.up) / dt / 1000,
      kbDown: (st.bytesReceived - this.rateMark.down) / dt / 1000,
    };
    this.rateMark = { t, resim: s.stats.resimFrames, up: st.bytesSent, down: st.bytesReceived };
    const x = s.stats;
    this.panel.setStats([
      ['Round trip', `${Math.round(s.rttMs)} ms`],
      ['Path', this.path()],
      ['Rolled back', `${this.rate.rollbackFrames.toFixed(0)} frames/s`],
      ['Rollbacks', `${x.rollbacks} (longest ${x.longestRollback} frames)`],
      ['Prediction misses', `${x.predictionMisses} of ${x.predictedFrames} guesses`],
      ['Re-simulation cost', `${x.lastResimMs.toFixed(2)} ms (max ${x.maxResimMs.toFixed(2)})`],
      ['Waited for opponent', `${x.stalls} ticks`],
      ['Time-sync skips', `${x.skips}`],
      ['Bandwidth', `${this.rate.kbUp.toFixed(2)} kB/s up, ${this.rate.kbDown.toFixed(2)} down`],
      ['Sounds deduplicated', `${s.presenter.suppressed} repeats skipped, ${s.presenter.late} played late`],
    ]);
  }

  /**
   * @param {number} winner  0, 1, 2 = draw, -1 = no result
   * @param {boolean} forfeit
   */
  finish(winner, forfeit) {
    if (this.finished) return;
    this.finished = true;
    const s = this.session;
    if (!forfeit) {
      try {
        saveReplay(replayFromSession(this.app.sim, s, /** @type {any} */ (this.matchOptions), { mode: this.options.kind === 'lab' ? 'lab' : 'online', names: this.names }));
      } catch {
        // A replay that can't be saved (storage full) never blocks the result.
      }
    }
    if (this.options.kind === 'online') {
      this.options.onEnd(winner, forfeit);
      return;
    }
    const names = this.names;
    const text = winner === 2 ? 'Draw game' : winner === 0 ? 'You win!' : `${names[1]} (CPU) wins`;
    const box = h('div', { class: 'screen results menu-active' },
      h('h2', { class: 'headline' }, text),
      h('p', {}, `${s.stats.rollbacks} rollbacks, ${s.stats.resimFrames} frames re-simulated, longest ${s.stats.longestRollback}. No desync: both copies of the game agreed on every checked frame.`),
      h('nav', { class: 'menu' },
        h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => this.app.setScene(new NetplayScene(this.app, this.options)) }, 'Play again'),
        h('button', { class: 'btn', 'data-back': true, onclick: () => this.app.setScene(new TitleScene(this.app)) }, 'Title screen')));
    this.app.ui.append(box);
    focusFirst(box);
  }

  showDesync() {
    this.desyncShown = true;
    const d = /** @type {NonNullable<RollbackSession['desync']>} */ (this.session.desync);
    const save = () => {
      const blob = new Blob([JSON.stringify(this.session.desyncLog())], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `dusk-duel-desync-frame-${d.frame}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    this.app.ui.append(h('div', { class: 'notice desync', role: 'alert' },
      h('strong', {}, `Desync detected at frame ${d.frame}.`),
      ' The two copies of the game no longer agree. The match can carry on, but the result may differ between you.',
      h('button', { class: 'btn small', onclick: save }, 'Save desync log')));
  }

  onPause() {
    if (this.menu) return this.closeMenu();
    if (this.finished) return;
    this.paused = true;
    const online = this.options.kind === 'online';
    this.menu = h('div', { class: 'screen pause menu-active', role: 'dialog', 'aria-label': 'Menu' },
      h('h2', {}, online ? 'Menu (the match keeps going)' : 'Paused'),
      h('nav', { class: 'menu' },
        h('button', { class: 'btn primary', 'data-back': true, onclick: () => this.closeMenu() }, 'Resume'),
        h('button', { class: 'btn', onclick: () => { this.closeMenu(); this.panel.toggle(true); } }, 'Rollback lab'),
        online
          ? h('button', { class: 'btn', onclick: () => { this.closeMenu(); this.finish(-1, true); /** @type {OnlineOptions} */ (this.options).client.leave(); } }, 'Leave the match (forfeit)')
          : h('button', { class: 'btn', onclick: () => this.app.setScene(new TitleScene(this.app)) }, 'Quit to title')));
    this.app.ui.append(this.menu);
    focusFirst(this.menu);
  }

  closeMenu() {
    this.menu?.remove();
    this.menu = null;
    this.paused = false;
  }

  /** @param {import('../../engine/input/InputManager.js').MenuAction} action */
  onMenu(action) {
    if (this.app.ui.querySelector('.modal') || this.menu || this.finished) return false;
    if (action === 'back') this.onPause();
    return true;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt
   */
  render(ctx, dt) {
    const s = this.session;
    const state = s.state;
    this.renderer.draw(ctx, state, {
      dt,
      reducedMotion: this.app.settings.reducedMotion,
      effects: this.effects,
      overlay: (c, camX) => {
        if (this.show.ghost && this.ghost) this.renderer.drawGhost(c, this.ghost.snapshot, camX, 0.25 + 0.4 * (this.ghost.ticks / 30));
      },
      hud: (c) => {
        this.hud.draw(c, state, { names: this.names, tags: this.tags, characters: this.app.sim.characters, roundsToWin: this.app.sim.config.roundsToWin });
        if (this.show.timeline) drawInputTimeline(c, s, 84);
        if (this.show.meter) drawRollbackMeter(c, s, 124);
        if (!this.panel.open) drawStatsLine(c, s, { path: this.path(), rate: this.rate });
        const badge = this.options.kind === 'lab' ? 'LAB · simulated online' : this.options.link.kind === 'direct' ? 'ONLINE · direct' : 'ONLINE · relay';
        outlined(c, badge, WIDTH / 2, 52, { size: 9, align: 'center', color: '#c7f4ff' });
        if (this.ghost && this.show.ghost) outlined(c, 'Ghost: where the guess had the opponent', WIDTH / 2, HEIGHT - 44, { size: 8, align: 'center', color: '#e7a6ff' });
        if (this.stalledTicks > 20) outlined(c, 'Waiting for your opponent’s inputs…', WIDTH / 2, HEIGHT / 2 + 40, { size: 14, align: 'center', color: '#ffe08a' });
        const r = this.room;
        if (r && r.status === 'paused' && r.pause) {
          const who = this.options.kind === 'online' && r.pause.seat === this.options.seat ? 'You were' : 'Your opponent was';
          outlined(c, `${who} disconnected. Waiting ${Math.ceil(r.pause.forfeitInMs / 1000)} s before a forfeit…`, WIDTH / 2, HEIGHT / 2 + 60, { size: 12, align: 'center', color: '#ffb4a8' });
        }
      },
    });
  }
}
