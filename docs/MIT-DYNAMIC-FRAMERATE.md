# Dynamic frame rate on the MIT baseline

This change was implemented independently from commit
`50d0c2c4fd8940c39a181c36bc414df0bd812d77` in HikariVerse/Coopanion.
Only the MIT checkout and its pinned MIT Cortico submodule were used as source.
No PR #54 patch, later upstream source, or AGPL implementation was read or copied.
The upstream performance objective supplied in the request is a requirement, not
an implementation source. Existing licenses and copyright notices remain intact.

## Presentation policy

| State | Target |
| --- | --- |
| Settled built-in idle, sit, sleep; breathing, gaze and ambient particles | 30 FPS |
| Walk, run, look, wake, crouch, airborne/drop/throw, land, drag, dizzy | 60 FPS |
| Pointer held down, layered nod/shake/spin, queued actions or conversation motion | 60 FPS |
| Turning/card flip, active expression, listening, thinking, speech mouth motion | 60 FPS |
| First second of a mode; residual squash, tilt, swing or stride/lift | 60 FPS |
| Custom figure with no idle opt-in; unknown mode | 60 FPS |
| Custom figure explicitly declaring `idleFrameRate: 30`, otherwise settled | 30 FPS |
| `fixed60Fps: true` | 60 FPS in all states |

An external walk, pointer press, figure replacement or live setting change promotes
presentation on the next rAF callback. Autonomous transitions discovered during
simulation are drawn in that presentation and promoted on the next callback.
A high-refresh display cannot multiply movement speed or action duration.

## Timing and implementation

`web/frame-loop.js` keeps a carried presentation deadline. Missed presentation
slots are skipped; they do not reset the deadline to `now + interval`. Thus a
144 Hz screen alternates suitable vblank gaps rather than accidentally becoming
48 FPS. Actual presentation remains quantized to available display callbacks;
60 FPS is a target, not a guarantee against browser throttling or a slow machine.

Skipped callbacks do no body stepping, rendering, backdrop work, tool hit testing
or layout. Admitted frames accumulate **all elapsed seconds**, including fractional
remainders, and advance the body and dialog/action handlers at fixed 1/60-second
steps. Idle presentations normally batch two simulation steps and draw once.
The baseline springs are consequently integrated with the same step size in both
modes. No action counter, frame multiplier or elapsed-time clamp is used.
Simulation time can trail wall time by an idle presentation interval plus one
simulation remainder, but never progressively slows or drops elapsed time.

`ctl.time`, `modeT`, gesture deadlines, gait phase, particles and custom `frame.t`
remain in seconds. Custom figure draw/groupTilt/anchors/color contracts are
unchanged. Figures do not have to implement a new API; unknown figures retain
60 FPS, protecting scheme fades and custom animations from unannounced throttling.

After a delayed callback the complete simulation interval is advanced and only
one current drawing is presented. A very long suspension therefore entails
simulation catch-up work; this change does not introduce a separate suspension
or background-pause policy.

## Configuration

`worlds.desktop-pet.fixed60Fps` is a hot boolean setting, default `false`.
It is available in the console Habits page and pet context menu. The `framerate`
action can also be selected as a hover button. The page applies it optimistically;
the World validates booleans, persists the setting and sends it in init/prefs
snapshots. Older configs with no field behave as adaptive mode.

## Validation

- `node --test tests-node/pet-framerate.test.mjs`: **71 passed**. Simulated
  60/120/144/165 Hz deadlines, all twelve actions, exact accumulated time,
  arrival/interruption/mode events with simulation timestamps, drag/release,
  turn settling, live mode changes, jitter/stalls and figure swapping. Action
  results are compared both to fixed presentation and to the unchanged MIT
  body stepped and drawn directly at 60 Hz.
- Real `pet.html` + `pet-app.js` in jsdom: **5 passed**, included below. At each
  display rate, idle draws about 30 FPS, walking and fixed mode about 60 FPS;
  arrival fires once and the context-menu switch applies/sends its preference.
- World suite: **79 passed, 3 platform-related skipped**. Includes a new test
  of defaults, persistence, broadcast, invalid types, hot config and a new page.
- Root suite excluding `tests/core-env.test.ts`: **25 passed**. The unexcluded
  run found the Electron integration test unavailable because this environment
  has no Electron binary. The other core-env test passed in that initial run.
- App staging/build, root TypeScript, web TypeScript, World TypeScript, JavaScript
  syntax and `git diff --check` passed.

The new coverage totals **77 tests** (71 scheduler/body + 5 page + 1 protocol).
CI runs the native frame tests on its existing Windows/macOS matrix in addition
to its existing build/typecheck/Vitest checks.

Local tests used an isolated scratch dependency installation; the repository
manifest versions and lockfile were preserved. Vitest 2.1.9, TypeScript 5.9.3,
jsdom 26 and Node 24 were used locally. CI's existing Node 22 and frozen-lockfile
installation remain the checks for exact packaged dependencies.

## Hardware acceptance still required

No Windows desktop session, physical refresh-rate panel or GPU profiler is
available here. The tests establish scheduling and behavioral invariants, not
measured CPU/GPU savings or subjective animation quality. On the user's machine:

1. Check idle, walking/running, dragging/release, turn, jump and sleep/wake on each
   available 60/120/144/165 Hz mode. Confirm no perceptible speed change and no
   duplicate arrivals or stuck mouse capture.
2. Check Coo and the whale/custom figure, including skin/scheme fades; exercise
   both fixed and adaptive mode and restart to confirm persistence.
3. Measure renderer/GPU process cost over comparable idle and moving intervals;
   compare against the old MIT checkout using the same display and figure.
4. Check hide/show and sleep/resume, including the catch-up behavior noted above.

No upstream benchmark numbers are represented as measurements of this fork.
