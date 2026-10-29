# Device Connection, Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `device-connection` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md` and `design.md` in this folder.

## Prerequisites
- [ ] `protocol-drivers/` is available: `drivers` registry in the order `[bledim, fff0, ffe0]`, `driverFor`, `allServices`, and each driver's `service`, `writeChar`, `minGapMs`, `onConnect`
- [ ] `WriteQueue` is available with `push` and a per-instance gap (see `device-control/`)
- [ ] `persistence/` exposes `store.devices`, `rememberDevice` and `forgetDevice`
- [ ] `endpoint.ts` exposes `parseEp`
- [ ] The app is served from HTTPS or `localhost` (Web Bluetooth secure context)
- [ ] There is no backend, no environment variables and no database

## Tasks

- [ ] T-01, Define `ConnState`, `Conn`, the private `Live`, and the module state `conns` (reactive), `selection` (reactive), `live` and `connectedAt` (plain maps)
  - Legacy source: `src/lib/ble.svelte.ts:11-39`
  - Done when: the UI re-renders on `conns[id].state` changes, while `live` and `connectedAt` changes trigger no render
  - Confidence: 🟢

- [ ] T-02, Implement `supported()` and `displayName()`
  - Legacy source: `src/lib/ble.svelte.ts:8-9,41-42`
  - Done when: `supported()` is false without `navigator.bluetooth`; `displayName({name:'X', label:''})` returns `'X'`
  - Confidence: 🟢

- [ ] T-03, Implement `track(device, driver)`: create or refresh `Conn` (name and label from the store), create `Live` with `new WriteQueue(driver.minGapMs)` only when absent, register the `gattserverdisconnected` handler, and persist with `rememberDevice`
  - Legacy source: `src/lib/ble.svelte.ts:44-66`
  - Done when: calling `track` twice keeps one `Conn` and one `Live`; the drop handler sets `offline`, `lastLinkMs` and clears `char`
  - Confidence: 🟢
  - Note: register the listener **once** per device (fixes F10); a re-implementation should not repeat the leak.

- [ ] T-04, Implement `connectGatt(device)`: 3 attempts, `400·(n+1)` ms backoff, disconnect a half-open link between attempts, set `connectedAt` on success
  - Legacy source: `src/lib/ble.svelte.ts:116-135`
  - Done when: with a mock that fails twice and then succeeds, the call resolves after about 1200 ms of sleep; with three failures it rejects with the last error
  - Confidence: 🟢

- [ ] T-05, Implement `resolveDriver(server, guess)`: probe the guess first, then the other drivers in registry order; documented char first, then any `write`/`writeWithoutResponse` char; collect seen short ids for the error
  - Legacy source: `src/lib/ble.svelte.ts:152-190`
  - Done when: (a) FFF0 with only FFF1 writable resolves to bledim/FFF1; (b) an FFE0 device with a bledim guess resolves to ffe0; (c) a service with only read chars throws a message listing their ids; (d) no known service throws "no known service"
  - Confidence: 🟢

- [ ] T-06, Implement `connect(id)`: guard on missing `live`/`conns`; no-op when online with `char`; `connecting` → GATT → resolve → swap driver and queue when changed → `online` → push `onConnect` frames; on error set `error` with `explain(e)` and rethrow
  - Legacy source: `src/lib/ble.svelte.ts:192-219`
  - Done when: the acceptance scenarios "Add a recognized device", "Name lies about the family" and "No compatible service" pass; handshake frames are written before any command queued after `connect` started
  - Confidence: 🟢

- [ ] T-07, Implement `explain(e)` with the three hint rules
  - Legacy source: `src/lib/ble.svelte.ts:137-150`
  - Done when: each of the three message classes gets its hint and other messages pass through unchanged
  - Confidence: 🟢
  - Note: put the hint text in the dictionary (`i18n/`) instead of hardcoding Portuguese (F6).

