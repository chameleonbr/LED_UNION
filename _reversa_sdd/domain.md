# Domain — LED UNION

> Reversa Detective · 2026-10-24 · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: the code, the commit history (37 commits, 2026-09-04 → 2026-09-06), `README.md`, `docs/protocol/`
> Incremental re-extraction · 2026-11-01 · covers `374da11..56af9f9` (features 001 iPixel phase 1, 002 panel content, reconnect fix PR #6)

## Purpose 🟢
**One app for every Bluetooth LED controller you own.** The vendor apps (Magic Lantern, Lotus Lantern, LED+LAMP, BLEDIM) each speak one family and control one device at a time, and none of them is maintained. LED Union adds:
- **many devices at once**: one, several, all of them, or a named group;
- **per-output control**: one controller can feed several lights;
- **scenes** that replay a saved state across many devices.

It is a PWA with no install, no account and no backend.

Primary scenario 🟡: car and home lighting. The commits mention "Car · strip + door handle", a door sill and walking back to the car and hitting a scene.

## Glossary

| Term | Meaning | Code |
|---|---|---|
| **Controller / device** | A BLE peripheral driving LEDs, identified by the browser's `BluetoothDevice.id` | `SavedDevice`, `Conn` |
| **Advertised name** | The BLE name the device broadcasts (e.g. `LEDBLE-02-xx`, `MELK-OC`). **The only model identifier**, and never user-editable | `name` |
| **Label** | The user's display name for a device or output | `label`, `labels[key]` |
| **Family / driver** | One protocol (one `Driver`): `bledim`, `fff0` (ELK/MELK), `ffe0` (LED+LAMP), `ipixel` (iPixel Color pixel panels) | `protocol/*` |
| **Layout** | The byte envelope inside the ffe0 family: `ble, dmx, dmxs, smart, sun, like, pho` | `layoutFor` |
| **Output** | A physical light fed by one controller, e.g. LED1/LED2 or RGB/SPI | `DriverOutput` |
| **Channel byte** | An output selector byte inside the frame (LEDBLE-02, LEDCAR-02) | `DriverOutput.ch` |
| **Variant** | An output selected by switching the whole frame envelope (LEDCAR-01: `ble`=RGB, `dmx`=SPI strip) | `DriverOutput.variant` |
| **Logical device / endpoint** | A whole controller (single light) or one of its outputs. This is the unit of control | endpoint key |
| **Endpoint key** | `deviceId` or `deviceId#i`, where `i` is the **index** into the model's outputs | `endpoint.ts` |
| **Selection** | The endpoint keys ticked on the Devices tab, used to save and re-select groups. Intended to target the next command, but no command reads it today (F15). The scene form on the Effects tab keeps its own `picked` list | `selection.ids` [external review R05] |
| **Group** | A named, saved selection | `Group` |
| **Look** | The **last command sent** to an endpoint (power, colour, brightness, speed, effect). Not a reading | `Look` |
| **Scene** | A named snapshot of the looks of chosen endpoints, re-applied on demand | `Scene` |
| **Effect (built-in)** | A firmware animation picked by id from the family's table | `Effect`, `effects.ts` |
| **Custom effect** | A user-built colour sequence (≤14 colours, jump or fade, speed) uploaded to the controller | `CustomEffect` |
| **Palette** | The user's list of saved colours; 8 are seeded | `SavedColor` |
| **Handshake** | Frame(s) some families need right after connecting (ffe0 `2A` auth, BLEDIM `0x89` serial code) | `onConnect` |
| **Addressable strip / SPI** | A pixel strip that needs a wiring configuration (pixel count, colour order, direction) | `StripConfig`, `spiConfigFrame` |
| **Channel mode (BLEDIM)** | How a BLEDIM is wired: 1 DIM, 2 CCT, 3 RGB, 4 RGBW | `channelMode` |
| **Coalescing** | Only the newest value of a slider stream is sent | `WriteQueue.pushLatest` |
| **Everything card** | Broadcast of power, colour and brightness to every endpoint | `Effects.svelte` |
| **Panel** | A pixel-matrix device (iPixel). Replies to queries, so its size (`PanelInfo`) and firmware (`mcu`) are read back and saved | `PanelInfo`, `SavedDevice.panel` |
| **Slot** | A numbered program store on a panel (1..100). Shown with `showSlot`; filled by an upload | `showSlot`, `Look.panel` |
| **Upload / window** | Content (PNG, GIF, text) sent to a slot as ≤12 KB (or 4 KB) windows, each ACKed before the next | `upload`, `windows` |
| **Library item** | A saved piece of panel content (image, GIF or text) with its source, fit and the slot it went to per device | `PanelItem`, IndexedDB `led-union-items` |
| **Stealth** | One tap turns every connected light off and snapshots each look; leaving restores them | `store.stealth`, `stealth.ts` |
| **Command trace** | In-memory log of every write, reply and link change, downloadable as JSON | `trace.ts`, `TraceEntry` |
| **Differential test** | Mechanical comparison of the TS frames with literals from the decompiled vendor Java | `tools/difftest` |

## Business rules

### Device identity and model knowledge
- **BR-01** 🟢 The advertised name is the source of truth for the model. All protocol decisions branch on it, so it is never edited. Users rename through `label`.
- **BR-02** 🟢 A name is only a *hint* for the family. The driver is confirmed by probing which GATT service and characteristic exist (commit `d6d08c7`: "advertised names are not reliable"). The confirmed driver id is persisted (`SavedDevice.driverId`) and preferred over the name guess on reload (`track`, `restore`).
- **BR-03** 🟢 A device is compatible if its family's service exposes **any** writable characteristic, not only the documented one. BLEDIM writes to FFF1, not FFF3 (`249749e`, `114847e`).
- **BR-04** 🟢 bledim is matched before fff0 (same service, different protocol). Clone BLE-UART names (`JDY-10`, `Ble_Light`) are deliberately not claimed. Driver order is `bledim, fff0, ffe0, ipixel`: an `LED_BLE_xx` name still guesses ffe0, and only the probe (service `00fa`) makes it ipixel.
- **BR-05** 🟢 **The model decides how many outputs a controller has, never the user** (`767e061`: "I was asking or guessing where the original app simply knows"). LEDBLE-02 and LEDCAR-02 have LED1/LED2 (channel byte); LEDCAR-01 has RGB and SPI (variant); every other model has a single light. Outputs can be renamed but not added or removed.
- **BR-06** 🟢 Each output of LEDCAR-01 uses its own effect table: `car_mode` (23) for RGB, `dmx_model` (211) for SPI. Sending one table's ids to the other plays the wrong effect.
- **BR-07** 🟢 Capabilities (white, CCT, scenes, RGB) follow the original app's name-based gating (see `code-analysis.md`).

### Commanding
- **BR-10** 🟢 Commands target **endpoints**. A command on a multi-output controller carries the output's channel byte or variant.
- **BR-11** 🟢 **Broadcast is limited to power, colour and brightness.** Effect ids differ per family, so broadcasting an effect would be arbitrary (README, `Effects.svelte`).
- **BR-12** 🟢 A command on an offline device reconnects it first, **unless stealth is on and the user declines to leave it** (`leaveStealth` in `applyTo`/`sendFrames`). Applying a scene while walking into the car "just works". When Chrome rejects a restored handle with "no longer in range", the connect waits up to 6 s for one advertisement (`watchAdvertisements`) and retries instead of forcing a re-pair (PR #6, confirmed on the owner's Android).
- **BR-13** 🟢 Writes to one device are serialized with a family-specific minimum gap (bledim 30 ms, ELK 5 ms, ffe0 50 ms). Concurrent writes get dropped or mangled. **A content upload is one queue op** that holds the device until every window is ACKed, rejected, timed out (6 s per window) or cancelled.
- **BR-14** 🟢 **The last slider value always lands.** Superseded values are dropped while queued (coalescing per output). The vendor apps instead discard writes inside the throttle window and lose the final value.
- **BR-15** 🟢 Ordered multi-frame uploads (custom effects, panel content windows) are never coalesced. A missing colour or window corrupts the content. Coalescing (`pushLatest`) stays for sliders only.
- **BR-16** 🟢 **White is an intent, not a channel** (`4af1427`). With a real W wire it drives the white channel; without one it sends r=g=b. Sending `[W,0,0,0]` to RGB-only hardware turned the strip off.
- **BR-17** 🟢 A static colour replaces the playing effect (look: effect cleared), and an effect replaces the static colour.
- **BR-18** 🟢 BLEDIM static colours must be sent as a scene (`0x82`). The live preview `0x81` does not survive a power cycle (`e632713`).
- **BR-19** 🟢 BLEDIM brightness scales the static colour when one is showing, and otherwise drives the effect brightness (`835a910`). BLEDIM speed only has a visible effect while an effect plays; that is device behaviour, not a bug.
- **BR-20** 🟢 A custom effect holds at most 14 colours (BLEDIM's limit, applied everywhere so that a sequence works on every family). Black is a valid colour: green → black → amber makes a strobe.
- **BR-21** 🟢 Families without a command never get a fake one. For example, there is no custom effect on ELK/MELK, SUN, LIKE or PHO, and no start-cycle frame on LEDSMART or LEDSTAGE.

### State and persistence
- **BR-30** 🟢 **The app records what it sent, not what the device is.** Most families give nothing back, and using the vendor app in between makes the look drift. The UI must not present the look as the device's state. Exceptions are facts, not looks: an iPixel panel's size and firmware are read back from its replies and saved. A panel's `look.panel.slot` is recorded only after the upload resolves (🟡 the last window's ACK may be `01` or `03`; the code does not insist on `03`).
- **BR-31** 🟢 A scene touches only the endpoints saved in it; everything else keeps doing what it was doing.
- **BR-32** 🟢 A scene is a snapshot: later changes to the lights do not change it.
- **BR-33** 🟢 Scene apply order is power → brightness → speed → colour → effect → panel slot, because the last one sent wins (`applyLook`).
- **BR-34** 🟢 Old-format scenes (one colour, no device) are dropped rather than applied to the wrong lights (`50de5fb`).
- **BR-35** 🟢 Forgetting a device removes everything keyed to it: looks, labels, stealth snapshot entries, scene entries, and scenes left empty. It is also removed from the live connection state, or it would come back on reload (`9ba40fe`).
- **BR-36** 🟢 The hardware wiring settings (BLEDIM channel mode, strip configuration) are saved **before or regardless of** the frame reaching the device: they describe the hardware, which stays true.
- **BR-37** 🟢 An empty palette is re-seeded. Having no palette at all is worse.
- **BR-38** 🟢 Storage failures never block a command (private mode leads to a clean in-memory state). The panel library (IndexedDB) is the same: a quota error shows "storage full" and the upload still goes out; the trace log dropping is silent.

### Panel content (feature 002)
- **BR-60** 🟢 Content is stored as a **file at exactly the panel's size**: PNG for one frame, GIF for several (one global palette), 1-bit glyphs for text. A one-frame GIF goes up as a PNG.
- **BR-61** 🟢 The owner picks the slot per send; the default is the item's last slot on that device, else the panel's last used slot + 1 (max 100).
- **BR-62** 🟢 An item is saved to the library before the upload and on close, so a failed first try does not lose the import.
- **BR-63** 🟢 Over 512 KB of encoded content is refused before sending (panel memory, not app limit).
- **BR-64** 🟢 On firmware major ≥ 5 the target slot is selected before the upload; silence is tolerated. A slot with no content does not answer `showSlot` (seen on mcu 317).
- **BR-65** 🟢 Text uses the legacy block (`sizeType RGB bitmap`) unless the firmware is in the new-format ranges; bits LSB-first by default, MSB-first only from a Debug switch.
- **BR-66** 🟢 GIPHY search uses the **owner's own key**, kept only in local storage and never logged (NFR-08); "Powered by GIPHY" is shown. Tenor is not offered (API shut down 2026-06-30).
- **BR-67** 🟢 Android "Share → LED Union" hands files or links to the Panel tab through the service worker (`share-target.js`); a shared link is fetched like an imported URL (CORS-dependent).

### Stealth and trace (feature 001)
- **BR-70** 🟢 Stealth turns every **connected** output off, snapshots each look first, and records `power:false`. A device that connects during stealth is turned off too and joins the snapshot.
- **BR-71** 🟢 While stealth is on, any command asks once to leave it; "no" sends nothing and records nothing.
- **BR-72** 🟢 Leaving stealth replays each snapshot look (missing power counts as on) and reports devices it could not reach.
- **BR-73** 🟢 Every write, reply, connect, disconnect and error goes to the trace (max 2000 entries, flushed at most once per second). Upload chunks are logged truncated. Losing the trace never affects a command.

### Locale
- **BR-40** 🟢 An explicit language choice beats the browser. An English browser does not imply English: any later Portuguese tag wins.
- **BR-41** 🟢 A missing translation falls back to English, then to the key. A raw identifier never shows unless the key is missing everywhere.

### Engineering policy (from commits and CI)
- **BR-50** 🟢 "The frame builders are the whole product; a red test must not reach the domain." CI runs tests and the type check before deploy.
- **BR-51** 🟢 The drivers are hand transcriptions of decompiled vendor apps and are checked mechanically against them (difftest), because hand-written tests only assert what the author understood.
- **BR-52** 🟢 Vendor APKs are not redistributed (`.gitignore`). Only the facts extracted from them live in `docs/protocol/`.
- **BR-53** 🟢 Confirmed on hardware: ffe0 (LEDBLE-00), and since 2026-11-01 the iPixel 32×32 (`LED_BLE_00203032`, mcu 317): size read-back, brightness, PNG/GIF/text upload, slot switch, GIPHY import. Earlier wording: only ffe0 (LEDBLE-00) has been **confirmed on hardware**. Every other family matches the vendor app's bytes but has never been tried on a device (README).

## Known violations of these rules (from the Archaeologist)
| Rule | Violation | Ref |
|---|---|---|
| BR-10, BR-06 | Scenes drop the variant, so the LEDCAR-01 RGB output is replayed through the SPI envelope. This is the same bug class that `e632713` fixed in the cards, left behind in Scenes. | F1 |
| BR-35 | Endpoint keys `id#i` remain in groups after a forget | F2 |
| `c13ed33` intent ("memory per device") | The state is keyed by advertised name, so two genuine BLEDIMs (both named `BLEDIM`) still share it | F3 |
| BR-30/32 | White, CCT and sound are never recorded in the look, so scenes cannot hold them | F5 |
| BR-41 | The Debug tab and BLE error messages are hardcoded in Portuguese | F6 |

## Gaps — answered by the owner (2026-10-24)
- **G1** 🟢 The README is out of date. `node tools/difftest/emit_ts_frames.ts` emits **259** frames today, which matches the commits (259/259), while the README says 221. That all 259 *match* the Java still cannot be re-verified without the decompiled trees (F8). → Update `README.md` and `tools/difftest/README.md`.
- **G2** 🟡 → **known defect.** The owner can control the outputs of their multi-output controller "with caveats": it often ends up **setting the same colour on everything**. This fits `44bfd0f` (byte 7 is an output selector outside LEDBLE-02; `FF` ≠ all) together with `outputsFor` modelling LEDBLE-00 as a single light, whose frames use `ch ?? FF`. → Needs a spec: model the outputs for the owner's LEDBLE model, and verify which byte-7 values reach which output.
- **G3** 🟢 Phone-audio (music) streaming is **out of scope for now, planned for the future**.
- **G4** 🟢 **Verified on hardware.** LEDCAR-01 works, including effects on the addressable strips.
- **G5** 🟢 **Partially verified.** The owner's headlight is a BLEDIM: static colours and changes work. Effects and the custom effect are **not tested**.
- **G6** 🟢 The **intent is device-level groups**: set colours and options on every member at once. The current implementation stores endpoint keys (selection), which gives the F2 count and forget issues. → Specs must define the group as a set of devices or endpoints that receives every command, not only "select".

## Gaps — still open 🔴
- None from the Detective. See G7 in `permissions.md` (answered: Debug stays as a debugging tool).
