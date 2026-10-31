# Requirements — 001 ipixel-fase1

> Feature: Phase 1 — iPixel driver (list, connect, read panel size, power, brightness, show slot), stealth mode, iPixel in scenes (slot), no regression on current LEDs.
> Sources: `_reversa_sdd/sdd/ipixel-driver.md`, `_reversa_sdd/sdd/stealth-mode.md`, `_reversa_sdd/sdd/panel-scenes.md`, `_reversa_sdd/prd.md`, `docs/protocol/ipixel.md`.
> Confidence: 🟢 confirmed in legacy code/extraction · 🟡 planned / inferred · 🔴 gap.

## 1. Goal

🟡 Let the user list, connect and test the iPixel panel they own (model unknown) from LED Union, black out every light with one tap, and include the iPixel (power, brightness, saved slot) in scenes together with the strip and RGB LEDs, without changing how the current LEDs behave.

## 2. Legacy anchors

- 🟢 New families are added as one `Driver` file plus one registry line (`_reversa_sdd/architecture.md#6. Extension points`).
- 🟢 Driver is confirmed by GATT probing, name is only a hint (`_reversa_sdd/domain.md#Device identity and model knowledge`, BR-02, ADR-003).
- 🟢 Frame builders are pure, no I/O (`_reversa_sdd/adrs/002-pure-driver-frame-builders.md`).
- 🟢 Writes per device are serialized with a family `minGapMs`, last slider value always lands (`_reversa_sdd/domain.md#Commanding`, BR-13, BR-14, ADR-004).
- 🟢 Scenes are snapshots, touch only their endpoints, apply order power → brightness → speed → colour → effect (`_reversa_sdd/domain.md#State and persistence`, BR-31..BR-33).
- 🟢 A command on an offline device reconnects it first (BR-12).
- 🟢 The app records what it sent, not device state (BR-30). 🟡 The iPixel is the first family that replies (device info, ACK); this feature keeps BR-30 for looks and adds read-back only for panel info.
- 🟢 Storage failures never block a command (BR-38).

## 3. Scope

### In
1. 🟡 `ipixel` driver: service `000000fa-…`, write `fa02`, notify `fa03`, match name containing `LED_BLE`.
2. 🟡 Notify subscription and device-info query on connect; parse type → panel size via table in `docs/protocol/ipixel.md#3`.
3. 🟡 Persist panel info on the saved device; show size badge on the card.
4. 🟡 Power, brightness (10..100), orientation (0..3), show saved slot, delete-all (with confirmation).
5. 🟡 Debug screen: show raw device-info reply and allow sending any iPixel frame (reuses existing `sendRaw`).
6. 🟡 Stealth mode: global toggle, snapshot, power off all endpoints of all drivers, block automatic writes, restore on exit, persisted across reload.
7. 🟡 Scenes: optional `look.panel = { kind: 'slot', slot }`; save/apply iPixel entries with power → brightness → show-slot.
8. 🟡 Strings in en and pt-BR.
9. 🟡 Command trace: record every write, notification and connection event, persist across reload, download as JSON for offline checking (user request 2026-10-31).

### Out
1. 🟡 Content upload (text, image, GIF), windowed transport, playlist — phase 2.
2. 🟡 Motion mode, action buttons — phase 3. Data sources — phase 4. CoolLED — phase 5.
3. 🟡 Clock, rhythm, scoreboard, schedule, password unlock, OTA.
4. 🟡 Scene kinds `item` and `playlist`.
5. 🟡 Stealth screen dimming or black UI: stealth turns lights off only (clarified 2026-10-31).

## 4. Functional requirements

