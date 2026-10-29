# Custom Effects, Technical Design

> Reversa Writer · 2026-10-26 · unit `custom-effects` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ui/CustomEffectEditor.svelte:1-120`, `src/lib/ui/DeviceCard.svelte:38-49,116-135,274-305`, `src/lib/ui/Effects.svelte:38,94-99`, `src/lib/protocol/ffe0.ts:76,88-94,361-416`, `src/lib/protocol/bledim.ts:252-282`, `src/lib/store.svelte.ts:161-183`, `src/lib/persist.ts:51-59`, `src/lib/ble.svelte.ts:348-369`, `src/lib/protocol/frames.test.ts:575-650`

## Interface

### Types 🟢

| Symbol | Shape | Where | Notes |
|---|---|---|---|
| `CustomEffect` | `{ id: string, name: string, colors: string[] /* '#rrggbb' in play order */, speed: number /* 0..100 */, fade: boolean }` | `persist.ts:51-59` | Persisted in `store.customEffects` |
| `CustomEffectSpec` | `{ colors: Array<{r,g,b}> /* 0..255 */, fade: boolean }` | `types.ts:27-32` | What the drivers receive (no name, no speed) |

### Driver member 🟢

| Symbol | Signature | Returns | Notes |
|---|---|---|---|
| `Driver.customEffect?` | `(spec, name, ch?, variant?)` | `Uint8Array[]` | In send order. `[]` means "no such command". Absent on fff0 |

### Store 🟢 (`store.svelte.ts:161-183`)

| Symbol | Signature | Behaviour |
|---|---|---|
| `addCustomEffect` | `(e: Omit<CustomEffect,'id'>) => CustomEffect` | New `uid()`, push, `save()` |
| `updateCustomEffect` | `(id, patch: Partial<CustomEffect>)` | `Object.assign` on the match, `save()`; no-op when missing |
| `removeCustomEffect` | `(id)` | Filter out, delete `customEffectId` from every look that equals `id`, `save()` |

### Transport 🟢

| Symbol | Signature | Notes |
|---|---|---|
| `sendFrames` | `(key, build: (driver, name, ch?, variant?) => Uint8Array[]) => Promise<void>` | Throws when the device is not tracked; auto-connects; `push` per frame |

### Editor component 🟢 (`CustomEffectEditor.svelte`)

| Prop / state | Type | Default |
|---|---|---|
| `onclose` | `() => void` | required |
| `onsaved?` | `(fx: CustomEffect) => void` | not passed by `Effects.svelte` |
| `editingId` | `string \| undefined` | `undefined` (new draft) |
| `name` | `string` | `''` |
| `colors` | `string[]` | `['#00ff00', '#000000', '#ffbb00']` |
| `speed` | `number` | `50` |
| `fade` | `boolean` | `false` |

## Main Flow

### Opening the editor 🟢
1. In a card's effect select, the user picks "New effect…" (`__new__`) → `onEditCustom()`.
2. `Effects.svelte` sets `editing = true` and renders one `<CustomEffectEditor onclose={() => editing = false} />` below the cards.
3. The editor always starts as a new draft; to edit an existing effect, the user clicks its chip inside the editor.

### Editing 🟢 (`CustomEffectEditor.svelte:19-53,56-118`)
1. Chips list `store.customEffects`:
   - name click → `load(fx)`: `editingId = fx.id`, a copy of the colours, then speed and fade;
   - ✕ → `removeCustomEffect(fx.id)`.
2. Name text input.
3. Colour rows (keyed by index): number `i+1`, `<input type=color>` bound to `colors[i]`, ↑ `move(i,-1)` (disabled at 0), ↓ `move(i,+1)` (disabled at the end), ✕ removes index `i`.
4. "Add colour" appends `#ffffff`; disabled when `colors.length >= 14`.
5. Speed range 0..100 bound to `speed`; Jump / Fade buttons set `fade`.
6. Save (disabled when `!name.trim() || !colors.length`) → `submit()`:
   1. `trimmed = name.trim()`; stop when empty or no colours.
   2. `payload = { name: trimmed, colors: [...colors], speed, fade }`.
   3. With `editingId`: `updateCustomEffect(editingId, payload)`, then `onsaved?({id, ...payload})`. Otherwise: `onsaved?(addCustomEffect(payload))`.
   4. `reset()`, `onclose()`.

Editing sends nothing to the devices: there is no live preview. 🟢

### Support detection 🟢 (`DeviceCard.svelte:38-41`)
`supportsCustom = (driver.customEffect?.({colors:[{r:1,g:1,b:1}], fade:false}, name)?.length ?? 0) > 0`.
The probe passes **no `variant`**, so on LEDCAR-01 both outputs are judged with the `dmx` layout. 🟡 This is harmless today: `dmx` supports custom effects, and so does the `ble` layout of the RGB output.

### Running 🟢 (`DeviceCard.svelte:116-135`)
1. The user picks `c:<id>` in the select → `fx = store.customEffects.find(id)`; stop when missing.
2. `sendFrames(dkey, (d,n,c,v) => d.customEffect?.({ colors: fx.colors.map(hexToRgb), fade: fx.fade }, n, c, v) ?? [])`:
   1. `parseEp(dkey)`; throw "not paired in this session" when the device is not tracked; `connect` when offline.
   2. `o = outputAt(deviceId, index)`.
   3. For each frame in order: `await queue.push(() => writeRaw(l, frame, driver))`.
3. `applyTo([dkey], (d,n,c,v) => d.speed(fx.speed, n, c, v))` (no coalescing key).
4. `setLook(dkey, { customEffectId: fx.id, effect: undefined })`.

