# Data Dictionary — LED UNION

> Reversa Archaeologist · 2026-10-24 · all entries 🟢 CONFIRMED from code unless marked

## Storage

| Key | Where | Content |
|---|---|---|
| `led-union/v1` | `localStorage` | JSON `Persisted` (current key) |
| `led-onion/v1` | `localStorage` | Legacy key, read only when the current key is absent; never written |

The whole `Persisted` object is rewritten on every mutation (`save()`). There is no versioning beyond the key suffix. Old shapes are fixed up by `migrate()` (see `flowcharts/store.md`).

## Persisted entities (`src/lib/persist.ts`)

### Persisted (root)
| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| devices | SavedDevice[] | ✔ | `[]` | |
| groups | Group[] | ✔ | `[]` | |
| scenes | Scene[] | ✔ | `[]` | Entries without an `entries` array are dropped by migrate |
| looks | Record<EndpointKey, Look> | ✔ | `{}` | |
| labels | Record<EndpointKey, string> | ✔ | `{}` | User names for outputs |
| colors | SavedColor[] | ✔ | `seedColors()` (8) | Re-seeded when empty |
| customEffects | CustomEffect[] | ✔ | `[]` | |
| locale | string | – | absent | Absent means follow the browser |

### SavedDevice
| Field | Type | Req | Notes |
|---|---|---|---|
| id | string | ✔ | Web Bluetooth `BluetoothDevice.id` (browser-scoped, opaque) |
| name | string | ✔ | Advertised name; **drives every protocol decision; never edited** |
| label | string | – | User display name; empty string deletes it |
| driverId | string | ✔ | `bledim` \| `fff0` \| `ffe0` (as last resolved) |
| strip | StripConfig | – | Only on addressable models (`dmx`/`dmxs` layouts) |
| channelMode | number | – | BLEDIM wiring: 1=DIM 2=CCT 3=RGB 4=RGBW; UI default 3 |

### StripConfig
| Field | Type | Range | Notes |
|---|---|---|---|
| pixels | number | 1..65535 (UI clamp) | Sent big-endian in 2 bytes |
| order | number | id from `rgbOrders` / `rgbOrdersDmx02` | Colour channel order |

### Group
| Field | Type | Notes |
|---|---|---|
| id | string | `uid()` |
| name | string | trimmed, non-empty (UI) |
| deviceIds | string[] | ⚠️ Despite the name, these are **endpoint keys** copied from `selection.ids` (see finding F2) |

### Look (a record of what was last sent, not a device reading)
| Field | Type | Range | Notes |
|---|---|---|---|
| power | boolean | | |
| colorHex | string | `#rrggbb` | 0..255 per channel |
| brightness | number | 0..100 | UI default display 100 |
| speed | number | 0..100 | UI default display 50 |
| effect | Effect | | Built-in effect object (id, name, group) |
| customEffectId | string | | Refers to CustomEffect.id; cleared when that effect is deleted |

Setting a colour clears `effect` and `customEffectId`. Choosing an effect clears `customEffectId` (and the reverse). White, CCT and sound are **not** recorded (F5).

### SavedColor
| Field | Type | Notes |
|---|---|---|
| id | string | Seeded colours use their key as id (`red`…) |
| name | string | User colours: the typed name, or the hex when the name is blank |
| hex | string | `#rrggbb` |
| key | string? | Present only on seeded colours, so the name can be translated as `color.<key>` |

Seeds: red `#ff0000`, orange `#ff8800`, yellow `#ffdd00`, green `#00ff44`, cyan `#00ddff`, blue `#0044ff`, purple `#aa00ff`, white `#ffffff`.

### CustomEffect
| Field | Type | Range | Notes |
|---|---|---|---|
| id | string | | `uid()` |
| name | string | trimmed, non-empty | |
| colors | string[] | 1..14 entries of `#rrggbb` | The UI caps at 14 (BLEDIM MAX_COLOR_QTY); black is a valid colour |
| speed | number | 0..100 | Editor default 50 |
| fade | boolean | | true = cross-fade (`0xFE` on ffe0), false = jump (`0xFD`) |

Editor default colours: `#00ff00, #000000, #ffbb00` (green → black → amber, a strobe).

### Scene
| Field | Type | Notes |
|---|---|---|
| id | string | `uid()` |
| name | string | |
| entries | `{ key: EndpointKey, look: Look }[]` | `look` is a `structuredClone` snapshot taken at save time |

## Key format: EndpointKey (`src/lib/endpoint.ts`)
- `deviceId` means the whole device.
- `deviceId#i` means one output. **`i` is the index into `driver.outputs(name)`**, not the channel byte. The field is named `ch` in `parseEp`, and the `Scene` comment says `deviceId#channel`; both are misleading.
- Resolution: `outputAt(id, i)` → `{ ch?: channel byte, variant?: 'ble'|'dmx' }`.
- A non-numeric suffix is ignored, and the key resolves to the whole device.
- Coalescing keys in the queue are `${coalesceKey}:${i}`.

