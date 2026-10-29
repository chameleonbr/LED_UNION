# Protocol Drivers, Technical Design

> Reversa Writer · 2026-10-26 · unit `protocol-drivers` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/protocol/index.ts:1-17`, `types.ts:1-111`, `fff0.ts:1-90`, `ffe0.ts:1-500`, `bledim.ts:1-290`, `frames.test.ts` (39 tests), `flowcharts/protocol.md`
> Byte-level frames: `contracts.md`.

## Interface

### The `Driver` contract 🟢 (`types.ts:38-105`)

| Member | Signature | Required | Notes |
|---|---|---|---|
| `id`, `label` | `string` | yes | `bledim` / `fff0` / `ffe0` |
| `service`, `writeChar` | 128-bit UUID string | yes | used by `device-connection/` |
| `minGapMs` | `number` | yes | queue gap |
| `chunkSize?`, `writeWithResponse?` | `number`, `boolean` | no | bledim only |
| `hasChannels?` | `boolean` | no | ffe0, bledim (informational; no consumer reads it 🟢) |
| `channelValues?` | `number[]` | no | bledim `[1,2,3,4]` (wiring modes); no consumer reads it, the UI hardcodes `CHANNEL_MODES` 🟢 |
| `matches(name)` | `boolean` | yes | name hint |
| `caps(name, variant?)` | `Caps` | yes | |
| `effects(name, variant?)` | `Effect[]` | yes | see `effects/` |
| `outputs?(name)` | `DriverOutput[]` | no | ffe0 only |
| `onConnect?(name, now?)` | `Uint8Array[]` | no | handshake frames |
| `power/rgb/brightness/speed/effect` | `(…, name, ch?, variant?) => Uint8Array` | yes | |
| `white?(pct, name, variant?)`, `cct?(warm, cool, name, variant?)` | `Uint8Array` | no | **no `ch` parameter** |
| `soundMode?(mode, name, source, ch?, variant?)`, `soundEnable?(on, name)`, `soundSensitivity?(pct, name, variant?)` | `Uint8Array` | no | |
| `customEffect?(spec, name, ch?, variant?)` | `Uint8Array[]` | no | see `custom-effects/` |

Shared helpers: `clamp(v, lo, hi)` rounds and clamps; `pct = clamp(0,100)`; `byte = clamp(0,255)`.

### Per-family constants 🟢

| | bledim | fff0 | ffe0 |
|---|---|---|---|
| service | `0000fff0-…` | `0000fff0-…` | `0000ffe0-…` |
| writeChar | `0000fff1-…` (write and notify) | `0000fff3-…` | `0000ffe1-…` |
| minGapMs | 30 | 5 | 50 |
| chunkSize / withResponse | 20 / true | — / false | — / false |
| matches | `^(BLEDIM\|LanQianTech)$` (exact, case-insensitive) | `^(MELK-\|ELK[-~_]\|XSL-\|CLK-)` | `^(LED[_ ]?BLE\|LEDSTAGE\|LEDLIGHT\|LEDDMX\|LEDCAR\|LEDSMART\|LEDSUN\|LEDLIKE\|LEDPHO)` |
| frame | variable `55 AA …` + checksum | fixed 9 bytes `7E … EF` | fixed 9 bytes, header and trailer per layout |
| ranges | 0..255 (`from100`) | 0..100 | 0..100 |

The extra exports are standalone helpers: ffe0 `layoutFor`, `outputsFor`, `authFrame`, `passwordQueryFrame` (dead), `isAddressable`, `rgbOrdersFor`, `spiConfigFrame`, `directionFrame`; bledim `frame`, `serialCodeFrame`, `switchChannelsFrame`, `readInfoFrame` (dead), `audioSenseFrame` (dead, duplicates `soundSensitivity`).

## Main Flow

### Name → driver 🟢
1. `driverFor(name)` returns the first of `[bledim, fff0, ffe0]` whose `matches(name)` is true.
2. Callers use it as a **guess**; `resolveDriver` in `device-connection/` confirms it by service and characteristic.

### Capabilities 🟢

| Family / condition | rgb | white | cct | speed | effects | scenes |
|---|---|---|---|---|---|---|
| bledim | ✔ | ✔ (the UI hides it in channel mode 3) | — | ✔ | ✔ | — |
| fff0 MELK (`MELK-` name) | ✔ | only `MELK-.+W` | only `MELK-.+CT` | ✔ | ✔ | ✔ |
| fff0 ELK / XSL / CLK | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| ffe0 `ble` | ✔ | — | ✔ | ✔ | ✔ | — |
| ffe0 `dmx` | ✔ | — | — | ✔ | ✔ | — |
| ffe0 `dmxs` | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| ffe0 `smart` | ✔ | ✔ | — | ✔ | ✔ | — |
| ffe0 `sun` | — | — | ✔ | ✔ | ✔ | — |
| ffe0 `like` | — | — | — | ✔ | ✔ | — |
| ffe0 `pho` | ✔ | — | ✔ | ✔ | ✔ | — |

`Caps.scenes` (MELK) has no UI consumer today 🟢 (grep). 🟡 It describes the Scenes group in the MELK effect table, which the effect select already shows.

The `white()` builder exists on every ffe0 layout even where `caps.white` is false (e.g. `ble` sends `7E FF 05 01 w FF FF FF EF`). The UI gates on caps, so it is not reachable there. 🟢

### ffe0 layout resolution 🟢 (`layoutFor`, `ffe0.ts:38-50`)

```
LEDSMART*            → smart  (7D … DF)
LEDSUN*              → sun    (7A … AF)
LEDLIKE*             → like   (70 … 0F)
LEDPHO*              → pho    (72 … 2F, last 3 params = group 00 00 00)
LEDDMX-02/04*, LEDCAR-02* → dmxs (7B … BF, no FF filler, params shifted left)
LEDCAR-01*           → variant==='ble' ? ble : dmx
LEDDMX*              → dmx    (7B FF … BF)
anything else        → ble    (7E … EF)   — LEDBLE, LED_BLE, LEDSTAGE, LEDLIGHT, LEDCAR-00
```
The strip helpers call `layoutFor(name)` **without** a variant, so on LEDCAR-01 they always use `dmx`, which is correct (only the SPI output is addressable). 🟢

### Output channel byte (ffe0) 🟢
`ch` comes from `outputsFor(name)[index].ch` via `outputAt` in `device-control/`. When it is undefined (single-light models, or LEDCAR-01, which uses variants):

| Builder | `ble` layout byte 7 default | `dmxs` |
|---|---|---|
| power | `ch ?? 00` (stage: no `ch` byte) | not carried |
| rgb, brightness, speed, effect, soundMode | `ch ?? FF` | effect only: `ch ?? FF` |
| white, cct, soundSensitivity, customEffect | not carried | not carried |

So on a single-light LEDBLE, power goes out with byte 7 = `00` and colour with `FF` (`frames.test.ts:47-51`). 🟢 Byte 7 is an output selector on LEDBLE-02 (`0` = all, `1`, `2`; `44bfd0f`); what `FF` and `00` mean on other ffe0 models is **unknown** (G2). 🔴

### Handshakes 🟢
- ffe0 `onConnect(name, now)`: `NEEDS_AUTH` (`^(LEDBLE|LEDDMX|LEDCAR|LED[_ ]BLE)`) → `[authFrame(now)]`, else `[]`.
- `authFrame(now, pwd = A1 23 45 67)`: `weekIndex = getDay() || 7`; `tb = ((weekIndex << 5) | getHours()) & 0xFF`; `2A 02 pwd… tb getMinutes() AF`. Verified: Wednesday 14:05 → `2A 02 A1 23 45 67 6E 05 AF`.
- bledim `onConnect` → `[serialCodeFrame(now)]` = `frame(0x89, [getSeconds(), getMilliseconds() & 0xFF])`.
- fff0: none.

### BLEDIM framing and memory 🟢 (`bledim.ts:23-100,155-290`)
1. `frame(cmd, payload)`: `out = [55, AA, seq++ & FF, cmd, len>>8, len & FF, ...payload.map(byte), sum]`, where `sum = Σ out[0..n-2] & FF`.
2. `stateFor(name)` lazily creates `{speed:192, brightness:255, strobe:0}` per **advertised name**.
3. `speedBrightness(name)` = `frame(0x88, [FF /*free scene*/, 1 /*commit*/, speed, brightness, strobe, 0])`.
4. `staticScene(r,g,b,w)` = `frame(0x82, p)`, 72-byte `p`: `p[1]=192, p[2]=255, p[3]=1, p[16..19]=[w,r,g,b]`, the rest 0 (`p[14]=0`, no effect).
5. Builders:
   - `rgb()` sets `color` and returns a static scene;
   - `white(v)` returns `staticScene(0,0,0,from100(v))` **without touching `color`**;
   - `brightness(v)` sets `brightness`, then rescales `color` (when set) into a static scene, or else returns `speedBrightness`;
   - `speed(v)` sets `speed` and returns `speedBrightness`;
   - `effect()` / `customEffect()` clear `color`;
   - `power(on)` returns `frame(0x80, [on?1:0])`.

## Alternative Flows
- **Out-of-range input** 🟢: clamped and rounded by `pct`/`byte`/`clamp`; never throws.
- **Unknown ffe0 sub-model** 🟢: falls to `ble`; caps and effects follow the `ble` layout.
- **Name that matches no driver** 🟢: `driverFor` returns `undefined`; `addDevice` falls back to bledim as the guess, and the GATT probe corrects it.
- **White after a colour on BLEDIM** 🟢: the white scene is sent, but `color` still holds the previous RGB, so a later brightness change brings that RGB back (SM-3). 🟡 Probably unintended.
- **Two devices named BLEDIM** 🟢: they share speed, brightness and colour memory (F3).

## Dependencies
- `effects.ts` (generated by `tooling/`) for the tables and colour orders.
- No runtime dependency on the browser, Svelte or the store: pure TypeScript, runnable under `node --experimental-strip-types`.
- Consumers: `device-connection/` (registry, services, handshakes), `device-control/` (builders, caps, outputs, strip and channel helpers), `effects/`, `custom-effects/`, `scenes/`, `tooling/difftest`.

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| Drivers are pure byte builders; all I/O lives in `ble.svelte.ts` | `types.ts:34-37`, `adrs/002` | 🟢 |
| Registry order puts bledim before fff0 | `index.ts:9-11` | 🟢 |
| One ffe0 driver with 7 layouts instead of 7 drivers | `ffe0.ts:20-36` | 🟢 |
| Outputs derived from the model name | `ffe0.ts:52-75`, `adrs/008` | 🟢 |
| BLEDIM protocol from a memory dump plus the decompiled app | `adrs/005` | 🟢 |
| BLEDIM static colour as a scene | `bledim.ts:203-213`, `adrs/010` | 🟢 |
| Constants and quirks commented with the vendor's reasoning | throughout | 🟢 |

## Internal State
- bledim: module-global `seq` and `states: Map<name, DeviceState>` (never cleared). 🟢
- fff0, ffe0: stateless. 🟢

## Observability
None (pure functions). Verified by `frames.test.ts` and the difftest. 🟢

## Risks and Gaps
- 🔴 **G2** (owner, 2026-10-26: owns a LEDBLE-00 and a LEDBLE-01, does not remember which has two outputs; one output is RGB, the other addressable): the meaning of the byte-7 defaults (`00` for power, `FF` for the rest) on ffe0 models other than LEDBLE-02 / LEDCAR-02; the owner sees "the same colour on everything". This needs the Debug channel sweep on the owner's controller.
- 🟢 **F3:** bledim memory is keyed by name, so same-named devices share it. Key it by device id: pass the id, or keep the state in the caller.
- 🟢 **F4:** the impure `customEffect` probe (see `custom-effects/`).
- 🟢 **F11:** dead exports `passwordQueryFrame`, `readInfoFrame`, `audioSenseFrame`; `hasChannels` is unread.
- 🟢 **BR-CT8 / BR-CE10:** no channel on white, cct or custom effect.
- 🟡 **F7:** the difftest skips `variant` and `LEDBLE-03` (see `tooling/`).
- 🟡 BLEDIM `white()` does not update `color` (SM-3).
- 🟡 `seq` is shared across every BLEDIM; harmless while the device ignores it.
