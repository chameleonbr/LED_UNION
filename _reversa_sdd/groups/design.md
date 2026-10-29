# Groups and Selection, Technical Design

> Reversa Writer · 2026-10-26 · unit `groups` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ui/Devices.svelte:11-97,100-207`, `src/lib/ble.svelte.ts:35-36,228-235,287-346`, `src/lib/store.svelte.ts:103-130`, `src/lib/persist.ts:27,71,95-100`, `src/lib/dict.ts:19-30`

## Interface

### Types and state 🟢

| Symbol | Shape | Persisted | Where |
|---|---|---|---|
| `Group` | `{ id: string, name: string, deviceIds: string[] }`. Despite the name, `deviceIds` holds **endpoint keys** (`id` or `id#i`) | yes, `store.groups` | `persist.ts:27` |
| `selection` | `$state<{ ids: string[] }>`: endpoint keys | no | `ble.svelte.ts:35-36` |

### Functions 🟢

| Symbol | Signature | Behaviour | Callers |
|---|---|---|---|
| `addGroup` | `(name, deviceIds: string[]) => Group` | `{ id: uid(), name, deviceIds }`, push, `save()` | `Devices.saveGroup` |
| `removeGroup` | `(id)` | filter, `save()` | Devices ✕ |
| `forgetDevice` (group part) | `(id)` | `g.deviceIds = g.deviceIds.filter(x => x !== id)` | `ble.forget` |
| `apply` | `(build, coalesceKey?) => applyTo(selection.ids, build, coalesceKey)` | broadcast to the selection | **none** (F15) |
| `targets` | `() => Conn[]` | unique conns in the selection | **none** (F11/F15) |

### Devices tab helpers 🟢 (`Devices.svelte`)

| Symbol | Definition |
|---|---|
| `outputsOf(c)` | `driver.outputs(name)`, or `[]` when there are fewer than 2 |
| `keysOf(c)` | outputs → `epKey(id, i)` for each; otherwise `[id]` |
| `toggle(key)` | splice in or out of `selection.ids` |
| `allKeys` | `list.flatMap(keysOf)` |
| `allSelected` | `allKeys.length > 0 && every key is selected` |
| `selectAll()` | `selection.ids = allSelected ? [] : allKeys` |
| `selectGroup(keys)` | `selection.ids = keys.filter(k => conns[k.split('#')[0]])` |
| `saveGroup()` | `name = newGroupName.trim()`; when the name and selection are non-empty: `addGroup(name, [...selection.ids])`; clear the name |

## Main Flow (legacy)

### Selecting 🟢
1. Device rows (`Devices.svelte:118-157`):
   - **single light**: a checkbox bound to `selection.ids.includes(c.id)` → `toggle(c.id)`;
   - **multi-output**: no device checkbox; a nested list with one row per output, each with a checkbox → `toggle(epKey(c.id, i))`, a rename button and the model label.
2. The row border is highlighted when any of the device's keys is selected.
3. "Select all / Clear selection" → `selectAll()`.

### Saving a group 🟢
1. Group name input (`newGroupName`) and "Save selection" (disabled when the name is blank or the selection is empty).
2. `saveGroup()` → `addGroup(name, [...selection.ids])` → `save()`.
3. The selection is kept (not cleared).

### Listing and using groups 🟢
For each `store.groups` entry: name, `devices.count` with `n = g.deviceIds.length`, Select → `selectGroup(g.deviceIds)`, ✕ → `removeGroup(g.id)`.

### Where the selection goes 🟢
Nowhere. `apply()` and `targets()` are its only readers, and no module calls them (verified by grep across `src/`). The Effects tab builds its own key lists: per card `[dkey]`, and `allKeys` for the Everything card.

## Intended Design (G6) 🟡
Proposal, consistent with the existing contracts. Nothing below exists in the legacy code.

1. **Group = keys, as today.** Keep `Group.deviceIds` as endpoint keys (wire-compatible with stored data); rename it to `keys` only together with a migration (see `tasks.md`).
2. **Group card on the Effects tab**, modelled on the Everything card (`Effects.svelte:50-76`), one per group:
   - `keys = group.deviceIds.filter(k => conns[parseEp(k).deviceId])`;
   - power → `applyTo(keys, power)` and `setLook({power})` on each;
   - colour → `applyTo(keys, rgb, 'rgb')` and `setLook({colorHex, effect: undefined, customEffectId: undefined})`;
   - brightness → `applyTo(keys, brightness, 'brightness')` and `setLook({brightness})`;
   - effect: only when every member resolves to the same `driver.id` and the same `effects(name, variant)` table; otherwise hidden (BR-11).
3. **Selection as an ad-hoc group:** the same card, fed by `selection.ids`, shown while the selection is non-empty. This is what `apply()` was written for.
4. **Device-level member of a multi-output device:** expand `id` to `keysOf(c)` before sending. Sending to the bare `id` would build frames with `ch = undefined` (family default `FF`), which on byte-7 families is not "all outputs" (`types.ts:53-57`, G2).

## Alternative Flows
- **Group member forgotten** 🟢: a plain `id` member is removed; `id#i` members stay (F2). The group then lists a count that includes ghosts, and `selectGroup` skips them because `conns` no longer has the device. A group that becomes empty is **not** removed (unlike scenes).
- **Group member never tracked this session** 🟢: `selectGroup` keeps it when `conns` has the id (seeded by `restore()` from saved devices), even without a `live` handle; any command would skip it silently (see `device-connection/` risks).
- **Duplicate group names** 🟢: allowed.
- **Reload** 🟢: groups persist; the selection resets to `[]`.

## Dependencies
- `device-connection/`: `conns`, `selection` (declared there), `forget`.
- `device-control/`: `applyTo`, the Everything-card pattern for the intended group control.
- `persistence/`: `store.groups`, `uid`, `save`, `forgetDevice`.
- `endpoint.ts`: `epKey`, `parseEp`.
- `i18n/`: `devices.*` keys (`groups`, `groupName`, `saveSelection`, `select`, `count`, `selectAll`, `clearSelection`).

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| Selection, groups and scenes share the flat endpoint-key format | `endpoint.ts:1-4`, `adrs/007` | 🟢 |
| The selection is session-only | `ble.svelte.ts:35-36` | 🟢 |
| Groups are stored as copies of the selection | `Devices.svelte:95` | 🟢 |
| Selecting a group filters out unknown devices instead of deleting them | `Devices.svelte:60-62` | 🟢 |
| No device-level checkbox on multi-output devices | `Devices.svelte:123-126` | 🟢 |

## Internal State
- Persisted: `store.groups`. 🟢
- Session: `selection.ids`; Devices-local `newGroupName`, `editing`, `draft`, `editingOut`, `outDraft`, `busy`, `error`. 🟢

## Observability
- None. 🟢

## Risks and Gaps
- 🟢 **F15 (high):** the selection and groups have no consumer, so the feature is inert. This is the main gap against the domain purpose and G6.
- 🟢 **F2:** `forgetDevice` leaves `id#i` keys in groups; counts are per key; empty groups remain.
- 🟢 The `Group.deviceIds` name is misleading (it holds endpoint keys).
- 🟡 `selectGroup` uses `k.split('#')[0]` while the rest of the code uses `parseEp`. The two differ for keys with a non-numeric suffix (`parseEp` keeps the whole key as the device id).
- 🟡 An intended group control must expand device-level keys of multi-output devices, or it reproduces G2 ("same colour on everything").
- 🟢 **Decided [Owner, 2026-10-26]:** a mixed group carries only power, colour and brightness; when every member is the same family (same effect table) the group also offers effects. (was a gap)
