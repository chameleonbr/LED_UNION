# Built-in Effects, Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `effects` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md` and `design.md` in this folder.

## Prerequisites
- [ ] `tooling/` can generate `effects.ts` from `docs/protocol/*.tsv` (or the generated file is copied as is)
- [ ] `protocol-drivers/` provides `layoutFor`, `isMelk`, the 9-byte frame helper `f`, BLEDIM `frame`/`stateFor`, and `byte`/`clamp`
- [ ] `device-control/` provides `applyTo` and the device card shell
- [ ] `persistence/` provides `setLook` / `lookOf` with `effect` and `customEffectId`
- [ ] There is no backend, no environment variables and no database

## Tasks

- [ ] T-01, Generate or import the effect tables (`melk` 241 grouped, `elk` 29, `ledble` 23, `ledcar` 23, `leddmx` 211, `ledlike` 8, `ledpho` 16) with the "generated, do not edit" header
  - Legacy source: `src/lib/protocol/effects.ts:1-600`, `tools/gen-effects.py`
  - Done when: the table sizes match; `src/lib/protocol/frames.test.ts` "effect tables are populated and in range" passes
  - Confidence: 🟢

- [ ] T-02, Implement `fff0.effects(name)` (MELK → `melk`, else `elk`) and `fff0.effect(e, name)` (Scenes opcode `0x31`; MELK sub-opcode `0x06`; ELK `0x03`)
  - Legacy source: `src/lib/protocol/fff0.ts:44-47,80-88`
  - Done when: `frames.test.ts` "fff0: effect opcode differs between MELK and ELK generations" passes
  - Confidence: 🟢

- [ ] T-03, Implement `ffe0.effects(name, variant)` in the order LEDCAR-01 by variant → LEDCAR → layout switch (`leddmx`, `ledlike`, `ledpho`, 16 numbered, `ledble`)
  - Legacy source: `src/lib/protocol/ffe0.ts:150-174`
  - Done when: `frames.test.ts` "effect tables are picked per family" passes
  - Confidence: 🟢
  - Note: put the "Mode N" label in the dictionary instead of hardcoding "Modo" (F6).

- [ ] T-04, Implement `ffe0.effect(e, name, ch, variant)` for the 7 layouts plus the `LEDBLE-03` shift; `ch` only on `ble` and `dmxs`, defaulting to `FF`
  - Legacy source: `src/lib/protocol/ffe0.ts:264-294`
  - Done when: the frames in `design.md` match byte for byte; the ffe0 effect tests in `frames.test.ts` pass (lines 53, 178, 191, 214)
  - Confidence: 🟢

- [ ] T-05, Implement the bledim table (13 × "M n") and `bledim.effect(e, name)`: clear `color`, then `sceneFrame(name, id)` with the chase bit, the remembered speed, brightness and strobe, and one white colour entry
  - Legacy source: `src/lib/protocol/bledim.ts:102-145,247-250`
  - Done when: the payload byte 14 equals `id | 0x80`; bytes 1/2/6 equal the remembered speed, brightness and strobe; a following `brightness()` returns a `0x88` frame
  - Confidence: 🟢

- [ ] T-06, Card effect select: the value from the look (custom → `c:id`; built-in matched by `id` **and** `group` → `b:index`; else `''`); options in order: none, My effects + New effect (when `supportsCustom`), built-ins grouped by `group` or under "Built-in"; the `custom.unsupported` hint
  - Legacy source: `src/lib/ui/DeviceCard.svelte:37-52,260-306`
  - Done when: MELK shows 9 optgroups; LEDBLE shows one; the chosen effect is re-selected after a reload
  - Confidence: 🟢

- [ ] T-07, `chooseEffect`: `__new__` → open the editor; `''` → no-op; `b:i` → `applyTo([dkey], effect)` with no coalescing, then `setLook({effect: fx, customEffectId: undefined})`; `c:id` → hand off to `custom-effects/`
  - Legacy source: `src/lib/ui/DeviceCard.svelte:102-120`
  - Done when: the acceptance scenarios "LEDCAR-01 strip plays its own table", "LEDBLE-02 output carries its channel byte" and "Effect choice survives reload" pass
  - Confidence: 🟢

- [ ] T-08, Keep effects off the Everything card
  - Legacy source: `src/lib/ui/Effects.svelte:50-52`
  - Done when: the Everything card has no effect control
  - Confidence: 🟢

## Test Tasks

- [ ] TT-01, Port the effect-related tests from `src/lib/protocol/frames.test.ts` (fff0 opcodes, table sizes, per-family picking, ffe0 layout frames)
- [ ] TT-02, Happy path: pick an effect on a LEDCAR-01 SPI output → `leddmx` id inside the `dmx` envelope
- [ ] TT-03, Main error case: the stale look index (`b:-1`) → the select shows none, and choosing nothing sends nothing
- [ ] TT-04, Add the cases missing from the difftest (F7): `LEDBLE-03` shifted id, and LEDCAR-01 with `variant 'ble'`
- [ ] TT-05, BLEDIM: effect → brightness switches from a static scene to `0x88`; effect frame byte 14 has the chase bit

## Data Migration Tasks
- [ ] TM-01, None. `look.effect` keeps the stored `Effect` object shape `{id, name, group?}`.

## Suggested Order
1. T-01 (tables) → T-02, T-03, T-04, T-05 (pure, test as you go with TT-01, TT-04, TT-05).
2. T-06 → T-07 (UI, needs `device-control/` `applyTo` and the card).
3. T-08 is a check, not new code.

## Pending Gaps (🔴)
- None blocking.
- 🟡 **G5:** BLEDIM effects are untested on hardware. Verify T-05 on the owner's headlight before calling the port done.
- 🟡 Decide whether the look should store only `{id, group}` and resolve the name from the table (it avoids stale names).
