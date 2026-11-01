# Code Analysis — LED UNION

> Reversa Archaeologist · 2026-10-24 · doc level: **completo**
> Confidence: 🟢 CONFIRMED (read in code) · 🟡 INFERRED · 🔴 GAP (needs human validation)
> Companion files: `data-dictionary.md`, `flowcharts/*.md`, `.reversa/context/modules.json`

## Overview

The app is a client-only PWA. Everything happens in the browser. The layers are:

```
UI (Svelte 5)  ──►  ble.svelte.ts (connection, routing, writes)  ──►  WriteQueue  ──►  Web Bluetooth GATT
      │                         │
      ▼                         ▼
store.svelte.ts ◄── persist.ts   protocol/* (pure frame builders, one Driver per family)
      │
      ▼
localStorage ('led-union/v1')
```

The core design idea 🟢: **drivers are pure byte builders** (`protocol/types.ts`, `Driver`), and all I/O lives in `ble.svelte.ts`. Every frame is a `Uint8Array` that is built and then written. The device sends nothing back, so the app keeps a record of the last commands it sent (`Look`), not a reading of the device's state.

---

## Module `protocol` — `src/lib/protocol/`

**Purpose:** turns user intents (power, colour, brightness, speed, effect, white, CCT, sound, custom sequence) into the vendor byte frames for each controller family.

### Driver registry — `index.ts`
- `drivers = [bledim, fff0, ffe0]`. **The order matters** 🟢: bledim shares fff0's service UUID, so it must be name-matched first.
- `driverFor(name)` returns the first driver whose `matches(name)` is true.
- `allServices` lists every service UUID. It feeds the `requestDevice` filters and `optionalServices`.

### Shared helpers — `types.ts`
- `clamp(v, lo, hi)` rounds and clamps. `pct` clamps to 0..100 and `byte` to 0..255. 🟢 Every driver clamps its inputs, so callers may pass values out of range.

### `fff0` — ELK / MELK (Magic Lantern, Lotus Lantern)
| Item | Value |
|---|---|
| Service / write char | `FFF0` / `FFF3` |
| Name match | `^(MELK-\|ELK[-~_]\|XSL-\|CLK-)` (case-insensitive) |
| Frame | fixed 9 bytes `7E … EF` |
| minGapMs | 5 |

Rules 🟢:
- **Caps:** MELK has white only if the name matches `MELK-.+W`, CCT only if it matches `MELK-.+CT`, and scenes always. Non-MELK models (ELK, XSL, CLK) have white and CCT but no scenes.
- **Power:** names containing `INTRO` use `0xFF` instead of `0x01` as the on byte (a Lotus quirk).
- **Brightness frame:** carries the LightMode selector `0xFF` (unspecified). The documented modes are ALL=0, RGB=1, W=2, CT=3.
- **Effect:** effects in group `Scenes` use opcode `0x31` (MELK only). Otherwise the sub-opcode is `0x06` on MELK and `0x03` on ELK. ELK ids are already offset into `0x80..0x9C` by the effect table.
- **soundMode:** OR-s `0x80` into the mode id. MELK sends length byte `0x07`, ELK sends `0x05`.
- `soundEnable` and `soundSensitivity` are separate frames.

### `ffe0` — LED+LAMP families (LEDBLE / DMX / CAR / SMART / SUN / LIKE / PHO)
| Item | Value |
|---|---|
| Service / write char | `FFE0` / `FFE1` |
| Name match | `^(LED[_ ]?BLE\|LEDSTAGE\|LEDLIGHT\|LEDDMX\|LEDCAR\|LEDSMART\|LEDSUN\|LEDLIKE\|LEDPHO)` |
| Frame | fixed 9 bytes; header and trailer depend on the layout |
| minGapMs | 50 |
| hasChannels | true |

