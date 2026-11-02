# Plan: drivers for Magic Light, ZENGGE, MohuanLED and LampSmart Pro

Evidence: [investigation.md](./investigation.md) (static APK analysis plus public sources).

## Verdict per app

| App | Package | Transport | Web Bluetooth? | New driver | Confidence |
|---|---|---|---|---|---|
| Magic Light - BLE | com.Zengge.LEDBluetoothV2 | GATT FFE5/FFE9, notify FFE0/FFE4 | yes | `magiclight.ts` | high (Java decompile) |
| ZENGGE | com.zengge.blev2 | GATT FFFF/FF01, notify FF02, framed with seq | yes | `zengge.ts` | high for basics, gap for pixel/music |
| MohuanLED | com.kimoji.flutter.bleled | GATT EEA0/EE01, no notify | yes | `mohuan.ts` | medium (public captures; effect opcode conflicts) |
| LampSmart Pro | com.jingyuan.lamp | raw BLE advertising, no GATT | **no** | none in the PWA | n/a |

None of the three GATT families overlaps our existing drivers (`fff0`, `ffe0`, `bledim`, `ipixel`).

## Phase A: shared groundwork

1. Add the new services to `allServices` (`0000ffe5-…`, `0000ffff-…`, `0000eea0-…`). Web Bluetooth only exposes services listed up front.
2. Let the notify characteristic live on a different service than the write characteristic. Magic Light writes on FFE5 and notifies on FFE0. Add an optional `notifyService` to `Driver` in `types.ts`, and use it in `ble.svelte.ts`.
3. Resolve the name collision: Magic Light advertises `LEDBLE…`, which `ffe0.ts` also claims. The GATT probe in `ble.svelte.ts` already corrects a wrong name guess (the iPixel case). Extend the probe so that a device exposing FFE5/FFE9 goes to `magiclight`, while FFE0/FFE1 stays with `ffe0`.
4. Brightness without an opcode: Magic Light and MohuanLED have no brightness command, so the driver scales the last RGB. Reuse the per-name state pattern from `bledim.ts` (`stateFor`).

## Phase B: `magiclight.ts` (first, most certain)

- Match names `LEDBLE`, `LEDBlue`, `LEDSpeaker`, `LEDShoe`, `TIBURN`, `FluxBlue`, confirmed by the probe.
- Commands:
  - power `CC 23 33` / `CC 24 33`
  - rgb `56 R G B 00 F0 AA`
  - white `56 00 00 00 W 0F AA`
  - effect `BB mode (31-s) 44`, with 20 modes `0x25..0x38`
  - custom effect `99 …16×RGB… speed kind FF 66`, split into 20-byte chunks 60 ms apart (`chunkSize: 20`)
  - clock on connect `10 14 YY MM DD hh mm ss dow 00 01`
  - state query `EF 01 77`, parsed by `onNotify` from the 12-byte reply `66 … 99`
- Music: the phone analyses audio and streams `78 R G B 00 F0 EE`. Hook it to the existing sound source only if the app already analyses audio; otherwise leave it for later.
- Tests: byte-exact fixtures in `frames.test.ts`.

## Phase C: `zengge.ts` (LEDnetWF)

- Match `/^(LEDnetWF|IOTWF)/`. Service FFFF, write FF01, notify FF02.
- Transport wrapper: header `00 seq 80 00 Nhi Nlo N+1 0B` (v0), seq from 1 per device, wrapping at 8 bits. v1 (bleVersion ≥ 8) uses a 9-byte header. Read bleVersion from the advertisement via `watchAdvertisements` (already used by `heardAdvert`); default to v0 when it is not known.
- Commands, sum8 checksum:
  - power `71 23 0F A3` / `71 24 0F A4`, or `3B 23 … 90` when ledVersion ≥ 5
  - rgb `31 R G B 00 00 F0 0F ck`, or HSV `3B A1 …` for ledVersion ≥ 5
  - white `31 00 00 00 WW CW 0F 0F ck`
  - brightness `47 v ck` (inferred, test on hardware)
  - effect `61 mode speed 0F ck`
- State: `81 8A 8B 96` with cmdId `0A`; parse the `81 …` reply.
- Out of scope for now: symphony/pixel strips (E0/E1…), music, scenes. Those bytes are only in the Dart binary and need blutter or a Bluetooth snoop log from a real device.

## Phase D: `mohuan.ts` (BJ_LED)

- Match the prefix `BJ_LED`. Service EEA0, write EE01, write without response.
- Commands:
  - power `69 96 02 01 01` / `69 96 02 01 00`
  - rgb `69 96 05 02 R G B max(R,G,B)`
  - brightness: scale the RGB
  - effect `69 96 03 04 mode speed`, 22 modes `0x00..0x15`, speed `01..0a`
- Open point: the capture shows effect CMD `04` but public code uses `03`. Settle it on hardware; mark the driver "experimental" until then.

## Phase E: LampSmart Pro (outside the PWA)

Web Bluetooth cannot send BLE advertisements, so there is no in-app path. Options, if wanted later:
1. An ESP32 bridge that exposes one GATT characteristic and re-broadcasts frames as adverts. This becomes one more PWA driver; the encoding (CRC16 and whitening, plus AES sign for v2) is done in TypeScript or on the ESP32.
2. ESPHome `ble_adv` with Home Assistant.

Recommendation: skip this unless you own such a lamp and want the ESP32.

## Cross-cutting

- Every new driver is labelled "experimental" in the UI until it has been tested on hardware, as with CoolLED.
- Scenes, stealth and motion mode work automatically through the `Driver` interface; no changes needed.
- Docs: update `docs/protocol`, the README device list and `_reversa_sdd` (incremental re-extraction) after merge.

## Order and size

| Step | Effort | Depends on |
|---|---|---|
| A groundwork | small | none |
| B magiclight | medium | A |
| C zengge | medium | A |
| D mohuan | small | A |
| E LampSmart | large (hardware) | optional |

B, C and D are independent after A. One PR per driver keeps hardware testing simple.

## Questions for the owner

1. Which of these devices do you physically own? Untested drivers ship as experimental.
2. ZENGGE pixel/symphony strips: worth installing blutter (a large build) to recover those commands, or are basic colour, power and effects enough?

## Decision (2026-11-01)

The owner chose to implement only the two apps whose protocol was recovered from the
decompiled code: Magic Light (`magiclight.ts`) and ZENGGE (`zengge.ts`). MohuanLED
(public captures only, conflicting effect opcode) and LampSmart Pro (advertising-only,
not reachable from Web Bluetooth) are dropped; nobody owns the hardware to settle them.
