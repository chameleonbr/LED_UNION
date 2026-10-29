# Persistence, Technical Design

> Reversa Writer · 2026-10-26 · unit `persistence` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/persist.ts:1-149`, `src/lib/store.svelte.ts:1-240`, `src/lib/persist.test.ts`, `src/lib/ui/ColorSelect.svelte:70-82`, `erd-complete.md`

## Interface

### Schema 🟢 (`persist.ts`)

```ts
type Persisted = {
  devices: SavedDevice[]           // keyed by BluetoothDevice.id
  groups: Group[]
  scenes: Scene[]
  looks: Record<endpointKey, Look>
  labels: Record<endpointKey, string>   // output names; device names live in SavedDevice.label
  colors: SavedColor[]
  customEffects: CustomEffect[]
  locale?: string                  // absent = follow the browser
}
type SavedDevice  = { id, name /* advertised, never edited */, label?, driverId /* write-only */, strip?: StripConfig, channelMode?: 1|2|3|4 }
type StripConfig  = { pixels: number /* 1..65535 */, order: number /* rgb_order id */ }
type Group        = { id, name, deviceIds: endpointKey[] }
type Look         = { power?, colorHex? '#rrggbb', brightness? 0..100, speed? 0..100, effect?: Effect, customEffectId? }
type SavedColor   = { id, name, hex, key? /* seeded colours only */ }
type CustomEffect = { id, name, colors: '#rrggbb'[], speed: 0..100, fade: boolean }
type Scene        = { id, name, entries: { key: endpointKey, look: Look }[] }
```
`endpointKey` = `deviceId` or `deviceId#outputIndex` (see `device-control/`).

### Constants 🟢

| Symbol | Value |
|---|---|
| `KEY` | `'led-union/v1'` |
| `LEGACY_KEY` | `'led-onion/v1'` |
| `seedColors()` | a fresh array each call: `red #ff0000, orange #ff8800, yellow #ffdd00, green #00ff44, cyan #00ddff, blue #0044ff, purple #aa00ff, white #ffffff`; `id = key = name = <colour key>` |

### Functions 🟢

| Symbol | Signature | Behaviour |
|---|---|---|
| `empty` | `() => Persisted` | Empty containers + `seedColors()` |
| `migrate` | `(raw: unknown) => Persisted` | See Main flow |
| `load` (private) | `() => Persisted` | `getItem(KEY) ?? getItem(LEGACY_KEY)` → `JSON.parse` → `migrate`; catch → `empty()` |
| `store` | `$state<Persisted>(load())` | Deep reactive proxy; module singleton |
| `save` | `() => void` | `setItem(KEY, JSON.stringify(store))`; catch → ignore |
| `uid` | `() => string` | `Math.random().toString(36).slice(2, 10)` |
| `rememberDevice` | `(d: SavedDevice)` | Find by id → `Object.assign(existing, d)`, else push; save |
| `renameDevice` | `(id, label)` | trim; empty → `delete d.label`; save |
| `setChannelMode` / `setStrip` | `(id, value)` | Set on the found device; save; no-op when missing |
| `labelOf` | `(key, fallback)` | `labels[key] ?? fallback` |
| `renameEndpoint` | `(key, label)` | trim; empty → delete; save |
| `forgetDevice` | `(id)` | Cascade, see below |
| `addGroup` / `removeGroup` | | see `groups/` |
| `lookOf` | `(key) => Look` | `looks[key] ?? {}`: returns a **proxy** when present |
| `setLook` | `(key, patch)` | `looks[key] = { ...looks[key], ...patch }`; save |
| `addColor` | `(name, hex) => SavedColor` | `{ id: uid(), name: name.trim() \|\| hex, hex }`; push; save |
| `removeColor` / `resetColors` | | filter / `seedColors()`; save |
| custom effects | | see `custom-effects/` |
| `addScene` / `removeScene` | | see `scenes/` (F14) |
| `setLocale` | `(tag?)` | set, or delete when falsy; save |

## Main Flow

### Startup 🟢
1. Module import evaluates `store = $state(load())`, before any component mounts.
2. `load()`:
   1. `raw = localStorage.getItem('led-union/v1') ?? localStorage.getItem('led-onion/v1')`.
   2. `migrate(raw ? JSON.parse(raw) : null)`.
   3. Any throw (blocked storage, bad JSON, private mode) → `empty()`.

### migrate(raw) 🟢 (`persist.ts:108-148`)
1. Not an object → `empty()`.
2. `merged = { ...empty(), ...raw }` (shallow; unknown fields survive).
3. `colors` not an array or empty → `seedColors()`.
4. `looks` / `labels` not objects → `{}`; `customEffects` not an array → `[]`.
5. For each device with a legacy `outputs` array, for each `outputs[i] = {ch, label}`:
   - `key = id#i`;
   - when `label` and no `labels[key]`: `labels[key] = label`;
   - when `looks[id#ch]` exists and `looks[key]` does not: `looks[key] = looks[id#ch]`;
   - afterwards, `delete device.outputs`.
