# Persistence, Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `persistence` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md` and `design.md` in this folder.

## Prerequisites
- [ ] Svelte 5 runes (`$state`, `$state.snapshot`) are available
- [ ] The `Effect` type from `protocol-drivers/`
- [ ] `localStorage` and a secure-context browser; nothing else (no backend, no environment variables, no database)

## Tasks

- [ ] T-01, Define the schema types: `Persisted`, `SavedDevice`, `StripConfig`, `Group`, `Look`, `SavedColor`, `CustomEffect`, `Scene`
  - Legacy source: `src/lib/persist.ts:1-80`
  - Done when: the types match `design.md`; stored data from the legacy app type-checks
  - Confidence: 🟢

- [ ] T-02, Implement `seedColors()` (a fresh array each call, 8 keyed colours), `KEY`, `LEGACY_KEY` and `empty()`
  - Legacy source: `src/lib/persist.ts:82-106`
  - Done when: `persist.test.ts:5` ("a fresh install starts with a usable palette") and `:94` ("seedColors returns a fresh array each call") pass
  - Confidence: 🟢

- [ ] T-03, Implement `migrate(raw)`:
  - shallow merge over `empty()`;
  - re-seed the palette when empty or invalid; fix the containers;
  - migrate legacy outputs, **reading every old `id#ch` look before writing any `id#i` key** (fixes F16);
  - drop scenes without `entries`.
  - Legacy source: `src/lib/persist.ts:108-148`
  - Done when: `persist.test.ts:15,49,61,76,84` pass, plus the new F16 case (TT-02)
  - Confidence: 🟢

- [ ] T-04, Implement `load()` (current key, then legacy; parse; migrate; catch → `empty()`), the reactive `store`, and `save()` (whole store, errors swallowed)
  - Legacy source: `src/lib/store.svelte.ts:29-47`
  - Done when: the "Storage is blocked" and "Renamed project key" scenarios pass
  - Confidence: 🟢

- [ ] T-05, Implement `uid()` (8 base-36 characters)
  - Legacy source: `src/lib/store.svelte.ts:49`
  - Done when: 1,000 calls produce 1,000 distinct ids with high probability
  - Confidence: 🟢

- [ ] T-06, Implement the device helpers `rememberDevice` (upsert + merge), `renameDevice` (trim; an empty label deletes it), `setChannelMode` and `setStrip`. Either drop `driverId` or update it after driver resolution (BR-P9).
  - Legacy source: `src/lib/store.svelte.ts:51-91`
  - Done when: re-tracking a device keeps `strip` and `channelMode`; renaming to blank shows the advertised name
  - Confidence: 🟢 port / 🟡 `driverId` choice

- [ ] T-07, Implement `labelOf` and `renameEndpoint`
  - Legacy source: `src/lib/store.svelte.ts:93-101`
  - Done when: clearing an output label shows the model label again
  - Confidence: 🟢

- [ ] T-08, Implement `lookOf` (default `{}`) and `setLook` (merge). Provide `snapshotLook(key)` that returns a plain object through `$state.snapshot`, for callers that store a copy (fixes F14 at the source).
  - Legacy source: `src/lib/store.svelte.ts:133-140`
  - Done when: `structuredClone(snapshotLook(k))` does not throw for a stored look
  - Confidence: 🟢

- [ ] T-09, Implement the palette helpers `addColor` (blank name → hex), `removeColor` and `resetColors`
  - Legacy source: `src/lib/store.svelte.ts:142-159`, `src/lib/ui/ColorSelect.svelte:70-82`
  - Done when: removing the last colour shows Restore; Restore brings back the 8 seeded colours
  - Confidence: 🟢

- [ ] T-10, Implement the custom-effect, scene, group and locale helpers. Specified in `custom-effects/`, `scenes/`, `groups/` and `i18n/`; implemented here.
  - Legacy source: `src/lib/store.svelte.ts:119-131,161-240`
  - Done when: each unit's tasks that depend on them pass
  - Confidence: 🟢

- [ ] T-11, Implement `forgetDevice(id)`: drop the device; drop the group keys whose device is `id` (including `id#i`, fixes F2) and the empty groups; drop the looks, labels and scene entries keyed `id` or `id#…`; drop the empty scenes; save
  - Legacy source: `src/lib/store.svelte.ts:103-117`
  - Done when: the "Forget cascades" scenario passes in full
  - Confidence: 🟢

- [ ] T-12, Remove the orphan comment and blank lines left from the removed output-editing feature (F11)
  - Legacy source: `src/lib/store.svelte.ts:68-78`
  - Done when: no reference to editable outputs remains
  - Confidence: 🟢

- [ ] T-13, Optional: listen to the `storage` event to reload the store when another tab saves (avoids last-writer-wins)
  - Legacy source: none
  - Done when: a change in tab A appears in tab B without a reload
  - Confidence: 🟡 (not in legacy; owner decision)

## Test Tasks

- [ ] TT-01, Port the 7 tests of `src/lib/persist.test.ts` unchanged
- [ ] TT-02, Regression for F16: legacy outputs `ch 1, 2` with looks `#111111` / `#222222` → `id#0 = #111111`, `id#1 = #222222`, no `id#2`
- [ ] TT-03, Happy path: load → mutate → save → reload yields the same store
- [ ] TT-04, Main error case: `localStorage.setItem` throws → no exception reaches the caller; `getItem` throws → `empty()`
- [ ] TT-05, Forget cascade covering looks, labels, scenes, groups with `id#i`, and empty scenes and groups
- [ ] TT-06, `snapshotLook` on a `$state`-backed look is cloneable and independent of later changes

## Data Migration Tasks

- [ ] TM-01, Repair data already migrated by the F16 bug. On load, when a device has a stale `id#N` look with `N` ≥ its output count, drop it. The swapped look on `id#1` cannot be recovered reliably. Leave it, and note it in the changelog.
  - Legacy source: `src/lib/persist.ts:127-138`
  - Confidence: 🟡
- [ ] TM-02, Drop group keys whose device is not in `store.devices` and empty groups (cleans data left by F2). Shared with `groups/` TM-01.
- [ ] TM-03, Keep reading `led-onion/v1` as a fallback. Optionally delete it after the first successful save under `led-union/v1`.
  - Confidence: 🟡

## Suggested Order
1. T-01, T-02, T-03 (pure, `persist.ts`; with TT-01 and TT-02).
2. T-04, T-05 (store boot), then T-06 to T-09 and T-11 (helpers; TT-03 to TT-06).
3. T-10 alongside the dependent units; T-12 cleanup; T-13 optional.
4. The TM tasks run inside `migrate()`, after T-03.

## Review Additions [external review]
- [ ] T-14, Repair per field, not per load (F21): check `devices` and `scenes` are arrays, `looks`/`labels` are non-array objects, and drop invalid `customEffects` entries, instead of letting one bad field discard everything.
  - Legacy source: `src/lib/persist.ts:113-145`, `src/lib/store.svelte.ts:29-36`
  - Done when: TT-07 passes
  - Confidence: 🟢 [external review R12]
- [ ] TT-07, A saved state with `scenes: {}` and valid devices → devices kept, scenes empty

## Pending Gaps (🔴)
- None blocking.
- 🟡 Decide on `driverId` (drop or fix), cross-tab sync (T-13), and deleting the legacy key (TM-03).
