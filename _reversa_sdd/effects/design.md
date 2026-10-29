# Built-in Effects, Technical Design

> Reversa Writer · 2026-10-26 · unit `effects` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/protocol/effects.ts`, `fff0.ts:44-88`, `ffe0.ts:150-174,264-294`, `bledim.ts:60-145,247-250`, `src/lib/ui/DeviceCard.svelte:37-52,102-120,260-306`, `src/lib/protocol/frames.test.ts:28-60,113-230`

## Interface

### Types 🟢 (`types.ts`)

| Symbol | Shape | Notes |
|---|---|---|
| `Effect` | `{ id: number, name: string, group?: string }` | `id` is the vendor's wire id (0..255); `group` exists only on MELK |
| `Caps.effects` | `boolean` | True on every family today |

### Driver members 🟢

| Symbol | Signature | Returns | Notes |
|---|---|---|---|
| `Driver.effects` | `(name, variant?)` | `Effect[]` | Pure: table choice only |
| `Driver.effect` | `(e: Effect, name, ch?, variant?)` | `Uint8Array` | fff0 and ffe0 are pure; **bledim mutates its per-name state** (clears `color`) |

### Tables 🟢 (`effects.ts`, generated; default export bundles them)

| Table | Entries | Groups | Used by |
|---|---|---|---|
| `melk` | 241 | Basic, Curtain, Flow, Run, RunBack, Scenes, Tail, Trans, Water | fff0, names starting `MELK-` |
| `elk` | 29 | — | fff0, `ELK`/`XSL`/`CLK` (ids already in `0x80..0x9C`) |
| `ledble` | 23 | — | ffe0 `ble` layout (default) |
| `ledcar` | 23 | — | `LEDCAR-01` RGB (`variant 'ble'`), every other `LEDCAR` |
| `leddmx` | 211 | — | `LEDCAR-01` SPI (`variant 'dmx'`), `dmx`, `dmxs` layouts |
| `ledlike` | 8 | — | `like` layout |
| `ledpho` | 16 | — | `pho` layout |
| generated "Modo 1..16" | 16 | — | `smart`, `sun` layouts (`ffe0.ts:167-171`) |
| generated "M1..M13" | 13 | — | bledim (`bledim.ts:102-108`) |

`rgbOrders` (12) and `rgbOrdersDmx02` (6) live in the same file but are colour-order lists for the strip setup (see `device-control/`), not effects.

### UI 🟢 (`DeviceCard.svelte`)

| Symbol | Kind | Definition |
|---|---|---|
| `builtIn` | `$derived<Effect[]>` | `conn.driver.effects(conn.name, variant)` |
| `groupNames` | `$derived<string[]>` | distinct, truthy `builtIn[].group` in first-seen order |
| select value | string | `''` none · `__new__` new custom · `b:<index into builtIn>` · `c:<customEffectId>` |
| `chooseEffect(e)` | handler | see Main flow |

## Main Flow

### Rendering the select 🟢 (`DeviceCard.svelte:260-306`)
1. Shown only when `caps.effects`.
2. Current value:
   - `look.customEffectId` set → `c:<id>`;
   - `look.effect` set → `b:<builtIn.findIndex(e => e.id === look.effect.id && e.group === look.effect.group)>`;
   - otherwise `''`.
3. Options, in order:
   1. "none" (`''`).
   2. When `supportsCustom`: an optgroup "My effects" with every `store.customEffects` entry (only when non-empty), then "New effect…" (`__new__`).
   3. Built-ins: when `groupNames` is non-empty, one `optgroup` per group holding its entries; otherwise one `optgroup` "Built-in" with every entry. The option value is `b:<index>`.
4. When `!supportsCustom`, a hint `custom.unsupported` shows under the select.

### Choosing an effect 🟢 (`DeviceCard.svelte:102-120`)
1. `v = select.value`.
2. `__new__` → `onEditCustom()` (opens the editor, see `custom-effects/`); stop.
3. `''` → stop (nothing sent).
4. `kind = v[0]`, `rest = v.slice(2)`.
5. `kind === 'b'`: `fx = builtIn[Number(rest)]`; stop when missing; `await applyTo([dkey], (d,n,c,v) => d.effect(fx, n, c, v))` with **no coalescing key**; then `setLook(dkey, { effect: fx, customEffectId: undefined })`.
6. Otherwise (`c`): run the custom effect (see `custom-effects/`).

### Table selection 🟢
**fff0** (`fff0.ts:44-47`): `isMelk(name) ? melk : elk`.

**ffe0** (`ffe0.ts:150-174`), first match wins:
1. `/^LEDCAR-01/i`: `variant === 'ble' ? ledcar : leddmx`. With no variant (should not happen: LEDCAR-01 always has 2 outputs), it falls to `leddmx`.
2. `/^LEDCAR/i`: `ledcar`.
3. `layoutFor(name, variant)`:
   - `dmx`, `dmxs` → `leddmx`
   - `like` → `ledlike`
   - `pho` → `ledpho`
   - `smart`, `sun` → `[{id: i, name: 'Modo ' + (i+1)}]` for `i` in 0..15
   - otherwise → `ledble`

**bledim**: the constant 13-entry list `{ id: i, name: 'M' + (i+1) }`.

### Frame building 🟢

**fff0** (`fff0.ts:80-88`), 9 bytes, `id = byte(e.id)`, output ignored:

| Condition | Frame |
|---|---|
| `e.group === 'Scenes'` | `7E 05 31 id 07 FF FF 01 EF` |
| MELK | `7E 05 03 id 06 FF FF 00 EF` |
| ELK / XSL / CLK | `7E 05 03 id 03 FF FF 00 EF` |

**ffe0** (`ffe0.ts:264-294`), 9 bytes, `id = byte(e.id)`, `F = FF`, `ch` = output channel byte or `F`:

| Layout | Frame | Carries `ch` |
|---|---|---|
| `dmxs` | `7B 03 id F F F F ch BF` | yes |
| `dmx` | `7B F 03 id F F F F BF` | no |
| `smart` | `7D 02 05 id F F F F DF` | no |
| `sun` | `7A 06 id F F F F F AF` | no |
| `like` | `70 F id F F F F F 0F` | no |
| `pho` | `72 08 id F F 00 00 00 2F` (PHO_GROUP) | no |
| `ble`, name `LEDBLE-03` | `7E 03 id 00 F F F F EF` | no |
| `ble` (default) | `7E F 03 id 03 F F ch EF` | yes |

**bledim** (`bledim.ts:117-145,247-250`):
1. `delete stateFor(name).color` (switches the driver memory to effect mode, SM-3).
2. `sceneFrame(name, e.id)` builds a 72-byte payload `p` of zeros, then sets:
   - `p[0] = 0` (fade off)
   - `p[1] = state.speed` (default 192)
   - `p[2] = state.brightness` (default 255)
   - `p[3] = 1` (one colour entry)
   - `p[4] = 0` (scene slot)
   - `p[6] = state.strobe` (default 0)
   - `p[14] = (clamp(id, 0, 0x7F) | 0x80) & 0xFF` (chase bit)
   - `p[16..19] = [W=0, R=255, G=255, B=255]`
3. `frame(0x82, p)` → `55 AA seq 82 00 48 p… sum` (79 bytes, chunked into 20-byte writes by `device-control/`).

## Alternative Flows
- **Selected index no longer exists** 🟢 (e.g. the table changed between releases): `builtIn[index]` is undefined and nothing is sent. On render, a look effect not found gives `findIndex = -1` → value `b:-1`, which matches no option, so the select shows its first option.
- **Same id, different group on MELK** 🟢: matching uses id and group, so the right option is selected.
- **Write fails** 🟢: `applyTo` swallows the error; the look is still updated (F9).
- **Device offline** 🟢: `applyTo` reconnects first.
- **Effect on BLEDIM then the brightness slider** 🟢: brightness sends `0x88` (`speedBrightness`) because `color` was cleared.

## Dependencies
- `device-control/`: `applyTo`, the queue, chunked writes, `setLook`.
- `protocol-drivers/`: `layoutFor`, `isMelk`, the frame helpers `f`/`frame`, `byte`, `clamp`, BLEDIM `stateFor`.
- `persistence/`: `look.effect` (whole `Effect` object stored), `look.customEffectId`.
- `custom-effects/`: shares the select (`c:` options, `__new__`, `supportsCustom`).
- `tooling/`: generates `effects.ts` from `docs/protocol/*.tsv`.

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| Effect tables generated from vendor TSVs, never hand-edited | `effects.ts:1` | 🟢 |
| Table chosen per output on LEDCAR-01 | `ffe0.ts:151-157` | 🟢 |
| `setRgbMode` instead of `setMode` on the `ble` layout | `ffe0.ts:288-291` | 🟢 |
| BLEDIM effects sent as whole scenes, not ids | `bledim.ts:117` | 🟢 |
| Nameless tables exposed as numbered entries | `ffe0.ts:168-171`, `bledim.ts:102-104` | 🟢 |
| The look stores the whole `Effect` object, not just the id | `DeviceCard.svelte:114` | 🟢 |
| No effect broadcast | `Effects.svelte:50-52` | 🟢 |

## Internal State
- Stateless for fff0 and ffe0. 🟢
- bledim: `states: Map<advertisedName, {speed, brightness, strobe, color?}>`; `effect()` deletes `color`. This is module-global and keyed by name, so two BLEDIMs share it (F3). 🟢
- Per endpoint: `look.effect`, `look.customEffectId` (persisted, see `persistence/`). 🟢

## Observability
- None beyond the card summary (`look.effect.name`). 🟢

## Risks and Gaps
- 🟢 **F1 (owned by `scenes/`):** scene replay drops the variant, so a LEDCAR-01 RGB effect is replayed through the `dmx` envelope with a `ledcar` id. That plays the wrong effect.
- 🟢 **F6:** "Modo N" labels are hardcoded in Portuguese.
- 🟢 **F3:** BLEDIM effect state is shared by every device named `BLEDIM`.
- 🟡 **F7:** the difftest never exercises the `LEDBLE-03` shift or the LEDCAR-01 `ble` variant, so those two effect paths are checked only by hand-written tests.
- 🟡 **G5:** BLEDIM effects have not been tried on hardware.
- 🟡 Storing the whole `Effect` (with name) in the look means a renamed table entry keeps showing the old name until it is picked again.
- 🟡 The select resets to the first option on `b:-1`; because "none" is the first option this is harmless, but it hides the stale look.
