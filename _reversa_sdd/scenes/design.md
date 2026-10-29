# Scenes, Technical Design

> Reversa Writer · 2026-10-26 · unit `scenes` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ui/Scenes.svelte:1-88`, `src/lib/ui/Effects.svelte:36-48,92-93,121-130`, `src/lib/store.svelte.ts:39,108-116,135-140,186-203`, `src/lib/persist.ts:36-45,60-66,138-145`, `adrs/009`

## Interface

### Types 🟢 (`persist.ts`)

| Symbol | Shape | Notes |
|---|---|---|
| `Look` | `{ power?: boolean, colorHex?: '#rrggbb', brightness?: 0..100, speed?: 0..100, effect?: Effect, customEffectId?: string }` | Command log per endpoint |
| `Scene` | `{ id: string, name: string, entries: { key: string /* endpoint key */, look: Look }[] }` | `key` is `deviceId` or `deviceId#index` |

### Store 🟢 (`store.svelte.ts`)

| Symbol | Signature | Behaviour |
|---|---|---|
| `lookOf` | `(key) => Look` | `store.looks[key] ?? {}`. Returns a **Svelte state proxy** when the key exists |
| `setLook` | `(key, patch: Look)` | `store.looks[key] = { ...old, ...patch }`, then `save()` |
| `addScene` | `(name, keys: string[]) => Scene` | Snapshot each `lookOf(key)` with `structuredClone`, push, `save()` |
| `removeScene` | `(id)` | Filter out, `save()` |

### UI 🟢

| Component | State | Handlers |
|---|---|---|
| `Effects` (save card) | `picked: Record<key, boolean>`, `sceneName`, `pickedKeys` (derived, in endpoint-list order) | `saveScene()` |
| `DeviceCard` | `checked` prop | `onToggle(next)` → `picked[key] = next` |
| `Scenes` | `busy: sceneId \| ''`, `error: string` | `run(scene)`, `applyLook(key, look)`, delete |

## Main Flow

### Saving 🟢 (`Effects.svelte:42-48`, `store.svelte.ts:188-198`)
1. The user ticks cards; each tick sets `picked[key]`.
2. `pickedKeys = logicals.filter(l => picked[l.key]).map(l => l.key)`: the order is the **endpoint list order**, not the tick order.
3. Save (enabled when `sceneName.trim()` and `pickedKeys.length > 0`) → `saveScene()`:
   1. `name = sceneName.trim()`; stop when empty or no keys.
   2. `addScene(name, pickedKeys)`:
      - `entries = keys.map(key => ({ key, look: structuredClone(lookOf(key)) }))`;
      - `store.scenes.push({ id: uid(), name, entries })`; `save()`.
   3. `sceneName = ''`; `picked = {}`.

