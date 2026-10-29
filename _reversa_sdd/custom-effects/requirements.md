# Custom Effects

> Reversa Writer · 2026-10-26 · unit `custom-effects` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ui/CustomEffectEditor.svelte`, `src/lib/ui/DeviceCard.svelte` (`supportsCustom`, `runCustom`), `src/lib/ui/Effects.svelte` (editor host), `src/lib/protocol/ffe0.ts` (`customEffect`), `src/lib/protocol/bledim.ts` (`customEffect`), `src/lib/store.svelte.ts` (custom effect CRUD), `src/lib/persist.ts` (`CustomEffect`), `src/lib/ble.svelte.ts` (`sendFrames`)

## Overview
Lets the user build a named **colour sequence** (up to 14 colours, jump or fade, speed) once, save it, and run it on any endpoint whose family has a colour-list command. Running it uploads the sequence in the family's own frame format, in order and without coalescing, then sets the speed. 🟢

## Responsibilities
- Create, edit and delete custom effects (name, ordered colours, speed, fade) 🟢
- Persist them globally (not per device) 🟢
- Detect per endpoint whether the family supports custom effects 🟢
- Build the family's upload frames and send them in order, never coalesced 🟢
- Record `look.customEffectId` and clear `look.effect` 🟢
- Clean up looks that point to a deleted custom effect 🟢

## Business Rules
- **BR-15** Ordered multi-frame uploads are never coalesced: a missing colour corrupts the sequence. `sendFrames` always uses `push`. 🟢 (`ble.svelte.ts:348-369`) **Not atomic** 🟢: it pushes one frame and awaits it before pushing the next (`ble.svelte.ts:365-367`), so another card command, upload or scene replay can interleave between frames. Relative order holds; an uninterrupted sequence does not. Whether the firmware tolerates interleaving is 🔴 untested. [external review R19]
- **BR-20** A custom effect holds at most **14 colours** (BLEDIM's `MAX_COLOR_QTY`), applied everywhere so that one sequence works on every family. Black is a valid colour (green → black → amber is a strobe). 🟢 (`CustomEffectEditor.svelte:96-102`, `types.ts:23-26`)
- **BR-21** Families without a colour-list command get none: ffe0 `sun`, `like`, `pho` and every fff0 (ELK/MELK) device. 🟢 (`ffe0.ts:371-372`; fff0 has no `customEffect`)
- **BR-CE1** Support is detected by **calling** `driver.customEffect` with a one-colour spec and checking for a non-empty result. 🟢 (`DeviceCard.svelte:38-41`)
- **BR-CE2** Colour indices are **1-based** in the ffe0 upload. 🟢 (`ffe0.ts:381`)
- **BR-CE3** Mode byte `0xFE` = fade and `0xFD` = jump. The vendor's `0xFC` for LEDBLE (unclear meaning) is deliberately not used. 🟢 (`ffe0.ts:376-378`)
- **BR-CE4** `smart` (LEDSMART) and LEDSTAGE/LEDLIGHT write each colour into a constant DIY slot 0 with no index and have **no start command**; inventing one would be a fake frame. 🟢 (`ffe0.ts:390-413`)
- **BR-CE5** BLEDIM fits the whole sequence in one `0x82` scene: `p[0]` = fade flag, `p[3]` = colour count, `p[14] = 0xFF` (no built-in effect, the colour list plays), colours from byte 16 as `[W=0,R,G,B]`. It also clears the remembered static colour. 🟢 Unverified on hardware (code comment, G5).
- **BR-CE6** After the upload, the effect's own speed is sent with `speed(fx.speed)`. 🟢 (`DeviceCard.svelte:133`)
- **BR-CE7** Running a custom effect sets `look.customEffectId = fx.id` and clears `look.effect`; choosing a built-in or a static colour clears `customEffectId`. 🟢 (SM-2)
- **BR-CE8** Deleting a custom effect removes `customEffectId` from every look that points to it, otherwise the card would show a blank name forever. 🟢 (`store.svelte.ts:177-183`)
- **BR-CE9** A custom effect needs a non-blank name and at least one colour to be saved. 🟢 (`CustomEffectEditor.svelte:41-43`)
- **BR-CE10** The ffe0 upload ignores the output: no channel byte in any per-colour or start frame. On LEDBLE-02 / LEDCAR-02 the sequence goes to the family default. 🟢 code / 🟡 hardware effect unknown. **Owner intent** 🟢 [Owner, 2026-10-26]: the controller has one RGB and one addressable output, and they should be independent. That is the LEDCAR-01 model (variants `ble` / `dmx`, separate layouts), which already addresses each output; if the device advertises as LEDBLE-00/01 it is modelled as one light (ADR-008, Q1) and needs the hardware check.

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | The editor opens from "New effect…" in any card's effect select and is shown once, under the cards | Must | Choosing "New effect…" shows the editor |
| RF-02 | A new draft starts with name `''`, colours `#00ff00, #000000, #ffbb00`, speed 50 and jump | Should | — |
| RF-03 | The editor lists the saved effects as chips: clicking loads one for editing, ✕ deletes it | Must | Editing an effect and saving changes it in place (same id); every scene that references it replays the edited version (`scenes/` BR-32 exception) [external review R07] |
| RF-04 | Colour rows: a 1-based number, a colour input, ↑ / ↓ reorder (disabled at the ends), ✕ remove; "Add colour" appends `#ffffff`, disabled at 14 | Must | The 15th colour cannot be added |
| RF-05 | Speed slider 0..100 and a Jump / Fade toggle | Must | — |
| RF-06 | Save is disabled when the name is blank or there are no colours; on save, `addCustomEffect` or `updateCustomEffect` runs, then the draft resets and the editor closes | Must | A saved effect appears under "My effects" in every supporting card |
| RF-07 | Delete removes the effect and clears `customEffectId` from every look that used it | Must | The card that was running it now shows "none" |
| RF-08 | A card offers "My effects" and "New effect…" only when `supportsCustom`; otherwise it shows the `custom.unsupported` hint | Must | A MELK card shows the hint and no custom options |
| RF-09 | Running: `sendFrames(dkey, customEffect({colors, fade}))` (ordered, never coalesced), then `applyTo(speed(fx.speed))`, then `setLook({customEffectId, effect: undefined})` | Must | All per-colour frames and the start frame arrive in order (other commands may interleave, BR-15) [external review R19] |
| RF-10 | ffe0 upload frames per layout as specified in `design.md` (dmxs, dmx, smart, ble, LEDSTAGE/LEDLIGHT); empty for sun/like/pho or for 0 colours | Must | Matches the custom-effect tests in `frames.test.ts` |
| RF-11 | BLEDIM upload: one `0x82` frame holding up to 14 colours | Must | A 3-colour fade sets `p[0]=1`, `p[3]=3`, `p[14]=FF` |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Reliability | Upload frames are queued in order with `push`, so the queue gap paces them and none is dropped | `src/lib/ble.svelte.ts:355-369` | 🟢 |
| Portability | One 14-colour limit for every family, so a sequence never silently truncates | `CustomEffectEditor.svelte:96-97` | 🟢 |
| Fidelity | No invented frames for families without the command | `ffe0.ts:363-372,410-413` | 🟢 |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: Create and run a strobe on LEDBLE
  Given a LEDBLE-00 card
  When the user creates "Strobe" with green, black, amber, jump, speed 80
  And runs it on that card
  Then three frames "7E 01 0D FD 00 FF 00 03 EF", "7E 02 0D FD 00 00 00 03 EF", "7E 03 0D FD FF BB 00 03 EF" are written in order
  And the start frame "7E FF 0F 00 FF FF FF FF EF" follows
  And a speed frame with 80 is sent
  And the card summary shows "Strobe"

