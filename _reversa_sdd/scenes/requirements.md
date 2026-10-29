# Scenes

> Reversa Writer · 2026-10-26 · unit `scenes` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ui/Scenes.svelte`, `src/lib/ui/Effects.svelte` (save scene card), `src/lib/store.svelte.ts` (`addScene`, `removeScene`, `lookOf`, `setLook`), `src/lib/persist.ts` (`Scene`, `migrate`), `domain.md`, `adrs/009`

## Overview
A **scene** is a named snapshot of the looks of the endpoints the user ticked, re-applied on demand to those endpoints only. It serves the headline scenario: walk back to the car, tap one scene, and every light goes to its saved state, reconnecting offline devices on the way. 🟢

## Responsibilities
- Save a scene from the endpoints ticked on the Effects tab, snapshotting their current looks 🟢
- List scenes with their entry count; apply or delete each 🟢
- Replay each entry in a fixed order (power → brightness → speed → colour → custom effect | effect) 🟢
- Touch only the endpoints saved in the scene 🟢
- Update each endpoint's look to the replayed one 🟢
- Drop old-format scenes on load 🟢

## Business Rules
- **BR-30** A look is the last command sent, not a reading. A scene replays commands; it cannot know the device's real state. 🟢
- **BR-31** A scene touches only the endpoints saved in it; everything else keeps doing what it was doing. 🟢 (`Scenes.svelte:46-49`)
- **BR-32** A scene is a snapshot: later changes to the lights do not change it. 🟢 (`store.svelte.ts:191-192`) **Exception** 🟢: a custom effect is stored as `customEffectId` only (`persist.ts:36-45`) and resolved live at replay (`Scenes.svelte:33-37`), so editing the effect changes every scene that uses it, and deleting it silently drops that upload. This is **intended** 🟢 [Owner, 2026-10-26]: scenes replay the edited version. Deleting an effect should warn or prune the scenes that use it (TD-14, T-12). [external review R07]
- **Precondition** 🟢: a stored look is a `$state` proxy even when it is empty; only an absent look (`lookOf` returns a fresh `{}`) clones today (F14). [external review R02]
- **BR-33** Apply order per entry is power → brightness → speed → colour → (custom effect | effect), because the last command sent wins on these controllers. 🟢 (`Scenes.svelte:14-42`) **Defect F23** 🟢: on BLEDIM `rgb()` emits a static scene at brightness 255 with unscaled RGB (`bledim.ts:155-165,214-217`), so the brightness sent before it is lost; the replayed light ends at full brightness. A family-aware order (colour, then brightness, on BLEDIM) is needed. [external review R17]
- **BR-34** Old-format scenes (one colour, no device) are dropped on load rather than applied to the wrong lights. 🟢 (`persist.ts:140-145`)
- **BR-12** Applying a scene reconnects offline devices first. 🟢 (`Scenes.svelte:50-51`)
- **BR-35** Forgetting a device removes its scene entries, and scenes left empty are removed. 🟢 (`store.svelte.ts:112-115`, owned by `persistence/`)
- **BR-SC1** Entries are applied **sequentially**, one endpoint after another, in saved order. 🟢 (`Scenes.svelte:57`)
- **BR-SC2** A custom effect in the look wins over a built-in effect; only one of them is replayed. 🟢 (`Scenes.svelte:33-42`)
- **BR-SC3** A field missing from the look is not sent. An endpoint with an empty look is only re-recorded. 🟢
- **BR-SC4** Saving needs a non-blank name and at least one ticked endpoint. After saving, the name clears and the ticks reset. 🟢 (`Effects.svelte:42-48`)
- **BR-SC5** While a scene applies, its Apply button is disabled; other scenes can run concurrently. 🟢 (`Scenes.svelte:81`) **Defect F22** 🟢: `busy` is one scalar id (`Scenes.svelte:6,53-62`). Start A, then B: A's button re-enables while A still runs, and whichever finishes first clears `busy` for both. `run()` has no in-flight guard. Owner decision 🟢 [Owner, 2026-10-26]: scenes may run concurrently; fix with a per-scene set of running ids. [external review R16]
- **BR-SC6 (intended)** The replay must use the same output selector as the live card: channel byte **and variant**. 🟢 intent (BR-10, BR-06), violated by the code (F1)

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | Each device card on the Effects tab has a checkbox; the "Save scene" card shows the ticked count, a name input and Save (disabled without a name or a tick) | Must | Ticking 2 cards shows "Save (2)" |
| RF-02 | `addScene(name, keys)` stores `{ id: uid(), name, entries: keys.map(key => ({ key, look: snapshot(lookOf(key)) })) }` and saves | Must | Changing a light after saving does not change the scene |
| RF-03 | The Scenes tab lists each scene with its name and `scenes.count` ({n} entries); an empty state message shows when there are none | Must | — |
| RF-04 | Apply runs `applyLook(key, look)` for each entry in order, with errors shown in an error card | Must | A scene with 3 entries sends to 3 endpoints |
| RF-05 | `applyLook` sends, when present, `power`, `brightness`, `speed`, `colorHex` (as rgb), then the custom effect (ordered upload) or else the built-in effect; then `setLook(key, look)` | Must | A look `{power:true, colorHex:'#ff0000', brightness:40}` sends power, brightness, then rgb, in that order |
| RF-06 | Each replayed frame uses the entry's output selector: `ch` and `variant` from `outputAt` | Must | Replaying a LEDCAR-01 RGB entry uses the `ble` envelope (fails today, F1) |
| RF-07 | When replaying a custom effect, the effect's speed is sent after the upload, as the card does | Should | Fails today (F12) |
| RF-08 | Delete (✕) removes the scene and saves | Must | — |
| RF-09 | On load, scenes without an `entries` array are dropped | Must | A v0 scene `{color:'#f00'}` disappears after migrate |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Availability | Offline devices are reconnected during apply, so a scene works on arrival | `Scenes.svelte:50-51`, `ble.svelte.ts:324` | 🟢 |
| Reliability | Each frame goes through the device's serial queue; scene frames are not coalesced | `Scenes.svelte:21-41` (no coalesce key) | 🟢 |
| Data integrity | Intended: scenes are deep snapshots; invalid legacy scenes are dropped, not guessed. Today the snapshot throws for any stored look (F14), and custom effects are held by reference (BR-32) | `store.svelte.ts:191-192`, `persist.ts:140-145` | 🟡 intent; 🟢 legacy drop [external review R02] |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: Save a scene
  Given two cards with looks: car strip red at 60%, door handle "Rainbow" effect
  When the user ticks both, types "Arrive" and clicks Save
  Then a scene "Arrive" with 2 entries is stored
  And the ticks and the name are cleared

Scenario: Snapshot does not follow the lights
  Given the scene "Arrive" was saved with the strip red
  When the user sets the strip to blue
  Then the scene entry for the strip still holds red

Scenario: Apply reconnects and replays in order
  Given the scene "Arrive" and both devices offline
  When the user applies it
  Then each device is reconnected
  And the strip receives power, brightness 60, then rgb red
  And the door handle receives its effect frame
  And both looks equal the scene entries

Scenario: Untouched endpoints keep their state
  Given a third device not in "Arrive" playing an effect
  When "Arrive" is applied
  Then nothing is written to the third device

Scenario: LEDCAR-01 RGB output replays with its own envelope
  Given a scene entry for the LEDCAR-01 RGB output with effect id 3 from car_mode
  When the scene is applied
  Then the effect frame uses the ble layout "7E FF 03 03 03 FF FF FF EF"
  # Fails today: the builder drops variant, so the dmx envelope is used (F1)

Scenario: Legacy scenes are dropped
  Given storage holds a scene without entries
  When the app loads
  Then that scene is not listed

Scenario: Saving a scene from cards that have looks
  Given a card whose look is not empty
  When the user saves a scene that includes it
  Then the scene is stored
  # Fails today: structuredClone on the Svelte state proxy throws DataCloneError (F14)
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-02 save, RF-04/05 apply, RF-06 correct output | Must | Headline feature (domain purpose); F1 and F14 break it |
| RF-01, RF-03, RF-08, RF-09 | Must | The only UI for scenes; migration protects data |
| RF-07 custom-effect speed | Should | Card behaviour parity |

> Priority inferred from call frequency and position in the dependency chain.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `src/lib/ui/Scenes.svelte` | `applyLook`, `run`, scene list | 🟢 |
| `src/lib/ui/Effects.svelte` | `picked`, `pickedKeys`, `saveScene`, save card | 🟢 |
| `src/lib/store.svelte.ts` | `addScene`, `removeScene`, `lookOf`, `setLook`, forget cascade on scenes | 🟢 |
| `src/lib/persist.ts` | `Scene`, `Look`, `migrate` (scene filter) | 🟢 |
