/**
 * Background music: one looping track at a time, faded in and out.
 *
 * Tracks are optional files (public/music/<name>.ogg, docs/AUDIO.md). The
 * build lists which ones exist, so a missing track is never requested:
 * the game is simply quiet there. Like the sound effects, music starts only
 * after a user gesture (`unlock`).
 */

const FADE_MS = 600;

export class Music {
  /**
   * @param {Record<string, string | null>} tracks  Track name → URL, or null if absent.
   */
  constructor(tracks) {
    this.tracks = tracks;
    this.volume = 0.5;
    this.muted = false;
    this.unlocked = false;
    /** The track the game wants now (even before unlock). */
    this.wanted = /** @type {string | null} */ (null);
    /** @type {{ name: string, el: HTMLAudioElement } | null} */
    this.current = null;
    /** @type {Set<HTMLAudioElement>} */
    this.fading = new Set();
  }

  /** The tracks that exist. */
  available() {
    return Object.keys(this.tracks).filter((k) => this.tracks[k]);
  }

  /** Call from a user gesture: starts whatever track is wanted. */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.wanted) this.play(this.wanted);
  }

  /**
   * Switches to a track (or to silence with null). Asking for the track
   * already playing does nothing, so it carries on across scenes.
   * @param {string | null} name
   */
  play(name) {
    this.wanted = name;
    if (!this.unlocked || typeof Audio === 'undefined') return;
    const url = name ? this.tracks[name] : null;
    if (this.current?.name === name && url) return;
    if (this.current) this.fadeOut(this.current.el);
    this.current = null;
    if (!url || !name) return;
    const el = new Audio(url);
    el.loop = true;
    el.volume = 0;
    el.play().catch(() => {
      // Autoplay refused or the file failed: stay quiet.
    });
    this.current = { name, el };
    this.fade(el, this.level());
  }

  level() {
    return this.muted ? 0 : this.volume * 0.7;
  }

  /** Applies a volume or mute change at once. */
  applyVolume() {
    if (this.current) this.current.el.volume = this.level();
  }

  /** @param {HTMLAudioElement} el */
  fadeOut(el) {
    this.fading.add(el);
    this.fade(el, 0, () => {
      el.pause();
      el.removeAttribute('src');
      this.fading.delete(el);
    });
  }

  /**
   * @param {HTMLAudioElement} el
   * @param {number} to
   * @param {() => void} [done]
   */
  fade(el, to, done) {
    const from = el.volume;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / FADE_MS);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t < 1) setTimeout(step, 30);
      else done?.();
    };
    step();
  }
}
