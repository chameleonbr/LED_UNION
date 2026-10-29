# Persistence

> Reversa Writer · 2026-10-26 · unit `persistence` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/persist.ts`, `src/lib/store.svelte.ts`, `src/lib/persist.test.ts`, `src/lib/ui/ColorSelect.svelte` (palette remove and restore), `erd-complete.md`, `data-dictionary.md`

## Overview
Holds every piece of user data (saved devices, groups, scenes, looks, labels, palette, custom effects, locale) in **one reactive object** mirrored to `localStorage['led-union/v1']`. It loads, migrates older shapes, saves the whole object on every mutation, and never lets a storage failure block a command. There is no backend and no account. 🟢

## Responsibilities
- Define the persisted schema (`Persisted` and its parts) 🟢
- Load from storage (current key, then legacy key) and migrate older shapes 🟢
- Expose the reactive `store` and save it after each mutation 🟢
- Provide mutation helpers per entity: devices, labels, hardware config, looks, palette, custom effects, scenes, groups, locale 🟢
- Cascade a device forget to every entity keyed to it 🟢
- Generate local ids 🟢

## Business Rules
- **BR-01** The saved `name` is the advertised name and is never edited; renaming writes `label`. 🟢 (`persist.ts:5-8`)
- **BR-35** Forgetting a device removes the device, its id from groups, every look and label keyed `id` or `id#…`, its scene entries, and scenes left empty. 🟢 (`store.svelte.ts:103-117`) Defect F2: `id#i` keys remain in groups.
- **BR-36** Hardware wiring (`strip`, `channelMode`) is stored on the saved device; it describes the hardware. 🟢 (`persist.ts:10-16`)
- **BR-37** An empty or invalid palette is re-seeded with 8 colours **on load**. 🟢 (`persist.ts:115-119`)
- **BR-38** Storage failures never block a command: `load()` falls back to an empty state; `save()` swallows errors. 🟢 (`store.svelte.ts:29-47`)
- **BR-34** Scenes without `entries` (old single-colour shape) are dropped on load. 🟢 (`persist.ts:140-145`)
- **BR-P1** The storage key is `led-union/v1`; on load, the legacy `led-onion/v1` is read when the current key is absent (project rename). Saving always writes the current key only; the legacy key is left in place. 🟢 (`persist.ts:94-96`, `store.svelte.ts:31,43`)
- **BR-P2** Legacy per-device `outputs[{ch, label}]` are migrated to `labels['id#i']` (by position), and looks keyed `id#ch` are copied to `id#i`; then `outputs` is deleted. Existing new-style values are never overwritten. 🟢 (`persist.ts:124-138`)
- **BR-P2a / F16** 🟢 defect: old channel keys (`id#1`, `id#2`) overlap the new index keys (`id#0`, `id#1`). The "never overwrite" guard reads the **old** `id#1` look as if it were new data, so the second output inherits the first output's look and `id#2` is left orphaned. The migration must read every old key first, then write the new ones.
- **BR-P3** A missing or non-object `looks` / `labels`, or a non-array `customEffects`, becomes an empty container on load; unknown extra fields are kept (shallow merge). 🟢 (`persist.ts:113-122`) The checks are shallow 🟢: arrays pass as `looks`/`labels`, and `customEffects` entries are not checked. **Defect F21** 🟢: a non-iterable `devices` or a non-array `scenes` (e.g. `scenes: {}`) throws in `migrate` (`persist.ts:127,143`), and `load()` then drops the **whole** saved state (`store.svelte.ts:29-36`). [external review R12]
- **BR-P4** Labels and device names are trimmed; an empty label deletes the entry, so the model's own name shows again. 🟢 (`store.svelte.ts:60-67,96-101`)
- **BR-P5** A look update **merges** into the existing look. 🟢 (`store.svelte.ts:137-140`)
- **BR-P6** Removing a custom effect clears `customEffectId` in every look that points to it. 🟢 (`store.svelte.ts:177-183`)
- **BR-P7** `uid()` = 8 base-36 characters from `Math.random`. It is not cryptographic; fine for local ids. 🟢 (`store.svelte.ts:49`)
- **BR-P8** Seeded colours carry a `key` (red, orange, yellow, green, cyan, blue, purple, white) so that their names translate; user colours keep the typed name, or the hex when the name is blank. 🟢 (`persist.ts:82-92`, `store.svelte.ts:144-149`)
- **BR-P9** `driverId` is written on every `track()` with the **name-based guess** and is never read (`restore()` re-derives the driver from the name). 🟢 dead field

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | `load()` reads `led-union/v1`, else `led-onion/v1`, parses the JSON and runs `migrate`; any exception returns `empty()` | Must | Garbage in storage gives a working empty app (`persist.test.ts:84`) |
| RF-02 | `empty()` = no devices, groups, scenes, looks or labels, no custom effects, the 8 seeded colours, no locale | Must | `persist.test.ts:5` |
| RF-03 | `migrate(raw)`: shallow merge over `empty()`; re-seed the palette; fix the containers; migrate the legacy outputs; drop the legacy scenes | Must | `persist.test.ts:15,49,61,76` |
| RF-04 | `save()` writes `JSON.stringify(store)` under `led-union/v1` and ignores failures | Must | In private mode, commands still work |
| RF-05 | `store` is one reactive object; the UI reads it directly | Must | Renaming updates every view immediately |
| RF-06 | Devices: `rememberDevice(d)` upserts by id (merging fields); `renameDevice(id, label)`; `setChannelMode(id, mode)`; `setStrip(id, cfg)`; each saves | Must | A re-tracked device keeps its strip and channel mode |
| RF-07 | Labels: `labelOf(key, fallback)` and `renameEndpoint(key, label)` | Must | Clearing an output name shows the model label again |
| RF-08 | Looks: `lookOf(key)` (default `{}`) and `setLook(key, patch)` (merge) | Must | — |
| RF-09 | Palette: `addColor(name, hex)`, `removeColor(id)`, `resetColors()` | Should | Restore brings back the 8 seeded colours |
| RF-10 | Custom effects: add (new uid), update (merge), remove (with look cleanup) | Must | See `custom-effects/` |
| RF-11 | Scenes: `addScene(name, keys)` with a deep plain snapshot; `removeScene(id)` | Must | See `scenes/` (F14) |
| RF-12 | Groups: `addGroup(name, keys)`, `removeGroup(id)` | Must | See `groups/` |
| RF-13 | Locale: `setLocale(tag \| undefined)`; `undefined` deletes the field (follow the browser) | Must | See `i18n/` |
| RF-14 | `forgetDevice(id)` cascade as in BR-35, including output keys in groups | Must | Fails today for groups (F2) |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Availability | Works with storage blocked or in a private window (in-memory only) | `src/lib/store.svelte.ts:33-35,44-46` | 🟢 |
| Privacy | All data stays in the browser profile; nothing leaves the device | no network code outside BLE (`permissions.md`) | 🟢 |
| Compatibility | Older installs (renamed key, hand-declared outputs, old scenes) load without loss where a faithful mapping exists | `src/lib/persist.ts:95-145` | 🟢 |
| Performance | The whole store is re-serialized on every mutation, including each slider step | `src/lib/store.svelte.ts:41-47,137-140` | 🟢 (fine at this data size) |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: Fresh install
  Given empty storage
  When the app loads
  Then the store has 8 seeded colours and nothing else

