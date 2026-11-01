# Requirements — 003 motion-mode

> Feature: Phase 3 — phone sensors drive the lights: accelerometer (braking, cornering, movement) and GPS (speed, location) change colour, brightness, effects or scenes on any connected device, existing LEDs and the iPixel panel alike.
> Sources: `_reversa_sdd/sdd/motion-mode.md`, `_reversa_sdd/prd.md` §4 §8, `_reversa_sdd/domain.md`, `_reversa_sdd/architecture.md`, hardware results 2026-11-01.
> Confidence: 🟢 confirmed in code, extraction or hardware · 🟡 planned / inferred · 🔴 gap.

## 1. Goal

🟡 While driving with the phone in a holder and LED Union open, the car lights react to the drive: brightness or colour follows speed, a hard brake flashes the lights red, a hard corner or acceleration fires a chosen look, scene or panel slot, and stopping the mode puts every light back as it was.

## 2. Legacy anchors

- 🟢 Commands go through `applyTo(keys, build, coalesceKey, opts)`; per-device `WriteQueue` serializes writes and `pushLatest` keeps only the newest slider value per output (`_reversa_sdd/domain.md#Commanding` BR-13, BR-14; ADR-004).
- 🟢 A command on an offline device reconnects first, except when stealth is on and the user declines (`domain.md` BR-12, BR-71).
- 🟢 `applyLook(key, look, opts)` replays power → brightness → speed → colour → effect → panel slot (`domain.md` BR-33, `look.ts`).
- 🟢 Stealth already snapshots looks and restores them (`stealth.ts`, `domain.md` BR-70..72) — same pattern fits "restore on Stop".
- 🟢 Looks record what was sent, not device state (BR-30); scenes are snapshots of looks (BR-31, BR-32).
- 🟢 Broadcast is limited to power, colour and brightness; effects are per family (BR-11). Panels have no `rgb`/`effect`/`speed` builders, only brightness and `showSlot` (`protocol-drivers/` RF-14).
- 🟢 Panel slot switch works on hardware; content upload takes seconds (`panel-content/`), so live per-sample panel content is not feasible.
- 🟢 Every write goes to the command trace with a `source` tag (BR-73).
- 🟢 Storage failures never block a command (BR-38); persisted state is `led-union/v1` (`persistence/`).
- 🟢 Chromium on Android is the only target (`architecture.md#Quality attributes`).

## 3. Scope

### In
1. 🟡 New **Motion** menu item (tab) with large Start/Stop and on-screen speed (km/h) and G gauges (longitudinal, lateral, G-ball), visible while running (clarified 2026-11-01).
2. 🟡 Sensors: Geolocation `watchPosition` (high accuracy) for speed; DeviceMotion `accelerationIncludingGravity` for G; permissions asked on Start.
3. 🟡 Calibration: "Calibrate" while stopped captures the gravity vector and the forward axis, so the phone may sit in any holder orientation.
4. 🟡 Rule **map**: input (speed, G long, G lat, G total) over a range → brightness range or colour gradient on chosen endpoints.
5. 🟡 Rule **trigger**: input crosses a threshold for a hold time → action, with a cooldown; actions: flash a colour N times then return, apply a look (colour / effect), apply a scene, show a panel slot (then return after a duration).
6. 🟡 Presets to start from: "Brake light" (G long ≤ −0.4 for 200 ms → flash red), "Brightness by speed" (0→100 km/h → 20→100 %).
7. 🟡 Restore on Stop: every touched endpoint gets the look it had before Start.
8. 🟡 Stealth suspends motion output; Screen Wake Lock held while running.
11. 🟡 **Dark screen** while running: a full-black overlay keeps sensors and BLE alive with the display practically off (OLED), so it works with the phone "off" in the holder (clarified 2026-11-01, see §7 and Out 1).
9. 🟡 Rules persisted in the store; strings in en and pt-BR.
10. 🟡 **Place triggers**: saved places (name, point, radius) fire an action on enter or leave (clarified 2026-11-01, D1 = a).

### Out
1. 🔴 **Locked phone / real screen-off.** Chrome stops DeviceMotion and Geolocation for a page that is hidden or behind the lock screen, and JS timers are frozen, so a PWA cannot read sensors then. The owner asked for it (2026-11-01); this phase delivers the Dark screen (In 11). True locked-screen operation needs a native Android shell with a foreground service — candidate for a later phase.
2. 🟡 OBD-II / CAN data (NG-02); trip recording or upload (NG-03); audio reactivity (NG-04).
3. 🟡 Live panel content per sample (speed number drawn on the iPixel): an upload takes seconds; only pre-uploaded slots are switched.
4. 🟡 Action pad / `ActionRef` from `sdd/action-buttons.md` — later phase; triggers use the four actions above.
5. 🟡 iOS (no Web Bluetooth).

