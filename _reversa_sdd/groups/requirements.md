# Groups and Selection

> Reversa Writer · 2026-10-26 · unit `groups` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ui/Devices.svelte`, `src/lib/ble.svelte.ts` (`selection`, `apply`, `targets`, `forget`), `src/lib/store.svelte.ts` (`addGroup`, `removeGroup`, `forgetDevice`), `src/lib/persist.ts` (`Group`), `domain.md` (G6, F2)

## Overview
A **group** is a named set of lights (whole devices or single outputs) that the user wants to command together. Today the code lets the user tick devices and outputs on the Devices tab (the *selection*), save the selection as a group, and re-select a group. **But no command reads the selection** (F15), so in the legacy code a group changes nothing on the lights. 🟢
The owner's stated intent (G6) is device-level groups: set colours and options on every member at once. This spec documents both the legacy behaviour and the intended contract.

## Responsibilities
- **Legacy** 🟢
  - Maintain the selection: endpoint keys ticked on the Devices tab
  - Select all or clear the selection
  - Save the selection as a named group, list the groups, re-select one, delete one
  - Remove a forgotten device from the selection and from the groups
- **Intended** 🟡 (G6)
  - Command a group: every control applies to all members
  - Show a group's real member count

## Business Rules
- **BR-G1** The selection holds endpoint keys (`deviceId` or `deviceId#i`) and is **not persisted**; it resets on reload. 🟢 (`ble.svelte.ts:35-36`)
- **BR-G2** A device without outputs is selected by its id. A multi-output device has **no** device-level checkbox, only one per output (`id#i`); its row is highlighted when any output is selected. 🟢 (`Devices.svelte:121-125,159-165`)
- **BR-G3** "Select all" selects every key from `keysOf` (outputs for multi-output devices, the id otherwise); when everything is already selected it clears instead. 🟢 (`Devices.svelte:51-58`)
- **BR-G4** Saving a group needs a non-blank name and a non-empty selection; it stores a **copy** of the selection keys. 🟢 (`Devices.svelte:92-97`)
- **BR-G5** Selecting a group replaces the selection with the group's keys whose device is still known (`conns[key.split('#')[0]]`). 🟢 (`Devices.svelte:60-62`)
- **BR-G6** Forgetting a device removes its keys from the selection (by parsed device id) and removes the exact id from groups. 🟢 (`ble.svelte.ts:233`, `store.svelte.ts:105`)
- **BR-G7 / F2** Output keys `id#i` **survive** a forget in groups, because the group filter compares `x !== id`. 🟢 defect
- **BR-G8 / F2** The group's member label counts keys, not devices: a device with two outputs selected counts as 2. 🟢 (`Devices.svelte:201`)
- **BR-G9 / F15** No command consumes the selection: `apply()` and `targets()` are the only readers and neither has a caller. Card controls and the Everything card address keys directly. 🟢 defect
- **BR-G10 (intended, G6)** A group is a set of devices or endpoints that **receives every command** (power, colour, brightness and the rest), not only a way to tick checkboxes. 🟡
- **BR-G11 (intended)** Effects stay per family (BR-11): a group command may carry an effect only when every member shares the family and table. 🟡 inferred from BR-11

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | Devices tab: a checkbox per single-light device and per output of a multi-output device toggles that key in the selection; selected rows are highlighted | Must | Ticking "LED 2" adds `id#1` |
| RF-02 | Select all / Clear selection toggle | Should | — |
| RF-03 | Group name input + "Save selection" (disabled without a name or a selection) → `addGroup(name, [...selection.ids])`; the name clears | Must | The group lists with its count |
| RF-04 | Each group row shows name, member count, Select (replaces the selection with the known members), ✕ delete | Must | — |
| RF-05 | Forget removes the device from the selection and from every group, **including its output keys** | Must | Fails today for `id#i` keys (F2) |
| RF-06 | The member count counts **distinct devices or endpoints as the user sees them** | Should | Fails today (F2) |
| RF-07 (intended) | Group control: a way to send power, colour and brightness (at least) to every member of a group, through `applyTo(group.keys, …)` | Must | Fails today: there is no group control (F15, G6) |
| RF-08 (intended) | Selection control: when a selection exists, a command surface applies to the selection (the role `apply()` was written for) | Should | Fails today (F15) |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Reliability | Group commands go through the same per-device queues and auto-reconnect as any command | `ble.svelte.ts:308-335` (`applyTo`) | 🟡 intended |
| Data integrity | Groups never point to forgotten devices | `store.svelte.ts:105` (partial) | 🟢 / defect F2 |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: Save and re-select a group
  Given devices "Strip" and "Handle" are ticked
  When the user saves the selection as "Car"
  Then the group "Car" lists with 2 members
  When the user clears the selection and clicks Select on "Car"
  Then both are ticked again

Scenario: Selecting a group skips unknown devices
  Given the group "Car" contains a device that is no longer known
  When the user clicks Select on "Car"
  Then only known members are ticked

Scenario: Forget removes outputs from groups
  Given a group containing "abc#0" and "abc#1"
  When the user forgets device "abc"
  Then the group has no "abc" keys left
  # Fails today (F2)

Scenario: Commanding a group (intended)
  Given the group "Car" with the strip and the handle
  When the user sets red on the group
  Then both lights receive red
  And both looks record red
  # Fails today: no command reads groups or the selection (F15)

Scenario: Selection does not survive reload
  Given some devices are ticked
  When the page is reloaded
  Then nothing is ticked
  And the saved groups are still listed
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-07 group control | Must | Owner intent (G6), headline feature "many devices at once / a named group" (domain purpose) |
| RF-01, RF-03, RF-04, RF-05 | Must | Group CRUD and integrity |
| RF-02, RF-06, RF-08 | Should | Convenience and correct counts |

> Priority inferred from the domain purpose and owner answers (G6), not from call frequency, since the selection has no consumer today.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `src/lib/ui/Devices.svelte` | `keysOf`, `toggle`, `allKeys`, `allSelected`, `selectAll`, `selectGroup`, `saveGroup`, groups list | 🟢 |
| `src/lib/ble.svelte.ts` | `selection`, `apply`, `targets` (dead), `forget` (selection cleanup) | 🟢 |
| `src/lib/store.svelte.ts` | `addGroup`, `removeGroup`, `forgetDevice` (groups filter) | 🟢 |
| `src/lib/persist.ts` | `Group` | 🟢 |
