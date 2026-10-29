# Protocol Drivers, Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `protocol-drivers` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md`, `design.md` and `contracts.md` in this folder.

## Prerequisites
- [ ] `tooling/` output: the generated `effects.ts` (tables and colour orders)
- [ ] `docs/protocol/*.md` and `*.tsv` available as the human reference
- [ ] Node with `--experimental-strip-types` (or a TS runner) for `node:test`
- [ ] There is no browser, Svelte, backend, environment variables or database: this unit is pure TypeScript

## Tasks

- [ ] T-01, Define the `Driver` contract and helpers (`Caps`, `Effect`, `DriverOutput`, `SoundSource`, `CustomEffectSpec`, `clamp`, `pct`, `byte`)
  - Legacy source: `src/lib/protocol/types.ts:1-111`
  - Done when: all three drivers type-check against it
  - Confidence: 🟢

- [ ] T-02, Build the registry: `drivers = [bledim, fff0, ffe0]` (order matters), `driverFor`, `allServices`
  - Legacy source: `src/lib/protocol/index.ts:1-17`
  - Done when: the "Registry order" and "Unknown clone" scenarios pass
  - Confidence: 🟢

- [ ] T-03, Build the fff0 driver:
  - constants; `matches`;
  - caps (MELK W/CT gating, scenes);
  - power (with the `INTRO` quirk), rgb, brightness (LightMode `FF`), speed, white, cct;
  - soundEnable, soundSensitivity, soundMode (`| 0x80`, MELK length `07` vs ELK `05`);
  - effect (see `effects/`); no `customEffect`.
  - Legacy source: `src/lib/protocol/fff0.ts:1-90`
  - Done when: the fff0 tests in `frames.test.ts` pass, and every fff0 frame in `contracts.md` matches
  - Confidence: 🟢

- [ ] T-04, Build the ffe0 layout core: `Layout`, `layoutFor` (rule order exactly as in `design.md`), `outputsFor`, and the `isStage`/`isCar01`/`isCar02` predicates
  - Legacy source: `src/lib/protocol/ffe0.ts:20-80`
  - Done when: a table test over `LEDSMART-1, LEDSUN-1, LEDLIKE-1, LEDPHO-1, LEDDMX-02-1, LEDDMX-04-1, LEDCAR-02-1, LEDCAR-01-1 (ble/dmx/none), LEDDMX-00-1, LEDBLE-00-1, LED_BLE_01, LEDSTAGE-1` gives the documented layouts
  - Confidence: 🟢

- [ ] T-05, Add the ffe0 handshake: `authFrame(now, pwd)` with the weekIndex mapping, `NEEDS_AUTH`, `onConnect`. Drop `passwordQueryFrame` (dead, F11) unless a caller is added.
  - Legacy source: `src/lib/protocol/ffe0.ts:96-123,177`
  - Done when: Wednesday 14:05 → `2A 02 A1 23 45 67 6E 05 AF`; Sunday 00:00 → `tb = E0`; `LEDSMART-1` → no handshake
  - Confidence: 🟢

- [ ] T-06, Add the ffe0 builders: caps by layout; power, rgb (white-only fallback), brightness (`dmx` scale32), speed, white, cct, soundMode, soundSensitivity, per layout, with the channel-byte defaults of BR-PD8
  - Legacy source: `src/lib/protocol/ffe0.ts:136-360,418-430`
  - Done when: the ffe0 tests in `frames.test.ts` pass, and every ffe0 frame in `contracts.md` matches
  - Confidence: 🟢

- [ ] T-07, Add the ffe0 strip helpers: `isAddressable`, `rgbOrdersFor`, `spiConfigFrame` (big-endian pixels; `dmx` type byte `04`; `dmxs` order first), `directionFrame`
  - Legacy source: `src/lib/protocol/ffe0.ts:432-500`
  - Done when: `spiConfigFrame('LEDDMX-00', {pixels: 300, order: 2})` = `7B FF 05 04 01 2C 02 FF BF`; the `dmxs` variant = `7B 05 02 01 2C FF FF FF BF`
  - Confidence: 🟢

- [ ] T-08, Build bledim framing: `frame(cmd, payload)` (seq, BE length, checksum), `CMD`, `serialCodeFrame`, `switchChannelsFrame` (clamped 1..4). Drop `readInfoFrame` and `audioSenseFrame` unless used (F11).
  - Legacy source: `src/lib/protocol/bledim.ts:12-58,284-290`
  - Done when: the checksum of every bledim frame in the tests verifies; `switchChannelsFrame(9)` carries `04`
  - Confidence: 🟢

