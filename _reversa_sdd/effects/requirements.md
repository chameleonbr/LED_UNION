# Built-in Effects

> Reversa Writer · 2026-10-26 · unit `effects` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/protocol/effects.ts` (generated), `fff0.ts` (`effects`, `effect`), `ffe0.ts` (`effects`, `effect`), `bledim.ts` (`effects`, `effect`, `sceneFrame`), `src/lib/ui/DeviceCard.svelte` (`chooseEffect`, effect select), `domain.md`

## Overview
Lets the user pick one of the controller's **firmware animations** (built-in effects) for one endpoint. Each family and model has its own effect table, ids and frame shape. The unit picks the right table for the model and output, shows it grouped when the table has groups, builds the effect frame, and records the choice in the look. 🟢
Effect speed and brightness controls belong to `device-control/`; user-built sequences to `custom-effects/`; the generation of `effects.ts` from TSV to `tooling/`.

## Responsibilities
- Select the effect table for a model and output (variant) 🟢
- Present the table in the device card's effect select, grouped by `Effect.group` when present 🟢
- Build the family-specific effect frame for the chosen effect, carrying the output's channel byte where the layout has one 🟢
- Record `look.effect` and clear `look.customEffectId` 🟢
- Reflect the look back into the select (selected option) 🟢
- Keep effects out of broadcast 🟢

## Business Rules
- **BR-06** Each output of LEDCAR-01 uses its own table: `ledcar` (23 entries) for RGB (`variant 'ble'`), `leddmx` (211 entries) for SPI (`variant 'dmx'`). Sending one table's ids to the other plays the wrong effect. 🟢 (`ffe0.ts:150-157`)
- **BR-11** Effects are never broadcast: ids differ per family (id 42 is a different effect on LEDDMX and MELK). The Everything card has no effect control. 🟢 (`Effects.svelte:50-52`)
- **BR-17** Choosing an effect sets `look.effect` and clears `look.customEffectId`; it keeps `look.colorHex`, so the swatch still shows. 🟢 (`DeviceCard.svelte:113-114`, SM-2)
- **BR-19** On BLEDIM, choosing an effect clears the driver's remembered static colour, so brightness and speed then drive the effect (`0x88`). 🟢 (`bledim.ts:247-250`)
- **BR-21** Families without a name table still expose the ids plainly (`smart`, `sun`: 16 entries "Modo N"; BLEDIM: 13 entries "M1..M13"), instead of hiding the feature or inventing names. 🟢 (`ffe0.ts:167-171`, `bledim.ts:102-108`)
- **BR-EF1** Table selection, checked in order: `LEDCAR-01` → by variant; any other `LEDCAR` → `ledcar`; then by layout: `dmx`/`dmxs` → `leddmx`, `like` → `ledlike`, `pho` → `ledpho`, `smart`/`sun` → 16 generated, everything else (`ble`) → `ledble`. fff0: MELK → `melk` (241, grouped), other → `elk` (29). bledim → 13 generated. 🟢
- **BR-EF2** MELK effects in group `Scenes` use a separate opcode (`0x31`); MELK only. 🟢 (`fff0.ts:80-84`)
- **BR-EF3** ELK ids are already offset into `0x80..0x9C` by the table; MELK ids are raw. The sub-opcode is `0x06` on MELK and `0x03` on ELK. 🟢 (`fff0.ts:85-87`)
- **BR-EF4** The ffe0 `ble` layout uses `setRgbMode` (`7E FF 03 id 03 FF FF ch EF`), not `setMode` (`7E 00 0E` is the colour tab's four scene shortcuts). `LEDBLE-03` shifts the id one byte left (`7E 03 id 00 FF FF FF FF EF`). 🟢 (`ffe0.ts:288-293`)
- **BR-EF5** The ffe0 `dmxs` layout uses opcode `0x03` (built-in modes); `0x13` is the DIY patterns, and using it was a past bug. 🟢 (`ffe0.ts:267-270`)
- **BR-EF6** A BLEDIM effect is a whole 72-byte scene (`0x82`): `p[14] = (id & 0x7F) | 0x80` (chase bit), with the remembered speed, brightness and strobe, and one white colour entry. 🟢 (`bledim.ts:117-140`)
- **BR-EF7** An effect is identified in the look by `id` **and** `group`, because MELK reuses ids across groups. 🟢 (`DeviceCard.svelte:268`)
- **BR-EF8** The channel byte is carried only where the layout has one: ffe0 `ble` and `dmxs`. fff0, bledim and the other ffe0 layouts ignore the output. 🟢

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | `driver.effects(name, variant)` returns the table defined by BR-EF1 | Must | LEDCAR-01 + `ble` → 23 `ledcar` entries; LEDCAR-01 + `dmx` → 211 `leddmx` entries |
| RF-02 | The effect select lists "none", then (when the family supports custom effects) "My effects" and "New effect…", then the built-ins: one `optgroup` per distinct group, or a single "Built-in" group when no entry has a group | Must | MELK shows 9 groups; LEDBLE shows one "Built-in" group |
| RF-03 | Choosing a built-in sends `driver.effect(fx, name, ch, variant)` through `applyTo` with **no coalescing**, then sets `look.effect = fx` and clears `customEffectId` | Must | The card summary shows the effect name after the pick |
| RF-04 | The select shows the current look: `c:<id>` for a custom effect, `b:<index>` for the built-in whose `id` and `group` match `look.effect`, otherwise "none" | Must | Reopening the card after a reload shows the last chosen effect |
| RF-05 | Choosing "none" sends nothing | Should | No frame is written |
| RF-06 | fff0 effect frame: `7E 05 31 id 07 FF FF 01 EF` for MELK `Scenes`; otherwise `7E 05 03 id <06 MELK \| 03 ELK> FF FF 00 EF` | Must | Matches the byte templates in `frames.test.ts` |
| RF-07 | ffe0 effect frame per layout: `dmxs 7B 03 id FF FF FF FF ch BF`; `dmx 7B FF 03 id FF FF FF FF BF`; `smart 7D 02 05 id FF FF FF FF DF`; `sun 7A 06 id FF FF FF FF FF AF`; `like 70 FF id FF FF FF FF FF 0F`; `pho 72 08 id FF FF 00 00 00 2F`; `ble 7E FF 03 id 03 FF FF ch EF` (`LEDBLE-03`: `7E 03 id 00 FF FF FF FF EF`); `ch` defaults to `FF` | Must | Matches `frames.test.ts` and the difftest |
| RF-08 | bledim effect frame: clears the remembered colour and returns `sceneFrame(name, id)` | Must | After an effect, a brightness change sends `0x88` instead of a static scene |
| RF-09 | The effect control shows only when `caps.effects` (true on every family today) | Could | — |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Fidelity | Effect ids and names come from the vendor app resources, generated from `docs/protocol/*.tsv`, never edited by hand | `src/lib/protocol/effects.ts:1` | 🟢 |
| Fidelity | Effect frames are checked mechanically against decompiled vendor code (difftest) | `tools/difftest/`, `adrs/006` | 🟢 |
| Reliability | Effect writes are never coalesced or dropped | `DeviceCard.svelte:113` (no key) | 🟢 |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: LEDCAR-01 strip plays its own table
  Given a LEDCAR-01 device
  When the user opens the SPI output card
  Then the effect list has 211 entries from dmx_model
  And picking entry id 5 sends "7B FF 03 05 FF FF FF FF BF"

Scenario: LEDCAR-01 RGB output uses car_mode
  Given a LEDCAR-01 device
  When the user picks an effect on the RGB output
  Then the frame uses the ble layout "7E FF 03 id 03 FF FF FF EF"

Scenario: MELK scene effect
  Given a device named "MELK-OA10"
  When the user picks an effect in group "Scenes" with id 3
  Then the frame is "7E 05 31 03 07 FF FF 01 EF"

Scenario: LEDBLE-02 output carries its channel byte
  Given a LEDBLE-02 device
  When the user picks effect id 0x25 on output "LED 2"
  Then the frame is "7E FF 03 25 03 FF FF 02 EF"

Scenario: Effect replaces static colour on BLEDIM
  Given a BLEDIM showing a static red
  When the user picks effect M3
  Then a 0x82 scene with p[14] = 0x82 is sent
  And a following brightness change sends 0x88

Scenario: No effect broadcast
  Given several devices of different families
  When the user looks at the Everything card
  Then there is no effect control

Scenario: Effect choice survives reload
  Given the user picked "7-Color Jump" on a MELK
  When the page is reloaded
  Then the card's select shows "7-Color Jump"
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-01 table selection, RF-06..08 frames | Must | Wrong table or frame plays the wrong effect (the LEDCAR-01 bug fixed in `767e061`/`e632713`) |
| RF-02 select, RF-03 send and record, RF-04 reflect | Must | The only way to reach effects |
| RF-05 "none" | Should | Harmless no-op |
| RF-09 caps gate | Could | All families have effects today |

> Priority inferred from call frequency and position in the dependency chain.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `src/lib/protocol/effects.ts` | `melk`, `elk`, `ledble`, `ledcar`, `leddmx`, `ledlike`, `ledpho` | 🟢 |
| `src/lib/protocol/fff0.ts` | `effects`, `effect` | 🟢 |
| `src/lib/protocol/ffe0.ts` | `effects`, `effect` | 🟢 |
| `src/lib/protocol/bledim.ts` | `effects`, `effect`, `sceneFrame` | 🟢 |
| `src/lib/ui/DeviceCard.svelte` | `builtIn`, `groupNames`, `chooseEffect`, effect `<select>` | 🟢 |
