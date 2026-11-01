# Device Control

> Reversa Writer · 2026-10-26 · unit `device-control` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ble.svelte.ts` (`applyTo`, `outputAt`, `writeRaw`, `writeOnce`), `src/lib/queue.ts`, `src/lib/endpoint.ts`, `src/lib/ui/DeviceCard.svelte`, `src/lib/ui/Effects.svelte`, `src/lib/ui/ColorSelect.svelte`, `src/lib/protocol/types.ts`, `domain.md`

## Overview
Turns the user's direct manipulations (power, colour, brightness, speed, white, CCT, sound, hardware wiring) into frames for one or many **endpoints**, and writes them through a per-device paced queue. A slider stream always delivers its last value. After each command, the unit records what it sent as the endpoint's **look**, because the devices report nothing back. 🟢
Built-in effects are covered in `effects/`, custom effects in `custom-effects/`, and scene replay in `scenes/`.

## Responsibilities
- Enumerate the **logical endpoints**: one per single-light controller, one per output of a multi-output model 🟢
- Route a command to a list of endpoint keys, resolving each to its device, channel byte or variant 🟢
- Auto-connect offline devices before writing 🟢
- Pace writes per device with a family-specific minimum gap, coalescing slider streams per output 🟢
- Write frames with write-without-response, falling back to write-with-response, and chunk them when the family needs it 🟢
- Provide per-endpoint controls (the device card) and a broadcast **Everything** card 🟢
- Gate controls by the model's capabilities 🟢
- Record the last command sent as the endpoint's look 🟢
- Configure the hardware wiring: the addressable strip (pixels, colour order, direction) and the BLEDIM channel mode 🟢
- Offer a colour palette picker with live preview and cancel-to-restore 🟢

## Business Rules
- **BR-05** The model decides how many outputs a controller has. Fewer than 2 outputs means one endpoint keyed by `deviceId`; otherwise one endpoint per output keyed `deviceId#i`. 🟢 (`Effects.svelte:20-34`)
- **BR-10** A command on an output carries that output's channel byte (`ch`) or protocol variant (`variant`), resolved from `driver.outputs(name)[i]`. 🟢 (`ble.svelte.ts:292-297`)
- **BR-11** The Everything card broadcasts **only power, colour and brightness**. Effect ids are per family, so broadcasting one would be arbitrary. 🟢 (`Effects.svelte:50-76`)
- **BR-12** A command on an offline device reconnects it first. 🟢 (`ble.svelte.ts:324`)
- **BR-13** All writes to one device go through one serial queue with a minimum gap between op starts: bledim 30 ms, fff0 5 ms, ffe0 50 ms. 🟢 (`queue.ts`, drivers)
- **BR-14** The last slider value always lands: a waiting op with the same coalescing key is replaced, never discarded. 🟢 (`queue.ts:27-40`)
- **BR-CT1** Coalescing is **per output**: the queue key is `${stream}:${index}`, so two outputs of one device never cancel each other. 🟢 (`ble.svelte.ts:329-332`)
- **BR-CT2** Coalesced streams: `rgb`, `brightness`, `speed`, `white`, `cct`, `sens`. Power, effect, sound mode and enable, handshake, strip, direction and channel-mode writes are never coalesced. 🟢 (`DeviceCard.svelte`)
- **BR-CT3** A failed write does not break the queue chain; the caller of `push`, and the **first** caller of a `pushLatest` slot, get the rejection. 🟢 (`queue.ts:49-52`) **Defect F20** 🟢: a superseding `pushLatest` caller receives `this.#tail`, the rejection-swallowing promise (`queue.ts:32-34,51`), so it sees success even when its own value's write fails. [external review R10]
- **BR-16** White is an intent. With a real W wire (`caps.white && driver.white` and, on BLEDIM, channel mode ≠ 3) the slider drives `white()`. Otherwise it sends `rgb(k,k,k)` with `k = round(v·255/100)` and records that grey as the look colour. 🟢 (`DeviceCard.svelte:83-98,174-179`) **Defect F24** 🟢: BLEDIM `white()` does not clear the remembered colour (`bledim.ts:214-222`), so a later brightness change re-emits the old RGB with W=0: red → real white → brightness gives red again. [external review R18]
- **BR-CT10** 🟢 On BLEDIM, picking a colour resets the effective brightness to 255 (`bledim.ts:214-217`), while the slider keeps showing the old value. Set brightness 40, then pick a colour: the light goes to full. This is the live form of F23. [external review R17]
- **BR-17** A static colour clears the effect and the custom effect in the look. 🟢 (`DeviceCard.svelte:69-70`)
- **BR-30** The look is the last command sent, not a reading. It is written after the send, whether or not the write reached the device (`applyTo` swallows errors). 🟢
- **BR-36** The hardware wiring settings are saved before the frame is sent (channel mode) or after it succeeds (strip config). Both describe the hardware. 🟢 (`DeviceCard.svelte:152-194`)
- **BR-CT4** Capabilities gate the controls: colour needs `caps.rgb`; speed needs `caps.speed`; the white slider shows when there is a real white wire or `caps.rgb`; CCT needs `caps.cct && driver.cct`; sound shows when the driver has `soundMode` or `soundEnable`; the strip panel shows when `isAddressable(name, variant)`; channel mode shows on bledim only. 🟢
- **BR-CT5** Driver inputs are clamped by the driver (`pct` 0..100, `byte` 0..255), so the UI may pass out-of-range values. 🟢 (`types.ts:107-111`)
- **BR-CT6** Pixel count input is clamped to 1..65535. 🟢 (`DeviceCard.svelte:397-398`)
- **BR-CT7** The colour picker sends each drag change straight to the lights; Cancel re-sends the colour that was lit before the picker opened, **only when one is known** (`before` truthy). 🟢 (`ColorSelect.svelte:31-42`) The Everything picker has no starting value (`Effects.svelte:113`), so Cancel there leaves the dragged colour; a running effect is not restored either (`DeviceCard.svelte:66-70`). [external review R03]
- **BR-CT8** `white()` and `cct()` take no channel argument, so on a multi-output model they cannot address one output. 🟢 (`types.ts:102-104`) 🟡 Effect on hardware unknown.

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | List logical endpoints from every known device, using `driver.outputs(name)` and output labels from the store | Must | A LEDCAR-01 shows two cards (RGB, SPI); a LEDBLE-00 shows one |
| RF-02 | `applyTo(keys, build, coalesceKey?)` writes `build(driver, name, ch, variant)` to each key in parallel, skipping unknown devices and builders that return `undefined` | Must | One call with 3 keys on 2 devices produces 3 queued writes |
| RF-03 | Offline devices are connected before the frame is built | Must | A command on an offline device ends with it online and the frame written |
| RF-04 | `WriteQueue.push` never drops an op and keeps a minimum gap between op starts | Must | Two pushes at t=0 start ≥ `gapMs` apart |
| RF-05 | `WriteQueue.pushLatest(key, op)` replaces an op with the same key still waiting; only the newest runs | Must | Ten brightness values pushed during one gap produce 2 writes: the first and the last |
| RF-06 | `writeRaw` writes the frame whole, or in `chunkSize` pieces separated by `minGapMs` when the family sets a chunk size | Must | A BLEDIM static-colour frame (6-byte header + 72-byte scene + checksum = 79 bytes) is sent as 4 writes (20+20+20+19), 30 ms apart |
| RF-07 | `writeOnce` uses write-without-response, and falls back to `writeValue` on `NotSupportedError`; families with `writeWithResponse` always use `writeValue` | Must | A characteristic without WRITE_NR still gets the frame |
| RF-08 | Device card: On/Off buttons send `power(on)` and record `look.power` | Must | The look shows the last power state |
| RF-09 | Device card: picking a colour sends `rgb` (coalesced) and records `colorHex`, clearing `effect` and `customEffectId` | Must | After a colour pick on a playing effect, the card summary shows "none" and the swatch shows the colour |
| RF-10 | Device card: the brightness slider (0..100, default shown 100) sends `brightness` (coalesced) and records it | Must | Dragging from 100 to 20 leaves the device at 20 and `look.brightness = 20` |
| RF-11 | Device card: the speed slider (0..100, default shown 50) sends `speed` (coalesced) when `caps.speed` | Should | Hidden on models without speed |
| RF-12 | Device card: the white slider follows BR-16 | Must | On RGB-only hardware, white 100 sends `rgb(255,255,255)` and records `#ffffff` |
| RF-13 | Device card: the CCT slider sends `cct(v, 100−v)` (coalesced) | Should | Hidden unless `caps.cct && driver.cct` |
| RF-14 | Device card: the sound panel offers enable on/off, source mic/music + mode 0..15, and sensitivity 0..100 (coalesced), each shown only when the driver has the builder | Could | A family without `soundEnable` shows no on/off buttons. ⚠ F19: on LEDSMART / LEDPHO the sensitivity slider sends a `ble`-layout frame (`protocol-drivers/contracts.md` C3). [external review F19 label] |
| RF-15 | Device card: the strip panel sends `spiConfigFrame(name, {pixels, order})` through `sendRaw`, saves it with `setStrip` on success, and shows a message; the direction buttons send `directionFrame` | Should | After Apply, a reload shows the saved pixels and order |
| RF-16 | Device card: the BLEDIM channel mode select (1 DIM, 2 CCT, 3 RGB, 4 RGBW, default 3) saves first, then sends `switchChannelsFrame(mode)`, showing any send error | Should | Choosing 4 while the device is unreachable still saves 4 and shows the error |
| RF-17 | Everything card: power, colour and brightness are sent to every endpoint and recorded on each | Must | All cards show the broadcast colour afterwards |
| RF-18 | Colour picker: palette chips, a "+" that opens a live picker starting at the current colour (or `#ff8800`), Save adds the colour to the palette, and Cancel restores the previous colour when one is known (BR-CT7) | Should | Cancel after dragging puts the lights back to the colour that was lit before; with no previous colour (Everything card) the dragged colour stays [external review R03] |
| RF-19 | The card header shows the connection dot, the label, the look colour swatch and the effect summary (custom name, else effect name, else "none") | Should | — |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Performance | Writes are paced at least one gap apart per device (5–50 ms), and a waiting value of the same key is replaced, so one slider builds no backlog. There is **no end-to-end latency bound**: other keys, `push` ops and multi-chunk BLEDIM writes ahead of it still run first, and reconnects add delay | `src/lib/queue.ts:23-47`, `ble.svelte.ts:279-284,324` | 🟢 [external review R09] |
| Performance | Write-without-response by default, "the only mode fast enough for a colour slider" | `src/lib/ble.svelte.ts:256-259` | 🟢 |
| Reliability | Per-device serialization, because the controllers drop or mangle concurrent writes | `src/lib/queue.ts:3-11` | 🟢 |
| Reliability | One device's failure does not block the others in a broadcast (`allSettled`) | `src/lib/ble.svelte.ts:318` | 🟢 |
| Usability | Each control is hidden when the model cannot do it, instead of sending a fake frame (BR-21) | `DeviceCard.svelte` | 🟢 |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: Slider coalescing keeps the last value
  Given an online ffe0 device with a 50 ms gap
  When the user drags brightness through 90, 80, 70, 60, 50 within 40 ms
  Then exactly two brightness frames are written: 90 and 50

