/**
 * The fixed-step loop: the simulation runs at 60 steps a second whatever
 * the display rate, slow motion feeds less time in, frame stepping runs
 * exactly one step, and the spiral-of-death cap drops time instead of
 * freezing.
 */
import { describe, it, expect } from 'vitest';
import { FixedStepLoop } from '../src/engine/loop/FixedStepLoop.js';

/** A loop driven by hand. */
function manual() {
  let now = 0;
  let steps = 0;
  let renders = 0;
  const loop = new FixedStepLoop({
    update: () => steps++,
    render: () => renders++,
    now: () => now,
    requestFrame: () => 0,
    cancelFrame: () => {},
  });
  loop.start();
  return {
    loop,
    /** @param {number} ms */
    frame(ms) {
      now += ms;
      loop.tick(now);
    },
    get steps() { return steps; },
    get renders() { return renders; },
  };
}

describe('FixedStepLoop', () => {
  it.each([30, 60, 144])('runs 60 steps per second at %i fps', (fps) => {
    const m = manual();
    for (let i = 0; i < fps * 2; i++) m.frame(1000 / fps);
    expect(m.steps).toBeGreaterThanOrEqual(119);
    expect(m.steps).toBeLessThanOrEqual(120);
    expect(m.renders).toBe(fps * 2);
  });

  it('slow motion runs a quarter of the steps at ¼ speed', () => {
    const m = manual();
    m.loop.timeScale = 0.25;
    for (let i = 0; i < 240; i++) m.frame(1000 / 60);
    expect(m.steps).toBe(60);
  });

  it('frozen: no steps, except exactly one per stepOnce()', () => {
    const m = manual();
    m.loop.setFrozen(true);
    for (let i = 0; i < 60; i++) m.frame(1000 / 60);
    expect(m.steps).toBe(0);
    m.loop.stepOnce();
    m.frame(16);
    m.frame(16);
    expect(m.steps).toBe(1);
  });

  it('a long stall runs at most maxSteps, then drops the rest', () => {
    const m = manual();
    m.frame(2000);
    expect(m.steps).toBe(m.loop.maxSteps);
    expect(m.loop.droppedTime).toBeGreaterThan(1.5);
  });
});
