# Device Connection, Technical Design

> Reversa Writer · 2026-10-26 · unit `device-connection` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ble.svelte.ts`, `src/lib/ui/Devices.svelte`, `src/App.svelte`, `state-machines.md` SM-1, `adrs/001`, `adrs/003`

## Interface

### Types 🟢

| Symbol | Shape | Notes |
|---|---|---|
| `ConnState` | `'offline' \| 'connecting' \| 'online' \| 'error'` | See SM-1 |
| `Conn` | `{ id, name, label?, driver: Driver, state: ConnState, error?, lastLinkMs? }` | Reactive (`$state`), what the UI renders |
| `Live` (private) | `{ device: BluetoothDevice, char?: BluetoothRemoteGATTCharacteristic, queue: WriteQueue }` | Not reactive; `char` set means "has a writable handle" |

### Module state 🟢

| Symbol | Type | Reactive | Purpose |
|---|---|---|---|
| `conns` | `Record<deviceId, Conn>` | yes | UI list of devices and their states |
| `selection` | `{ ids: string[] }` | yes | Endpoint keys targeted by the next command (owned by `device-control`, cleaned here on forget) |
| `live` | `Map<deviceId, Live>` | no | GATT handles and write queues |
| `connectedAt` | `Map<deviceId, epochMs>` | no | Time of the last successful GATT connect, for `lastLinkMs` |

### Functions

| Symbol | Signature | Returns | Notes |
|---|---|---|---|
| `supported` | `()` | `boolean` | `'bluetooth' in navigator` 🟢 |
| `displayName` | `(c: {name, label?})` | `string` | `label \|\| name`; display only 🟢 |
| `restore` | `()` | `Promise<void>` | Never throws 🟢 |
| `addDevice` | `()` | `Promise<Conn \| undefined>` | Throws on chooser cancel (caller filters it) 🟢 |
| `connect` | `(id: string)` | `Promise<void>` | Throws `Error(explain(e))` and sets `state='error'` 🟢 |
| `disconnect` | `(id: string)` | `void` | Synchronous state change 🟢 |
| `forget` | `(id: string)` | `void` | Cascades to the store 🟢 |
| `track` (private) | `(device, driver)` | `void` | Creates or refreshes `Conn` and `Live`; persists 🟢 |
| `connectGatt` (private) | `(device)` | `Promise<BluetoothRemoteGATTServer>` | 3 attempts 🟢 |
| `resolveDriver` (private) | `(server, guess: Driver)` | `Promise<{driver, char}>` | GATT probe 🟢 |
| `explain` (private) | `(e: unknown)` | `string` | Error hints, hardcoded Portuguese (F6) 🟢 |

### Driver fields consumed 🟢
`id`, `service`, `writeChar`, `minGapMs`, `matches(name)`, `onConnect?(name): Uint8Array[]`. Registry from `protocol/index.ts`: `drivers = [bledim, fff0, ffe0]`, `driverFor(name)`, `allServices`.

## Main Flow

### Add a device 🟢
1. `Devices.add()` sets `busy=true`, clears `error`, calls `addDevice()` (`Devices.svelte:73-83`).
2. `navigator.bluetooth.requestDevice({ filters: allServices.map(s => ({services:[s]})), optionalServices: allServices })` (`ble.svelte.ts:103-106`).
3. Guess = `driverFor(device.name ?? '') ?? drivers[0]` (`:109`).
4. `track(device, guess)` (`:44-66`):
   1. `name = device.name ?? '(sem nome)'`.
   2. `conns[id] ??= { id, name, driver, state:'offline' }`, then refresh `name` and `label` from `store.devices`.
   3. If `live` has no entry: create `{ device, queue: new WriteQueue(driver.minGapMs) }`.
   4. Add the `gattserverdisconnected` listener (see Alternative flows).
   5. `rememberDevice({ id, name, label, driverId: driver.id })`.
5. `connect(device.id)`, below.

### Connect 🟢 (`ble.svelte.ts:192-219`)
1. Look up `l = live.get(id)` and `c = conns[id]`; if either is missing, throw "device not paired in this session, use Add".
2. If `c.state === 'online' && l.char`, return.
3. `c.state = 'connecting'`, `c.error = undefined`.
4. `server = await connectGatt(l.device)`:
   - for `attempt` in 0..2: `device.gatt.connect()`; on success set `connectedAt[id] = now` and return;
   - on failure: if `gatt.connected`, `disconnect()`; sleep `400·(attempt+1)` ms;
   - after 3 failures, rethrow the last error.
5. `resolved = await resolveDriver(server, c.driver)`:
   - `order = [guess, ...drivers without guess]`;
   - for each driver: `getPrimaryService(driver.service)`, or skip on throw;
   - `getCharacteristic(driver.writeChar)`, or else `getCharacteristics()`: record the short ids (`uuid.slice(4,8)`) in `seen` and take the first one with `write || writeWithoutResponse`;
   - when nothing matches, throw "service found but no writable characteristic. Seen: …" if `seen` is non-empty, otherwise "no known service found".
6. If `resolved.driver !== c.driver`: set `c.driver = resolved.driver` and `l.queue = new WriteQueue(resolved.driver.minGapMs)`.
7. `l.char = resolved.char`; `c.state = 'online'`.
8. For each frame of `c.driver.onConnect?.(c.name) ?? []`: `await l.queue.push(() => writeRaw(l, frame, c.driver))`.
9. On any exception in steps 4–8: `c.state = 'error'`, `c.error = explain(e)`, throw `new Error(c.error)`.

Handshake frames per family (built in `protocol-drivers/`):

| Family | Condition | Frame |
|---|---|---|
| ffe0 | name matches `^(LEDBLE\|LEDDMX\|LEDCAR\|LED[_ ]BLE)` | `authFrame(now)` = `2A 02 A1 23 45 67 <tb> <min> AF` 🟢 |
| bledim | always | `serialCodeFrame(now)` = cmd `0x89 [sec, ms&0xFF]` 🟢 |
| fff0 | — | none 🟢 |

### Restore on load 🟢 (`ble.svelte.ts:74-99`)
1. `App.svelte` calls `restore()` in `onMount` (`App.svelte:26`).
2. If not `supported()`, return.
3. For each `store.devices` entry whose name has a driver: `conns[id] ??= { …, state:'offline' }`. These have **no `live` entry yet**, so `connect` on them throws "not paired" until the device is tracked.
4. If `navigator.bluetooth.getDevices` exists: `track` every granted device with a recognized name; swallow errors.
5. `Promise.allSettled(Object.keys(conns).map(id => connect(id).catch(()=>{})))`.

### Disconnect and forget 🟢
- `disconnect(id)`: `gatt.disconnect()` if connected, and `conns[id].state = 'offline'` (`:237-242`).
- `forget(id)`: `disconnect`; `delete conns[id]`; `live.delete`; `connectedAt.delete`; drop selection keys whose `parseEp(k).deviceId === id`; `forgetDevice(id)` in the store (`:228-235`).

## Alternative Flows
- **Device drops the link** 🟢 (listener from `track`): `state='offline'`; when `connectedAt` has the id, `lastLinkMs = now − connectedAt`; delete `connectedAt`; `live.char = undefined`. The next command reconnects (BR-12).
- **Chooser cancelled** 🟢: `requestDevice` rejects; `Devices.add` hides messages matching `/cancel|User cancelled/i`.
- **Connect while connecting** 🟡: there is no guard on `state==='connecting'`, so two concurrent `connect(id)` calls run two GATT connects. Web Bluetooth tends to share the pending connect, but this is not guaranteed.
- **Command on an offline device** 🟢: `applyTo`, `sendFrames` and `sendRaw` await `connect` first (see `device-control/`).
- **Saved but not granted** 🟢: after a reload without `getDevices`, the device shows offline, and connecting throws "not paired in this session, use Add". 🟡 Adding it again re-tracks it under the same `id`, assuming the browser keeps `BluetoothDevice.id` stable per origin.
- **Connect all** 🟢: `Promise.allSettled(list.map(c => connect(c.id)))`; each per-device error shows on its row (`Devices.svelte:86-90,147`).

### Error hints (`explain`) 🟢

| Raw message matches | Hint appended (Portuguese today) |
|---|---|
| `NetworkError`, `GATT Server is disconnected`, `connection attempt failed` | another app may be holding the device; force-stop it and retry |
| `No Services matching UUID`, `Nenhum serviço conhecido` | use the Debug tab to list what the device really exposes |
| `SecurityError`, `not allowed` | origin not allowed; check that the page is on HTTPS |
| anything else | the raw message |

## Dependencies
- **Web Bluetooth API** (browser): `requestDevice`, `getDevices` (optional), GATT connect, service and characteristic discovery, `gattserverdisconnected`.
- **`protocol/index.ts`**: driver registry, name hints, service list, `onConnect` frames.
- **`queue.ts` (`WriteQueue`)**: per-device pacing for the handshake and everything after it (see `device-control/`).
- **`store.svelte.ts`**: `store.devices`, `rememberDevice`, `forgetDevice` (see `persistence/`).
- **`endpoint.ts`**: `parseEp`, used to clean the selection on forget.

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| PWA on Web Bluetooth with no backend | `adrs/001`, `ble.svelte.ts` | 🟢 |
| Driver confirmed by GATT probe; name is only a hint | `ble.svelte.ts:152-190`, `adrs/003` | 🟢 |
| Any writable characteristic in the family's service is accepted | `ble.svelte.ts:171-183` | 🟢 |
| Queue recreated when the driver changes, because pacing is per family | `ble.svelte.ts:203-207` | 🟢 |
| Handshake goes through the queue instead of a fixed 300 ms delay | `ble.svelte.ts:210-213` | 🟢 code / 🟡 hardware equivalence |
| One device per chooser call | `ble.svelte.ts:101` | 🟢 |
| Reactive `conns` separate from non-reactive `live` | `ble.svelte.ts:32-39` | 🟢 |

## Internal State
- Per device, `Conn` follows SM-1: `offline → connecting → online | error`; `online → offline` on drop or disconnect; `error → connecting` on retry. 🟢
- `live[id].char` is the only proof of a usable link; `connect` checks both `state` and `char`. 🟢
- `live[id].queue` is replaced only when the driver changes; queued ops on the old queue still run against the shared `Live` object. 🟡
- `connectedAt[id]` lives from GATT connect to drop. 🟢
- Nothing in this unit is persisted except through `rememberDevice` / `forgetDevice`. 🟢

## Observability
- No logging or telemetry. 🟢
- User-visible signals: `Conn.state`, `Conn.error` (shown on the device row), `Conn.lastLinkMs` (short links hint at a missing handshake), and the online counter in the shell (`App.svelte`). 🟢

## Risks and Gaps
- 🟢 **F10:** `track()` adds a new `gattserverdisconnected` listener on every call (restore + add + re-add), so listeners pile up. They are idempotent, but they leak.
- 🟢 **F6:** `explain()`, `resolveDriver`, `connect` errors and `'(sem nome)'` are hardcoded in Portuguese while the default locale is English. A reimplementation should route them through `i18n/`.
- 🟡 There is no guard against concurrent `connect(id)` while `connecting`.
- 🟡 The handshake is not delayed 300 ms as in the vendor app. It is fine on LEDBLE-00 (the only family confirmed on hardware, BR-53); it is unverified elsewhere.
- 🟡 Restore seeds `conns` for saved devices without a `live` entry, so a command on them fails silently in `applyTo` (it returns early on `!l`) until the user re-adds the device.
- 🟡 When the queue is replaced, writes still pending on the old queue are not cancelled; they keep their old gap.