Scenario: Outputs do not cancel each other
  Given a LEDBLE-02 with outputs "LED 1" (ch 1) and "LED 2" (ch 2)
  When the user sets red on LED 1 and blue on LED 2 within one gap
  Then both frames are written, with channel bytes 1 and 2

Scenario: LEDCAR-01 output uses its own envelope
  Given a LEDCAR-01 device
  When the user sets a colour on the RGB output
  Then the frame uses the "ble" layout (7E … EF)
  And on the SPI output the frame uses the "dmx" layout (7B … BF)

Scenario: White on RGB-only hardware
  Given a model without a real white wire
  When the user sets white to 100
  Then the frame is rgb(255,255,255)
  And look.colorHex is "#ffffff" with no effect

Scenario: White on BLEDIM wired as RGB
  Given a BLEDIM with channel mode 3
  When the user sets white
  Then rgb(k,k,k) is sent, not the white command

Scenario: Command on an offline device
  Given a tracked device in state "offline"
  When the user presses On
  Then the device is connected first
  And the power frame is written

Scenario: Broadcast skips a failing device
  Given two devices, one of which is unreachable
  When the user sets a colour on the Everything card
  Then the reachable device receives the colour
  And no error stops the broadcast

Scenario: Channel mode is saved even if the send fails
  Given a BLEDIM out of range
  When the user picks mode 4
  Then channelMode 4 is saved
  And the send error is shown under the select
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-02..07 routing, queue, write path | Must | Every command in the app flows through them |
| RF-01 endpoints, RF-08..10, RF-12 power, colour, brightness, white | Must | Core controls used on every card |
| RF-17 Everything card | Must | Headline feature: many devices at once |
| RF-11 speed, RF-13 CCT, RF-15 strip, RF-16 channel mode, RF-18 picker, RF-19 header | Should | Model-dependent or with an alternative |
| RF-14 sound | Could | Rarely used; phone-audio streaming is out of scope for now (G3) |