| ID | Requirement | Conf. | Source |
|---|---|---|---|
| FR-01 | The system registers driver `ipixel` and adds its service to `allServices` so the chooser can expose it. | 🟡 | `sdd/ipixel-driver.md` RF-01 |
| FR-02 | `matches(name)` is true when the name contains `LED_BLE`; existing names resolve to the same driver as today. The chooser also offers any device advertising service `000000fa` (service filter), and such a device resolves to `ipixel` by GATT probe (BR-02). | 🟡 | RF-02; BR-02; BR-04; clarified 2026-10-31 |
| FR-03 | On connect the system enables notifications on `fa03` and sends `08 00 01 80 HH MM SS 00` (local time). | 🟡 | RF-03; `ipixel.md#Connect sequence` |
| FR-04 | The system parses the device-info reply (byte 4 = type, byte 10 = password flag) into `{type,width,height}`; unknown type keeps `type` with no size. | 🟡 | RF-04 |
| FR-05 | The system saves `panel` on the `SavedDevice` and shows "W×H" on the card; a later connect without reply keeps the saved value. | 🟡 | RF-05 |
| FR-06 | `power(on)` → `05 00 07 01 <1\|0>`. | 🟡 | RF-06 |
| FR-07 | `brightness(pct)` → `05 00 04 80 <v>`, v clamped 10..100; `minGapMs` 100. | 🟡 | RF-07 |
| FR-08 | Orientation setting → `05 00 06 80 <0..3>`. | 🟡 | RF-08 |
| FR-09 | Show slot → `07 00 08 80 01 00 <slot>`, slot 1..100 input on the card. | 🟡 | RF-09 |
| FR-10 | Delete all stored content → `04 00 03 80`, only after a confirm dialog. | 🟡 | RF-10 |
| FR-11 | `caps` all false; card hides colour, effect, white, CCT, custom and sound controls for iPixel. | 🟡 | RF-13 |
| FR-12 | Stealth toggle in the app header, visible on every screen, `aria-pressed`. | 🟡 | `sdd/stealth-mode.md` RF-01, RF-09 |
| FR-13 | Stealth on: snapshot looks of connected endpoints, queue `power(false)` on each (every output of multi-output controllers). | 🟡 | RF-02, RF-03 |
| FR-14 | Stealth on: manual control asks "Leave stealth?" before writing; scene apply asks the same. | 🟡 | RF-05; `sdd/panel-scenes.md` RF-09 |
| FR-15 | Stealth off: re-apply the snapshot through the scene-apply path; unreachable endpoints listed in a toast. | 🟡 | RF-06 |
| FR-16 | Stealth state and snapshot persist; a device connecting while stealth is on gets `power(false)` after its `onConnect` frames. | 🟡 | RF-07, RF-08 |
| FR-17 | `Look` gains optional `panel: { kind: 'slot'; slot: number }`; scene save snapshots it; old scenes load unchanged. | 🟡 | `sdd/panel-scenes.md` RF-01, RF-02 |
| FR-18 | Scene apply on an iPixel entry sends power → brightness → show-slot, consistent with BR-33. | 🟡 | RF-03; BR-33 |
| FR-19 | Scenes show the panel entry summary ("Slot 3"). | 🟡 | RF-07 |
| FR-20 | The system records a trace entry for every BLE write (ISO time, device id, advertised name, driver id, characteristic uuid, hex bytes, source tag, ok/error text), every notification (hex), and every connect/disconnect/error event, for all drivers. | 🟡 | user request 2026-10-31 |
| FR-21 | The trace persists in its own storage key (`led-union/trace`), capped at the last 2000 entries; storage failure never blocks a write (BR-38). | 🟡 | user request; BR-38 |
| FR-22 | Debug offers "Download log" (JSON file `led-union-trace-<timestamp>.json` with app version, saved devices and the entries) and "Clear log"; recording is on by default with an on/off switch. | 🟡 | user request |
| FR-23 | Writes carry a source tag: `card`, `scene:<name>`, `stealth`, `debug`, `connect`. | 🟡 | user request |

## 5. Non-functional requirements

| ID | Requirement | Conf. |
|---|---|---|
| NFR-01 | Zero regression: all current tests pass and difftest emitter md5 stays `98622b8733585ad72d2b82a0aa7767e0`. | 🟢 policy (`_reversa_sdd/domain.md#Engineering policy`) |
| NFR-02 | iPixel frame builders unit-tested (≥ 10 tests) with exact bytes. | 🟡 |
| NFR-03 | Stealth: all power-off frames queued < 500 ms after tap with 5 devices. | 🟡 |
| NFR-04 | No new npm dependency. | 🟡 |
| NFR-05 | Stealth button ≥ 48×48 px. | 🟡 |
| NFR-06 | Persisted store stays `led-union/v1`, new fields optional. | 🟢 `persist.ts` |

## 6. Acceptance criteria

- 🟡 **Given** the user's iPixel is on, **when** they tap Add device and pick it, **then** it is listed, connected, and the card shows its size (or "size unknown" after 5 s with Retry).
- 🟡 **Given** a connected iPixel, **when** the user toggles power, moves brightness and taps Show slot 2, **then** the panel turns on/off, dims, and shows slot 2.
- 🟡 **Given** strip, RGB LEDs and iPixel connected and lit, **when** the user taps Stealth, **then** all go off; **when** tapped again, **then** each returns to its previous look.
- 🟡 **Given** stealth on and the page reloaded, **then** stealth is still on and no device is turned on automatically.
- 🟡 **Given** a scene with strip, RGB LEDs and iPixel slot 3, **when** applied, **then** all three match it.
- 🟡 **Given** any scene saved before this feature, **when** applied, **then** the frames are identical to the previous build.
- 🟡 **Given** a scene was applied and stealth toggled, **when** the user taps Download log, **then** the file lists every frame sent, in order, with device, source and result, and each iPixel reply in hex.
- 🟡 **Given** the current test suite and difftest, **when** run on the branch, **then** all pass and md5 is unchanged.

## 7. Risks and hardware unknowns

- 🔴 Chrome may refuse the service or the panel may need OS pairing (PRD risk 1). Mitigation: first task is a connect/probe spike on the user's panel via Debug.
- 🔴 Reply may not arrive on `fa03` (`ipixel.md#Open questions` 2). Mitigation: FR-04 fallback, Debug shows every notify.
- 🔴 The user's panel may not advertise `LED_BLE` (open question 4). Mitigation: service filter in FR-02.

## 8. Clarifications

| Date | Question | Answer |
|---|---|---|
| 2026-10-31 | Accept devices by service `000000fa` when the name lacks `LED_BLE`? | Yes (FR-02). |
| 2026-10-31 | Stealth: lights only or also black UI? | Lights only (Out 5). |

---
Gerado por reversa-requirements em 2026-10-31
