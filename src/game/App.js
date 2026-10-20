/**
 * The application: owns the canvas, the loop, input, sound, settings and
 * loaded art, and switches between scenes (title, character select, VS,
 * match, results). Each scene gets `update()` once per 60 Hz step and
 * `render()` once per displayed frame.
 */
import { Screen, WIDTH, HEIGHT } from '../engine/render/Screen.js';
import { FixedStepLoop } from '../engine/loop/FixedStepLoop.js';
import { InputManager } from '../engine/input/InputManager.js';
import { TouchControls } from '../engine/input/TouchControls.js';
import { Sfx } from '../engine/audio/Sfx.js';
import { Music } from '../engine/audio/Music.js';
import music from 'virtual:music';
import { Captions } from './hud/Captions.js';
import { EVENT_SOUNDS, trackFor } from './audio.js';
import { SpriteSheet } from '../engine/render/sprites.js';
import { loadImages, loadOptionalImage } from '../engine/assets/loader.js';
import licensedArt from 'virtual:licensed-art';
import { sim } from './sim.js';
import { ALL_FILES } from './data/assets.js';
import { loadSettings, saveSettings } from './settings.js';
import { buildDuskShrine } from './stage/duskShrine.js';
import { moveFocus, activateFocused } from './ui/dom.js';
import { TitleScene } from './scenes/title.js';

/**
 * @typedef {object} Scene
 * @property {() => void} enter
 * @property {() => void} [exit]
 * @property {() => void} [update]
 * @property {(ctx: CanvasRenderingContext2D, dt: number) => void} render
 * @property {(action: import('../engine/input/InputManager.js').MenuAction) => boolean | void} [onMenu]  Gamepad/keyboard menu action; return true if handled.
 * @property {() => void} [onPause]
 * @property {boolean} [touch]  Show the touch controls in this scene.
 * @property {string} [name]
 */

