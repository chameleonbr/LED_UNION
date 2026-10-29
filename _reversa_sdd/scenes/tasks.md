# Scenes, Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `scenes` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md` and `design.md` in this folder.

## Prerequisites
- [ ] `device-control/` is done: `applyTo`, `outputAt`, the logical endpoint list, the device card checkbox
- [ ] `custom-effects/` is done: `sendFrames`, `store.customEffects`
- [ ] `persistence/` provides `store.scenes`, `store.looks`, `lookOf`, `setLook`, `uid`, `save`, `migrate`, and the forget cascade
- [ ] `i18n/` has `scenes.empty`, `scenes.count`, `scenes.apply`, `effects.saveScene`, `effects.pickToSave`, `effects.sceneName`, `common.save`, `common.remove`
- [ ] There is no backend, no environment variables and no database

## Tasks

- [ ] T-01, Define `Look` and `Scene` (entries of endpoint key + look)
  - Legacy source: `src/lib/persist.ts:36-45,60-66`
  - Done when: the types match `design.md`
  - Confidence: 🟢

- [ ] T-02, Implement `addScene(name, keys)` with a **plain deep snapshot** of each look: `$state.snapshot(lookOf(key))` or `JSON.parse(JSON.stringify(...))`, not `structuredClone` on the proxy (fixes F14). Also implement `removeScene(id)`.
  - Legacy source: `src/lib/store.svelte.ts:186-203`
  - Done when: saving a scene from a card with a non-empty look succeeds; mutating the look afterwards leaves the entry unchanged
  - Confidence: 🟢 (the defect was reproduced: `DataCloneError` under node with `svelte/compiler`)

- [ ] T-03, Build the save card in the Effects tab:
  - checkbox per card (`picked`), with `pickedKeys` in endpoint-list order;
  - name input; Save shows the count and is disabled without a name or a tick;
  - after saving, clear the name and the ticks;
  - catch and show errors.
  - Legacy source: `src/lib/ui/Effects.svelte:36-48,92-93,121-130`
  - Done when: the "Save a scene" scenario passes; a failing save shows a message instead of an unhandled error
  - Confidence: 🟢

- [ ] T-04, Implement `applyLook(key, look)` in the fixed order power → brightness → speed → colour → (custom effect | effect), each awaited, then `setLook(key, look)`. Every builder passes the 4th `variant` argument (fixes F1).
  - Legacy source: `src/lib/ui/Scenes.svelte:14-44`
  - Done when: the "Apply reconnects and replays in order" and "LEDCAR-01 RGB output replays with its own envelope" scenarios pass
  - Confidence: 🟢

- [ ] T-05, After replaying a custom effect, send `speed(fx.speed)`, as the card does (fixes F12)
  - Legacy source: `src/lib/ui/DeviceCard.svelte:133` (card), missing in `src/lib/ui/Scenes.svelte:33-39`
  - Done when: a replayed custom effect is followed by a speed frame
  - Confidence: 🟢

- [ ] T-06, Implement `run(scene)`: `busy = id`; entries in sequence; set `error` on a throw; clear `busy` in `finally`. Decide the error policy: the strict port aborts on the first throw. The recommendation is to continue with the other entries and report every failure.
  - Legacy source: `src/lib/ui/Scenes.svelte:53-63`
  - Done when: one unreachable device does not leave `busy` set; the error card shows the message
  - Confidence: 🟢 port / 🟡 policy

- [ ] T-07, Build the Scenes tab list: empty state; name and `scenes.count` per scene; Apply (disabled while that scene is busy); ✕ delete
  - Legacy source: `src/lib/ui/Scenes.svelte:66-88`
  - Done when: the list renders, applies and deletes
  - Confidence: 🟢

