# Device Control, Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `device-control` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md` and `design.md` in this folder.

## Prerequisites
- [ ] `device-connection/` is done: `conns`, `live` (with `char` and `queue`), `connect`, `sendRaw`
- [ ] `protocol-drivers/` is done: builders, `caps`, `outputs`, `chunkSize`, `writeWithResponse`, `minGapMs`, ffe0 strip helpers, bledim `switchChannelsFrame`
- [ ] `persistence/` exposes `lookOf`, `setLook`, `labelOf`, `setStrip`, `setChannelMode`, `store.colors`, `addColor`
- [ ] `i18n/` exposes `t()` with the `effects.*`, `strip.*`, `sound.*`, `bledim.*` and `color.*` keys
- [ ] There is no backend, no environment variables and no database

## Tasks

- [ ] T-01, Implement `WriteQueue(gapMs)` with `push`, `pushLatest(key)` and the private `#chain` (gap measured between op starts, failure isolation with `tail.catch`)
  - Legacy source: `src/lib/queue.ts:1-54`
  - Done when: the five legacy tests in `src/lib/queue.test.ts` pass unchanged (order, gap, last value wins, independent keys, no wedge after failure)
  - Confidence: 🟢

- [ ] T-02, Implement `epKey` / `parseEp`: the suffix is the output **index**; a non-numeric suffix falls back to the whole key as the device id
  - Legacy source: `src/lib/endpoint.ts:1-15`
  - Done when: `parseEp('a#1') = {deviceId:'a', ch:1}`, `parseEp('a#x') = {deviceId:'a#x'}`, `epKey('a') = 'a'`
  - Confidence: 🟢
  - Note: consider naming the field `index` instead of `ch` (data dictionary); keep the wire format `id#i`.

- [ ] T-03, Implement `writeOnce` (without-response by default, `NotSupportedError` → `writeValue`, `writeWithResponse` families always use `writeValue`) and `writeRaw` (whole frame, or `chunkSize` slices with a `minGapMs ?? 30` sleep between slices inside one op)
  - Legacy source: `src/lib/ble.svelte.ts:244-285`
  - Done when: a 79-byte BLEDIM frame produces 4 `writeValue` calls (20/20/20/19) about 30 ms apart; an ffe0 frame produces one `writeValueWithoutResponse`
  - Confidence: 🟢

- [ ] T-04, Implement `outputAt(deviceId, index?)` and `applyTo(keys, build, coalesceKey?)`: parallel over keys, skip unknown devices, auto-connect, build with `(driver, name, ch, variant)`, skip `undefined`, `pushLatest('${key}:${index ?? ""}')` or `push`
  - Legacy source: `src/lib/ble.svelte.ts:287-335`
  - Done when: the requirements scenarios "Outputs do not cancel each other", "LEDCAR-01 output uses its own envelope" and "Command on an offline device" pass
  - Confidence: 🟢
  - Note: decide whether to surface per-key failures (F9). A strict port keeps `allSettled` and silence.

- [ ] T-05, Build the logical endpoint list from `conns` and `driver.outputs(name)` (fewer than 2 outputs → one key; otherwise `epKey(id, i)` with `labelOf(key, o.label)`)
  - Legacy source: `src/lib/ui/Effects.svelte:10-34`
  - Done when: LEDCAR-01 → 2 logicals with variants `ble`/`dmx`; LEDBLE-02 → 2 logicals with ch 1/2; MELK → 1
  - Confidence: 🟢

- [ ] T-06, Device card header and toggling: checkbox (`onToggle`), connection dot, label, look swatch, summary (custom name → effect name → `effects.none`), `conn.error` line, expand or collapse
  - Legacy source: `src/lib/ui/DeviceCard.svelte:43-52,211-233`
  - Done when: a card whose look has `colorHex` and an effect shows both the swatch and the effect name
  - Confidence: 🟢

- [ ] T-07, Device card core controls: On/Off, colour (through `ColorSelect`), brightness (default shown 100), speed (only `caps.speed`, default shown 50), each with its coalescing key and look update as in the design table
  - Legacy source: `src/lib/ui/DeviceCard.svelte:59-81,236-258,308-324`
  - Done when: each control sends the documented builder and updates the look after the send; a colour pick clears `effect` and `customEffectId`
  - Confidence: 🟢

- [ ] T-08, White-as-intent: compute `hasRealWhite` and `showWhite`; real wire → `white(v)` (coalesced `white`, no look); otherwise `rgb(k,k,k)` (coalesced `rgb`) and record `#kkkkkk` with the effect cleared
  - Legacy source: `src/lib/ui/DeviceCard.svelte:83-98,170-179,326-332`
  - Done when: the scenarios "White on RGB-only hardware" and "White on BLEDIM wired as RGB" pass
  - Confidence: 🟢

- [ ] T-09, CCT slider: `cct(v, 100−v)` coalesced `cct`, shown only when `caps.cct && driver.cct`
  - Legacy source: `src/lib/ui/DeviceCard.svelte:99-100,334-340`
  - Done when: hidden on MELK without `CT` in the name; visible on a `ble` layout device
  - Confidence: 🟢

- [ ] T-10, Sound panel: shown when the driver has `soundMode` or `soundEnable`; on/off via `soundEnable`; source mic/music + mode 0..15 via `soundMode` (sent on source click and on slider `change`); sensitivity 0..100 via `soundSensitivity` (coalesced `sens`)
  - Legacy source: `src/lib/ui/DeviceCard.svelte:203-208,342-386`
  - Done when: each sub-control appears only when its builder exists on the driver
  - Confidence: 🟢

