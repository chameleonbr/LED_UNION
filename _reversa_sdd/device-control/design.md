# Device Control, Technical Design

> Reversa Writer · 2026-10-26 · unit `device-control` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ble.svelte.ts`, `src/lib/queue.ts`, `src/lib/endpoint.ts`, `src/lib/ui/DeviceCard.svelte`, `src/lib/ui/Effects.svelte`, `src/lib/ui/ColorSelect.svelte`, `src/lib/protocol/types.ts`, `state-machines.md` SM-2/SM-4, `adrs/004`, `adrs/007`, `adrs/008`, `adrs/011`

## Interface

### Endpoint keys 🟢 (`endpoint.ts`)

| Symbol | Signature | Returns | Notes |
|---|---|---|---|
| `epKey` | `(deviceId: string, i?: number)` | `string` | `deviceId` when `i` is undefined, otherwise `deviceId#i` |
| `parseEp` | `(key: string)` | `{ deviceId, ch?: number }` | `ch` is the **output index**, not the channel byte. A non-numeric suffix is ignored (the whole key is then the device id) |

### Routing and writing 🟢 (`ble.svelte.ts`)

| Symbol | Signature | Returns | Notes |
|---|---|---|---|
| `Build` (type) | `(driver: Driver, name: string, ch?: number, variant?: string) => Uint8Array \| undefined` | — | `name` is the advertised name; `ch`/`variant` come from `outputAt` |
| `outputAt` | `(deviceId, index?: number)` | `{ ch?: number, variant?: string }` | `{}` when the index is undefined; reads `driver.outputs(name)[index]` |
| `applyTo` | `(keys: string[], build: Build, coalesceKey?: string)` | `Promise<void>` | Never rejects (`allSettled`) |
| `writeRaw` (private) | `(l: Live, frame: Uint8Array, driver?: Driver)` | `Promise<void>` | Throws "Não conectado" when there is no characteristic |
| `writeOnce` (private) | `(char, part: Uint8Array, withResponse: boolean)` | `Promise<void>` | Without-response with a fallback |
| `sendRaw` | `(id, frame, charUuid?)` | `Promise<void>` | Used here for strip, direction and channel-mode frames (full spec in `debug/`) |

### `WriteQueue` 🟢 (`queue.ts`)

| Member | Signature | Notes |
|---|---|---|
| `constructor` | `(gapMs: number)` | One instance per device |
| `push` | `(op: () => Promise<void>) => Promise<void>` | Never dropped |
| `pushLatest` | `(key: string, op) => Promise<void>` | Replaces a waiting op with the same key |
| `#tail` | `Promise<void>` | Chain head |
| `#last` | `number` | Start time (epoch ms) of the last op |
| `#pending` | `Map<string, op>` | Newest op per coalescing key |

### Driver builders consumed 🟢 (`types.ts`)
`power(on, name, ch?, variant?)`, `rgb(r,g,b, name, ch?, variant?)`, `brightness(pct, …)`, `speed(pct, …)`, `white?(pct, name, variant?)`, `cct?(warm, cool, name, variant?)`, `soundMode?(mode, name, source, ch?, variant?)`, `soundEnable?(on, name)`, `soundSensitivity?(pct, name, variant?)`, `caps(name, variant?)`, `outputs?(name)`, plus `chunkSize?`, `writeWithResponse?`, `minGapMs`. ffe0 helpers: `isAddressable(name, variant)`, `rgbOrdersFor(name)`, `spiConfigFrame(name, {pixels, order})`, `directionFrame(name, forward)`. bledim helper: `switchChannelsFrame(mode)`.

### UI components 🟢

| Component | Props | Emits / side effects |
|---|---|---|
| `DeviceCard` | `dkey, conn, ch?, variant?, label, checked, onToggle(next), onEditCustom()` | Writes frames and the look; the checkbox feeds scene picking in `Effects` |
| `Effects` | — | Builds `logicals`; hosts the cards and the Everything card |
| `ColorSelect` | `value?` (bindable), `onpick?(hex)` | Calls `addColor` on create |

## Main Flow

### Building the endpoint list 🟢 (`Effects.svelte:20-34`)
1. For each `Conn` in `conns`: `outs = driver.outputs?.(name) ?? []`.
2. When `outs.length < 2`: one logical `{ key: c.id, conn, label: displayName(c) }`.
3. Otherwise, for each `outs[i]`: `{ key: epKey(c.id, i), conn, ch: o.ch, variant: o.variant, label: labelOf(key, o.label) }`.

Model outputs (from `protocol-drivers/`):

| Model (name prefix) | Outputs | Selector |
|---|---|---|
| `LEDCAR-01` | `[RGB {variant:'ble'}, SPI {variant:'dmx'}]` | variant (whole envelope) |
| `LEDBLE-02`, `LEDCAR-02` | `[LED 1 {ch:1}, LED 2 {ch:2}]` | channel byte |
| anything else | `[]` | single light |

