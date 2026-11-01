# Device Connection

> Reversa Writer · 2026-10-24 · unit `device-connection` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ble.svelte.ts`, `src/lib/ui/Devices.svelte`, `src/App.svelte`, `domain.md`, `state-machines.md` (SM-1), `permissions.md`

## Overview
Owns the Web Bluetooth lifecycle of every LED controller: picking a device in the browser chooser, connecting with retries, confirming the protocol family by probing GATT, sending the family handshake, re-adopting devices after a reload, and disconnecting or forgetting them. Nothing else in the app talks to GATT directly, except the Debug bench (see `debug/`). 🟢

## Responsibilities
- Detect whether Web Bluetooth is available and let the app run without it 🟢
- Add one device per chooser call, filtered by the known service UUIDs 🟢
- Connect to GATT with retry and backoff 🟢
- Resolve the real driver from the services and characteristics present, not from the name alone 🟢
- Send the family handshake (`onConnect`) right after the link goes online 🟢
- Keep a UI-visible connection state per device (`Conn`) and a hidden live handle (`Live`) 🟢
- Re-adopt saved and already-granted devices on load, and try to reconnect them 🟢
- Disconnect and forget devices, cascading to the store 🟢
- Turn low-level errors into actionable hints 🟢

## Business Rules
- **BR-01** The advertised name is the model identifier and is never edited; the user renames through `label`. `displayName = label || name` is for display only and must never reach a driver. 🟢 (`ble.svelte.ts:8-9`)
- **BR-02** The name is only a hint. The driver is confirmed by which GATT service exists: try the guessed driver first, then every other one in registry order. 🟢 (`ble.svelte.ts:157-190`)
- **BR-03** A driver matches if its service exists and exposes its documented write characteristic, or failing that **any** characteristic with `write` or `writeWithoutResponse`. 🟢 (`ble.svelte.ts:174-183`)
- **BR-04** When the resolved driver differs from the guess, the device's write queue is recreated with the new driver's `minGapMs`, because pacing is per family. 🟢 (`ble.svelte.ts:203-207`)
- **BR-12** A command on a device that is not online reconnects it first (callers: `applyTo`, `sendFrames`, `sendRaw`). 🟢 (`ble.svelte.ts:324,363,447`)
- **BR-35** Forgetting a device removes it from the live connection state **and** the store; otherwise `restore()` brings it back on reload. 🟢 (`ble.svelte.ts:221-235`)
- **BR-C1** A device the user just added with an unrecognized name falls back to `drivers[0]` (bledim) as the guess; the GATT probe corrects it. 🟢 (`ble.svelte.ts:109`)
- **BR-C2** On restore, saved devices are shown only if some driver recognizes their name; granted devices with unrecognized names are not tracked. 🟢 (`ble.svelte.ts:76-88`)
- **BR-C3** Auto-connect on load is best effort and silent; "Connect all" is the reliable path because the browser may require a user gesture. 🟢 (`ble.svelte.ts:93-98`)
- **BR-C4** A cancelled chooser is a normal outcome and shows no error. 🟢 (`Devices.svelte:78-80`)
- **BR-C5** Handshake frames are queued only after the state becomes `online`, through the same FIFO queue as commands, so a racing command cannot overtake them. 🟡 The original vendor app waits 300 ms after connecting; this implementation relies on the queue gap instead.
- **BR-C6** A link that dies within a couple of seconds usually means the device expected a handshake we did not send; the app records `lastLinkMs` to show this. 🟢 (`ble.svelte.ts:57-59`)

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | `supported()` returns true only when `navigator.bluetooth` exists; the app renders a warning banner instead of blocking when false | Must | Without Web Bluetooth, the shell renders with `common.unsupported` and the saved data is still viewable |
| RF-02 | `addDevice()` opens `requestDevice` with one filter per known service UUID and `optionalServices = allServices`, then tracks and connects the chosen device | Must | The chooser lists only devices exposing FFF0 or FFE0; after a pick, the device appears in `conns` and in `store.devices` |
| RF-03 | `connectGatt` makes up to 3 attempts with backoff `400·(n+1)` ms, disconnecting a half-open link between attempts | Must | A first attempt that throws, followed by a success, ends `online`; three failures rethrow the last error |
| RF-04 | `resolveDriver` returns the first driver (guess first) whose service is present and has a writable characteristic | Must | A BLEDIM exposing FFF1 instead of FFF3 resolves to `bledim` with FFF1 |
| RF-05 | When no family matches, the connection fails with an error listing the characteristic ids that were seen, or "no known service" if none | Must | The `Conn.error` text contains the seen ids |
| RF-06 | `connect(id)` is a no-op when the device is already online with a live characteristic | Must | Connecting an online device sends no GATT connect. 🟢 Today two **concurrent** `connect` calls on an offline device run two GATT connects (`ble.svelte.ts:194-204`, no in-flight promise); deduplicating them is target behaviour, see T-12. [external review R01] |
| RF-07 | After the state becomes `online`, `connect` pushes every `driver.onConnect(name)` frame through the queue | Must | An LEDBLE device receives the `2A 02 …` auth frame before any command |
| RF-08 | A `gattserverdisconnected` event sets the state to `offline`, clears the live characteristic and records `lastLinkMs = now − connectedAt` | Must | Turning the device off shows it offline with the link duration |
| RF-09 | `restore()` seeds `conns` from `store.devices`, then tracks `navigator.bluetooth.getDevices()` results when available, then tries to connect every device, ignoring failures | Should | After a reload, saved devices show without the chooser; granted devices come online without a click when the browser allows it |
| RF-10 | `disconnect(id)` closes the GATT link and sets the state to `offline` synchronously | Must | The state reads `offline` immediately after the click |
| RF-11 | `forget(id)` disconnects, then deletes the device from `conns`, `live`, `connectedAt` and the selection, then calls `forgetDevice(id)` | Must | After forget and reload, the device does not reappear |
| RF-12 | "Connect all" calls `connect` on every listed device in parallel and disables the buttons while busy | Should | One failing device does not stop the others |
| RF-13 | Connection errors are rewritten into hints: another app holds the device; use the Debug tab; the page needs HTTPS | Should | A `NetworkError` shows the "another app may be holding the device" hint |
| RF-14 | `track()` persists the device (`id`, `name`, `label`, `driverId`) through `rememberDevice` | Must | A newly added device survives a reload |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Availability | 3 GATT connect attempts with linear backoff (400, 800, 1200 ms) to absorb busy radios on Android | `src/lib/ble.svelte.ts:121-135` | 🟢 |
| Availability | Auto-reconnect before any command on an offline device | `src/lib/ble.svelte.ts:324` | 🟢 |
| Security | Works only in a secure context (HTTPS or localhost); a device is reachable only after an explicit user pick in the browser chooser | `permissions.md`, `ble.svelte.ts:102-106` | 🟢 |
| Security | Access to services is limited to the declared `allServices` | `src/lib/ble.svelte.ts:105` | 🟢 |
| Compatibility | Chrome or Edge on desktop or Android; iOS is unsupported and gets a non-blocking banner | `src/App.svelte:50-53` | 🟢 |
| Usability | Error messages say what to do next | `src/lib/ble.svelte.ts:137-150` | 🟢 |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: Add a recognized device
  Given Web Bluetooth is available and the page is served over HTTPS
  When the user clicks Add and picks "LEDBLE-00-1234" in the chooser
  Then the device is tracked with the ffe0 driver
  And it is saved in the store
  And its state becomes "online"
  And the auth frame "2A 02 A1 23 45 67 …" is written before any other frame

Scenario: Name lies about the family
  Given a device named "BLEDIM" whose FFF0 service exposes only FFF1
  When the app connects to it
  Then the driver resolves to "bledim" using characteristic FFF1

Scenario: Unknown name falls back and gets corrected
  Given a device with an unrecognized name that exposes FFE0/FFE1
  When the user adds it
  Then the initial guess is "bledim"
  And after connecting the driver is "ffe0"
  And the write queue uses a 50 ms gap

Scenario: No compatible service
  Given a device exposing neither FFF0 nor FFE0
  When the app connects to it
  Then the state becomes "error"
  And the error contains "use the Debug tab" as a hint

Scenario: Flaky first connect
  Given the first GATT connect throws
  And the second succeeds
  When the app connects
  Then the state ends "online" after about 400 ms of backoff

Scenario: Cancelled chooser
  Given the chooser is open
  When the user cancels it
  Then no error card is shown

Scenario: Device drops the link
  Given a device has been online for 1.2 s
  When it fires gattserverdisconnected
  Then its state is "offline"
  And lastLinkMs is about 1200

Scenario: Forget is permanent
  Given a saved device that is online and selected
  When the user forgets it and reloads the page
  Then it is not listed, not selected and not in the store
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-02 add, RF-03 retry, RF-04/05 resolve, RF-06 idempotent connect | Must | Critical path of every command |
| RF-07 handshake | Must | ffe0 ignores every command without it |
| RF-08 drop handling, RF-10 disconnect, RF-11 forget, RF-14 persist | Must | Called from several components; forget has a data-integrity rule |
| RF-01 unsupported banner | Must | Without it the app crashes on iOS |
| RF-09 restore, RF-12 connect all | Should | Convenience; the chooser path still works |
| RF-13 error hints | Should | Diagnostic help |

> Priority inferred from call frequency and position in the dependency chain.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `src/lib/ble.svelte.ts` | `supported`, `track`, `restore`, `addDevice`, `connectGatt`, `explain`, `resolveDriver`, `connect`, `forget`, `disconnect`, `Conn`, `ConnState`, `displayName` | 🟢 |
| `src/lib/ui/Devices.svelte` | `add`, `connectAll`, connect / disconnect / forget buttons | 🟢 |
| `src/App.svelte` | `onMount(restore)`, unsupported banner | 🟢 |
| `src/lib/protocol/index.ts` | `drivers`, `driverFor`, `allServices` | 🟢 (consumed) |

## Re-extraction 2026-11-01 (`374da11..56af9f9`)

> Delta from features 001 (iPixel phase 1, stealth, trace), 002 (panel content) and PR #6. Earlier sections above are unchanged unless noted here.

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-15 | 🟢 The probe-confirmed `driverId` is saved and preferred over the name guess on `track`/`restore` (BR-02) | Must | An iPixel named `LED_BLE_xx` reloads as `ipixel`, not `ffe0` |
| RF-16 | 🟢 `listen` enables notifications on every notify/indicate char of the resolved service **before** `onConnect`; replies go to `driver.onNotify` and to the device's ACK waiter | Must | iPixel connect logs `0A 00 01 80 81 …` and saves 32×32 |
| RF-17 | 🟢 On "no longer in range" `connectGatt` waits ≤ 6 s for one advertisement (`watchAdvertisements`) and retries; unsupported → old behaviour | Must | After reopening the app the panel connects without re-adding (confirmed on Android 2026-11-01) |
| RF-18 | 🟢 A device that connects while stealth is on is powered off and its look joins the snapshot (BR-70) | Must | Connect during stealth → `power off` write tagged `stealth` |