## 4. Functional requirements

| ID | Requirement | Conf. | Source |
|---|---|---|---|
| FR-01 | Start (user gesture) requests Geolocation and DeviceMotion; on `DeviceMotionEvent.requestPermission` present it is called first. A denied or missing sensor disables only the rules that need it, with a message. | 🟡 | sdd RF-01 |
| FR-02 | Speed km/h = `coords.speed × 3.6` when present, else distance/time between the last two fixes (haversine); dead band: below 3 km/h counts as 0. Fixes older than 5 s → "No GPS fix", speed rules hold their last output. | 🟡 | sdd RF-02, EC-01 |
| FR-03 | G: low-pass filter (default 0.3 s) on `accelerationIncludingGravity`; subtract calibrated gravity; project on calibrated forward and lateral axes; G = m/s² ÷ 9.81. Braking is negative G long. | 🟡 | sdd RF-03 |
| FR-04 | Calibrate: average 1 s of samples at rest as gravity; forward axis taken from the first ≥ 0.15 G acceleration along the horizontal plane, or from the phone's top edge until then. Stored per phone. A gravity shift > 20° from the calibrated one shows "Recalibrate". | 🟡 | sdd RF-03, EC-02 |
| FR-05 | Map rule: `out = min + (clamp(input, from, to) − from) / (to − from) × (max − min)`; output brightness % or a colour interpolated across 2–5 stops; sent with `applyTo(..., coalesceKey 'motion:<ruleId>')`. | 🟡 | sdd RF-04 |
| FR-06 | Trigger rule fires once when the input stays beyond the threshold for `holdMs` (default 200 ms); it cannot fire again within `cooldownMs` (default 2 s). | 🟡 | sdd RF-05 |
| FR-07 | Trigger actions: (a) flash colour N times (on/off 150 ms) then restore the endpoint's look; (b) apply a look (colour or effect) until the next trigger or Stop; (c) apply a scene; (d) show a panel slot for N seconds then restore the previous slot. | 🟡 | sdd RF-05 |
| FR-08 | Output rate ≤ 10 writes/s per endpoint; samples between are dropped by coalescing, never queued. | 🟡 | sdd RF-06, BR-14 |
| FR-09 | Stop restores each touched endpoint to its pre-Start look via `applyLook(force)`; looks are recorded as sent (BR-30). | 🟡 | sdd RF-07 |
| FR-10 | Stealth on → motion sends nothing (no prompt to leave stealth from a sensor) and readouts show "Paused (stealth)". | 🟡 | sdd RF-08, BR-71 |
| FR-11 | Page hidden (app switched or phone locked) → output paused, "Paused — keep LED Union on screen" shown and a vibration pulse given; visible again → resumes. Wake Lock requested on Start, re-requested on visible, released on Stop. | 🟡 | sdd RF-09, EC-03 |
| FR-17 | Places: save a named place from the current fix (or typed lat/lon), radius 50–1000 m (default 100 m); list, edit, delete. Stored only on the phone. | 🟡 | D1 |
| FR-18 | Place trigger: on **enter** or **leave** a place → action (FR-07, or apply a scene / power on). Enter when distance ≤ radius with accuracy ≤ radius; leave when distance > radius × 1.2 (hysteresis); one fire per transition. The first fix after Start only sets the state, it does not fire. | 🟡 | D1 |
| FR-19 | Dark screen: button while running shows a full-black overlay (no animation; optional dim red speed digits), keeps Wake Lock and sensors; a double tap or the back gesture leaves it. | 🟡 | clarified 2026-11-01 |
| FR-20 | Gauges: large speed number, G long and G lat bars with ± scale to 1 G, G-ball (x/y dot) and the last trigger fired; update ≤ 10 Hz to save battery. | 🟡 | clarified 2026-11-01 |
| FR-21 | Defaults: brake G long ≤ −0.4 for 200 ms, corner \|G lat\| ≥ 0.4, hard acceleration G long ≥ +0.3, flash 3 times, cooldown 2 s. | 🟡 | D2 |
| FR-12 | Rules (`MotionRule`), calibration and presets persisted in `led-union/v1`; positions never persisted. | 🟡 | sdd §9, RNF-02 |
| FR-13 | Rule editor: input, kind, targets (endpoints from connected devices, panels only offered brightness and slot actions), ranges or threshold/hold/cooldown, action, enabled toggle; delete. | 🟡 | sdd §8 |
| FR-14 | A BLE write failure drops that sample, keeps running and increments an on-screen error counter. No sensor sample for 2 s shows "Sensor lost" and holds the last look. | 🟡 | sdd EC-04, EC-05 |
| FR-15 | Every motion write is traced with source `motion:<rule name>`; sensor samples are not traced. | 🟡 | BR-73 |
| FR-16 | Debug: "Simulate" feeds a recorded or synthetic speed/G series into the engine so rules can be tested parked. | 🟡 | sdd §13 |

