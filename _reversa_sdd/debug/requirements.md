# Debug Bench

> Reversa Writer · 2026-10-26 · unit `debug` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ui/Debug.svelte`, `src/lib/ble.svelte.ts` (`inspect`, `sendRaw`, `propsOf`, `connectGatt`), `src/lib/hex.ts`, `permissions.md` (G7), `docs/protocol/variants.md` (referenced)

## Overview
A bench for devices and frames that misbehave: list what a device really exposes over GATT, send any hand-typed frame to any writable characteristic, and fire **sweeps** of candidate frames 1.5 s apart, so the user can watch which one makes the lights react. It stays in production, ungated, by the owner's decision (G7). 🟢

## Responsibilities
- Choose a device that has been tracked this session 🟢
- Inspect the GATT services and characteristics with their properties, even when driver resolution fails 🟢
- Warn when the device dropped the link quickly (a missing handshake) 🟢
- Send a raw hex frame to the default or a chosen writable characteristic 🟢
- Run sweeps of candidate frames: power-on, effect, channel 🟢
- Offer one-tap preset frames 🟢
- Keep a rolling log of the last 40 lines 🟢

## Business Rules
- **G7** 🟢 Debug sends arbitrary frames **without confirmation, by design**, and stays in production, ungated (`permissions.md`).
- **BR-D1** 🟢 Inspect deliberately does **not** call `connect()`: driver resolution is what fails on an unknown device, and the services must still be visible. It uses `connectGatt` directly. (`Debug.svelte:32-34`)
- **BR-D2** 🟢 Inspect lists every primary service; when `getPrimaryServices()` is not allowed, it probes each known service UUID one by one. (`ble.svelte.ts:386-408`)
- **BR-D3** 🟢 A link that dropped in under 3000 ms adds the warning "the device dropped the link in N ms, smells like a missing handshake". (`Debug.svelte:37-40`)
- **BR-D4** 🟢 After an inspect, the write target defaults to the first characteristic with WRITE or WRITE_NR, unless the user already chose one.
- **BR-D5** 🟢 Hex parsing accepts `7E040401`, `7e 04 04 01` and `0x7E,0x04`: it strips `0x` and every non-hex character and requires an even, non-zero number of digits. (`hex.ts:1-8`)
- **BR-D6** 🟢 Raw sends go through the device's write queue (pacing and serialization preserved). With a chosen characteristic different from the live one, `sendRaw` walks every service to find it and writes to it **without** `connect()` (no handshake).
- **BR-D7** 🟢 Sweeps wait 1.5 s between frames; a failing frame is logged and the sweep continues.
- **BR-D8** 🟢 The candidate frames come from the decompiled apps and from the elkbledom project's hardware sniffing; byte 1 and the padding differ between firmwares.
- **BR-D9** 🟢 The channel sweep is the tool for G2: byte 7 = 0 / 1 / 2 / 3 with a different colour each, so the user sees which output each value reaches.
- **BR-D10 / F6** 🟢 Every Debug string is hardcoded in Portuguese.

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | A device select lists every `Conn` as `displayName — state` | Must | — |
| RF-02 | "Inspect GATT" calls `inspect(id)` and renders each service UUID, with each characteristic UUID and its props (`READ`, `WRITE`, `WRITE_NR`, `NOTIFY`, `INDICATE`, or `—`), or "no readable characteristics" | Must | A device with FFF0/FFF1+FFF3 lists both characteristics with their props |
| RF-03 | The log gets "N service(s), M characteristic(s)", plus the quick-drop warning when it applies | Should | — |
| RF-04 | A "Write to" select lists the writable characteristics (after an inspect) | Must | — |
| RF-05 | A "Frame (hex)" input (default `7E 04 04 01 00 01 FF 00 EF`) and Send → `sendRaw(id, parseHex(hex), charUuid \|\| undefined)`, logging "sent NB → uuid" or the error | Must | An odd digit count logs the parse error |
| RF-06 | Sweeps: power-on (5 candidates), effect → static red (4), channels (4), each 1.5 s apart, framed by start and end log lines | Must | The channel sweep sends byte 7 = 00, 01, 02, 03 in order |
| RF-07 | Preset buttons put their frame in the input and send it | Should | — |
| RF-08 | Every action is disabled while busy or with no device chosen | Must | — |
| RF-09 | The log keeps the newest 40 lines, newest first, each with a local time stamp | Should | — |
| RF-10 | Every Debug string is translatable | Should | Fails today (F6) |

### Built-in frame sets 🟢 (`Debug.svelte:69-105`)

| Set | Label | Frame |
|---|---|---|
| power-on | A · ELK app | `7E 04 04 01 00 01 FF 00 EF` |
| | B · ELK hw | `7E 04 04 F0 00 01 FF 00 EF` |
| | C · byte1=00 | `7E 00 04 01 00 00 00 00 EF` |
| | D · byte1=FF | `7E FF 04 01 00 FF FF 00 EF` |
| | E · ELK 07 | `7E 07 04 01 00 01 FF 00 EF` |
| effect | F · app effect | `7E 05 03 80 03 FF FF 00 EF` |
| | G · hw effect | `7E 07 03 80 03 FF FF 00 EF` |
| | H · effect 00 | `7E 00 03 80 03 00 00 00 EF` |
| | I · effect 06 | `7E 05 03 80 06 FF FF 00 EF` |
| channels | CH0 · all red | `7E FF 05 03 FF 00 00 00 EF` |
| | CH1 · LED1 green | `7E FF 05 03 00 FF 00 01 EF` |
| | CH2 · LED2 blue | `7E FF 05 03 00 00 FF 02 EF` |
| | CH3 · LED3? white | `7E FF 05 03 FF FF FF 03 EF` |
| presets | off | `7E 04 04 00 00 00 FF 00 EF` |
| | red app / red hw / red 00 | `7E 07 05 03 FF 00 00 10 EF` / `…0A EF` / `7E 00 05 03 FF 00 00 00 EF` |
| | brightness 100 | `7E 04 01 64 FF FF FF 00 EF` |
| | MELK login 1 / 2 | `7E 07 83` / `7E 04 04` |
| | query | `7E 00 01 FA 00 00 00 00 EF` |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Security | No confirmation and no gate: accepted risk, because BLE range is the boundary and the devices have no real authentication | `permissions.md` G7 | 🟢 |
| Usability | A 1.5 s gap between sweep frames, long enough to see which frame reacted | `Debug.svelte:121` | 🟢 |
| Reliability | Raw sends keep the per-device queue pacing | `ble.svelte.ts:440,448` | 🟢 |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: Inspect an unknown device
  Given a tracked device whose driver resolution fails
  When the user clicks Inspect GATT
  Then every exposed service and characteristic is listed with its props
  And the first writable characteristic is preselected

Scenario: Quick drop warning
  Given the device's lastLinkMs is 800
  When the user inspects it
  Then the log contains the missing-handshake warning with "800ms"

Scenario: Raw send
  Given an online device
  When the user enters "0x7E,0x04,0x04,0x01,0x00,0x01,0xFF,0x00,0xEF" and clicks Send
  Then 9 bytes are written through the device queue
  And the log shows "sent 9B"

Scenario: Bad hex
  Given the input "7E0"
  When the user clicks Send
  Then nothing is written
  And the log shows the parse error

Scenario: Channel sweep identifies the outputs
  Given a controller with two outputs
  When the user runs the channel sweep
  Then four frames are sent 1.5 s apart with byte 7 = 00, 01, 02, 03
  And each log line names the frame sent
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-02 inspect, RF-05 raw send, RF-06 sweeps, RF-08 busy gate | Must | The tool's purpose: identifying devices and frames (G7, G2) |
| RF-01, RF-04 selects | Must | Required to target |
| RF-03, RF-07, RF-09 | Should | Diagnostics comfort |
| RF-10 translation | Should | F6 |

> Priority inferred from the owner's G7 answer and the dependency chain.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `src/lib/ui/Debug.svelte` | `run`, `send`, `sweep`, `note`, `candidates`, `presets`, `channelCandidates`, `effectCandidates`, `writable` | 🟢 |
| `src/lib/ble.svelte.ts` | `inspect`, `sendRaw`, `propsOf`, `CharInfo`, `ServiceInfo` | 🟢 |
| `src/lib/hex.ts` | `parseHex`, `toHex` | 🟢 |