- [ ] T-08, Implement `addDevice()`: `requestDevice` with one filter per service and `optionalServices = allServices`; guess = `driverFor(name) ?? drivers[0]`; `track`; `connect`; return the `Conn`
  - Legacy source: `src/lib/ble.svelte.ts:101-112`
  - Done when: the chooser lists only compatible devices, and the picked device ends online and saved
  - Confidence: 🟢

- [ ] T-09, Implement `restore()`: seed `conns` from saved devices with a known driver; `track` `getDevices()` results when the API exists, swallowing errors; then `allSettled(connect)` over every `conns` key, silencing failures
  - Legacy source: `src/lib/ble.svelte.ts:68-99`
  - Done when: without `getDevices`, saved devices list as offline and no error surfaces; with it, granted devices come online when the browser allows it
  - Confidence: 🟢

- [ ] T-10, Implement `disconnect(id)` and `forget(id)` with the full cascade (conns, live, connectedAt, selection keys of that device, `forgetDevice`)
  - Legacy source: `src/lib/ble.svelte.ts:221-242`
  - Done when: after forget and reload, the device is gone from the UI, the selection and the store
  - Confidence: 🟢

- [ ] T-11, Wire the UI: `App` calls `restore()` on mount and shows the unsupported banner; `Devices` provides Add (busy state, hides cancel errors), Connect all (`allSettled`), and per-row connect / disconnect / forget with the state, error and link time shown
  - Legacy source: `src/App.svelte:26,50-53`, `src/lib/ui/Devices.svelte:39-156`
  - Done when: the buttons are disabled while busy; a cancelled chooser shows nothing; a per-device error shows on its row
  - Confidence: 🟢

- [ ] T-12, Guard concurrent connects: when `state === 'connecting'`, return the in-flight promise instead of starting a second GATT connect
  - Legacy source: not in the legacy code (gap in `src/lib/ble.svelte.ts:192-199`)
  - Done when: two simultaneous `connect(id)` calls produce one `gatt.connect()`
  - Confidence: 🟡 (improvement, not current behaviour; skip for a strict port)

## Test Tasks

> The legacy code has no tests for `ble.svelte.ts` because it needs a mocked Web Bluetooth. A fake `BluetoothDevice` / GATT server is the first test task.

- [ ] TT-01, Build a fake GATT layer: a device with a configurable name, services, characteristics (props), a connect failure count, and a drop trigger
- [ ] TT-02, Happy path: add an LEDBLE device → `online`, ffe0 driver, auth frame first (requirements, "Add a recognized device")
- [ ] TT-03, Driver correction: the unknown-name and lying-name scenarios; the queue gap follows the resolved driver
- [ ] TT-04, Main error case: no compatible service → `state='error'` and the hint text
- [ ] TT-05, Retry: fail, fail, succeed → `online`; fail ×3 → `error`
- [ ] TT-06, Drop: a link up for 1.2 s, then a drop → `offline`, `lastLinkMs ≈ 1200`, `char` cleared; the next `connect` reconnects
- [ ] TT-07, Forget cascade: the device, its selection keys and its store entry are removed, and `restore()` does not bring it back
- [ ] TT-08, Restore without `getDevices`: no throw, devices listed offline

## Data Migration Tasks
- [ ] TM-01, None for this unit. The saved device shape (`id`, `name`, `label`, `driverId`) belongs to `persistence/`.

## Suggested Order
1. T-01, T-02 (types and state); TT-01 (the fake GATT layer unblocks every other test).
2. T-04 → T-05 → T-07 → T-06 (connect depends on retry, resolution and hints).
3. T-03 → T-08 → T-09 → T-10 (lifecycle around `connect`).
4. T-11 (UI) last; T-12 optional.
5. Blocker: T-06 needs `WriteQueue` and the driver `onConnect` frames from `protocol-drivers/`.

## Pending Gaps (🔴)
- None blocking. 🟡 Decide before implementation:
  - whether to keep the queue-based handshake or add the vendor's 300 ms delay (only LEDBLE-00 is confirmed on hardware);
  - whether to fix F10 and the concurrent-connect race (T-12), or port them as they are.