Because `sendFrames` awaits each push, a write failure **rejects** `runCustom`: the speed and the look are then skipped, and the error goes unhandled in the `onchange` handler. 🟢

### Upload frames — ffe0 🟢 (`ffe0.ts:361-416`)
Preconditions: `l = layoutFor(name, variant)`; return `[]` for `sun`, `like`, `pho`; `total = byte(colors.length)`, return `[]` when 0. Then `mode = fade ? FE : FD`, `idx = i + 1`, `F = FF`, `DIY_SLOT = 00`.

| Layout / model | Per-colour frame | Start frame |
|---|---|---|
| `dmxs` (LEDDMX-02/04, LEDCAR-02) | `7B 0E R G B total idx mode BF` | `7B 0F F F F F F F BF` |
| `dmx` (LEDDMX, LEDCAR-01 SPI) | `7B idx 0E mode R G B total BF` | `7B F 0F 01 F F F F BF` |
| `smart` (LEDSMART) | `7D 02 03 00 R G B total DF` | none |
| `ble`, LEDSTAGE / LEDLIGHT (`isStage`) | `7E F 06 00 R G B total EF` | none |
| `ble`, others (LEDBLE, LEDCAR-01 RGB) | `7E idx 0D mode R G B total EF` | `7E F 0F 00 F F F F EF` |

No frame carries the output channel byte (BR-CE10). The ffe0 builder itself does not cap at 14; the cap comes from the editor. 🟢

### Upload frame — bledim 🟢 (`bledim.ts:252-282`)
1. `colors = spec.colors.slice(0, 14)`; return `[]` when empty.
2. `delete state.color` (driver memory → effect mode).
3. 72-byte payload `p`, zero-filled:
   - `p[0] = fade ? 1 : 0`
   - `p[1] = state.speed`
   - `p[2] = state.brightness`
   - `p[3] = colors.length`
   - `p[4] = 0`
   - `p[6] = state.strobe`
   - `p[14] = 0xFF` (NO_EFFECT)
   - for each colour `i`: `p[16+4i] = 0`, then `R, G, B`.
4. Return `[frame(0x82, p)]`: one 79-byte frame, chunked by the transport.

### Delete cleanup 🟢 (`store.svelte.ts:177-183`)
`customEffects = customEffects.filter(id ≠)`, then for every look with `customEffectId === id`, delete that field; `save()`.

## Alternative Flows
- **Unsupported family** 🟢: `supportsCustom` is false → no custom options, the hint shows; `customEffect?.` returns undefined → `?? []` → nothing is sent.
- **Effect deleted while selected elsewhere** 🟢: the looks are cleaned; the card shows "none".
- **Selected custom id no longer exists** 🟢: `find` fails, nothing is sent.
- **Device not tracked** 🟢: `sendFrames` throws "not paired in this session" (Portuguese, F6); the handler does not catch it.
- **Write fails mid-upload** 🟢: the remaining frames are not queued; speed and look are skipped; the device may hold a partial sequence.
- **Editor closed with ✕** 🟢: the draft is discarded without a reset; the component unmounts.

## Dependencies
- `device-control/`: `applyTo`, `WriteQueue.push`, `writeRaw` (chunking for BLEDIM), `outputAt`.
- `device-connection/`: `connect`, the `live` handle.
- `effects/`: shares the card's effect select and the look exclusivity rule.
- `protocol-drivers/`: `layoutFor`, `isStage`, `f`, `frame`, `stateFor`, `byte`.
- `persistence/`: `store.customEffects`, `store.looks`, `uid`, `save`.
- `i18n/`: `custom.*`, `effects.speed`, `common.save`.

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| A single 14-colour cap for every family | `CustomEffectEditor.svelte:96-97` | 🟢 |
| Support detected by calling the builder | `DeviceCard.svelte:38-41` | 🟢 |
| `customEffect` returns a frame list, empty meaning unsupported | `types.ts:93-100` | 🟢 |
| Ordered `push` upload, never `pushLatest` | `ble.svelte.ts:348-354` | 🟢 |
| No start frame where the vendor app has none | `ffe0.ts:363-367` | 🟢 |
| Vendor `0xFC` mode not used | `ffe0.ts:376-378` | 🟢 |
| Custom effects are global, not per device | `persist.ts`, `store.customEffects` | 🟢 |
| Speed sent as a separate command after the upload | `DeviceCard.svelte:133` | 🟢 |

## Internal State
- Persisted: `store.customEffects: CustomEffect[]`; `look.customEffectId` per endpoint. 🟢
- Editor-local: `editingId`, `name`, `colors`, `speed`, `fade` (reset after save). 🟢
- `Effects.svelte`: `editing` (editor visible). 🟢
- bledim driver memory: `customEffect()` deletes `state.color` (SM-3). 🟢

## Observability
- None. Upload progress and failures are invisible to the user. 🟢

## Risks and Gaps
- 🟡 **F4:** `supportsCustom` calls `bledim.customEffect`, which deletes `state.color` and increments `seq` on every evaluation. After a re-render, a BLEDIM showing a static colour loses its colour memory, and brightness switches to `0x88`. A reimplementation must make the probe side-effect free: a `supportsCustom(name, variant)` capability instead of calling the builder.
- 🟢 **F12 (owned by `scenes/`):** scene replay of a custom effect does not resend `fx.speed`.
- 🟢 BR-CE10: no channel byte in ffe0 uploads, so multi-output models cannot run a sequence on one output.
- 🟢 An unhandled rejection in `runCustom` gives no user feedback on failure.
- 🟡 **G5:** BLEDIM custom effects are untested on hardware (code comment).
- 🟡 The editor has no live preview, unlike the colour picker.
- 🟡 `onsaved` exists but the host does not use it, so a newly saved effect is not run automatically.
