import test from 'node:test';
import assert from 'node:assert/strict';
import { createPet } from '../packages/cortico-world-desktop-pet/web/pet-core.js';
import { createFrameLoop, needsSmoothFrames, SIMULATION_STEP } from '../packages/cortico-world-desktop-pet/web/frame-loop.js';

const refreshRates = [60, 120, 144, 165];
const element = () => ({ setAttribute() {}, innerHTML: '', textContent: '' });
function body(figure = null) {
  const events = [];
  let ctl;
  ctl = createPet({ petG: element(), shadowEl: element(), fxG: element() }, {
    bounds: () => ({ W: 1000, H: 800, floorY: 750, S: .42 }),
    roam: 'off', startX: 300, figure,
    sfx: new Proxy({}, { get: () => () => {} }),
    onEvent: (kind, data) => events.push({ kind, data, time: ctl?.time ?? 0 }),
  });
  ctl.render();
  return { ctl, events };
}
function run(hz, seconds, ctl, { fixed = false, before = () => {} } = {}) {
  const presentations = [];
  let finish = false;
  const loop = createFrameLoop({ start: 0, active: () => finish || needsSmoothFrames(ctl),
    fixed60: () => fixed, simulate: dt => ctl.step(dt),
    present: dt => { ctl.render(); presentations.push(dt); },
  });
  loop(0);
  for (let i = 1; i <= Math.round(seconds * hz); i++) { before(i / hz, ctl); loop(i * 1000 / hz); }
  // Finish at an exact wall-clock boundary, including a pending idle deadline.
  finish = true;
  loop(seconds * 1000);
  return presentations;
}

for (const hz of refreshRates) {
  for (const fps of [30, 60]) test(`${hz} Hz targets ${fps} FPS without integer-divisor drift`, () => {
    let count = 0, time = 0;
    const loop = createFrameLoop({ start: 0, active: () => fps === 60, fixed60: () => false,
      simulate: dt => time += dt, present: () => count++ });
    for (let i = 0; i <= hz * 10; i++) loop(i * 1000 / hz);
    assert.ok(Math.abs(count - (fps * 10 + 1)) <= 1, `${count} drawings`);
    assert.ok(Math.abs(time - 10) < SIMULATION_STEP + 1e-8);
  });
  for (const action of ['walk', 'run', 'jump', 'hop', 'look', 'turn', 'nod', 'shake', 'spin', 'sit', 'sleep', 'dizzy']) {
    test(`${hz} Hz ${action}: same elapsed time, final pose and events as unthrottled 60 Hz baseline`, () => {
      const execute = fixed => {
        const { ctl, events } = body();
        if (action === 'walk' || action === 'run') ctl.walkTo(600, action === 'run', 'test-walk');
        else ctl.act(action);
        if (fixed === 'baseline') {
          for (let i = 0; i < 8 * 60; i++) { ctl.step(SIMULATION_STEP); ctl.render(); }
        } else run(hz, 8, ctl, { fixed });
        const p = ctl.pet;
        return { time: ctl.time, mode: p.mode, x: p.x, fy: p.fy, facing: p.facing, faceVis: p.faceVis,
          pulse: p.pulse, events: events.filter(e => ['arrived', 'interrupted', 'mode'].includes(e.kind)) };
      };
      // Idle gaze/blink RNG must be reproducible across the two executions.
      const original = Math.random;
      Math.random = () => .5;
      try {
        const adaptive = execute(false), fixed = execute(true);
        assert.deepEqual(adaptive, fixed);
        assert.deepEqual(adaptive, execute('baseline'));
        assert.ok(Math.abs(adaptive.time - 8) < 1e-8);
        if (['walk', 'run'].includes(action)) {
          assert.equal(adaptive.events.filter(e => e.kind === 'arrived').length, 1);
          assert.ok(Math.abs(adaptive.x - 600) < 1.5);
        }
      } finally { Math.random = original; }
    });
  }
  test(`${hz} Hz drag, release and turn stay responsive`, () => {
    const { ctl, events } = body();
    const p = ctl.toStage(128, 128);
    assert.equal(ctl.pointerDown(p), true);
    ctl.pointerMove({ x: p.x + 100, y: p.y - 40 });
    assert.equal(ctl.pet.mode, 'drag');
    assert.equal(needsSmoothFrames(ctl), true);
    run(hz, .5, ctl);
    assert.ok(Math.abs(ctl.pet.dx - (p.x + 100)) < 1);
    ctl.pointerUp();
    ctl.pointerLeave();
    assert.notEqual(ctl.pet.mode, 'drag');
    run(hz, 2, ctl);
    assert.equal(events.filter(e => e.kind === 'touch' && e.data.kind === 'grab').length, 1);
    ctl.act('turn');
    assert.equal(needsSmoothFrames(ctl), true);
    run(hz, 1, ctl);
    assert.ok(Math.abs(ctl.pet.faceVis - ctl.pet.facing) < .01);
  });
  test(`${hz} Hz swapping a custom figure preserves the clock and draw contract`, () => {
    const { ctl } = body();
    run(hz, 2, ctl);
    const before = ctl.time, frames = [];
    ctl.setFigure({ draw: (_g, _face, frame) => frames.push(frame), anchors: { bubble: [128, 20] } });
    assert.equal(ctl.time, before);
    run(hz, 1, ctl);
    assert.ok(Math.abs(ctl.time - 3) < 1e-8);
    assert.ok(frames.every((frame, i) => Number.isFinite(frame.t) && (!i || frame.t >= frames[i - 1].t)));
    assert.ok(frames.at(-1).legs.every(leg => leg.every(Number.isFinite)));
    ctl.setFigure(null);
    assert.equal(ctl.figure, null);
    assert.ok(Math.abs(ctl.time - 3) < 1e-8);
  });
  test(`${hz} Hz custom figure receives real-time frames and defaults to 60 FPS`, () => {
    const frames = [];
    const { ctl } = body({ draw: (_g, _face, frame) => frames.push(frame), groupTilt: () => 0 });
    run(hz, 2, ctl);
    assert.ok(Math.abs(frames.length - 122) <= 1);
    assert.ok(Math.abs(frames.at(-1).t - 2) < 1e-8);
    assert.equal(frames.at(-1).groupRot, 0);
    assert.equal(frames.at(-1).mode, 'idle');
    ctl.figure.idleFrameRate = 30;
    assert.equal(needsSmoothFrames(ctl), false);
  });
}