### Sending a command 🟢 (`applyTo`, `ble.svelte.ts:308-335`)
For each `key` in parallel (`Promise.allSettled`):
1. `{ deviceId, ch: index } = parseEp(key)`.
2. `c = conns[deviceId]`, `l = live.get(deviceId)`; return when either is missing.
3. When `c.state !== 'online'`: `await connect(deviceId)` (a throw rejects only this key).
4. `o = outputAt(deviceId, index)`.
5. `frame = build(c.driver, c.name, o.ch, o.variant)`; return when it is undefined.
6. `op = () => writeRaw(l, frame, c.driver)`.
7. With a `coalesceKey`: `l.queue.pushLatest(`${coalesceKey}:${index ?? ''}`, op)`; otherwise `l.queue.push(op)`.

### Queue algorithm 🟢 (`queue.ts`)
- `#chain(op)`:
  1. `tail = tail.then(async () => { wait = gapMs − (now − last); if wait > 0 sleep(wait); last = now; await op() })`.
  2. `result = tail`; `tail = tail.catch(() => {})`.
  3. Return `result`.
- `pushLatest(key, op)`:
  1. `superseded = pending.has(key)`; `pending.set(key, op)`.
  2. When superseded, return the current `tail`; the queued slot will pick up the new op.
  3. Otherwise chain a slot: `latest = pending.get(key); pending.delete(key); if latest await latest()`.
- The gap is measured between **starts** of consecutive ops, not from the end of the previous write.
- 🟡 The promise returned to a superseded caller is the tail at call time. It resolves when the chain reaches that point, which may be before or after its own value is written.

### Writing a frame 🟢 (`writeRaw` / `writeOnce`, `ble.svelte.ts:246-285`)
1. `char = l.char`, or throw "Não conectado".
2. `chunk = driver.chunkSize`, `withResponse = driver.writeWithResponse ?? false`.
3. When there is no chunk size or `frame.length ≤ chunk`: one `writeOnce`.
4. Otherwise, for each slice of `chunk` bytes: sleep `driver.minGapMs ?? 30` between slices (not before the first), then `writeOnce`. The chunks of one frame are written **inside one queue op**, so no other frame interleaves with them.
5. `writeOnce`: with `withResponse`, call `writeValue`. Otherwise call `writeValueWithoutResponse`; on `DOMException NotSupportedError` fall back to `writeValue`; rethrow anything else.

| Family | `minGapMs` | `chunkSize` | `writeWithResponse` |
|---|---|---|---|
| bledim | 30 | 20 | true |
| fff0 | 5 | — | false |
| ffe0 | 50 | — | false |

### Device card controls 🟢 (`DeviceCard.svelte`)

| Control | Builder call | Coalesce key | Look update afterwards |
|---|---|---|---|
| On / Off | `power(on, n, c, v)` | — | `{ power }` |
| Colour pick | `rgb(r,g,b, n, c, v)` | `rgb` | `{ colorHex, effect: undefined, customEffectId: undefined }` |
| Brightness 0..100 | `brightness(v, n, c, v)` | `brightness` | `{ brightness }` |
| Speed 0..100 | `speed(v, n, c, v)` | `speed` | `{ speed }` |
| White, real wire | `white(v, n, variant)` | `white` | **none** (F5) |
| White, RGB-only | `rgb(k,k,k, …)`, `k = round(v·255/100)` | `rgb` | `{ colorHex: #kkkkkk, effect: undefined, customEffectId: undefined }` |
| CCT 0..100 | `cct(v, 100−v, n, variant)` | `cct` | **none** (F5) |
| Sound on/off | `soundEnable(on, n)` | — | none |
| Sound source / mode 0..15 | `soundMode(mode, n, source, c, v)` | — | none |
| Sensitivity 0..100 | `soundSensitivity(pct, n, variant)` | `sens` | none |
| Strip Apply | `sendRaw(id, spiConfigFrame(name, {pixels, order}))`, then `setStrip(id, cfg)` | — | none |
| Direction | `sendRaw(id, directionFrame(name, forward))`, errors swallowed | — | none |
| BLEDIM channel mode | `setChannelMode(id, mode)`, then `sendRaw(id, switchChannelsFrame(mode))` | — | none |

The look is written **after** `applyTo` resolves. Because `applyTo` never rejects, the look is written even when the write failed (F9).

`hasRealWhite = caps.white && !!driver.white && (!isBledim || channelMode !== 3)`; `showWhite = hasRealWhite || caps.rgb`. The default channel mode is `3` when none is saved. 🟢

### Everything card 🟢 (`Effects.svelte:50-76`)
`allKeys` = every logical key, offline devices included.
- `allColor(hex)`: `applyTo(allKeys, rgb, 'rgb')`, then for each key set `{ colorHex, effect: undefined, customEffectId: undefined }`.
- `allBrightness(v)`: `applyTo(allKeys, brightness, 'brightness')`, then `{ brightness }` on each key.
- `allPower(on)`: `applyTo(allKeys, power)`, then `{ power }` on each key.