**Key algorithm: `layoutFor(name, variant)`** 🟢 picks one of 7 wire layouts. The rules are checked in this order:
1. `LEDSMART` → `smart` (`7D…DF`)
2. `LEDSUN` → `sun` (`7A…AF`)
3. `LEDLIKE` → `like` (`70…0F`)
4. `LEDPHO` → `pho` (`72…2F`, ends with 3 group-address bytes `PHO_GROUP=[0,0,0]`)
5. `LEDDMX-02/04`, `LEDCAR-02` → `dmxs` (`7B…BF`, no `FF` filler, params shifted left)
6. `LEDCAR-01` → `ble` when `variant==='ble'`, otherwise `dmx`
7. `LEDDMX*` → `dmx` (`7B FF…BF`)
8. anything else → `ble` (`7E…EF`)

See `flowcharts/protocol.md`.

**`outputsFor(name)`** 🟢. Physical outputs are derived from the model, never asked of the user:
- `LEDCAR-01` → `[{RGB, variant:'ble'}, {SPI, variant:'dmx'}]`. Each output uses a different protocol envelope.
- `LEDBLE-02`, `LEDCAR-02` → `[{LED 1, ch:1}, {LED 2, ch:2}]`. The outputs are selected by a channel byte, and `ch=0` means both.
- every other model → `[]` (a single light).

**Auth handshake** 🟢:
- `authFrame(now, password=[A1 23 45 67])` = `2A 02 <pwd×4> <tb> <minutes> AF`, where `tb = (weekIndex<<5 | hours) & 0xFF`.
- `weekIndex` maps Sunday to 7 and Monday..Saturday to 1..6.
- It is sent only to names matching `^(LEDBLE|LEDDMX|LEDCAR|LED[_ ]BLE)`, from `onConnect`.
- The original app sends it 300 ms after connecting. Here it is queued right after `online` and subject to the queue gap 🟡.
- `passwordQueryFrame()` exists but nothing calls it 🟢 (dead export).

Other rules 🟢:
- **Caps by layout:**
  - `rgb` is false only on `sun` and `like`.
  - `white` is true on `dmxs` and `smart`.
  - `cct` is true on `sun`, `pho`, `dmxs` and `ble`.
  - `scenes` is always false.