- [ ] T-11, Addressable strip panel: shown when `isAddressable(name, variant)`; pixels clamped to 1..65535 (default 60), order from `rgbOrdersFor(name)` (default 1), re-seeded from the saved strip config; Apply → `sendRaw(spiConfigFrame)` then `setStrip` on success; Forward / Reverse → `sendRaw(directionFrame)` with errors ignored
  - Legacy source: `src/lib/ui/DeviceCard.svelte:137-165,388-415`
  - Done when: a failed Apply does not save and shows the error; a successful Apply survives a reload
  - Confidence: 🟢

- [ ] T-12, BLEDIM channel mode select (1 DIM, 2 CCT, 3 RGB, 4 RGBW; default 3): `setChannelMode` **first**, then `sendRaw(switchChannelsFrame(mode))`, with the error shown in `modeMsg`
  - Legacy source: `src/lib/ui/DeviceCard.svelte:167-201,241-251`
  - Done when: the scenario "Channel mode is saved even if the send fails" passes
  - Confidence: 🟢

- [ ] T-13, Everything card: `allPower`, `allColor`, `allBrightness` over every logical key, then the look update per key
  - Legacy source: `src/lib/ui/Effects.svelte:50-78`
  - Done when: the scenario "Broadcast skips a failing device" passes; there is no effect control on this card
  - Confidence: 🟢

- [ ] T-14, `ColorSelect`: chips from `store.colors` with translated seeded names; "+" opens the picker with live preview from `value ?? '#ff8800'`; Save → `addColor` and pick; Cancel → re-pick `before` when set
  - Legacy source: `src/lib/ui/ColorSelect.svelte:1-70`
  - Done when: Cancel after dragging restores the previous colour on the device
  - Confidence: 🟢

- [ ] T-15, Record real white, CCT and sound in the look so scenes can replay them (F5)
  - Legacy source: not in the legacy code (gap at `src/lib/ui/DeviceCard.svelte:89-100`)
  - Done when: after a real-white change, `lookOf(key)` holds the white value
  - Confidence: 🟡 (improvement, needs a `Look` schema change in `persistence/` and a replay step in `scenes/`; skip for a strict port)

- [ ] T-16, Add a channel parameter to `white()` and `cct()` for multi-output models (BR-CT8)
  - Legacy source: `src/lib/protocol/types.ts:101-104`
  - Done when: white on LEDBLE-02 output "LED 2" carries channel byte 2
  - Confidence: 🔴 (requires hardware verification of the frame; see G2)

## Test Tasks

- [ ] TT-01, Port `src/lib/queue.test.ts` as is (5 tests)
- [ ] TT-02, Happy path: `applyTo` with a fake `Live` on two outputs of one device; assert the channel bytes and that both writes land (coalescing per output)
- [ ] TT-03, Main error case: one key's `connect` throws; the other keys still write, and `applyTo` resolves
- [ ] TT-04, Coalescing timing: five `pushLatest('brightness:')` calls within one gap → two writes, first and last
- [ ] TT-05, Chunking: a bledim frame of 79 bytes → 4 writes with `writeValue`; ffe0 → 1 write with `writeValueWithoutResponse`; `NotSupportedError` → fallback
- [ ] TT-06, White intent: the `hasRealWhite` truth table over (`caps.white`, `driver.white`, bledim, channelMode)
- [ ] TT-07, Endpoint list: LEDCAR-01, LEDBLE-02 and a single-light model

## Data Migration Tasks
- [ ] TM-01, None. The look and the hardware config are persisted by `persistence/`; the legacy `id#ch` → `id#i` migration lives there.

## Suggested Order
1. T-01, T-02, T-03 (pure or near-pure, testable without a UI); TT-01, TT-04, TT-05.
2. T-04 (needs `device-connection/` `connect` and `live`), then T-05.
3. T-06 → T-07 → T-08 → T-09 → T-10 (card, core controls first).
4. T-11, T-12 (hardware setup), T-13 (Everything card), T-14 (picker).
5. T-15, T-16 only after the owner decides; T-16 is blocked by a hardware test.

## Review Additions [external review]
- [ ] T-17, Give each `pushLatest` slot its own result promise, so a superseding caller sees its own write's outcome (F20).
  - Legacy source: `src/lib/queue.ts:31-52`
  - Done when: TT-08 passes
  - Confidence: 🟢 [external review R10]
- [ ] TT-08, Two same-key `pushLatest` calls before the slot runs; the replacement throws → both promises reject
- [ ] T-18, Keep the BLEDIM card brightness when a colour is picked (BR-CT10 / F23): send the colour scaled by the remembered brightness, or re-send brightness after `rgb`.
  - Legacy source: `src/lib/protocol/bledim.ts:214-217`, `src/lib/ui/DeviceCard.svelte`
  - Done when: brightness 40 then picking red lights red at 40 %
  - Confidence: 🟢 [external review R17]

## Pending Gaps (🔴)
- **T-16 / G2:** which byte values select which output on the owner's multi-output controller, and whether white and CCT need a channel. This needs a hardware session with the Debug tab before implementing.
- 🟡 Decide whether to surface write failures (F9) and to extend the look with white, CCT and sound (F5).