## Runtime entities (`src/lib/ble.svelte.ts`)

### Conn
| Field | Type | Notes |
|---|---|---|
| id | string | Device id |
| name | string | Advertised name (`'(sem nome)'` when the device has none) |
| label | string? | From SavedDevice |
| driver | Driver | Can change after `resolveDriver` |
| state | `'offline' \| 'connecting' \| 'online' \| 'error'` | |
| error | string? | Message from `explain()` |
| lastLinkMs | number? | How long the link stayed up before it dropped (Debug: < 3000 ms suggests a missing handshake) |

### Live (non-reactive)
`{ device: BluetoothDevice, char?: GATTCharacteristic, queue: WriteQueue }`

### Selection
`selection.ids: EndpointKey[]`. Not persisted.

## Protocol types (`src/lib/protocol/types.ts`)

| Type | Fields |
|---|---|
| Caps | rgb, white, cct, speed, effects, scenes: boolean |
| Effect | id: number, name: string, group?: string |
| DriverOutput | label: string, ch?: number, variant?: string (a model has either ch or variant, never both) |
| SoundSource | `'mic' \| 'music'` |
| CustomEffectSpec | colors: {r,g,b 0..255}[], fade: boolean |
| Layout (ffe0) | `ble \| dmx \| dmxs \| smart \| sun \| like \| pho` |

## Driver constants

| Driver | Service | Write char | minGapMs | chunk | withResp | Range |
|---|---|---|---|---|---|---|
| bledim | 0000fff0-… | 0000fff1-… | 30 | 20 | true | 0..255 |
| fff0 (ELK/MELK) | 0000fff0-… | 0000fff3-… | 5 | – | false | 0..100 |
| ffe0 (LED+LAMP) | 0000ffe0-… | 0000ffe1-… | 50 | – | false | 0..100 (dmx scales to 0..32) |

Base UUID: `-0000-1000-8000-00805f9b34fb`.

### ffe0 wire envelopes (9 bytes)
| Layout | Header | Trailer | Models |
|---|---|---|---|
| ble | 7E | EF | LEDBLE, LEDSTAGE, LEDLIGHT, LEDCAR-00, LEDCAR-01 (RGB) |
| dmx | 7B FF | BF | LEDDMX-00/01/03, LEDCAR-01 (SPI) |
| dmxs | 7B | BF | LEDDMX-02/04, LEDCAR-02 |
| smart | 7D | DF | LEDSMART |
| sun | 7A | AF | LEDSUN |
| like | 70 | 0F | LEDLIKE |
| pho | 72 | 2F | LEDPHO (+3 group bytes `00 00 00`) |

Auth frame: `2A 02 A1 23 45 67 <(weekIdx<<5)|hour> <minute> AF`.

### BLEDIM packet
`55 AA <seq> <cmd> <lenHi> <lenLo> <payload…> <sum8 of all preceding bytes>`

#### ScenePara (payload of cmd 0x82, 72 bytes)
| Offset | Meaning | staticScene | sceneFrame (effect) | customEffect |
|---|---|---|---|---|
| 0 | fade flag | 0 | 0 | fade?1:0 |
| 1 | speed 0..255 | 192 | state.speed | state.speed |
| 2 | brightness 0..255 | 255 | state.brightness | state.brightness |
| 3 | colour entry count | 1 | 1 | n (≤14) |
| 4 | scene slot | 0 | 0 | 0 |
| 6 | strobe | 0 | state.strobe | state.strobe |
| 14 | effect: low 7 bits = index, bit 7 = chase on; `0xFF` = none | 0 | `id \| 0x80` | `0xFF` |
| 16 + 4k | colour k: W, R, G, B | W,R,G,B | 0,r,g,b (default white) | 0,R,G,B |
| other | 0 | | | |

#### 0x88 SPEED_BRIGHTNESS payload
`[0xFF (free scene), commit 1|0, speed, brightness, strobe, 0]`

#### DeviceState (per **name**; see F3)
`{ speed: 192, brightness: 255, strobe: 0, color?: {r,g,b} }`

## Effect tables (`effects.ts`, generated)
| Table | Source TSV | Used by |
|---|---|---|
| melk | melk_effects.tsv (with group) | fff0 MELK |
| elk | elk_effects.tsv | fff0 non-MELK |
| ledble | ble_mode.tsv | ffe0 `ble` |
| ledcar | car_mode.tsv | LEDCAR-00/02, LEDCAR-01 RGB |
| leddmx | dmx_model.tsv (211) | `dmx`/`dmxs`, LEDCAR-01 SPI |
| ledlike | like_mode.tsv | `like` |
| ledpho | pho_mode.tsv | `pho` |
| rgbOrders | rgb_order.tsv | `dmx` strip config |
| rgbOrdersDmx02 | rgb_order_dmx02.tsv | `dmxs` strip config |
| (generated) | – | `smart`/`sun`: 16 × `Modo N`; bledim: 13 × `M1..M13` |
