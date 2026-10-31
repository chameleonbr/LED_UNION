# Actions — 001 ipixel-fase1

> Source: `roadmap.md` (D1–D12), `data-delta.md`. `[//]` = parallelizable with the other `[//]` tasks of its phase.

## Summary

- Total actions: 26
- Parallelizable `[//]`: 10
- Longest dependency chain: T001 → T002 → T006 → T010 → T012 → T018 → T021 (7)

## 1. Preparation

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T001 | Add optional Driver members `notifyChar`, `onNotify`, `showSlot`, `orientation`, `deleteAll`, `namePrefix`, and types `PanelInfo`, `DeviceReport` (D1). | — | | `src/lib/protocol/types.ts` | 🟡 | [X] |
| T002 | `[//]` Add optional `SavedDevice.panel`, `Look.panel`, `Persisted.stealth`; ensure load/merge keeps them (data-delta). | T001 | `[//]` | `src/lib/persist.ts` | 🟡 | [X] |
| T023 | `[//]` Trace module: `TraceEntry`, `trace()`, ring buffer 2000, persist `led-union/trace` with try/catch, `clearTrace()`, `exportTrace()` JSON download (D13). | — | `[//]` | `src/lib/trace.ts` | 🟡 | [X] |
| T003 | `[//]` Add en + pt-BR strings: panel size/unknown/retry, slot, show, orientation, delete-all confirm, stealth on/off, leave-stealth confirm, unreachable toast. | — | `[//]` | `src/lib/dict.ts` | 🟡 | [X] |

## 2. Tests

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T004 | `[//]` Byte-exact tests: power on/off, brightness 0/50/150 clamp, orientation 0..3 + reject 4, show-slot, delete-all, onConnect with fixed Date, rgb/speed/effect empty. | T001 | `[//]` | `src/lib/protocol/ipixel.test.ts` | 🟡 | [X] |
| T005 | `[//]` Tests: `parseDeviceInfo` for `0x81`→32×32, `0x8A`→64×32, unknown type, short reply (no lock byte), lock flag; `matches` true for `LED_BLE_1A2B`, false for `LEDBLE-00`. | T001 | `[//]` | `src/lib/protocol/ipixel.test.ts` | 🟡 | [X] |
| T024 | Tests: trace caps at 2000, survives storage throwing, export JSON has `version`, `devices`, `entries`. | T023 | | `src/lib/trace.test.ts` | 🟡 | [X] |
| T006 | Test: persist round-trip keeps `panel`, `look.panel`, `stealth`; old store without them loads. | T002 | | `src/lib/persist.test.ts` | 🟡 | [X] |

## 3. Core

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T007 | Implement `ipixel` driver: uuids, `matches`, `namePrefix`, `minGapMs: 100`, `writeWithResponse: true`, caps all false, power/brightness/orientation/showSlot/deleteAll, empty rgb/speed/effect, `onConnect` (D2, D5). | T001, T004 | | `src/lib/protocol/ipixel.ts` | 🟡 | [X] |
| T008 | Implement size table and `parseDeviceInfo` / `onNotify` (D6). | T007, T005 | | `src/lib/protocol/ipixel.ts` | 🟡 | [X] |
| T009 | Register `ipixel` in `drivers`; confirm `allServices` includes `000000fa-…`. | T007 | | `src/lib/protocol/index.ts` | 🟢 | [X] |
| T010 | Store: `setPanel(id, info)`, `setOrientation(id, v)`; `forgetDevice` also drops stealth snapshot entries of the device. | T002, T006 | | `src/lib/store.svelte.ts` | 🟡 | [X] |
| T011 | Move `applyLook` from `Scenes.svelte` to new `look.ts` unchanged; add final panel step `showSlot` (D7). | T001 | `[//]` | `src/lib/look.ts` | 🟡 | [X] |
| T012 | Store: `enterStealth()` / `exitStealth()` using snapshot + `applyTo(..., {force:true})` + `applyLook` (D8). | T010, T011, T014 | | `src/lib/store.svelte.ts` | 🟡 | [X] |

## 4. Integration

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T013 | `addDevice`: add `{ namePrefix }` filters from drivers that set it (D3). | T009 | | `src/lib/ble.svelte.ts` | 🟡 | [X] |
| T014 | `applyTo`: skip empty frames; optional `{ force }` arg; stealth guard with `confirm` (D2, D9). | T002, T003 | | `src/lib/ble.svelte.ts` | 🟡 | [X] |
| T015 | `connectOnce`: start notifications when `driver.notifyChar`, route to `onNotify` → `setPanel`; non-fatal on failure (D4). | T008, T010, T013 | | `src/lib/ble.svelte.ts` | 🟡 | [X] |
| T016 | `connectOnce`: when stealth is on, push `power(false)` per output after `onConnect` frames (D10). | T014, T015 | | `src/lib/ble.svelte.ts` | 🟡 | [X] |
| T017 | `Scenes.svelte`: import `applyLook` from `look.ts`; show "Slot N" for entries with `look.panel`. | T011, T003 | `[//]` | `src/lib/ui/Scenes.svelte` | 🟡 | [X] |
| T018 | Header stealth toggle (≥ 48 px, `aria-pressed`, "Stealth ON" state) calling enter/exit. | T012, T003 | | `src/App.svelte` | 🟡 | [X] |
| T019 | DeviceCard iPixel block: size badge / unknown + Retry, slot input 1..100 + Show (sets `look.panel`), orientation select, Delete all with confirm (D11). | T010, T014, T003 | `[//]` | `src/lib/ui/DeviceCard.svelte` | 🟡 | [X] |

## 5. Polish

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T025 | Hook trace into `writeOnce` (write + ok/err), notify listener, connect/disconnect/error; add `source` to the `applyTo`/`sendFrames` options and tag callers (card, scene, stealth, debug, connect) (D13). | T023, T014, T015 | | `src/lib/ble.svelte.ts` | 🟡 | [X] |
| T020 | Debug: trace view (last 100 entries, hex), record on/off switch, Download log and Clear log buttons; last notification per device visible for the spike. | T015, T023 | `[//]` | `src/lib/ui/Debug.svelte` | 🟡 | [X] |
| T021 | Verify no regression: `npm test`, `npm run check`, `npm run build`, difftest emitter md5 `98622b8733585ad72d2b82a0aa7767e0`. | T016, T017, T018, T019, T020, T024, T025, T026 | | `tools/difftest/emit_ts_frames.ts` | 🟢 | [X] |
| T026 | Add trace strings (download, clear, record, empty) en + pt-BR. | T003 | | `src/lib/dict.ts` | 🟡 | [X] |
| T022 | `[//]` Add iPixel to supported devices list in README (en + pt-BR), marked "phase 1: power, brightness, slot". | T009 | `[//]` | `README.md` | 🟡 | [X] |
