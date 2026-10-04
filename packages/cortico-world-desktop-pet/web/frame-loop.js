/** Independent MIT implementation. Simulation uses seconds, presentation uses deadlines. */
export const SIMULATION_STEP = 1 / 60;

/** Unknown figures stay smooth unless they explicitly opt into idle presentation. */
export function needsSmoothFrames(ctl) {
  const p = ctl.pet;
  if (ctl.figure && ctl.figure.idleFrameRate !== 30) return true;
  return ctl.pressing || !['idle', 'sit', 'sleep'].includes(p.mode)
    || p.modeT < 1 || !!p.pulse || (!!p.expr && ctl.time < p.exprUntil) || p.listening || p.thinking
    || p.talkK > .01 || Math.abs(p.faceVis - p.facing) > .01
    || Math.abs(p.sqv) > .05 || Math.abs(p.tiltV) > .5
    || Math.abs(p.swingV) > .5 || p.stride > .1 || p.lift > .1;
}

/**
 * Call from rAF. Skipped callbacks do no simulation, DOM rendering or layout work.
 * Deadline carry avoids rounding 60 FPS down to 48 FPS on a 144 Hz display.
 * Physics runs fixed 1/60-second steps, at most one presentation per callback.
 * Elapsed time is never clamped or discarded, including across a delayed callback.
 */
export function createFrameLoop({ start, active, fixed60, simulate, present }) {
  let last = start, deadline = start, remainder = 0, previousFps = 0;
  return (now) => {
    const fps = fixed60() || active() ? 60 : 30;
    const interval = 1000 / fps;
    // Activity and a live preference change take effect on the very next callback.
    if (fps !== previousFps) { deadline = now; previousFps = fps; }
    if (now + 1e-7 < deadline) return false;
    const elapsed = Math.max(0, (now - last) / 1000);
    last = now;
    remainder += elapsed;
    while (remainder + 1e-10 >= SIMULATION_STEP) {
      simulate(SIMULATION_STEP);
      remainder -= SIMULATION_STEP;
    }
    if (remainder < 0) remainder = 0;
    present(elapsed);
    // Drop missed presentation deadlines, never replay stale drawings after a stall.
    deadline += (Math.floor((now - deadline + 1e-7) / interval) + 1) * interval;
    return true;
  };
}