- **`dmx` double encoding:** brightness and white are sent twice, first scaled to 0..32 (`round(pct*32/100)`), then raw.
- **White-only hardware** (`sun`, `like`): `rgb()` falls back to `white(round((R+G+B)/3/255*100))`.
- **Effect frame:**
  - `ble` uses `7E FF 03 id 03 FF FF ch EF` (the app's setRgbMode, not setMode).
  - `LEDBLE-03` shifts the id one byte left: `7E 03 id 00 …`.
  - `dmxs` uses opcode `0x03` for built-in modes; the comment says opcode `0x13` (DIY) was a previous bug.
- **Effect tables:**
  - `LEDCAR-01` uses `ledcar` with the `ble` variant and `leddmx` (211 entries) with the `dmx` variant.
  - Any other `LEDCAR` uses `ledcar`.
  - `smart` and `sun` have no names, so the code generates 16 entries labelled `Modo N` (Portuguese label) 🟢.
- **Custom effect** (`customEffect`), one frame per colour followed by a start frame:
  - Returns `[]` on `sun`, `like` and `pho`, and when there are 0 colours.
  - Colour indices are **1-based**.
  - Mode `0xFE` means fade and `0xFD` means jump. The app's `0xFC` for LEDBLE is deliberately not used.
  - `smart` uses a constant `DIY_SLOT=0` with no index and has **no start command**.
  - `LEDSTAGE/LEDLIGHT` (on the `ble` layout) use a different per-colour frame and also have **no start command**.
- **Addressable strips** (`dmx`/`dmxs` only; `isAddressable`):
  - `spiConfigFrame(name, {pixels, order})` sends pixels as 2 bytes big-endian. `BANNER_TYPE=4` is fixed on `dmx`; on `dmxs` the order comes first and there is no type byte.
  - `directionFrame(name, forward)` sets which end of the strip effects run from.
  - `rgbOrdersFor` returns `rgbOrdersDmx02` (6 permutations) on `dmxs` and `rgbOrders` otherwise.

### `bledim` — BLEDIM (shares the FFF0 service)
| Item | Value |
|---|---|
| Service / write char | `FFF0` / `FFF1` (writes and notifications) |
| Name match | **exact** `^(BLEDIM\|LanQianTech)$`; JDY-10 and Ble_Light clones are deliberately not claimed |
| Frame | variable length `55 AA seq cmd lenHi lenLo payload… sum` |
| minGapMs / chunkSize / writeWithResponse | 30 / 20 / true |
| channelValues | `[1,2,3,4]` = DIM / CCT / RGB / RGBW wiring mode |

**`frame(cmd, payload)`** 🟢:
- `seq` is a module-global counter, incremented and masked to 8 bits. The device does not validate it.
- The length counts the payload only and is big-endian.
- The checksum is the 8-bit sum of every preceding byte, sync and header included.

**Commands:** `ONOFF 80`, `SELECT_COLOR 81` (unused), `IMMEDIATE_SCENE 82`, `SWITCH_CHANNELS 86`, `READ_INFO 87`, `SPEED_BRIGHTNESS 88`, `SERIAL_CODE 89`, `ENABLE_HW_AUDIO 8B`, `AUDIO_SENSE 8C`.

**Per-device state** `states: Map<name, {speed=192, brightness=255, strobe=0, color?}>` 🟢. Speed and brightness travel in one command (`0x88`), so changing one means resending the other.

Rules 🟢:
- **Static colour** is sent as a 72-byte one-colour scene (`0x82`, `staticScene`), not as `0x81`. Only scenes survive a power cycle.
- **Brightness:**
  - With a static colour remembered, the colour is rescaled by `brightness/255` and resent as a static scene.
  - Otherwise the code sends `0x88`.
- **Effect** clears the remembered colour and sends `sceneFrame`: `p[14] = id | 0x80` (chase bit) plus speed, brightness and strobe.
- **Custom effect:**
  - One `0x82` frame holds up to `MAX_COLOR_QTY=14` colours.
  - `p[14]=0xFF` (NO_EFFECT) means the colour list itself plays.
  - `p[0]` is the fade flag.
  - Not verified on hardware (code comment).
- **Range:** this family takes 0..255, converted from percent by `from100 = round(pct*255/100)`.
- **`onConnect`** sends `serialCodeFrame(now)` = `0x89 [seconds, ms & 0xFF]`.
- **Unused helpers** 🟢: `readInfoFrame` and `audioSenseFrame` are exported, but no caller exists in `src/lib/ui/`. `audioSenseFrame` duplicates `soundSensitivity`.

### `effects.ts` — generated
- **GENERATED** from `docs/protocol/*.tsv` by `tools/gen-effects.py`. Do not edit by hand 🟢.
- Tables:
  - `melk` (grouped: Basic, Scenes, …)
  - `elk`, `ledble`, `ledcar`
  - `leddmx` (211 entries)
  - `ledlike`, `ledpho`
  - `rgbOrders`, `rgbOrdersDmx02`

---

## Module `ble` — `ble.svelte.ts`, `queue.ts`, `endpoint.ts`, `hex.ts`

**Purpose:**
- Web Bluetooth lifecycle: choose, connect, restore, disconnect, forget.
- Driver resolution against the real GATT services.
- Routing intents to endpoints.
- Paced, serialized writes.

### Reactive state
- `conns: Record<deviceId, Conn>` (`$state`) is what the UI shows.
- `selection.ids: string[]` holds endpoint keys.
- `live: Map<id, {device, char?, queue}>` and `connectedAt: Map<id, ms>` are non-reactive.

### Main functions 🟢
| Function | Behaviour |
|---|---|
| `restore()` | Seeds `conns` from `store.devices` (only for names a driver recognizes). Then calls `navigator.bluetooth.getDevices()` if the browser has it (may be behind a flag) and `track`s each device. Then tries `connect` on every device and ignores failures, since a user gesture may be required. |
| `addDevice()` | Opens `requestDevice` filtered by every service UUID. Guesses the driver from the name, falling back to `drivers[0]` (bledim). Calls `track`, then `connect`. |
| `track(device, driver)` | Creates or updates the `Conn`. Uses the label from the store. Creates a `WriteQueue(minGapMs)`. Adds a `gattserverdisconnected` listener that sets the state to offline and records `lastLinkMs`. Persists the device with `rememberDevice`. |
| `connectGatt(device)` | 3 attempts with a 400·(n+1) ms backoff, disconnecting a half-open link between attempts. |
| `resolveDriver(server, guess)` | Tries the guessed driver first, then the others. A driver wins if its service exists and its documented write char exists, or failing that **any** char with write or writeWithoutResponse. Otherwise it throws a Portuguese error that lists the char ids it saw. |
| `connect(id)` | Returns early if already online. Otherwise connects, resolves the driver, and swaps driver and queue if the resolution differs (pacing is per family). Then sends the `onConnect` frames through the queue. On error it sets the state to `error` with an `explain()` message. |
| `explain(e)` | Turns DOMExceptions into hints: another app holds the device, use Debug, needs HTTPS. **Hardcoded in Portuguese.** |
| `forget(id)` | Disconnects, then deletes from `conns`, `live`, `connectedAt` and the selection, then calls `forgetDevice` in the store. |
| `writeOnce(char, part, withResponse)` | Uses write-without-response by default. Falls back to `writeValue` on `NotSupportedError`. |
| `writeRaw(l, frame, driver)` | Without `chunkSize`, or when the frame fits, writes it whole. Otherwise splits it into chunks with `minGapMs` sleeps between them. |
| `outputAt(deviceId, index)` | Resolves an endpoint index to `{ch, variant}` through `driver.outputs(name)[index]`. |
| `applyTo(keys, build, coalesceKey?)` | Runs per key in parallel (`Promise.allSettled`, so **errors are swallowed**). Steps: `parseEp`, auto-`connect` if offline, `outputAt`, `build`, then `pushLatest('${coalesceKey}:${index}')` or `push`. |
| `apply(build, key?)` | `applyTo(selection.ids, …)`. **No caller in the UI** 🟢. |
| `targets()` | Unique conns in the selection. **No caller** 🟢. |
| `sendFrames(key, build)` | Ordered frames for one endpoint, always `push` and never coalesced (custom effect uploads). |
| `inspect(id)` | Lists the GATT services: `getPrimaryServices()`, falling back to probing each known UUID. Returns the chars with their props. |
| `sendRaw(id, frame, charUuid?)` | Debug bench. With a different char UUID, walks every service to find it and writes through the queue with that char. |

### `WriteQueue` (`queue.ts`) 🟢. Key algorithm.
- One promise chain per device. A minimum gap `gapMs` is kept between the starts of consecutive ops (`wait = gap - (now - last)`).
- `push(op)` never drops an op.
- `pushLatest(key, op)`:
  - If an op with the same key is still waiting, it is replaced and the call returns the current tail.
  - Otherwise a slot is chained that runs whatever op is newest for that key at run time.
  - So the last value always lands. The original apps instead *discard* writes inside the window.
- A failed op does not break the chain (`tail.catch`); the caller still gets the rejection.

### `endpoint.ts` 🟢
- `epKey(deviceId, i?)` returns `deviceId` or `deviceId#i`.
- `parseEp` parses it back, ignoring a non-numeric suffix.
- **The suffix is an index into `driver.outputs(name)`, not the channel byte**, although the field is named `ch` (see the data dictionary).

### `hex.ts` 🟢
- `parseHex` strips `0x` and every non-hex character and requires an even number of digits. Its error message is in Portuguese.
- `toHex` returns uppercase bytes separated by spaces.

---

## Module `store` — `store.svelte.ts`, `persist.ts`

**Purpose:** persisted user data (devices, groups, scenes, looks, labels, palette, custom effects, locale) in `localStorage`.

- `load()` 🟢 reads `localStorage['led-union/v1']`, falling back to `'led-onion/v1'` (the project was renamed), then runs `migrate`. Any exception gives `empty()`, which covers private mode and blocked storage.
- `save()` 🟢 serializes the whole `store` on every mutation and ignores failures.
- `uid()` 🟢 returns 8 base-36 characters from `Math.random` (not cryptographic; fine for local ids).
- **`migrate(raw)`** 🟢:
  1. Shallow merge over `empty()`.
  2. Re-seed the palette when it is empty or invalid.
  3. Replace `looks` / `labels` / `customEffects` with defaults when they are invalid.
  4. Move legacy `device.outputs[{ch,label}]` into `labels['id#i']`, and move looks from `id#ch` to `id#i`.
  5. Drop scenes without `entries`; the old single-colour format cannot be mapped.
- **`forgetDevice(id)`** 🟢 cascades:
  - removes the device;
  - removes `id` from groups;
  - deletes `looks` and `labels` keys equal to `id` or starting with `id#`;
  - removes scene entries for the device, then removes scenes left empty.
- `removeCustomEffect` 🟢 clears `customEffectId` from every look that points to it.
- `addScene(name, keys)` 🟢 **snapshots** the current looks with `structuredClone`.
- `renameDevice` / `renameEndpoint` 🟢 trim the input; an empty label deletes the entry.
- `setChannelMode`, `setStrip` 🟢 store per-device hardware configuration.

---

## Module `i18n` — `dict.ts`, `i18n.svelte.ts`

- Two dictionaries, `en` (the source) and `pt-BR`, about 80 keys each. No library is used.
- `translate(locale, key, params)` 🟢 falls back from the locale dictionary to `en`, then to the key itself. It interpolates `{name}`, and an unknown placeholder is kept as is.
- `resolveLocale(tag)` 🟢: an exact match first, then a match on the base language (`pt`, `pt-PT` → `pt-BR`), otherwise `en`.
- `locale()` 🟢 returns `store.locale` (explicit choice) or `detect()`, which takes the first `navigator.languages` entry that resolves to a non-default locale, or that is English.
- `chooseLocale(undefined)` 🟢 clears the choice, so the app follows the browser again.

---

## Module `ui` — `App.svelte`, `src/lib/ui/*`

| Component | Responsibility |
|---|---|
| `App.svelte` | Shell with 4 tabs: Devices, Effects, Scenes, Debug. Shows the online counter and the locale `<select>`. Calls `restore()` on mount. Shows a warning, rather than blocking the app, when Web Bluetooth is missing. |
| `Devices.svelte` | Add, connect all, select all; rename devices and outputs; per-output checkboxes for multi-output models; groups (save the selection as a group, select a group, delete a group). |
| `Effects.svelte` | One `DeviceCard` per **logical endpoint**. An "Everything" card broadcasts **only** power, colour and brightness, because effect ids are per family. Saves a scene from the cards that are ticked. |
| `DeviceCard.svelte` | Per-endpoint controls: power, colour, effect (built-in or custom), brightness, speed, white, CCT, sound, addressable strip setup (pixels, order, direction), BLEDIM channel mode. Writes the `Look` after sending. |
| `Scenes.svelte` | Lists scenes and applies them. Per entry, the order is power → brightness → speed → colour → (custom effect \| effect), then `setLook`. |
| `ColorSelect.svelte` | Palette chips, a live colour picker (each drag change goes straight to the lights) and cancel-to-restore. Seeded colours have translated names. |
| `CustomEffectEditor.svelte` | Create, edit and delete custom effects: colour list (reorder, at most **14**, BLEDIM's limit), speed, fade or jump. |
| `Debug.svelte` | GATT inspection, raw hex send to any writable char, and sweeps through candidate frames (power, effect, channels) with a 1.5 s gap. |

UI rules 🟢:
- **White is an intent:** on hardware with a real W wire the slider drives `white()`. Otherwise it sends `rgb(k,k,k)`. On BLEDIM in channel mode 3 (RGB) there is no white wire.
- `supportsCustom` is detected by **calling** `customEffect` with a dummy 1-colour spec and checking that the result is non-empty.
- The BLEDIM channel mode is **saved before** the frame is sent: it describes the wiring and stays true even if the write fails.
- Slider streams (rgb, brightness, speed, white, cct, sens) use coalescing keys. Power, effect and handshake writes use `push`.

---

## Module `tools` — `tools/gen-effects.py`, `tools/difftest/`

- `gen-effects.py` 🟢 converts the TSV tables into `effects.ts`. Python standard library only.
- `difftest` 🟢 checks the hand transcription of each frame against the decompiled Java:
  - `extract_java_frames.py` parses three Java shapes (literal, bare initialiser, indexed assignment). It resolves jadx buffer aliases and decompiler constant artifacts.
  - `emit_ts_frames.ts` runs the drivers on representative names with probe values R=0x11, G=0x22, B=0x33 and channels 0, 1, 2.
  - `compare.py` classifies each frame as exact, prefix or unmatched, and reports app literals no TS frame covers as uncovered.
- The README claims **221/221 frames match** 🟡. See the findings below for why the coverage is narrower.

---

## Re-extraction 2026-11-01 — `374da11..56af9f9`

### `ipixel` — iPixel Color panels (`protocol/ipixel.ts`) 🟢
- `matches`: name contains `LED_BLE`; registry order keeps it **last**, so the GATT probe (service `00fa`, write `fa02`) decides, not the name.
- Frames `[len u16 LE] [cmd] [type] payload`. Builders: `power` `05 00 07 01 <0|1>`, `brightness` `05 00 04 80 <0..100>`, `showSlot` `07 00 08 80 01 00 <slot>`, `orientation` `05 00 06 80 <0..3>`, `deleteAll` `04 00 03 80`. `rgb`/`effect`/`speed` return empty (BR-21).
- `onConnect`: device-info query `08 00 01 80 <hh mm ss> 00` and HW query `04 00 05 80`.
- `onNotify`: `parseHwInfo` (`08 00 05 80 maj min` → `mcu = maj*100+min`) first, else `parseDeviceInfo` (only a frame echoing `01 80`; byte 4 = type → `PANEL_SIZES`, byte 10 lock flag when present). Acks never overwrite size.
- `chunkSize: 244`.

### `ipixel-content` — upload bytes (`protocol/ipixel-content.ts`) 🟢
- `windows(kind, slot, content, size)`: 15-byte header `len u16, dataType(2), option 00|02, total u32, crc32 u32, subType, slot` + slice. Data types image `02 00`/sub 00, GIF `03 00`/02, text `00 01`/00. Every window repeats total and CRC.
- `windowSize`: 12288 for types `00/80/81` or mcu major 2, else 4096.
- `parseAck(d, kind)`: only `05 00 <t0 t1>` of the same data type; status 1 next, 3 done, 0 rejected, 2 full.
- Text: `textPayload` = 14-byte header (count u16, align 1,1, effect, speed 0..100, colour mode 1, RGB, bg 0×4) + `charBlock` per glyph. Legacy block `[sizeType RGB bits]` (sizeType: 16/32/48/64 px high, odd = not half-width); new block `[80 RGB w h bits]` for `newTextFormat(mcu)` ranges. `packGlyph` row-major, rows padded to bytes, LSB-first (MSB-first optional).
- 10 unit tests incl. CRC (`0xcbf43926`) and exact header bytes.

### `ble` additions 🟢
- `listen` enables notify on every notify/indicate char of the service; each notification is traced, offered to `ackWaiters.get(id)` and to `driver.onNotify` → `patchPanel`.
- `writeRaw(l, frame, driver, source, brief)`: chunks by `driver.chunkSize`; `brief` truncates the traced hex and sends chunks without gap.
- `upload(id, kind, slot, content, {signal, onProgress})`: single `queue.push`; optional pre-select (`mcu ≥ 500`, 2 s, silence ok); per window `writeAndWait` (timer starts after the write, 6 s); `rejected`/`full` → `UploadError`; abort → `cancelled`. `listenFor` removes only its own waiter.
- Stealth gate: `applyTo`/`sendFrames` call `leaveStealth()` unless `opts.force`; `SendOpts.source` tags the trace. `connectOnce` powers off a device that connects during stealth and adds it to the snapshot.
- `connectGatt` (PR #6): on "no longer in range", `heardAdvert` (`watchAdvertisements` + `advertisementreceived`, 6 s, aborted in `finally`) then retry; up to 3 attempts.

### `store` additions 🟢
- `patchPanel(id, {orientation?, mcu?, lastSlot?})` replaces `setOrientation`; `store.stealth`; `store.giphyKey`; `forgetDevice` also prunes `stealth.snapshot`.
- `persist.migrate` drops a malformed `stealth`.

### Cross-cutting modules 🟢
- `look.ts#applyLook`: moved out of Scenes; order power → brightness → speed → colour|white|cct → custom effect (+speed) | effect → panel slot; then `setLook`.
- `stealth.ts`: `enterStealth` (snapshot online endpoints, force power off, record `power:false`), `exitStealth` (replay with `power:true` default, return unreachable names).
- `trace.ts`: ring of 2000 `TraceEntry`, debounced flush (1 s) to `led-union/trace`; `clear`, download as JSON from Debug. 3 tests.

### `panel/` — browser helpers (002) 🟢
- `render.ts`: `renderImage` (createImageBitmap → canvas, fit cover/contain/stretch on black), `renderGif` (ImageDecoder, ≤ `maxFrames`, default 60), `encodePng` (OffscreenCanvas), `encodeGif` (gifenc, one global palette), `rasterText` (bold sans 85 % of height; half-width cell unless wider), `glyphFrame` (preview), `MAX_BYTES` 512 KB.
- `library.ts`: IndexedDB `led-union-items`; `listItems`, `putItem` (plain copy), `removeItem`; `StorageFull` on quota.
- `giphy.ts`: `search(key, q, offset)` → `/v1/gifs/search` (limit 24, rating g); `hitFrom` picks original under 2 MB else downsized; errors `badKey` (401/403), `limit` (429), `network`. 3 tests.
- `prefs.svelte.ts`: `textPrefs.msbFirst` (Debug switch, not persisted).
- `public/share-target.js`: SW `fetch` listener for POST `./share`; stores first file (`x-name` header) or text/url/title in Cache `led-union-share`, 303 → `./?share=1`. Loaded via `workbox.importScripts`.

### `ui` additions 🟢
- `App.svelte`: Panel tab; starts on Panel when `?share` present; stealth toggle.
- `Panel.svelte`: device picker (drivers with `showSlot`), library grid (thumb URLs revoked), import file/URL/new text, duplicate/delete, GIPHY key + search + "more" + attribution, `takeShared` on mount. `{#key editing.id}` around the editor.
- `PanelEditor.svelte`: preview canvas (animated), fit/frames or text/colour/effect/speed, slot input (default item slot, else `lastSlot+1`), `send` (leaveStealth → encode → size check → save → upload with progress/cancel → showSlot force → setLook → patchPanel → save with slot), save on close.
- `DeviceCard.svelte`: iPixel controls (brightness, slot buttons, orientation, delete all) via `patchPanel`. `Debug.svelte`: trace view/download/clear, `msbFirst` switch. `Scenes.svelte`: uses `applyLook`.

## Findings (defects / risks)

| # | Sev | Finding | Evidence |
|---|---|---|---|
| F1 | 🟢 high | **Scenes drop `variant`.** Every builder in `applyLook` is `(d,n,c)=>…` and never passes the 4th argument. LEDCAR-01's RGB output (`variant:'ble'`) is replayed through the `dmx` envelope, and its saved `car_mode` effect id is sent in a `dmx` effect frame, so the wrong effect plays. `DeviceCard` does pass `variant`. | `src/lib/ui/Scenes.svelte:21-41` |
| F2 | 🟢 med | **`Group.deviceIds` holds endpoint keys** (from `selection.ids`, so possibly `id#i`). `forgetDevice` filters with `x !== id`, so `id#0` and `id#1` survive in groups. The `devices.count` label counts keys, not devices. | `store.svelte.ts:105`, `Devices.svelte:199-203` |
| F3 | 🟢 med | **BLEDIM state is keyed by advertised name**, and `matches` only accepts the exact names `BLEDIM` / `LanQianTech`. Two physical BLEDIMs therefore share one `DeviceState`, which contradicts the comment above `states`. | `bledim.ts` `states`, `matches` |
| F4 | 🟡 med | **Impure probe.** `supportsCustom` (`$derived`) calls `bledim.customEffect`, which deletes `state.color` and increments `seq`. After a re-render, brightness may switch from rescaling the colour to sending `0x88`. This breaks the "frames built pure" contract in `types.ts`. | `DeviceCard.svelte` `supportsCustom`; `bledim.ts` `customEffect` |
| F5 | 🟢 med | **Look gaps.** The real-white branch of `setWhite`, `setCct` and every sound control never call `setLook`, so scenes cannot capture or replay white, CCT or sound. | `DeviceCard.svelte` |
| F6 | 🟢 low | **i18n leaks:** Portuguese is hardcoded in `explain()`, the `resolveDriver`/`connect`/`sendRaw` errors, `'(sem nome)'`, `parseHex`, all of `Debug.svelte`, and `Modo N` in `ffe0`, while the default locale is `en`. | `ble.svelte.ts`, `hex.ts`, `Debug.svelte`, `ffe0.ts` |
| F7 | 🟡 low | **Narrow difftest coverage.** `emit_ts_frames.ts` loops over channels but never passes a `variant`, and has no `LEDBLE-03` name. LEDCAR-01's `ble` path and the LEDBLE-03 effect shift are not exercised, so "221/221" covers fewer paths than implied. | `tools/difftest/emit_ts_frames.ts:72-83` |
| F8 | 🔴 | **difftest is not reproducible from the repo.** The decompiled trees are not committed (`original_apps/` is gitignored and holds APKs, not decompiled sources), and the npm script needs `$DIFFTEST_TARGETS` and writes to `/tmp`. | `package.json`, `.gitignore` |
| F9 | 🟢 low | `applyTo` uses `allSettled`, so a per-device write error never reaches the UI. Effects and DeviceCard show no feedback when a write fails. | `ble.svelte.ts` `applyTo` |
| F10 | 🟢 low | `track()` adds a new `gattserverdisconnected` listener on every call (restore + add), so listeners pile up on the same device. | `ble.svelte.ts` `track` |
| F11 | 🟢 low | Dead or duplicate code: `apply`, `targets`, `passwordQueryFrame`, `readInfoFrame` and `audioSenseFrame` have no callers; `sleep` and `sleepMs` are duplicates; an orphan JSDoc sits above `outputAt`; blank lines and an orphan comment remain in `store.svelte.ts` (removed output editing). | various |
| F12 | 🟢 low | Scenes replaying a custom effect do not resend `fx.speed`, unlike `DeviceCard.runCustom`. | `Scenes.svelte` vs `DeviceCard.svelte` |
| F13 | 🟡 | `tools/difftest/__pycache__/*.pyc` is tracked in git. | `git ls-files` |

## Tests
- `node:test`. Four files:
  - `frames.test.ts`: 39 tests that check byte templates per driver.
  - `queue.test.ts`: gap and coalescing.
  - `persist.test.ts`: migrate and seed.
  - `dict.test.ts`: fallback and locale resolution.
- There are no UI or `ble.svelte.ts` tests, because they would need mocked Web Bluetooth 🟢.