Scenario: Renamed project key
  Given only "led-onion/v1" holds data
  When the app loads and the user changes anything
  Then the data is available
  And it is written to "led-union/v1"

Scenario: Legacy outputs migrate to index keys
  Given a device "abc" with outputs [{ch:1,label:"Strip"},{ch:2,label:"Handle"}] and a look under "abc#2"
  When migrate runs
  Then labels["abc#0"] = "Strip" and labels["abc#1"] = "Handle"
  And looks["abc#0"] equals the old "abc#1" look
  And looks["abc#1"] equals the old "abc#2" look
  And no "abc#2" look remains
  And the device has no "outputs" field
  # Fails today (F16): looks["abc#1"] keeps the old ch-1 look and "abc#2" is left orphaned
  # (reproduced by running migrate under node)

Scenario: Storage is blocked
  Given localStorage throws on access
  When the app loads and the user sends commands
  Then the app runs with an empty state and every command works

Scenario: Emptied palette
  Given the stored palette is []
  When the app loads
  Then the 8 seeded colours are back

Scenario: Forget cascades
  Given device "abc" with looks, labels, scene entries and group keys "abc" and "abc#1"
  When forgetDevice("abc") runs
  Then no key starting with "abc" remains anywhere
  And scenes left empty are removed
  # The group part fails today for "abc#1" (F2)
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-01..05 load, migrate, save, reactive store | Must | Every feature reads or writes it |
| RF-06..08, RF-10..14 entity helpers | Must | Called by several units |
| RF-09 palette remove and restore | Should | Convenience; re-seeding protects against loss |

> Priority inferred from call frequency and position in the dependency chain.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `src/lib/persist.ts` | `SavedDevice`, `StripConfig`, `Group`, `Look`, `SavedColor`, `CustomEffect`, `Scene`, `Persisted`, `seedColors`, `KEY`, `LEGACY_KEY`, `empty`, `migrate` | 🟢 |
| `src/lib/store.svelte.ts` | `load`, `store`, `save`, `uid`, `rememberDevice`, `renameDevice`, `setChannelMode`, `setStrip`, `labelOf`, `renameEndpoint`, `forgetDevice`, `addGroup`, `removeGroup`, `lookOf`, `setLook`, `addColor`, `removeColor`, `resetColors`, custom-effect CRUD, `addScene`, `removeScene`, `setLocale` | 🟢 |
| `src/lib/persist.test.ts` | 7 tests (seed, legacy install, output migration, scene drop, re-seed, garbage, fresh array) | 🟢 |
