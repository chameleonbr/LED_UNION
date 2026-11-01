# Roadmap — 003 motion-mode

> Plan as a delta over the legacy described in `_reversa_sdd/`. Source: `requirements.md` (0 open doubts). 🟢 confirmed · 🟡 planned · 🔴 gap.

## Summary

🟡 A pure **motion engine** (speed, G, filters, map and trigger rules, place enter/leave) turns sensor samples into **actions**. A thin browser adapter feeds it from Geolocation and DeviceMotion, holds the Wake Lock and pauses on hidden pages. An executor turns actions into the existing `applyTo` / `applyLook` calls, so drivers, queue, coalescing, stealth and trace are reused unchanged. A new **Motion** tab shows the gauges, rules, places and the Dark screen.

## Principles applied

No `.reversa/principles.md`. Engineering rules from `_reversa_sdd/domain.md#Engineering policy` apply:
- 🟢 BR-50: drivers untouched; the engine is pure and unit-tested like the frame builders.
- 🟢 ADR-002: no I/O inside the engine; adapter and executor do I/O.
- 🟡 **Tension with BR-30** (looks record what was sent): motion output is transient — it is **not** recorded as looks while running; Stop replays the pre-Start snapshot and that is recorded. Documented in D6 so a scene saved during a drive does not capture a flash.

## Technical decisions

| # | Decision | Conf. |
|---|---|---|
| D1 | `src/lib/motion/engine.ts` (pure): `speedFrom(fixes)`, `lowPass`, `calibrate(samples)`, `project(sample, cal)` → `{gLong, gLat}`, `mapValue`, `TriggerState` (hold + cooldown), `PlaceState` (enter/leave with 1.2× hysteresis, first fix only sets state), `step(state, sample, rules, places) → Action[]`. No browser types. | 🟡 |
| D2 | `src/lib/motion/sensors.svelte.ts`: `start()` / `stop()`; `watchPosition({enableHighAccuracy:true, maximumAge:0})`, `devicemotion` listener, `DeviceMotionEvent.requestPermission?.()`, `navigator.wakeLock.request('screen')`, `visibilitychange` pause/resume + `navigator.vibrate(200)`; reactive `live = {speed, gLong, gLat, fixAge, sensor, paused}` throttled to 10 Hz for the gauges. A `feed(series)` entry point lets Debug simulate. | 🟡 |
| D3 | `src/lib/motion/run.ts` executor: actions → `applyTo(keys, build, 'motion:<ruleId>', {force:true, source:'motion:<rule name>'})`. `force` because a sensor must never open the leave-stealth confirm; instead **every action is dropped while `store.stealth`** (FR-10). Rate ≤ 10/s per rule by the engine; the queue's `pushLatest` drops the rest (BR-14). | 🟡 |
| D4 | Map outputs: brightness → `d.brightness`; gradient → `d.rgb` (colour interpolated in RGB across 2–5 stops). Panels get brightness only (no `rgb` builder, BR-21). | 🟡 |
| D5 | Trigger actions: `flash` (rgb on/off ×N, 150 ms, then `applyLook(key, before)`), `look` (colour or effect via `applyLook`), `scene` (shared `applyScene`), `slot` (`showSlot(n)` then after N s `showSlot(previous)`). One running flash per endpoint; a new trigger cancels the pending revert. | 🟡 |
| D6 | Start snapshots `lookOf(key)` for every target of every enabled rule (plain copy, like `enterStealth`); Stop cancels timers and replays the snapshot with `applyLook(force)`, which records it. Motion writes do not call `setLook`. | 🟡 |
| D7 | Extract `applyScene(scene, opts)` from `Scenes.svelte#run` into `look.ts`; Scenes keeps its leave-stealth prompt and calls it. | 🟢 refactor |
| D8 | Calibration: 1 s average at rest = gravity `g`; horizontal plane ⟂ `g`; forward axis starts as the horizontal component of device −Z (out of the phone's back, holder facing the driver) and is replaced by the direction of the first ≥ 0.15 G horizontal acceleration seen while GPS speed rises. Saved in `motion.calibration`; gravity drift > 20° raises "Recalibrate". | 🟡 |
| D9 | Speed: `coords.speed × 3.6` when not null, else haversine distance/time of the last two fixes; dead band < 3 km/h → 0; fix older than 5 s → `fixAge` stale, speed rules hold. | 🟡 |
| D10 | Persistence: `Persisted.motion?: { rules: MotionRule[]; places: Place[]; calibration?: Calibration }`; `migrate` drops it when malformed; `forgetDevice` prunes the device's keys from rule targets (BR-35 extended). | 🟡 |
| D11 | UI: `src/lib/ui/Motion.svelte` (tab "Motion" after Panel): gauges (speed number, G long/lat bars ±1 G, G-ball), Start/Stop ≥ 64 px, Calibrate, Dark screen, rules list + `MotionRuleEditor.svelte`, places list (save current fix, radius). Presets "Brake light" and "Brightness by speed" added from a menu. | 🟡 |
| D12 | Dark screen: fixed full-viewport black `div` (z-top), optional dim red speed, exits on double tap or `popstate` (a history entry is pushed on enter). Wake Lock stays. | 🟡 |
| D13 | Debug: "Simulate drive" feeds a built-in synthetic series (accelerate to 60 km/h, brake −0.5 G, corner +0.45 G) through `feed()`. | 🟡 |
| D14 | Trace: motion writes tagged `motion:<rule name>`; samples and positions never traced (NFR-03). | 🟡 |

## Architectural delta

| Component (`_reversa_sdd/architecture.md`) | Change |
|---|---|
| protocol/* drivers | none |
| `ble.svelte.ts` (`applyTo`) | none; used with `force` + coalesce key |
| `look.ts` | + `applyScene` (moved from Scenes) |
| `store.svelte.ts` / `persist.ts` | + `motion` field, migrate, prune in `forgetDevice` |
| new `src/lib/motion/` | `engine.ts`, `engine.test.ts`, `sensors.svelte.ts`, `run.ts` |
| UI | + `Motion.svelte`, `MotionRuleEditor.svelte`; `App.svelte` tab; `Scenes.svelte` uses `applyScene`; `Debug.svelte` simulate |
| `dict.ts` | + `nav.motion`, `motion.*` (en, pt-BR) |

## Data delta

See `data-delta.md`.

## Contract delta

No external contracts. Browser APIs only: Geolocation, DeviceMotion, Screen Wake Lock, Vibration. No `interfaces/`.

## Migration plan

Additive field; old stores load with `motion` absent. Rollback: revert; the extra field is ignored by `migrate`'s spread.

## Risks

| Risk | Mitigation |
|---|---|
| 🔴 Locked phone stops sensors (Chrome) | Dark screen; pause notice; native shell noted for a later phase |
| 🔴 Thresholds vs. real holder vibration | Low-pass, hold time, simulate, tune from the first trip trace |
| 🟡 Forward axis wrong sign | Learn from acceleration while GPS speed rises (D8) |
| 🟡 Battery with screen + GPS | Document "plug in the car"; gauges at 10 Hz |
| 🟡 BLEDIM brightness during an effect (BR-19) | Editor hint |

## Definition of done

- All FR-01..21 implemented; `npm test`, `npm run check`, `npm run build` green; difftest md5 unchanged.
- Engine tests on recorded/synthetic series (speed fallback, dead band, filter, projection, map, hold/cooldown, place hysteresis).
- Simulate drive shows a brake flash and speed-driven brightness on real LEDs parked.