## 5. Non-functional requirements

| ID | Requirement | Conf. |
|---|---|---|
| NFR-01 | Zero regression: current tests pass; difftest md5 stays `98622b8733585ad72d2b82a0aa7767e0`. | 🟢 policy |
| NFR-02 | Sensor sample → queued write < 300 ms. | 🟡 sdd RNF-01 |
| NFR-03 | Live positions stay in memory only: never persisted, traced or sent. Saved places are stored only in `led-union/v1` on the phone, never traced or sent. | 🟡 sdd RNF-02, D1 |
| NFR-04 | Start/Stop ≥ 64 px, readable at arm's length; no typing needed while running. | 🟡 sdd RNF-03 |
| NFR-05 | Speed, G math, filter, map, trigger hold/cooldown unit-tested on recorded series (pure module, no browser). | 🟡 |
| NFR-06 | No false brake trigger in a 10 min smooth drive with default preset. | 🟡 sdd metrics |
| NFR-07 | No new dependency. | 🟡 |

## 6. Acceptance criteria

- 🟡 **Given** "Brightness by speed" on the strip, **when** speed goes 0 → 100 km/h, **then** brightness goes 20 → 100 % and the trace shows ≤ 10 writes/s.
- 🟡 **Given** "Brake light" on all lights, **when** the car brakes at −0.5 G for 300 ms, **then** they flash red 3 times once and return to their looks.
- 🟡 **Given** a trigger "G lat > 0.4 → slot 2 for 3 s" on the iPixel, **when** cornering, **then** the panel shows slot 2 and goes back to the previous slot.
- 🟡 **Given** motion running, **when** the user taps Stop, **then** every touched light returns to its pre-Start look.
- 🟡 **Given** stealth on, **when** a trigger fires, **then** nothing is written.
- 🟡 **Given** location permission denied, **then** speed rules show "Location denied" and G rules still work.
- 🟡 **Given** a place "Home" with radius 100 m and trigger "enter → scene Garage", **when** the car arrives home, **then** the scene is applied once, and not again until it leaves (> 120 m) and comes back.
- 🟡 **Given** motion running in Dark screen, **when** the car brakes, **then** the brake flash still fires.
- 🟡 **Given** motion running, **when** the phone is locked, **then** output pauses and resumes when LED Union is visible again.
- 🟡 **Given** strip, RGB and BLEDIM devices, **when** motion is never started, **then** frames are identical to the previous build.

## 7. Risks

- 🔴 Phone sensors in a holder: vibration and mount angle; thresholds need a real drive. Mitigation: calibration, low-pass filter, FR-16 simulate, defaults tuned after the first trip log.
- 🟡 GPS speed lags ~1 s and is noisy under 5 km/h (dead band).
- 🔴 Chrome stops sensors when hidden or locked; Dark screen is the PWA answer. Battery drain with screen on and GPS high accuracy: plug the phone in the car.
- 🟡 BLEDIM brightness only scales a static colour (BR-19); map rules on BLEDIM during an effect may look like nothing happens.
- 🟡 iPixel write rate for brightness (sdd OQ-02); limited to 10/s like the rest.

## 8. Clarifications

| # | Question | Answer |
|---|---|---|
| D1 | Place triggers (arrive / leave home or car)? | 2026-11-01: **(a) yes**, saved points and a radius, kept only on the phone (FR-17, FR-18). |
| D2 | Default thresholds? | 2026-11-01: **keep** brake −0.4 G / 200 ms, corner ±0.4 G, acceleration +0.3 G, flash 3× (FR-21). |
| D3 | Work with the screen off? | 2026-11-01: owner wants it. PWA limit → Dark screen this phase (FR-19); locked phone needs a native shell (Out 1). |
| D4 | Gauges on screen and a menu item? | 2026-11-01: yes — Motion tab with speed and G gauges (In 1, FR-20). |

---
Gerado por reversa-requirements em 2026-11-01