- [ ] T-08, Make the replay write a look that matches what was sent. Use `setLook` with explicit clears when the scene sets a colour without an effect: `{ ...look, effect: look.effect, customEffectId: look.customEffectId }`, so missing keys become `undefined`.
  - Legacy source: `src/lib/ui/Scenes.svelte:43`, `src/lib/store.svelte.ts:137-140`
  - Done when: after a reload, applying a colour-only scene to an endpoint that showed an effect leaves no effect in its look
  - Confidence: 🟡 (improvement; the strict port keeps the plain merge)

- [ ] T-09, Keep the load-time filter that drops scenes without `entries`, and the forget cascade on scene entries (owned by `persistence/`; check here)
  - Legacy source: `src/lib/persist.ts:138-145`, `src/lib/store.svelte.ts:108-116`
  - Done when: the "Legacy scenes are dropped" scenario passes; forgetting a device removes its entries and empty scenes
  - Confidence: 🟢

## Test Tasks

- [ ] TT-01, Regression for F14: save a scene from a `$state`-backed look → it succeeds, and the stored entry is a plain object
- [ ] TT-02, Happy path: a scene with two endpoints → fake writes in the order power, brightness, speed, rgb, effect for each, sequential across entries
- [ ] TT-03, Main error case: the second entry's device is untracked and holds a custom effect → the documented error policy (abort or continue) holds, and `busy` is cleared
- [ ] TT-04, Regression for F1: a LEDCAR-01 RGB entry with an effect → a `ble` layout frame with the `ledcar` id
- [ ] TT-05, Snapshot: changing the look after saving does not alter the scene
- [ ] TT-06, Migration: scenes without `entries` are dropped (port `src/lib/persist.test.ts:61` "scenes from the old single-colour shape are dropped, not misapplied")

## Data Migration Tasks
- [ ] TM-01, None for the shape. Existing stored scenes (if any were saved from empty looks) load unchanged.

## Suggested Order
1. T-01, T-02 (with TT-01 and TT-05), then T-09.
2. T-04, T-05 (with TT-02 and TT-04), then T-06.
3. T-03 and T-07 (UI).
4. T-08 after the owner decides.

## Review Additions [external review]
- [ ] T-10, Guard concurrent replays (F22): keep a **set of running scene ids** (owner chose concurrent runs [Owner, 2026-10-26]); `run()` refuses an id already running and clears only its own id.
  - Legacy source: `src/lib/ui/Scenes.svelte:6,53-62,81`
  - Done when: starting A then B keeps A disabled until A ends; finishing B does not re-enable A
  - Confidence: 🟢 (defect read in code) [external review R16]
- [ ] T-11, Family-aware replay order (F23): on BLEDIM send colour before brightness, so the saved brightness survives.
  - Legacy source: `src/lib/ui/Scenes.svelte:23-31`, `src/lib/protocol/bledim.ts:155-165,214-217`
  - Done when: TT-07 passes
  - Confidence: 🟢 [external review R17]
- [ ] T-12, Deleting a custom effect warns about, or prunes, the scene entries that reference it (live reference kept [Owner, 2026-10-26]).
  - Legacy source: `src/lib/store.svelte.ts:170-181`, `src/lib/ui/Scenes.svelte:33-37`
  - Done when: deleting an effect used by a scene no longer leaves a silent no-op entry
  - Confidence: 🟢 [external review R07]
- [ ] TT-07, BLEDIM entry with brightness 40 and a colour → the last frame emitted carries the colour scaled to 40 %, not brightness 255

## Pending Gaps (🔴)
- None blocking.
- 🟢 F14 (was 🟡 pending a browser): the Svelte docs name `structuredClone` as an API that does not accept `$state` proxies and prescribe `$state.snapshot` (svelte `02-$state.md`, "$state.snapshot"); the node repro ran on V8, Chrome's engine; the cross-review reproduced it independently with the installed runtime. A manual browser check is optional. [Reviewer]
- 🟡 Decide the error policy (abort vs. continue) and whether to fix stale looks (T-08).
- 🟡 F5: scenes cannot hold white, CCT or sound until `device-control/` T-15 extends the look.