test('idle, activity, live fixed-60 switch and back: immediate promotion with carried deadlines', () => {
  let active = false, fixed = false, time = 0;
  const loop = createFrameLoop({ start: 0, active: () => active, fixed60: () => fixed,
    simulate: dt => time += dt, present() {} });
  assert.equal(loop(0), true);
  assert.equal(loop(7), false);
  active = true;
  assert.equal(loop(14), true);
  assert.equal(loop(21), false);
  assert.equal(loop(35), true);
  active = false;
  assert.equal(loop(42), true);
  assert.equal(loop(49), false);
  fixed = true;
  assert.equal(loop(56), true);
  fixed = false;
  assert.equal(loop(63), true);
  loop(1000);
  assert.ok(Math.abs(time - 1) < 1e-8);
});

test('delayed and jittered callbacks preserve elapsed time, with no burst of stale presentations', () => {
  let time = 0, count = 0;
  const loop = createFrameLoop({ start: 0, active: () => false, fixed60: () => false,
    simulate: dt => { assert.equal(dt, SIMULATION_STEP); time += dt; }, present: () => count++ });
  for (const now of [0, 6, 18, 37, 42, 550, 559, 600, 1000]) loop(now);
  assert.ok(Math.abs(time - 1) < 1e-8);
  assert.ok(count <= 6);
});

test('only settled idle/sit/sleep may throttle; every movement, gesture and transition stays smooth', () => {
  const { ctl } = body();
  ctl.pet.modeT = 2;
  for (const mode of ['idle', 'sit', 'sleep']) { ctl.pet.mode = mode; assert.equal(needsSmoothFrames(ctl), false); }
  for (const mode of ['walk', 'run', 'look', 'wake', 'crouch', 'air', 'land', 'drag', 'dizzy', 'future-mode']) {
    ctl.pet.mode = mode; assert.equal(needsSmoothFrames(ctl), true);
  }
  ctl.pet.mode = 'idle';
  ctl.pet.expr = 'happy';
  for (const [key, value] of [['pulse', {}], ['thinking', true], ['listening', true], ['exprUntil', 10],
    ['talkK', 1], ['faceVis', -1], ['sqv', 1], ['tiltV', 1], ['swingV', 1], ['stride', 1], ['lift', 1]]) {
    const prior = ctl.pet[key]; ctl.pet[key] = value;
    assert.equal(needsSmoothFrames(ctl), true, key); ctl.pet[key] = prior;
  }
});
