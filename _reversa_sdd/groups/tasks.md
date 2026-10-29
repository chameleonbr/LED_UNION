# Groups and Selection, Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `groups` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md` and `design.md` in this folder.

## Prerequisites
- [ ] `device-connection/` is done: `conns`, `forget`
- [ ] `device-control/` is done: `applyTo`, the Everything-card pattern, `setLook`
- [ ] `persistence/` provides `store.groups`, `uid`, `save`, `forgetDevice`
- [ ] `endpoint.ts` provides `epKey`, `parseEp`
- [ ] `i18n/` has the `devices.*` group and selection keys
- [x] The owner has decided effects for groups (T-08) [Owner, 2026-10-26]

## Tasks

- [ ] T-01, Define `Group` (`id`, `name`, `deviceIds: string[]` of endpoint keys) and the session-only `selection = $state({ ids: [] })`
  - Legacy source: `src/lib/persist.ts:27`, `src/lib/ble.svelte.ts:35-36`
  - Done when: groups persist and the selection resets on reload
  - Confidence: 🟢

- [ ] T-02, Implement `addGroup(name, keys)` (stores a copy) and `removeGroup(id)`, each ending with `save()`
  - Legacy source: `src/lib/store.svelte.ts:119-130`
  - Done when: the "Save and re-select a group" scenario passes
  - Confidence: 🟢

- [ ] T-03, Group cleanup on forget: drop every key whose `parseEp(k).deviceId === id` (not only `x === id`), and drop groups left empty (fixes F2)
  - Legacy source: `src/lib/store.svelte.ts:105` (currently `x !== id`)
  - Done when: the "Forget removes outputs from groups" scenario passes
  - Confidence: 🟢

- [ ] T-04, Build the Devices tab selection:
  - one checkbox per single-light device;
  - for a multi-output device, one per output (no device checkbox);
  - highlight a row when any of its keys is selected;
  - Select all / Clear selection.
  - Legacy source: `src/lib/ui/Devices.svelte:11-21,43-58,100-181`
  - Done when: LEDBLE-02 shows two output checkboxes and no device checkbox; Select all selects every output key
  - Confidence: 🟢

- [ ] T-05, Build the group list:
  - name input + "Save selection" (disabled without a name or a selection);
  - each row shows name, count, Select (keeps only known devices, using `parseEp` instead of `split('#')`) and ✕.
  - Legacy source: `src/lib/ui/Devices.svelte:60-62,92-97,183-206`
  - Done when: the "Selecting a group skips unknown devices" scenario passes
  - Confidence: 🟢

- [ ] T-06, Count group members as distinct endpoints the user sees; show a separate device count when that is clearer (fixes F2's count)
  - Legacy source: `src/lib/ui/Devices.svelte:201`
  - Done when: a group holding `abc#0` and `abc#1` reads "2 lights · 1 device" (wording to be agreed)
  - Confidence: 🟡 (copy and format need an owner decision)

- [ ] T-07, Group control card on the Effects tab, one per group:
  - power, colour (through `ColorSelect`) and brightness over the group's known keys, through `applyTo`, with the look updated per key (Everything-card pattern);
  - device-level keys of multi-output devices are expanded to their output keys before sending.
  - Legacy source: none (intent G6); pattern from `src/lib/ui/Effects.svelte:50-76,103-120`
  - Done when: the "Commanding a group (intended)" scenario passes; the frames for a LEDBLE-02 member carry channel bytes 1 and 2, never the default `FF`
  - Confidence: 🟡

- [ ] T-08, Group effects: offer the effect select on a group card only when every member has the same `driver.id` and the same `effects(name, variant)` table
  - Legacy source: none; constraint from BR-11 (`src/lib/ui/Effects.svelte:50-52`)
  - Done when: a group of two LEDCAR-01 SPI outputs shows the `leddmx` list; a mixed MELK + LEDBLE group shows none
  - Confidence: 🟢 owner decision [Owner, 2026-10-26]: effects only when members share the family and table; mixed groups get power, colour, brightness

- [ ] T-09, Selection as an ad-hoc group: while `selection.ids` is non-empty, show the same control card for the selection (the role of the dead `apply()`). Then remove or reuse `apply`/`targets`.
  - Legacy source: `src/lib/ble.svelte.ts:299-346` (dead code)
  - Done when: ticking two devices on the Devices tab and setting a colour on the selection card changes both
  - Confidence: 🟡

## Test Tasks

- [ ] TT-01, Happy path: save a group → select it → the selection equals the stored keys (minus unknown devices)
- [ ] TT-02, Main error case: forget a device with output keys in two groups → no keys left; empty groups removed
- [ ] TT-03, Group control: a fake `applyTo` receives the expanded output keys for a multi-output member
- [ ] TT-04, Group effect gating: same family and table → shown; mixed → hidden
- [ ] TT-05, Reload: groups survive, the selection is empty

## Data Migration Tasks
- [ ] TM-01, On load, drop group keys whose device is no longer in `store.devices`, and drop empty groups (cleans data left by F2)
- [ ] TM-02, Optional: rename `Group.deviceIds` → `keys` with a `migrate()` step that copies the old field (only if the rename is adopted)

## Suggested Order
1. T-01, T-02, T-03 (with TT-02), then TM-01.
2. T-04, T-05 (legacy UI parity), then T-06.
3. T-07 (core intent), then T-09; T-08 after the owner's decision.

## Pending Gaps (🔴)
- ✅ T-08 decided [Owner, 2026-10-26]: yes, when every member shares family and table.
- 🟡 Confirm the intended UX: a group card per group on the Effects tab, or one "target" selector (device / group / selection) feeding a single control card.
- 🟡 The count wording for T-06.