### Colour picker 🟢 (`ColorSelect.svelte`)
1. Chips list `store.colors`; the chip whose hex equals `value` is pressed. Seeded colours have a `key` whose name is translated through `color.<key>`.
2. "+" → `open()`: remember `before = value`; set the draft to `value ?? '#ff8800'`; `pick(draft)` immediately, so the lights match the picker.
3. Each picker change → `pick(hex)` → `onpick(hex)`, which sends straight to the lights (coalesced by `rgb`).
4. Save → `addColor(draftName, draftHex)`, close, `pick(c.hex)`.
5. Cancel → close; when `before` is set, `pick(before)`.

## Alternative Flows
- **Unknown device or no live handle** 🟢: `applyTo` silently skips the key.
- **Connect fails** 🟢: that key's promise rejects inside `allSettled`; the others continue; nothing reaches the UI (F9). The card shows `conn.error` through the device-connection state.
- **Builder returns `undefined`** 🟢: nothing is queued (e.g. `white?.` on a driver without `white`).
- **Write fails** 🟢: the op rejects, and the queue continues with the next op.
- **`NotSupportedError` on write-without-response** 🟢: retried once with `writeValue`.
- **Strip Apply fails** 🟢: the config is not saved, and the error text shows in `stripMsg`.
- **Channel mode send fails** 🟢: the mode stays saved, and the error shows in `modeMsg`.
- **Cancel with no previous colour** 🟢: nothing is re-sent; the lights keep the last dragged colour.

## Dependencies
- `device-connection/`: `conns`, `live`, `connect`, the `Conn.driver` swap on resolve.
- `protocol-drivers/`: every frame builder, the caps, the outputs, and the ffe0 and bledim helpers.
- `persistence/`: `lookOf`, `setLook`, `labelOf`, `store.devices[].strip`/`channelMode`, `setStrip`, `setChannelMode`, `store.colors`, `addColor`.
- `i18n/`: `t()` for every label.
- `effects/`, `custom-effects/`: share the card's effect select (specified there).

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| Serial queue per device with coalescing instead of throttle-and-discard | `queue.ts:3-11`, `adrs/004` | 🟢 |
| Coalescing key includes the output index | `ble.svelte.ts:329-332` | 🟢 |
| Endpoint key encodes the output index in a flat string | `endpoint.ts:1-4`, `adrs/007` | 🟢 |
| Outputs derived from the model, never configured | `Effects.svelte:22-24`, `adrs/008` | 🟢 |
| Look is a command log written after the send | `DeviceCard.svelte:59-60`, `adrs/009` | 🟢 |
| White is an intent, mapped per hardware | `DeviceCard.svelte:83-98`, `adrs/011` | 🟢 |
| Broadcast limited to power, colour and brightness | `Effects.svelte:50-52` | 🟢 |
| Chunking happens inside one queue op, paced by `minGapMs` | `ble.svelte.ts:279-284` | 🟢 |
| Hardware wiring saved first because it describes the hardware | `DeviceCard.svelte:184-187` | 🟢 |

## Internal State
- Per device: one `WriteQueue` (`#tail`, `#last`, `#pending`), owned by `Live` (see `device-connection/`). SM-4 gives each coalescing slot's lifecycle. 🟢
- Per card (component-local, not persisted): `open`, `showStrip`, `pixels` (default 60), `order` (default 1), `stripMsg`, `modeMsg`, `showSound`, `source` (`mic`), `sensitivity` (50), `soundModeId` (0). `pixels`/`order` are re-seeded from the saved strip config. 🟢
- The white and CCT sliders always start at 0 and 50: they are not backed by the look. 🟢
- Per endpoint (persisted through `persistence/`): `Look { power?, colorHex?, brightness?, speed?, effect?, customEffectId? }`. Mode derivation follows SM-2. 🟢
- `Effects`: `picked` (scene selection, see `scenes/`) and `allBright` (default 100). 🟢

## Observability
- No logging. 🟢
- User-visible: the connection dot per card, `conn.error`, `stripMsg`, `modeMsg`, and the look summary (swatch and effect name). Write failures in `applyTo` are invisible (F9). 🟢

## Risks and Gaps
- 🟢 **F9:** `applyTo` swallows every per-key error, so the look records commands that never reached the device and the user gets no feedback.
- 🟢 **F5:** real-white, CCT and sound changes are not recorded in the look, so scenes cannot capture or replay them.
- 🟡 **BR-CT8:** `white()` and `cct()` have no channel parameter, so on LEDBLE-02 / LEDCAR-02 they hit the family's default output. This possibly contributes to G2 ("same colour on everything").
- 🟡 **G2 (owner):** on the owner's multi-output controller, commands often land on every output. `outputsFor` models LEDBLE-00 as a single light (frames use `ch ?? FF`), and byte 7 is an output selector outside LEDBLE-02 (`44bfd0f`). This needs a hardware check: which byte-7 values reach which output.
- 🟡 The superseded `pushLatest` caller's promise does not track its own write.
- 🟡 The Everything card includes offline devices, so a broadcast triggers a reconnect on each of them; with many devices this is slow but not wrong.
- 🟡 `F4`: the card's `supportsCustom` probe calls `bledim.customEffect`, which mutates BLEDIM driver memory, so brightness behaviour can flip after a re-render (see `custom-effects/`).
