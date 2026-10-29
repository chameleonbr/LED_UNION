# Protocol Drivers

> Reversa Writer · 2026-10-26 · unit `protocol-drivers` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/protocol/index.ts`, `types.ts`, `fff0.ts`, `ffe0.ts`, `bledim.ts`, `effects.ts`, `frames.test.ts`, `docs/protocol/*`, `adrs/002`, `adrs/003`, `adrs/005`, `adrs/006`, `adrs/008`, `adrs/010`
> Wire formats per command: see `contracts.md` in this folder.

## Overview
Three **pure frame builders** turn user intents into the vendor byte frames of every supported BLE LED controller family: `bledim` (BLEDIM), `fff0` (ELK/MELK: Magic Lantern, Lotus Lantern) and `ffe0` (the LED+LAMP families: LEDBLE, LEDDMX, LEDCAR, LEDSMART, LEDSUN, LEDLIKE, LEDPHO, LEDSTAGE, LEDLIGHT). They are hand transcriptions of the decompiled vendor apps, checked byte for byte by tests and the difftest. **"The frame builders are the whole product"** (BR-50). 🟢

## Responsibilities
- Register the drivers in matching order and list their GATT services 🟢
- Match an advertised name to a family (a hint; GATT probing confirms it) 🟢
- Expose per-model capabilities, outputs, effect tables and pacing parameters 🟢
- Build every frame: power, rgb, brightness, speed, effect, white, cct, sound, custom effect, handshake, strip setup, channel mode 🟢
- Clamp every input so callers may pass out-of-range values 🟢
- Stay free of I/O 🟢. fff0 and ffe0 are pure; **bledim is not** (per-name memory and `seq`, mutated by its builders, see BR-PD9 and ADR-002's exception) [external review R06]

## Business Rules
- **BR-02** 🟢 The name is only a hint: `driverFor(name)` picks a guess; `device-connection/` confirms it by GATT probe.
- **BR-04** 🟢 bledim is matched **before** fff0 (same service UUID, different protocol). Clone names `JDY-10` / `Ble_Light` are not claimed. (`index.ts:9-11`, `bledim.ts:186-189`)
- **BR-05** 🟢 The model decides the outputs (`outputsFor`): LEDCAR-01 → `RGB {variant:'ble'}`, `SPI {variant:'dmx'}`; LEDBLE-02 / LEDCAR-02 → `LED 1 {ch:1}`, `LED 2 {ch:2}`; every other model → none (a single light).
- **BR-07** 🟢 Capabilities follow the vendor apps' name-based gating (table in `design.md`).
- **BR-16** 🟢 On white-only hardware (`sun`, `like`), `rgb()` falls back to `white(round(avg(R,G,B)/255·100))`.
- **BR-18** 🟢 BLEDIM static colours are sent as a one-colour scene (`0x82`); `0x81` does not survive a power cycle.
- **BR-19** 🟢 BLEDIM brightness rescales the remembered static colour (from the original colour, not compounding) when one is set; otherwise it sends `0x88` with the remembered speed.
- **BR-19a** 🟢 BLEDIM `rgb()` always emits brightness 255 with unscaled RGB and ignores the remembered brightness (`bledim.ts:155-165,214-217`): brightness then colour gives full brightness (F23). `white()` leaves the remembered colour set (`bledim.ts:222`), so brightness after white re-emits the old RGB with W=0 (F24). [external review R17/R18]
- **BR-21** 🟢 A family without a command gets no fake frame (no custom effect on fff0, sun, like or pho; no start frame on smart or stage).
- **BR-50** 🟢 A red test must not reach production (CI runs the tests and the type check before deploy).
- **BR-51** 🟢 The drivers are checked mechanically against the decompiled Java (difftest, see `tooling/`).
- **BR-53** 🟢 Only ffe0 / LEDBLE-00 is confirmed on hardware (G4 adds LEDCAR-01; G5 adds BLEDIM static colours). Everything else matches the vendor bytes but is untested on devices.
- **BR-PD1** 🟢 ffe0 picks one of **7 layouts** by name (and variant), in this order: `LEDSMART`→smart, `LEDSUN`→sun, `LEDLIKE`→like, `LEDPHO`→pho, `LEDDMX-02/04`|`LEDCAR-02`→dmxs, `LEDCAR-01`→(variant `ble` ? ble : dmx), `LEDDMX*`→dmx, else ble.
- **BR-PD2** 🟢 The ffe0 handshake `2A 02 <A1 23 45 67> <tb> <minutes> AF`, where `tb = (weekIndex<<5 | hours) & 0xFF`, `weekIndex` Sun=7, Mon..Sat=1..6. It is sent only to names matching `^(LEDBLE|LEDDMX|LEDCAR|LED[_ ]BLE)`.
- **BR-PD3** 🟢 The BLEDIM handshake is `0x89 [seconds, ms & 0xFF]`. It is checked on the phone side only.
- **BR-PD4** 🟢 BLEDIM framing: `55 AA seq cmd lenHi lenLo payload… sum`; `seq` is a free-running 8-bit counter (not validated); the length counts the payload only; `sum` = the 8-bit sum of every preceding byte.
- **BR-PD5** 🟢 Ranges: fff0 and ffe0 take percent (0..100) as is; BLEDIM converts percent to 0..255 with `round(p·255/100)`; colour channels are 0..255 everywhere.
- **BR-PD6** 🟢 fff0: `INTRO` names use `0xFF` instead of `0x01` as the power-on byte; the brightness frame carries LightMode `0xFF` (unspecified).
- **BR-PD7** 🟢 ffe0 `dmx` double-encodes brightness and white: first `round(p·32/100)`, then the raw percent.
- **BR-PD8** 🟢 The output channel byte: on the ffe0 `ble` layout, **power defaults to `ch ?? 00`**, while rgb, brightness, speed, effect and sound default to `ch ?? FF`; `dmxs` carries `ch` only in the effect frame. White, cct, sensitivity, strip and custom-effect frames never carry it.
- **BR-PD9** 🟢 BLEDIM keeps per-name memory (`speed=192, brightness=255, strobe=0, color?`): speed and brightness travel together in `0x88`; `rgb()` stores the colour; `effect()` and `customEffect()` clear it. Keyed by name, so it is shared between same-named devices (F3).
- **BR-PD10** 🟢 Addressable strips (`dmx`, `dmxs` only): `spiConfigFrame(pixels big-endian, order)` with type byte `4` on `dmx`; `directionFrame(forward)`; colour orders `rgbOrders` (12) or `rgbOrdersDmx02` (6, on `dmxs`).
- **BR-PD11** 🟢 Pacing per family: bledim 30 ms gap, 20-byte chunks, write-with-response; fff0 5 ms; ffe0 50 ms.

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | `drivers = [bledim, fff0, ffe0]`, `driverFor(name)`, `allServices` | Must | `driverFor('BLEDIM')` is bledim, `driverFor('MELK-OC')` is fff0, `driverFor('LED_BLE_01')` is ffe0, `driverFor('JDY-10')` is undefined |
| RF-02 | Each driver implements the `Driver` contract (`types.ts`) | Must | Type check passes |
| RF-03 | `caps(name, variant)` per family and model | Must | `frames.test.ts` caps cases |
| RF-04 | `outputs(name)` on ffe0 per BR-05 | Must | — |
| RF-05 | `layoutFor(name, variant)` per BR-PD1 | Must | `frames.test.ts` layout cases |
| RF-06 | Builders for power, rgb, brightness, speed, white, cct produce the exact frames in `contracts.md` | Must | `frames.test.ts` + difftest |
| RF-07 | Sound builders (`soundMode`, `soundEnable`, `soundSensitivity`) where the family has them | Could | `contracts.md` |
| RF-08 | `onConnect(name, now)` handshakes per BR-PD2 / BR-PD3 | Must | The auth frame for a Wednesday at 14:05 is `2A 02 A1 23 45 67 6E 05 AF` |
| RF-09 | Strip helpers `isAddressable`, `rgbOrdersFor`, `spiConfigFrame`, `directionFrame`; BLEDIM `switchChannelsFrame(1..4)` | Should | `contracts.md` |
| RF-10 | Every builder clamps its **finite** numeric inputs (`pct`, `byte`, `clamp` round). NaN is not rejected: `pct(NaN)` / `byte(NaN)` return NaN, which the typed array turns into `00` (`types.ts:107-111`) | Must | `rgb` with 300 → 255; brightness −5 → 0; brightness NaN → `00` silently [external review R15] |
| RF-11 | Effect and custom-effect builders | Must | See `effects/` and `custom-effects/` |
| RF-12 | No builder performs I/O; bledim's memory is the only state | Must | Builders run under `node:test` with no browser |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Fidelity | Frames match the decompiled vendor apps byte for byte | `tools/difftest/`, `adrs/006` | 🟢 (259 frames emitted; match not re-verifiable from the repo, F8) |
| Testability | Pure builders unit-tested against byte templates (39 tests) | `src/lib/protocol/frames.test.ts` | 🟢 |
| Quality gate | CI blocks deploy on a red test or type error | `.github/workflows/deploy.yml` | 🟢 |
| Compatibility | Name matching is case-insensitive and accepts `LED_BLE` / `LED BLE` / `LEDBLE` | `ffe0.ts:131-134` | 🟢 |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: Registry order resolves BLEDIM before ELK
  Given the advertised name "BLEDIM"
  When driverFor is called
  Then it returns the bledim driver, not fff0

Scenario: LEDCAR-01 envelopes per output
  Given the name "LEDCAR-01-1234"
  When rgb(255,0,0) is built with variant "ble"
  Then the frame is "7E FF 05 03 FF 00 00 FF EF"
  And with variant "dmx" the frame is "7B FF 07 FF 00 00 00 FF BF"

Scenario: LEDBLE-02 power on output 2
  Given the name "LEDBLE-02-1" and ch 2
  When power(true) is built
  Then the frame is "7E FF 04 01 00 FF FF 02 EF"

Scenario: White-only hardware falls back
  Given the name "LEDSUN-1"
  When rgb(255,255,255) is built
  Then the frame equals white(100): "7A 02 64 FF FF FF FF FF AF"

Scenario: BLEDIM brightness rescales the static colour
  Given BLEDIM showed rgb(200,100,0)
  When brightness(50) is built
  Then a 0x82 static scene with R=100, G=50, B=0 is returned
  And brightness(100) afterwards returns R=200 again

Scenario: Inputs are clamped
  Given any family
  When brightness(150) is built
  Then the brightness byte is 100 (or 255 on BLEDIM)

Scenario: Unknown clone is not claimed
  Given the name "JDY-10"
  When driverFor is called
  Then it returns undefined
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-01..06, RF-08, RF-10..12 | Must | Every command in the app goes through them; BR-50 |
| RF-09 strip and channel mode | Should | Needed for addressable strips and BLEDIM wiring |
| RF-07 sound | Could | Rarely used; phone-audio streaming deferred (G3) |

> Priority inferred from call frequency and position in the dependency chain.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `src/lib/protocol/index.ts` | `drivers`, `driverFor`, `allServices` | 🟢 |
| `src/lib/protocol/types.ts` | `Driver`, `Caps`, `Effect`, `DriverOutput`, `SoundSource`, `CustomEffectSpec`, `clamp`, `pct`, `byte` | 🟢 |
| `src/lib/protocol/fff0.ts` | `fff0`, `isMelk`, `isIntro` | 🟢 |
| `src/lib/protocol/ffe0.ts` | `ffe0`, `layoutFor`, `outputsFor`, `authFrame`, `passwordQueryFrame` (dead), `isAddressable`, `rgbOrdersFor`, `spiConfigFrame`, `directionFrame` | 🟢 |
| `src/lib/protocol/bledim.ts` | `bledim`, `frame`, `serialCodeFrame`, `switchChannelsFrame`, `readInfoFrame` (dead), `audioSenseFrame` (dead), `sceneFrame`, `staticScene`, `speedBrightness`, `stateFor` | 🟢 |
| `src/lib/protocol/frames.test.ts` | 39 byte-template tests | 🟢 |