> Priority inferred from call frequency and position in the dependency chain.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `src/lib/ble.svelte.ts` | `applyTo`, `outputAt`, `writeRaw`, `writeOnce`, `sendRaw` (strip and mode use) | 🟢 |
| `src/lib/queue.ts` | `WriteQueue` (`push`, `pushLatest`, `#chain`) | 🟢 |
| `src/lib/endpoint.ts` | `epKey`, `parseEp` | 🟢 |
| `src/lib/ui/DeviceCard.svelte` | `power`, `pickColor`, `setBrightness`, `setSpeed`, `setWhite`, `setCct`, sound handlers, `applyStrip`, `setDirection`, `pickChannelMode`, `hasRealWhite` | 🟢 |
| `src/lib/ui/Effects.svelte` | `logicals`, `allColor`, `allBrightness`, `allPower` | 🟢 |
| `src/lib/ui/ColorSelect.svelte` | `pick`, `open`, `cancel`, `create` | 🟢 |
| `src/lib/protocol/types.ts` | `Driver`, `Caps`, `DriverOutput`, `clamp`, `pct`, `byte` | 🟢 |

## Re-extraction 2026-11-01 (`374da11..56af9f9`)

> Delta from features 001 (iPixel phase 1, stealth, trace), 002 (panel content) and PR #6. Earlier sections above are unchanged unless noted here.

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-20 | 🟢 Every command passes the stealth gate: while stealth is on the user is asked once to leave; "no" sends and records nothing (BR-71) | Must | Drag a slider in stealth → one confirm; cancel → no write in trace |
| RF-21 | 🟢 Stealth toggle: `enterStealth` snapshots online endpoints, powers them off (force) and records `power:false`; `exitStealth` replays snapshots (missing power = on) and lists unreachable devices (BR-70, BR-72) | Must | Enter/exit restores colour and effect |
| RF-22 | 🟢 iPixel card: brightness, slot buttons (`showSlot`, look `panel.slot`), orientation (`patchPanel`), delete all | Must | Slot tap on a filled slot switches the panel (hardware 2026-11-01) |