- [ ] T-09, Add the bledim memory and builders: `stateFor` defaults `192/255/0`; `speedBrightness`; `staticScene`; `sceneFrame`; power; rgb (stores the colour); white; brightness (rescale or `0x88`); speed; effect; customEffect; soundEnable; soundSensitivity
  - Legacy source: `src/lib/protocol/bledim.ts:60-282`
  - Done when: the bledim tests in `frames.test.ts` pass, plus the "BLEDIM brightness rescales" scenario
  - Confidence: 🟢

- [ ] T-10, Key the bledim memory by **device id** instead of advertised name (fixes F3). Options: the caller passes the id as `name`-like context, or the state moves to the caller. Keep the builders' signatures compatible.
  - Legacy source: `src/lib/protocol/bledim.ts:62-84` (`states` keyed by name)
  - Done when: two devices both named `BLEDIM` keep independent brightness
  - Confidence: 🟡 (design choice; touches the `Driver` contract)

- [ ] T-11, Add a pure `supportsCustom(name, variant)` (or a `caps.custom` flag) so that the UI stops probing `customEffect` (fixes F4; coordinate with `custom-effects/` T-07)
  - Legacy source: `src/lib/ui/DeviceCard.svelte:38-41`
  - Done when: no UI code calls a frame builder only to detect support
  - Confidence: 🟡

- [ ] T-12, Decide the channel-byte semantics for ffe0 models outside LEDBLE-02 / LEDCAR-02 (G2):
  - verify on hardware with the Debug channel sweep;
  - then fix `outputsFor` (e.g. add the owner's model) and the `00`/`FF` defaults.
  - Legacy source: `src/lib/protocol/ffe0.ts:52-75,197-200,219,240`
  - Done when: on the owner's controller each output can be driven alone and "same colour on everything" no longer happens
  - Confidence: 🔴

## Test Tasks

- [ ] TT-01, Port all 39 tests of `src/lib/protocol/frames.test.ts` unchanged
- [ ] TT-02, Happy path: one table-driven test per family asserting every frame in `contracts.md`
- [ ] TT-03, Main error case: out-of-range and non-integer inputs (`-5`, `150`, `12.6`, `300`) clamp and round in every builder
- [ ] TT-04, Add the cases missing from the difftest (F7): LEDCAR-01 with variant `ble` for every builder; the `LEDBLE-03` effect shift
- [ ] TT-05, BLEDIM memory: rescale from the original colour, the effect clearing the colour, and the F3 regression after T-10

## Data Migration Tasks
- [ ] TM-01, None. Drivers hold no persisted data (BLEDIM memory is in-memory only).

## Suggested Order
1. T-01 → T-02 (contract and registry).
2. T-04 → T-05 → T-06 → T-07 (ffe0, the only family confirmed on hardware; TT-01 and TT-02 as you go).
3. T-03 (fff0), T-08 → T-09 (bledim); TT-03 to TT-05.
4. T-10, T-11 after the owner agrees; T-12 after the hardware session.

## Review Additions [external review]
- [ ] T-13, BLEDIM `white()` clears the remembered colour (F24), and `rgb()` honours the remembered brightness (F23), or the caller handles both (`device-control/` T-18).
  - Legacy source: `src/lib/protocol/bledim.ts:155-165,214-239`
  - Done when: TT-06 passes
  - Confidence: 🟢 [external review R17/R18]
- [ ] TT-06, BLEDIM: rgb(red) → white(50) → brightness(40) emits no red; brightness(40) → rgb(red) emits red at 40 %
- [ ] T-14, Reject non-finite numeric inputs in `pct`/`byte` (or document `00`) (RF-10).
  - Legacy source: `src/lib/protocol/types.ts:107-111`
  - Done when: `brightness(NaN)` has a defined, tested result
  - Confidence: 🟢 [external review R15]

## Pending Gaps (🔴)
- **T-12 / G2:** byte-7 semantics on the owner's multi-output ffe0 controller. This blocks `device-control/` T-16 and `custom-effects/` T-12.
- 🟡 F8: the difftest needs the decompiled trees, which are not in the repo, so a re-port cannot be re-verified against the Java without them.
