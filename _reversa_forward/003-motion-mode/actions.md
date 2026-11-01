# Actions — 003 motion-mode

> Source: `roadmap.md` (D1–D14), `data-delta.md`, `requirements.md` (FR-01..FR-21). `[//]` = parallelizable with the other `[//]` tasks of its phase.

## Summary

- Total actions: 20
- Parallelizable `[//]`: 10
- Longest dependency chain: T001 → T005 → T009 → T010 → T012 → T015 → T019 (7)

## 1. Preparation

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T001 | `[//]` Types `MotionRule`, `MotionAction`, `Place`, `Calibration`; `Persisted.motion?`; `migrate` keeps it only when `rules`/`places` are arrays (data-delta, D10). | — | `[//]` | `src/lib/persist.ts` | 🟡 | [X] |
| T002 | `[//]` en + pt-BR strings: `nav.motion`, gauges, Start/Stop, Calibrate/Recalibrate, Dark screen, rules editor fields, presets, places, statuses (No GPS fix, Sensor lost, Paused stealth/hidden, Location denied, Sensors not available), simulate. | — | `[//]` | `src/lib/dict.ts` | 🟢 | [X] |
| T003 | `[//]` Move scene apply into `applyScene(scene, opts)`; `Scenes.svelte#run` keeps its leave-stealth prompt and calls it (D7). | — | `[//]` | `src/lib/look.ts`, `src/lib/ui/Scenes.svelte` | 🟢 | [X] |

## 2. Tests

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T004 | `[//]` Persist tests: `motion` round-trip; malformed `motion` dropped; `forgetDevice` prunes `id` and `id#i` from rule targets. | T001 | `[//]` | `src/lib/persist.test.ts` | 🟡 | [X] |
| T005 | `[//]` Engine tests on synthetic series: speed from `coords.speed` and haversine fallback, dead band < 3 km/h, stale fix > 5 s; low-pass τ 0.3 s; calibration + projection (braking → negative G long, right turn sign); forward learned from acceleration while speed rises; `mapValue` clamp; trigger hold 200 ms + cooldown 2 s fires once; place enter/leave with 1.2× hysteresis, first fix sets state only; ≤ 10 outputs/s per rule. | T001 | `[//]` | `src/lib/motion/engine.test.ts` | 🟡 | [X] |

## 3. Core

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T006 | Signal math: `lowPass`, `speedFrom(fixes)`, `haversine`, `calibrate(samples)`, `project(sample, cal) → {gLong, gLat}`, `learnForward`, gravity drift check > 20° (D8, D9). | T001 | — | `src/lib/motion/engine.ts` | 🟡 | [X] |
| T007 | Rules: `mapValue`, gradient interpolation (2–5 stops, RGB), `TriggerState` (op `>=`/`<=`/`abs>=`, hold, cooldown), per-rule 10 Hz throttle. | T006 | — | `src/lib/motion/engine.ts` | 🟡 | [X] |
| T008 | Places: `PlaceState` enter/leave with accuracy ≤ radius, 1.2× exit, initial state from first fix. | T006 | — | `src/lib/motion/engine.ts` | 🟡 | [X] |
| T009 | `step(state, input, rules, places) → Action[]` combining T006–T008; presets "Brake light" (gLong ≤ −0.4, 200 ms, flash red ×3, cooldown 2 s) and "Brightness by speed" (0→100 km/h → 20→100 %) (FR-21). Make T005 pass. | T007, T008 | — | `src/lib/motion/engine.ts` | 🟡 | [X] |

## 4. Integration

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T010 | Executor: brightness/gradient via `applyTo(..., 'motion:<ruleId>', {force, source:'motion:<name>'})`; flash (×N, 150 ms, revert to `before`); look; scene via `applyScene`; slot with timed revert; drop everything while `store.stealth`; error counter; no `setLook` (D3–D5). | T003, T009 | — | `src/lib/motion/run.ts` | 🟡 | [X] |
| T011 | Snapshot targets' looks on Start, cancel timers and replay with `applyLook(force)` on Stop (D6). | T010 | — | `src/lib/motion/run.ts` | 🟡 | [X] |
| T012 | Sensors adapter: permissions on Start, `watchPosition` high accuracy, `devicemotion`, Wake Lock (re-request on visible), `visibilitychange` pause + `vibrate`, sensor-lost 2 s, reactive `live` at 10 Hz, `feed(series)` for simulate (D2). | T009, T011 | — | `src/lib/motion/sensors.svelte.ts` | 🟡 | [X] |
| T013 | `[//]` `forgetDevice` prunes rule targets; scene deletion leaves rule with warning (data-delta). | T001 | `[//]` | `src/lib/store.svelte.ts` | 🟡 | [X] |
| T014 | `[//]` Debug: "Simulate drive" button feeding the synthetic series (D13). | T012 | `[//]` | `src/lib/ui/Debug.svelte` | 🟡 | [X] |

## 5. Polish (UI)

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T015 | Motion tab: gauges (speed number, G long/lat bars ±1 G, G-ball, last trigger), Start/Stop ≥ 64 px, Calibrate, statuses; tab added in `App.svelte` after Panel (D11, FR-20). | T002, T012 | — | `src/lib/ui/Motion.svelte`, `src/App.svelte` | 🟡 | [X] |
| T016 | Rule list + editor: input, kind (map/trigger/place), targets (connected endpoints; panels limited to brightness/slot), ranges, threshold/hold/cooldown, action, enabled, delete; presets menu (FR-13). | T015 | — | `src/lib/ui/MotionRuleEditor.svelte`, `src/lib/ui/Motion.svelte` | 🟡 | [X] |
| T017 | `[//]` Places list: save from current fix (or typed lat/lon), radius 50–1000 m, edit, delete (FR-17). | T015 | `[//]` | `src/lib/ui/Motion.svelte` | 🟡 | [X] |
| T018 | `[//]` Dark screen overlay: full black, optional dim red speed, double tap / back to exit (history entry), Wake Lock kept (D12, FR-19). | T015 | `[//]` | `src/lib/ui/Motion.svelte` | 🟡 | [X] |
| T019 | Verify: `npm test`, `npm run check`, `npm run build`, difftest md5 `98622b8733585ad72d2b82a0aa7767e0`; README rows (en, pt-BR) for Motion mode. | T004, T005, T013, T014, T016, T017, T018 | — | `README.md`, `README.pt-BR.md` | 🟢 | [X] |
| T020 | `[//]` Write `legacy-impact.md` and `regression-watch.md` (reversa-coding). | T019 | `[//]` | `_reversa_forward/003-motion-mode/` | 🟢 | [X] |
