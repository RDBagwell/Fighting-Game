/**
 * The game loop: a fixed 60 Hz simulation, drawn at whatever rate the
 * display runs.
 *
 * Fighting games count in frames: "5 frames of startup" has to mean the
 * same on a 60 Hz laptop, a 120 Hz phone and a 144 Hz monitor. So the
 * simulation always advances in whole steps of 1/60 s, and rendering just
 * draws the latest one:
 *
 *   real time ──►|----frame----|----frame----|--frame--|
 *   steps      ──►|  s  |  s  |  s  |  s  |  s  |  s  |
 *
 * Once per animation frame: add the real time that passed to an
 * accumulator, run as many whole steps as fit, then render once. There is
 * **no interpolation** between steps: this is pixel art, and drawing a
 * fighter between two simulated positions would show a frame the
 * simulation never had (and blur hitbox overlays). At 144 Hz a frame is
 * simply drawn two or three times.
 *
 * The spiral of death: if steps ever take longer than real time (a slow
 * phone, a debugger pause), a frame runs at most `maxSteps` of them and
 * drops the rest of the debt, so the game slows down instead of freezing.
 *
 * Training mode controls:
 *
 * - `timeScale` (1, ½, ¼) feeds less real time in: slow motion shows
 *   exactly the same frames, more slowly;
 * - `frozen` stops the simulation (rendering continues), and `stepOnce()`
 *   then advances exactly one frame.
 *
 * Hidden tabs pause the loop and forget the time spent away, so coming
 * back doesn't fast-forward the fight.
 */
export class FixedStepLoop {
  /**
   * @param {object} options
   * @param {() => void} options.update  One simulation step.
   * @param {(frameTime: number) => void} options.render  Once per animation frame.
   * @param {number} [options.step=1/60]  Seconds per step.
   * @param {number} [options.maxSteps=4]
   * @param {() => number} [options.now]  Clock in milliseconds (injectable for tests).
   * @param {(cb: FrameRequestCallback) => number} [options.requestFrame]
   * @param {(id: number) => void} [options.cancelFrame]
   */
  constructor({
    update,
    render,
    step = 1 / 60,
    maxSteps = 4,
    now = () => performance.now(),
    requestFrame = (cb) => requestAnimationFrame(cb),
    cancelFrame = (id) => cancelAnimationFrame(id),
  }) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.maxSteps = maxSteps;
    this.now = now;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;

    this.running = false;
    /** The page is hidden. */
    this.hidden = false;
    /** Training mode's pause: no steps until stepOnce() or unfreezing. */
    this.frozen = false;
    this.pendingSteps = 0;
    this.accumulator = 0;
    /** 1 = real time; 0.25 = quarter speed. */
    this.timeScale = 1;
    /** Steps run so far. */
    this.tickCount = 0;
    /** Steps run during the last animation frame. */
    this.lastSteps = 0;
    /** Seconds of real time thrown away by the maxSteps cap. */
    this.droppedTime = 0;
    this.lastTime = 0;
    this.frameId = 0;
    this.tick = this.tick.bind(this);
    /** @type {(() => void) | null} */
    this.detachVisibility = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.now();
    this.frameId = this.requestFrame(this.tick);
  }

  stop() {
    this.running = false;
    this.cancelFrame(this.frameId);
    this.detachVisibility?.();
  }

  /** Advance exactly one step on the next animation frame (while frozen). */
  stepOnce() {
    this.pendingSteps++;
  }

  /** @param {boolean} frozen */
  setFrozen(frozen) {
    this.frozen = frozen;
    this.accumulator = 0;
  }

  /**
   * Pause while the page is hidden (another tab, a minimised window).
   * @param {Document} doc
   */
  pauseWhenHidden(doc) {
    const onChange = () => {
      this.hidden = doc.hidden;
      this.lastTime = this.now();
      this.accumulator = 0;
    };
    doc.addEventListener('visibilitychange', onChange);
    this.detachVisibility = () => doc.removeEventListener('visibilitychange', onChange);
  }

  /**
   * Runs one animation frame. Public so tests can drive the loop by hand.
   * @param {number} [timestamp]  milliseconds
   */
  tick(timestamp = this.now()) {
    if (!this.running) return;
    let frameTime = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    if (frameTime < 0) frameTime = 0;

    // Ask for the next frame even if this one throws: a bug in one step
    // reports its error but doesn't freeze the game for good.
    try {
      let steps = 0;
      if (!this.hidden) {
        if (this.frozen) {
          while (this.pendingSteps > 0) {
            this.pendingSteps--;
            this.update();
            this.tickCount++;
            steps++;
          }
        } else {
          this.pendingSteps = 0;
          this.accumulator += frameTime * this.timeScale;
          // A tiny epsilon so three 1/60 s frames always make three steps.
          while (this.accumulator >= this.step - 1e-9) {
            if (steps >= this.maxSteps) {
              const owed = Math.floor(this.accumulator / this.step);
              this.droppedTime += owed * this.step;
              this.accumulator -= owed * this.step;
              break;
            }
            this.update();
            this.tickCount++;
            steps++;
            this.accumulator -= this.step;
          }
          if (this.accumulator < 0) this.accumulator = 0;
        }
      }
      this.lastSteps = steps;
      this.render(frameTime);
    } finally {
      this.frameId = this.requestFrame(this.tick);
    }
  }
}