Scenario: Family without a colour-list command
  Given a MELK-OA10 card
  When the user opens the effect select
  Then there is no "My effects" or "New effect…" option
  And the hint "custom.unsupported" is shown

Scenario: LEDSMART has no start command
  Given a LEDSMART card
  When a 2-colour custom effect runs
  Then exactly two frames "7D 02 03 00 R G B 02 DF" are written and nothing else before the speed frame

Scenario: Colour limit
  Given a draft with 14 colours
  When the user looks at "Add colour"
  Then the button is disabled

Scenario: Delete clears the looks
  Given "Strobe" is running on two cards
  When the user deletes "Strobe"
  Then both cards' look.customEffectId is removed
  And their summaries show "none"

Scenario: Save needs a name
  Given a draft with colours and a blank name
  When the user looks at Save
  Then Save is disabled
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-09..11 run and frames | Must | Without them the feature does nothing; ordered upload is a hard rule |
| RF-03..07 editor CRUD | Must | The only way to make an effect |
| RF-08 support gate | Must | Prevents fake frames on unsupported families |
| RF-01, RF-02 open and defaults | Should | Convenience |

> Priority inferred from call frequency and position in the dependency chain.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `src/lib/ui/CustomEffectEditor.svelte` | `load`, `reset`, `move`, `submit`, colour rows, delete chips | 🟢 |
| `src/lib/ui/DeviceCard.svelte` | `supportsCustom`, `activeCustom`, `runCustom`, `chooseEffect` (`c:` branch) | 🟢 |
| `src/lib/ui/Effects.svelte` | `editing`, `<CustomEffectEditor>` host | 🟢 |
| `src/lib/protocol/ffe0.ts` | `customEffect`, `DIY_SLOT`, `isStage` | 🟢 |
| `src/lib/protocol/bledim.ts` | `customEffect`, `MAX_COLOR_QTY`, `NO_EFFECT` | 🟢 |
| `src/lib/store.svelte.ts` | `addCustomEffect`, `updateCustomEffect`, `removeCustomEffect` | 🟢 |
| `src/lib/persist.ts` | `CustomEffect` | 🟢 |
| `src/lib/ble.svelte.ts` | `sendFrames` | 🟢 |
