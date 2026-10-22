/**
 * Sound effects synthesised with Web Audio: no audio files to download or
 * license (the same approach as Emberwake). Each sound is a few
 * oscillators and filtered noise with short envelopes.
 *
 * Browsers only allow audio after a user gesture, so the context is
 * created on the first key press, click or touch (`unlock`). Before that,
 * `play` does nothing.
 *
 * Sounds are triggered by the simulation's events after a step; the sound
 * system never touches the state.
 */

/** @typedef {'hit'|'block'|'swing'|'throw'|'tech'|'ko'|'super'|'round'|'fight'|'jump'|'land'|'dash'|'projectile'|'clash'|'menu'|'confirm'|'back'|'knockdown'|'special'|'parry'|'guardCancel'|'burst'} SoundName */

export class Sfx {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    /** @type {GainNode | null} */
    this.master = null;
    this.volume = 0.7;
    this.muted = false;
    /** @type {AudioBuffer | null} */
    this.noise = null;
  }

  /** Creates or resumes the audio context; call from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** @param {number} v  0..1 */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  applyVolume() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.6;
  }

  /**
   * @param {number} freq
   * @param {number} endFreq
   * @param {number} time
   * @param {number} gain
   * @param {OscillatorType} type
   * @param {number} [delay]
   */
  tone(freq, endFreq, time, gain, type, delay = 0) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + time);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + time);
    osc.connect(g).connect(/** @type {GainNode} */ (this.master));
    osc.start(t);
    osc.stop(t + time + 0.02);
  }

  /**
   * Filtered noise.
   * @param {number} time
   * @param {number} gain
   * @param {BiquadFilterType} filter
   * @param {number} freq
   * @param {number} [endFreq]
   * @param {number} [q]
   * @param {number} [delay]
   */
  hiss(time, gain, filter, freq, endFreq = freq, q = 1, delay = 0) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + time);
    src.connect(f).connect(g).connect(/** @type {GainNode} */ (this.master));
    src.start(t, Math.random() * 0.5);
    src.stop(t + time + 0.02);
  }

  /**
   * @param {SoundName} name
   * @param {number} [strength]  Hit-stop of the hit: bigger hits sound bigger.
   */
  play(name, strength = 10) {
    if (!this.ctx || !this.master || this.muted || this.ctx.state !== 'running') return;
    const s = Math.max(0.5, Math.min(1.6, strength / 10));
    switch (name) {
      case 'hit':
        this.tone(140 * s, 45, 0.12 + 0.05 * s, 0.7, 'sine');
        this.hiss(0.08 + 0.04 * s, 0.5 * s, 'bandpass', 1800, 700, 0.8);
        this.hiss(0.05, 0.25, 'highpass', 4000);
        break;
      case 'block':
        this.tone(1100, 900, 0.05, 0.18, 'square');
        this.tone(2300, 1800, 0.08, 0.12, 'triangle');
        this.hiss(0.06, 0.25, 'highpass', 3000);
        break;
      case 'swing':
        this.hiss(0.14, 0.18, 'bandpass', 500, 2600, 2.5);
        break;
      case 'special':
        this.hiss(0.2, 0.2, 'bandpass', 400, 3000, 3);
        break;
      case 'throw':
        this.tone(90, 40, 0.25, 0.7, 'sine', 0.02);
        this.hiss(0.2, 0.3, 'lowpass', 900, 200);
        break;
      case 'tech':
        this.tone(1500, 1400, 0.05, 0.2, 'square');
        this.tone(1900, 1800, 0.06, 0.18, 'square', 0.06);
        break;
      case 'parry':
        // A bright, ringing deflection: higher and cleaner than a block.
        this.tone(2400, 2350, 0.35, 0.18, 'sine');
        this.tone(3600, 3550, 0.25, 0.1, 'sine', 0.01);
        this.hiss(0.05, 0.2, 'highpass', 5000);
        break;
      case 'guardCancel':
        this.tone(300, 900, 0.15, 0.2, 'sawtooth');
        this.hiss(0.15, 0.25, 'bandpass', 600, 2400, 2);
        break;
      case 'burst':
        this.tone(90, 400, 0.35, 0.35, 'sawtooth');
        this.hiss(0.45, 0.35, 'bandpass', 300, 4000, 1.5);
        break;
      case 'knockdown':
        this.tone(80, 35, 0.3, 0.6, 'sine');
        this.hiss(0.25, 0.25, 'lowpass', 600, 150);
        break;
      case 'ko':
        this.tone(110, 30, 1.2, 0.8, 'sine');
        this.hiss(0.9, 0.4, 'lowpass', 1200, 80);
        this.tone(55, 30, 1.5, 0.5, 'triangle', 0.05);
        break;
      case 'super':
        this.tone(180, 1400, 0.5, 0.25, 'sawtooth');
        this.hiss(0.6, 0.25, 'bandpass', 800, 6000, 2);
        break;
      case 'round':
        // A temple gong: inharmonic partials with a long decay.
        for (const [f, g] of [[110, 0.4], [237, 0.22], [391, 0.14], [563, 0.08]]) this.tone(f, f * 0.98, 2.2, g, 'sine');
        break;
      case 'fight':
        this.tone(660, 660, 0.12, 0.25, 'triangle');
        this.tone(990, 990, 0.25, 0.25, 'triangle', 0.1);
        break;
      case 'jump':
        this.hiss(0.08, 0.06, 'bandpass', 900, 1500, 1);
        break;
      case 'land':
        this.hiss(0.07, 0.08, 'lowpass', 500, 200);
        break;
      case 'dash':
        this.hiss(0.12, 0.1, 'bandpass', 700, 300, 1.5);
        break;
      case 'projectile':
        this.tone(1600, 900, 0.18, 0.12, 'sine');
        this.hiss(0.15, 0.1, 'bandpass', 2500, 1200, 3);
        break;
      case 'clash':
        this.tone(1800, 1700, 0.3, 0.2, 'triangle');
        this.tone(2700, 2600, 0.25, 0.1, 'sine');
        break;
      case 'menu':
        this.tone(880, 880, 0.04, 0.08, 'square');
        break;
      case 'confirm':
        this.tone(660, 990, 0.09, 0.12, 'square');
        break;
      case 'back':
        this.tone(660, 440, 0.08, 0.1, 'square');
        break;
      default:
        break;
    }
  }
}