export class App {
  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.root = root;
    this.canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('canvas'));
    this.ui = /** @type {HTMLElement} */ (root.querySelector('#ui'));
    this.screen = new Screen(this.canvas, root);
    this.sim = sim;
    this.settings = loadSettings();
    this.input = new InputManager(window);
    this.input.bindings = this.settings.controls;
    this.sfx = new Sfx();
    this.sfx.setVolume(this.settings.volume);
    this.sfx.muted = this.settings.muted;
    this.music = new Music(music);
    this.captions = new Captions(root);
    this.applyAudio();
    this.touch = new TouchControls(root, { easy: this.settings.easySpecials, onPause: () => this.scene?.onPause?.() });
    this.input.touch = this.touch;
    this.isTouchDevice = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    /** @type {Scene | null} */
    this.scene = null;
    /** @type {import('./render/FightRenderer.js').RenderAssets | null} */
    this.assets = null;
    /** Errors are collected for the smoke tests (window.__game). */
    this.errors = /** @type {string[]} */ ([]);

    this.loop = new FixedStepLoop({
      update: () => this.scene?.update?.(),
      render: (dt) => this.render(dt),
    });
    this.loop.pauseWhenHidden(document);

    // Audio may only start after a user gesture.
    const unlock = () => {
      this.sfx.unlock();
      this.music.unlock();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    // Keyboard menu navigation (arrow keys between buttons; Escape = back/pause).
    window.addEventListener('keydown', (e) => {
      if (this.input.capture) return;
      const map = /** @type {Record<string, import('../engine/input/InputManager.js').MenuAction>} */ ({
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Escape: 'back',
      });
      const action = map[e.code];
      if (!action) return;
      if (action === 'back') {
        e.preventDefault();
        this.menu('back');
        return;
      }
      // Arrow keys move between menu buttons only when a menu is showing.
      if (this.ui.querySelector('.menu-active')) {
        e.preventDefault();
        this.menu(action);
      }
    });
  }

  /**
   * @param {(done: number, total: number) => void} onProgress
   */
  async load(onProgress) {
    const images = await loadImages(ALL_FILES, onProgress);
    /** @type {Record<string, Record<string, SpriteSheet>>} */
    const sheets = {};
    for (const ch of Object.values(sim.characters)) {
      sheets[ch.id] = {};
      for (const name of Object.keys(ch.sprites.sheets)) {
        const img = /** @type {HTMLImageElement} */ (images.get(`${ch.sprites.dir}${name}.png`));
        sheets[ch.id][name] = new SpriteSheet(img, ch.sprites.frameSize);
      }
    }
    const [background, shop] = await Promise.all([loadOptionalImage(licensedArt.oakWoodsBackground), loadOptionalImage(licensedArt.oakWoodsShop)]);
    this.assets = { sheets, shrine: buildDuskShrine(sim.config.stage.width), licensed: { background, shop } };
  }

  /**
   * @param {Scene} [first]  Where to start (an invite link opens the online lobby).
   */
  start(first) {
    this.setScene(first ?? new TitleScene(this));
    this.loop.start();
  }

  /**
   * @param {Scene} scene
   */
  setScene(scene) {
    this.scene?.exit?.();
    this.ui.replaceChildren();
    this.loop.setFrozen(false);
    this.loop.timeScale = 1;
    this.scene = scene;
    scene.enter();
    this.music.play(trackFor(scene.name));
    this.updateTouch();
  }

  /**
   * Plays the sounds for a frame's simulation events, and captions them
   * when captions are on. Every scene that shows a fight presents its
   * events through here.
   * @param {import('../engine/sim/types.js').SimEvent[]} events
   */
  presentSounds(events) {
    for (const e of events) {
      const sound = EVENT_SOUNDS[e.type];
      if (sound) this.sfx.play(sound, e.strength);
    }
    this.captions.show(events);
  }

  applyAudio() {
    this.music.volume = this.settings.musicVolume;
    this.music.muted = this.settings.muted;
    this.music.applyVolume();
    this.captions.enabled = this.settings.captions;
  }

  updateTouch() {
    const mode = this.settings.touch;
    const show = !!this.scene?.touch && (mode === 'on' || (mode === 'auto' && this.isTouchDevice));
    this.touch.setVisible(show);
    this.touch.setEasy(this.settings.easySpecials);
    this.root.classList.toggle('touch-on', show);
  }

  /**
   * A menu action from the keyboard or a gamepad.
   * @param {import('../engine/input/InputManager.js').MenuAction} action
   */
  menu(action) {
    if (this.scene?.onMenu?.(action)) return;
    if (action === 'select' || action === 'pause') action = 'back';
    // The topmost open menu (a modal over a screen) gets the action.
    const menus = this.ui.querySelectorAll('.menu-active');
    const top = /** @type {HTMLElement | undefined} */ (menus[menus.length - 1]);
    if (!top) return;
    if (action === 'confirm') activateFocused();
    else if (action === 'back') /** @type {HTMLElement | null} */ (top.querySelector('[data-back]'))?.click();
    else if (!top.contains(document.activeElement)) /** @type {HTMLElement | null} */ (top.querySelector('button'))?.focus();
    else moveFocus(top, action);
  }

  /**
   * @param {number} dt
   */
  render(dt) {
    this.input.poll();
    for (const { action } of this.input.menuPresses()) {
      if (action === 'pause') this.scene?.onPause?.();
      else this.menu(action);
    }
    const ctx = this.screen.begin();
    if (this.scene) this.scene.render(ctx, Math.min(dt, 0.1));
    else {
      ctx.fillStyle = '#140d1c';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  /** Saves settings and applies the ones that take effect at once. */
  saveSettings() {
    saveSettings(this.settings);
    this.input.bindings = this.settings.controls;
    this.sfx.setVolume(this.settings.volume);
    this.sfx.muted = this.settings.muted;
    this.sfx.applyVolume();
    this.applyAudio();
    this.updateTouch();
  }

  /** @param {import('../engine/audio/Sfx.js').SoundName} name */
  click(name = 'menu') {
    this.sfx.play(name);
  }
}