6. `scenes = scenes.filter(s => s && Array.isArray(s.entries))`.
7. Return `merged`.

Step 5 defect **F16** 🟢 (reproduced): with outputs `ch 1, 2`, the new key `id#1` already exists as the old `ch 1` key, so it is not overwritten. Output 2 keeps output 1's look, and `id#2` stays orphaned. The fix: collect the old looks per `ch` into a temporary map, delete the old keys, then write `id#i`.

Not validated by `migrate` 🟢: the device entries themselves, the group keys, scene entry shapes, hex formats, and number ranges. Bad values pass through to the UI.

### Save 🟢
Every mutation helper ends with `save()`, which serializes the **whole** store. Consequences:
- `undefined` fields vanish (JSON), e.g. `look.effect: undefined` (see `scenes/` stale-look risk).
- A slider stream saves once per input event.
- The legacy key is never removed.

### Forget cascade 🟢 (`store.svelte.ts:103-117`)
1. `devices = devices.filter(d.id !== id)`.
2. For each group: `deviceIds = deviceIds.filter(x !== id)` (defect F2: misses `id#i`).
3. For `looks` and `labels`: delete keys `=== id` or starting with `id#`.
4. For each scene: drop entries with `key === id` or starting with `id#`; then drop scenes with no entries.
5. `save()`.
The live connection cleanup is done by `ble.forget` before this call (see `device-connection/`).

### Palette UI hooks 🟢 (`ColorSelect.svelte:70-82`)
- When the current value matches a palette colour: a remove button → `removeColor(current.id)`, and the picker's value becomes `store.colors[0]?.hex`.
- When the palette is empty, a Restore button → `resetColors()`.
- Removing the last colour leaves the palette empty, with only Restore offered, until the user restores it or the next load re-seeds it (BR-37 is load-time only).
- Removing a colour also sets the picker's value, but it does **not** send that colour to the lights, because `pick()`/`onpick` is not called. 🟢

## Alternative Flows
- **Private mode or quota error on save** 🟢: changes live in memory for the session only.
- **Legacy key only** 🟢: data loads; the first save writes the new key; both keys then exist.
- **Two tabs open** 🟡: each tab holds its own `store` and overwrites the other's save (there is no `storage` event listener).
- **Unknown future field** 🟢: kept through the shallow merge and saved back.
- **Device re-tracked** 🟢: `rememberDevice` merges `{id, name, label, driverId}`, so `strip` and `channelMode` survive; `driverId` is overwritten with the current guess.

## Dependencies
- Browser `localStorage`, `JSON`, `Math.random`.
- Svelte 5 `$state` (deep proxy reactivity).
- `protocol/index.ts`: the `Effect` type only.
- Consumers: every UI component, `ble.svelte.ts` (`rememberDevice`, `forgetDevice`, `store.devices`), `i18n.svelte.ts` (`store.locale`, `setLocale`).

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| One JSON blob in `localStorage`, saved whole on each mutation | `store.svelte.ts:41-47` | 🟢 |
| Storage failures are never fatal | `store.svelte.ts:33-35,44-46` | 🟢 |
| Versioned key with one legacy fallback for the rename | `persist.ts:94-96` | 🟢 |
| Pure `migrate`/`empty`/`seedColors` in `persist.ts`, testable without Svelte | `persist.ts`, `persist.test.ts` | 🟢 |
| Output labels keyed by endpoint key; the set of outputs derived from the model | `persist.ts:74-75`, `adrs/008` | 🟢 |
| Looks are a command log, not device state | `persist.ts:29-35`, `adrs/009` | 🟢 |
| Seeded colours carry a translation key | `persist.ts:47,82-92` | 🟢 |

## Internal State
The single `store` (shape above). Entity relations and cardinalities are in `erd-complete.md`. 🟢

## Observability
None; failures are swallowed by design. 🟢

## Risks and Gaps
- 🟢 **F16 (new):** the legacy output migration copies the wrong look to output 2 and leaves an orphan.
- 🟢 **F14:** `lookOf` returns a proxy; `structuredClone` on it throws (see `scenes/`).
- 🟢 **F2:** the forget cascade misses `id#i` in groups.
- 🟢 **BR-P9:** `driverId` is write-only and may hold a wrong guess; drop it, or update it after `resolveDriver`.
- 🟢 **F11:** blank lines and an orphan comment about editable outputs remain at `store.svelte.ts:68-78` (removed feature).
- 🟡 There is no schema validation of entries, so a corrupted field can break a view instead of being dropped.
- 🟡 There is no cross-tab sync, so the last writer wins.
- 🟡 Saving on every slider event; fine today, but worth debouncing if the store grows.
