# Debug Bench, Technical Design

> Reversa Writer · 2026-10-26 · unit `debug` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ui/Debug.svelte:1-215`, `src/lib/ble.svelte.ts:121-135,371-449`, `src/lib/hex.ts:1-11`

## Interface

### Types 🟢 (`ble.svelte.ts:371-372`)

| Symbol | Shape |
|---|---|
| `CharInfo` | `{ uuid: string /* full 128-bit, lowercase */, props: string[] }` |
| `ServiceInfo` | `{ uuid: string, chars: CharInfo[] }` |

### Functions 🟢

| Symbol | Signature | Returns | Notes |
|---|---|---|---|
| `inspect` | `(id) => Promise<ServiceInfo[]>` | services + chars | Uses `connectGatt` (3 attempts), not `connect`; throws "not paired" when there is no `live` entry |
| `propsOf` (private) | `(char) => string[]` | the subset of `READ, WRITE, WRITE_NR, NOTIFY, INDICATE` | from `char.properties` |
| `sendRaw` | `(id, frame, charUuid?) => Promise<void>` | — | See the flow; throws "not paired" or "characteristic not found" |
| `parseHex` | `(text) => Uint8Array` | bytes | Throws on an empty or odd number of digits |
| `toHex` | `(bytes) => string` | `'7E 04 …'` uppercase | Exported and re-exported by `ble.svelte.ts`; **no UI caller** 🟢 |

### Component state 🟢 (`Debug.svelte:7-21`)

| State | Default | Purpose |
|---|---|---|
| `deviceId` | `''` | target device |
| `services` | `[]` | last inspect result |
| `charUuid` | `''` | write target (`''` = the device's live characteristic) |
| `hex` | `'7E 04 04 01 00 01 FF 00 EF'` | frame input |
| `log` | `[]` | newest first, capped at 40 |
| `busy` | `false` | global action lock |
| `list` (derived) | `Object.values(conns)` | device options |
| `writable` (derived) | the UUIDs of chars with `WRITE` or `WRITE_NR` | target options |

## Main Flow

### Inspect 🟢 (`Debug.svelte:27-47`, `ble.svelte.ts:386-423`)
1. Stop without a `deviceId`. `busy = true`, `services = []`.
2. `inspect(id)`:
   1. `l = live.get(id)`, or throw "not paired in this session".
   2. `server = await connectGatt(l.device)` (3 attempts, backoff).
   3. `services = await server.getPrimaryServices()`; on a throw, for each `allServices` UUID: `getPrimaryService(uuid)`, skipping misses.
   4. For each service: `getCharacteristics()` (`[]` on a throw); map each to `{uuid, props: propsOf(c)}`.
3. Log `"{services} service(s), {chars} characteristic(s)"`.
4. When `conns[id].lastLinkMs < 3000`: log the missing-handshake warning.
5. When `charUuid` is empty and `writable` is non-empty: `charUuid = writable[0]`.
6. On error, log `ERRO: …`; `finally`, `busy = false`.

`inspect` does not change `Conn.state` or `live.char`: the device can be GATT-connected while the UI still shows it offline. 🟢

### Send 🟢 (`Debug.svelte:49-61`, `ble.svelte.ts:425-449`)
1. Stop without a `deviceId`. `busy = true`.
2. `frame = parseHex(hex)`:
   1. `clean = text.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '')`.
   2. When `clean` is empty or of odd length, throw.
   3. Split into pairs, `parseInt(…, 16)`.
3. `sendRaw(id, frame, charUuid || undefined)`:
   - **Branch A, a different characteristic** (`charUuid` set and `≠ live.char?.uuid`):
     1. `server = await connectGatt(device)`.
     2. For each `getPrimaryServices()` → each `getCharacteristics()`: when `ch.uuid === charUuid`, `await queue.push(() => writeRaw({...l, char: ch}, frame, driver))` and return.
     3. No match → throw "characteristic {uuid} not found".
     - There is no `connect()`, so no handshake and no state change, and there is no fallback when `getPrimaryServices()` is not allowed.
   - **Branch B, default characteristic:** when not online, `await connect(id)` (handshake included); then `queue.push(() => writeRaw(l, frame, driver))`.
4. Log `"enviado {n}B → {uuid | 'padrão'}"`, or the error; `busy = false`.

`writeRaw` applies the driver's chunking and write mode, so a raw frame to a BLEDIM is split into 20-byte writes with response. 🟢

### Sweep 🟢 (`Debug.svelte:107-125`)
1. Stop without a `deviceId`. `busy = true`. Log the start line.
2. For each `[label, frame]` in the set:
   1. `try sendRaw(id, parseHex(frame), charUuid || undefined)` → log `label → frame`; `catch` → log `label ERRO: …`.
   2. `await wait(1500)` (also after the last frame).
3. Log the end line; `busy = false` (not in `finally`, but every step is caught, so it is always reached).

Total durations: power-on 7.5 s, effect 6 s, channels 6 s.

### Presets 🟢
Each preset button sets `hex = frame` and calls `send()`.

## Alternative Flows
- **Device never tracked this session** 🟢: `inspect` and `sendRaw` throw "not paired"; it is logged.
- **Browser forbids `getPrimaryServices()`** 🟢: `inspect` falls back to probing the known UUIDs. `sendRaw` branch A has **no** fallback and logs the error.
- **Inspect before connect, then Send** 🟡: `charUuid` is preselected while `live.char` is still undefined, so `charUuid ≠ live.char?.uuid` and Send takes branch A. That path writes without the handshake, so ffe0 controllers may ignore the frame. To send through the normal path, clear the target or connect first.
- **Busy lock** 🟢: one global flag, so a sweep blocks every other button for its whole duration.
- **Write failure inside the queue** 🟢: it rejects to `sendRaw` and is logged; the queue continues.

## Dependencies
- `device-connection/`: `conns`, `live`, `connectGatt`, `connect`, `lastLinkMs`, `allServices`.
- `device-control/`: `WriteQueue.push`, `writeRaw` (chunking, write mode).
- `hex.ts`: `parseHex`, `toHex`.
- Browser Web Bluetooth: `getPrimaryServices`, `getPrimaryService`, `getCharacteristics`, characteristic properties.

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| Inspect bypasses driver resolution | `Debug.svelte:32-33` | 🟢 |
| Raw writes reuse the device queue | `ble.svelte.ts:440,448` | 🟢 |
| Candidate frames hardcoded from the decompiled apps and elkbledom sniffing, cross-referenced in `docs/protocol/variants.md` | `Debug.svelte:63-68` | 🟢 |
| A fixed 1.5 s gap for human observation | `Debug.svelte:121` | 🟢 |
| No confirmation and no gating in production | `permissions.md` G7 | 🟢 |
| The log is component-local and not persisted | `Debug.svelte:11,23-25` | 🟢 |

## Internal State
Component-local only (table above); nothing persisted. The log, the inspect result and the chosen target are lost when the tab changes, because `App.svelte` renders the tabs with `{#if tab === …}`, which unmounts Debug. 🟢

## Observability
The Debug log **is** the unit's observability: time-stamped lines for inspect results, sends, sweep steps and errors. There is no console logging. 🟢

## Risks and Gaps
- 🟢 **F6:** the whole UI is in Portuguese.
- 🟢 Branch A of `sendRaw` skips the handshake and has no service-listing fallback.
- 🟢 `inspect` leaves a GATT link open without updating `Conn.state`.
- 🟢 `toHex` is a dead export: nothing in `src/` or `tools/` calls it.
- 🟡 The quick-drop warning threshold (3000 ms) differs from the code comment in `track()` ("a couple of seconds"); both are heuristics.
- 🟢 The log does not survive a tab switch; consider keeping it in a module-level store when sweeps are used for hardware sessions (G2).
