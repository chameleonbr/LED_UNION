# Debug Bench, Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `debug` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md` and `design.md` in this folder.

## Prerequisites
- [ ] `device-connection/` is done: `conns`, `live`, `connectGatt`, `connect`, `allServices`, `lastLinkMs`
- [ ] `device-control/` is done: `WriteQueue.push`, `writeRaw`
- [ ] `i18n/` T-07 has added `debug.*` keys (or this unit adds them)
- [ ] There is no backend, no environment variables and no database

## Tasks

- [ ] T-01, Implement `parseHex` (strip `0x` and non-hex characters; even, non-zero digit count; error through i18n) and `toHex` (uppercase, space-separated). Drop `toHex` if it stays unused.
  - Legacy source: `src/lib/hex.ts:1-11`
  - Done when: `"7E040401"`, `"7e 04 04 01"` and `"0x7E,0x04,0x04,0x01"` all parse to the same 4 bytes; `"7E0"` and `""` throw
  - Confidence: 🟢

- [ ] T-02, Implement `inspect(id)`:
  - use `connectGatt` (not `connect`);
  - read `getPrimaryServices()`, falling back to probing `allServices` one by one;
  - read the characteristics of each service (`[]` on error), with `propsOf` names.
  - Legacy source: `src/lib/ble.svelte.ts:371-423`
  - Done when: the "Inspect an unknown device" scenario passes against a fake GATT whose driver resolution fails
  - Confidence: 🟢

- [ ] T-03, Implement `sendRaw(id, frame, charUuid?)`:
  - **branch A** (a different characteristic): find it across services and `push` the write with that characteristic;
  - **branch B** (default): `connect` when offline, then `push`;
  - both go through the device queue and `writeRaw`.
  - Legacy source: `src/lib/ble.svelte.ts:425-449`
  - Done when: both branches write through the queue; an unknown UUID throws "characteristic not found"
  - Confidence: 🟢
  - Note: consider `await connect(id)` in branch A too, so ffe0 gets its handshake. It is a behaviour change, so confirm with the owner.

- [ ] T-04, Build the Debug UI:
  - device select (`displayName — state`);
  - Inspect GATT (service and characteristic list with props);
  - "Write to" select of the writable characteristics, preselecting the first after an inspect;
  - hex input (default `7E 04 04 01 00 01 FF 00 EF`) and Send.
  - Legacy source: `src/lib/ui/Debug.svelte:1-61,128-170`
  - Done when: the "Raw send" and "Bad hex" scenarios pass
  - Confidence: 🟢

- [ ] T-05, Add the quick-drop warning when `lastLinkMs < 3000` after an inspect
  - Legacy source: `src/lib/ui/Debug.svelte:37-40`
  - Done when: the "Quick drop warning" scenario passes
  - Confidence: 🟢

- [ ] T-06, Add the sweeps and presets: the 4 frame sets exactly as tabled in `requirements.md`; each sweep logs start, each frame or error, and end, with 1.5 s between frames; presets set the input and send
  - Legacy source: `src/lib/ui/Debug.svelte:63-125,171-186`
  - Done when: the "Channel sweep identifies the outputs" scenario passes; a failing frame does not stop the sweep
  - Confidence: 🟢

- [ ] T-07, Add the log: newest first, capped at 40, with time stamps; one global `busy` lock disabling every action
  - Legacy source: `src/lib/ui/Debug.svelte:11-12,23-25,188-194`
  - Done when: line 41 drops the oldest; no button works during a sweep
  - Confidence: 🟢

- [ ] T-08, Translate every Debug string (F6), keeping technical tokens (UUIDs, hex, `CH0`) as they are
  - Legacy source: `src/lib/ui/Debug.svelte` (all literals)
  - Done when: in `en` the tab shows no Portuguese
  - Confidence: 🟢

- [ ] T-09, Keep the log (and optionally the inspect result) across tab switches, in a module-level store, for long hardware sessions (G2)
  - Legacy source: none (today it is lost on unmount, `src/App.svelte:57-64`)
  - Done when: switching to Effects and back keeps the log
  - Confidence: 🟡

- [ ] T-10, Reflect an inspect-opened GATT link in `Conn.state`, or close it after the inspect
  - Legacy source: `src/lib/ble.svelte.ts:394` (link opened, state untouched)
  - Done when: after an inspect, the Devices tab state matches the real link
  - Confidence: 🟡

## Test Tasks

- [ ] TT-01, `parseHex` / `toHex` unit tests (formats, errors, round trip)
- [ ] TT-02, Happy path: a fake GATT with two services; `inspect` lists them with the correct props; `sendRaw` branch B writes once through the queue
- [ ] TT-03, Main error case: `getPrimaryServices` throws → `inspect` probes the known UUIDs; `sendRaw` branch A with an unknown UUID → throws
- [ ] TT-04, Sweep timing: 4 frames → 4 writes about 1.5 s apart (fake timers); one failing write is logged and the rest continue

## Data Migration Tasks
- [ ] TM-01, None (nothing persisted).

## Suggested Order
1. T-01 (pure), T-02, T-03 (transport; TT-01 to TT-03).
2. T-04 → T-05 → T-06 → T-07 (UI; TT-04).
3. T-08 with `i18n/` T-07; T-09, T-10 optional.

## Pending Gaps (🔴)
- None blocking.
- 🟡 Should branch A of `sendRaw` connect (handshake) first? It changes what the bench measures.
- 🟡 The owner's hardware session for G2 is planned around the channel sweep. Record which byte-7 values reach which output on the LEDBLE model, and feed the result to `protocol-drivers/`.