**Defect F14** 🟢: when `store.looks[key]` exists, `lookOf` returns a deep `$state` proxy, and `structuredClone(proxy)` throws `DataCloneError` (reproduced with the project's `svelte/compiler` under node). Only endpoints with an empty look (`{}` literal) clone. `saveScene` has no catch, so the error is unhandled, the scene is not stored, and the form is not cleared. A reimplementation must snapshot with `$state.snapshot(...)` (or a JSON round trip).

### Applying 🟢 (`Scenes.svelte:53-63`)
1. `busy = scene.id`, `error = ''`.
2. `for (const entry of scene.entries) await applyLook(entry.key, entry.look)`.
3. On throw: `error = message`; the loop stops (later entries are skipped).
4. `finally`: `busy = ''`.

### applyLook(key, look) 🟢 (`Scenes.svelte:18-44`)
Each step is `await`ed before the next. No coalescing key is used anywhere.

| # | When | Call (current code) | Intended call |
|---|---|---|---|
| 1 | `power !== undefined` | `applyTo([key], (d,n,c) => d.power(power, n, c))` | `(d,n,c,v) => d.power(power, n, c, v)` |
| 2 | `brightness !== undefined` | `applyTo([key], (d,n,c) => d.brightness(b, n, c))` | `+ v` |
| 3 | `speed !== undefined` | `applyTo([key], (d,n,c) => d.speed(s, n, c))` | `+ v` |
| 4 | `colorHex` truthy | `applyTo([key], (d,n,c) => d.rgb(r,g,b, n, c))` | `+ v` |
| 5a | `customEffectId` and the effect still exists | `sendFrames(key, (d,n,c) => d.customEffect?.({colors, fade}, n, c) ?? [])` | `+ v`, then `applyTo(speed(fx.speed))` (F12) |
| 5b | else `effect` | `applyTo([key], (d,n,c) => d.effect(effect, n, c))` | `+ v` |
| 6 | always | `setLook(key, look)` | same |

**Defect F1** 🟢: every builder drops the 4th argument `variant`. `outputAt` still resolves it, but it is never passed on. On LEDCAR-01 the RGB output (`variant 'ble'`) is replayed through the `dmx` envelope, and its saved `car_mode` effect id lands in a `dmx` effect frame, so the wrong effect plays. The channel byte (`ch`) is passed correctly.

### Removing 🟢
✕ → `removeScene(id)`. There is no confirmation.

### Forget cascade 🟢 (`store.svelte.ts:108-116`, owned by `persistence/`)
`forgetDevice(id)` removes entries whose `parseEp(key).deviceId === id` from every scene, then drops scenes with no entries left.

### Load-time migration 🟢 (`persist.ts:138-145`)
`scenes = scenes.filter(s => s && Array.isArray(s.entries))`.

## Alternative Flows
- **Device offline** 🟢: each `applyTo` reconnects; a reconnect failure is swallowed (`allSettled`), so that step is skipped silently and the loop continues.
- **Device not tracked this session** 🟢: `applyTo` skips it silently; `sendFrames` **throws**, which aborts the whole scene from that entry on.
- **Custom effect deleted** 🟢: `find` fails, nothing is uploaded, and the built-in effect is **not** tried as a fallback (it is in the `else` branch).
- **Empty look** 🟢: nothing is sent; `setLook(key, {})` keeps the current look.
- **Same scene clicked twice** 🟢: the button is disabled while busy, **but only until another scene starts** (F22): `busy` is a single id, so starting B re-enables A, and either run finishing clears it. [external review R16]
- **Two different scenes at once** 🟢: allowed; their frames interleave in each device's queue.
- **Stale fields after reload** 🟡: `setLook` merges. A snapshot taken right after a colour pick holds `effect: undefined`, but `save()` serializes to JSON, which drops `undefined` keys. After a reload the scene look has no `effect` key, so the merge keeps the endpoint's current effect in the look although the colour was sent last. The card then shows an effect that is not playing.

## Dependencies
- `device-control/`: `applyTo`, `outputAt`, the queue.
- `custom-effects/`: `sendFrames`, `store.customEffects`.
- `device-connection/`: auto-reconnect via `connect`.
- `persistence/`: `store.scenes`, `store.looks`, `lookOf`, `setLook`, `uid`, `save`, `migrate`, the forget cascade.
- `i18n/`: `scenes.*`, `effects.saveScene`, `effects.pickToSave`, `effects.sceneName`, `common.save`, `common.remove`.

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| A scene is a list of (endpoint key, look) snapshots | `persist.ts:60-66` | 🟢 |
| The look is the command log, so the scene replays commands | `adrs/009` | 🟢 |
| Fixed replay order with the effect last | `Scenes.svelte:14-17` | 🟢 |
| Sequential entries, not parallel | `Scenes.svelte:57` | 🟢 |
| Legacy scenes dropped, not mapped | `persist.ts:140-142` | 🟢 |
| The scene save lives on the Effects tab (where the cards are); apply lives on the Scenes tab | `Effects.svelte:121-130`, `Scenes.svelte` | 🟢 |

## Internal State
- Persisted: `store.scenes: Scene[]`. 🟢
- `Effects`: `picked`, `sceneName` (not persisted). 🟢
- `Scenes`: `busy`, `error` (not persisted). 🟢

## Observability
- The error card in the Scenes tab shows the first thrown error. Swallowed `applyTo` failures are invisible. 🟢

## Risks and Gaps
- 🟢 **F14 (new, high):** `addScene` throws `DataCloneError` for any endpoint with a stored look, so scenes cannot be saved from used cards. ✅ Reproduced in node; ⚠ not yet confirmed in a browser session.
- 🟢 **F1 (high):** replay drops `variant`, giving the wrong envelope and the wrong effect on LEDCAR-01.
- 🟢 **F12:** a replayed custom effect does not resend `fx.speed`.
- 🟢 **F5:** real white, CCT and sound are not in the look, so scenes cannot hold them.
- 🟢 `sendFrames` throwing aborts the rest of the scene, while `applyTo` failures are silent: the error handling is inconsistent.
- 🟡 Merge-based `setLook` after replay can keep a stale `effect` in the look (see Alternative flows).
- 🟡 There is no confirmation on delete.
- 🟡 Endpoint keys for LEDCAR-01 are indexes (`id#0` = RGB, `id#1` = SPI); if `outputsFor` ever reorders outputs, saved scenes silently target the other output.
