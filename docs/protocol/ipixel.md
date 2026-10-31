# iPixel Color (`LED_BLE_*` pixel panels)

Derived from the decompiled `iPixel Color 3.8.1` (`com.wifiled.ipixels`), cross-checked
against `pypixelcolor` and `go-ipxl`. Paths below are relative to
`com/wifiled/ipixels/` unless they start with `blelibrary/`.

Legend: **[V]** read directly in the app code. **[X]** app code and at least one
reference agree. **[I]** inferred, not seen on hardware. **[R]** only in a reference,
not in the app.

This is a **pixel-matrix** protocol (text, images, GIFs, clock, a slot list), not a
colour-controller one. There is no "set colour", no effect-id table and no brightness
of an RGB strip. See the last section for what that means for the `Driver` interface.

## 1. Identification and transport

| item | value | source |
|---|---|---|
| service | `000000fa-0000-1000-8000-00805f9b34fb` | `core/BleManager.java:357`, `:685`; built by `blelibrary/ble/utils/UuidUtils.java:25-30` from `"00fa"` **[V]** |
| write char | `0000fa02-0000-1000-8000-00805f9b34fb` | `core/BleManager.java:357`, `:685` **[V]** |
| notify char | `0000fa03-0000-1000-8000-00805f9b34fb` | refs: `pypixelcolor/lib/constants.py`, `go-ipxl/consts.go` **[R]**. The app never names it: it enables notifications on **every** char of service `00fa` that has the notify or indicate property (`blelibrary/ble/BleRequestImpl.java:620-650`, `:559-583`) **[V]** |
| CCCD | `0x2902` | `blelibrary/ble/Options.java:33` |
| name filter | name **contains** `LED_BLE` | `core/BleManager$bleScanCallback$1.java:59` **[V]** |
| second path | manufacturer data, company id `21586` (`0x5452`), `manufacturerData[1] == 114` (`0x72`), for devices without that name | `core/BleManager$bleScanCallback$1.java:64-65` **[V]** |
| scan UUID filter | none in foreground; service `00fa` only when the app is backgrounded | `blelibrary/ble/scan/BluetoothScannerImplLollipop.java:86-99` **[V]** |
| write type | never set (`writeCharacteristic` after `setValue`) | `core/BleManager.java:579-598` **[V]**; refs use write-with-response **[R]** |
| MTU | requests `512` right after notify is enabled | `core/BleManager.java:226` **[V]** |
| chunk size | `509` bytes, hard-coded, applied whatever MTU was granted. Before the MTU callback it is `20` | `core/BleManager.java:89-90`, `:233`; split in `core/SendBleDataThread.java:64-85` **[V]** |
| chunk pacing | strictly serial: next chunk is written only after the previous `onCharacteristicWrite`; wait up to `6000` ms; 3 failures drop the whole queue | `core/BleManager.java:88`, `core/SendBleDataThread.java:180-215` **[V]** |
| ref chunking | `pypixelcolor` 244 B, `response=True`; `go-ipxl` none | `pypixelcolor/lib/transport/send_plan.py:63,145` **[R]** |
| second device | `BleManager2` / `SendBleDataThread2` are the same code with a second connection slot. No protocol difference | diff of `core/BleManager2.java` vs `BleManager.java` **[V]** |

Frames are not padded or wrapped for the radio: a frame, or a whole upload window, is
cut into consecutive chunks and written in order.

### Connect sequence the app performs

| step | what | source |
|---|---|---|
| 1 | GATT connect, service discovery, `isReady = true`, enable notify | `core/BleManager.java:124-134` |
| 2 | request MTU 512 (after notify is enabled) | `core/BleManager.java:218-236` |
| 3 | send **device info query** (section 3) with a 5 s timer; on timeout the app disconnects ("10021") | `ui/ChooseActivity.java:1225-1260`, `:1280-1300` |
| 4 | parse type from reply byte 4, set panel size and window size | `ui/ChooseActivity.java:1796` (`setLedType`) |
| 5 | send **HW info query** `04 00 05 80`, learn MCU version | `utils/OtaUpData.java:80-98` |
| 6 | send **week sync** `05 00 12 80 <dow>` | `ui/ChooseActivity.java:1320`, `core/send/BaseSend.java:262` |
| 7 | only if `reply[10] == 1`: password verify (section 3) | `ui/ChooseActivity.java:1752-1790` |

There is **no mandatory handshake** before ordinary commands. Nothing in the code gates a
write on step 3 beyond the app's own UI flow. **[I]** whether the firmware ignores
commands until the clock/week sync has happened.

## 2. Framing

Every command frame:

```
[len_lo] [len_hi] [cmd] [type] [payload ...]
```

| field | meaning | evidence |
|---|---|---|
| `len` | u16 LE, **total frame length including these two bytes** | `core/send/BaseSend.java` literals, `core/SendCore.java:288-289` **[V]** |
| `cmd` | command id | |
| `type` | `0x80` for device-level queries and settings, `0x01` for most mode/state commands, `0x02` for rhythm | literals in `BaseSend.java` **[V]** |
| checksum | none on short commands | **[V]** |

Short commands are written whole in one write. `pypixelcolor` calls byte 1 "reserved";
it is just the high byte of the length.

### Content frames (image, GIF, text, template): the "window" scheme

Content is sent as one or more **windows**. Each window is one frame with a 15-byte
header, written in 509-byte chunks, and then the app **waits for an ACK notification
before sending the next window**.

```
off  size  field
0    2     len        u16 LE = 15 + window payload length
2    2     data type  see table
4    1     option     00 first window, 02 every later window
5    4     total size u32 LE, length of the WHOLE content (all windows)
9    4     crc32      u32 LE, CRC32 of the WHOLE content (same in every window)
13   1     sub-type   00 image/text, 02 GIF
14   1     slot       target slot, see section 5
15   n     payload    this window's slice of the content
```

Source: `core/SendCore.java:257-369` (`payloadChannel`), `getDataType` at `:420`,
`shouldCrc` at `:84` **[V]**. Header layout and the repeated total/CRC agree with
`pypixelcolor/commands/send_image.py` `_build_send_plan` **[X]**.

| content | data type bytes | sub-type (off 13) | `shouldCrc` | source |
|---|---|---|---|---|
| image (PNG file bytes, see 5) | `02 00` | `00` | yes | `SendCore.java:420-439` |
| GIF (GIF file bytes) | `03 00` | `02` | yes | `:420-439`, `:319-350` |
| text | `00 01` | `00` | yes | `:420-439` |
| template / sub-zone | `04 00` | n/a | yes | `:420-439` |
| video | `01 00` | n/a | yes | `:420-439` |
| raw live frame ("camera") | `00 00` | n/a | **no**, 9-byte header | `:192-231`, `:452-572` |
| DIY paint | `05 01` | n/a | **no**, 5-byte header | `:192-231`, `:986-1014` |

CRC is standard CRC32 (refs use `zlib.crc32` / `crc32.ChecksumIEEE` and interoperate) **[X]**.
Little-endian helper: `blelibrary/ble/utils/ByteUtils.java:99` (`int2byte`) **[V]**.

**Window size** = `AppConfig.ledFrameSize` (`AppConfig.java:89`, `:149`):

| panel | window payload |
|---|---|
| default | `4096` |
| device-info type byte `0x80`, `0x81`, `0x00`, or HW-info MCU major `2` | `12288` |

Set in `ui/ChooseActivity.java:1796-1822` and `:1311` **[V]**. `pypixelcolor` and
`go-ipxl` always use 12 KB **[R]**; the app uses 4 KB for every panel except the 64x64
and 32x32 ones. See open questions.

### ACK frames (notifications)

Always 5 bytes: `05 00 <type0> <type1> <status>`, where `type0 type1` echo the data
type of the window just sent. Whitelist in `core/SendCore.java:80`:

| frame | meaning |
|---|---|
| `05 00 02 00 01` | image: window stored, send next |
| `05 00 02 00 03` | image: all windows stored, done |
| `05 00 03 00 01` / `05 00 03 00 03` | GIF: next / done |
| `05 00 04 00 01` / `05 00 04 00 03` | template: next / done |
| `05 00 00 01 01` / `05 00 00 01 03` | text: next / done |
| `05 00 00 00 02` | raw frame: no space |
| `05 00 00 80 01` / `05 00 00 80 03` | device-level ok / done |
| `05 00 11 80 01` / `05 00 11 80 00` | schedule set ok / fail |

Status byte (`ack[4]`), handled in `core/SendCore$sendDataInner$sendDataCallback$1.java:48-90` and
`ui/control/BusinessControlModel.java:640-660`:

| status | app behaviour |
|---|---|
| `01` | send the next window (progress += 1) |
| `03` | upload finished and stored |
| `00` | "command invalid": app aborts with error 10017. The notify handler also counts it as a CRC fault (`core/BleManager.java:188-195`) |
| `02` | "no space": app aborts with error 10016 |

App timeouts: in `sendDataInner` a 3 s timer re-sends the window twice and errors on the third tick
(`SendCore.java:2111-2290`), 8 s overall guard in `sendChannelImageData` (`:606-660`).
`pypixelcolor` waits 8 s per window and treats `00` as "continue"; the app treats it as
an error **[R]** (divergence).

## 3. Device info

### Query (sent on connect)

```
08 00 01 80 <HH> <MM> <SS> <lang>        core/SendCore.java:1564
09 00 01 80 <HH> <MM> <SS> <lang> <dow>  only for cid 0001 and pid 54/55/...  :1562
```

`lang` = `01` when the app language contains `zh`, else `00`
(`ui/ChooseActivity.java:1243`). `HH MM SS` are the phone's local time **[V]**. This is
also the clock sync. `pypixelcolor/lib/internal_commands.py:16-35` sends the 8-byte form
with `lang = 0` **[X]**.

### Reply

Any notification long enough is accepted; the app reads only:

| offset | meaning | source |
|---|---|---|
| `[4]` | device type byte (table below) | `ui/ChooseActivity.java:1751` **[V]** |
| `[10]` | password flag, `01` = device is password protected. Absent when reply is shorter than 11 bytes | `ui/ChooseActivity.java:1752-1754` **[V]** |

Other bytes are unread by the app. **[I]** the reply starts `?? 00 01 80` like the query.

### Device type byte to panel

`ui/ChooseActivity.java:1796-1980` turns the byte into an app "led type" (0..35), and
`AppConfig.java:84` holds the size table (width x height, indexed by led type) **[V]**.
Names in `LedType.java` agree with the table.

| type byte | led type | W x H | notes |
|---|---|---|---|
| `0x00` | 0 | 64 x 64 | wifi-capable board, window 12288 |
| `0x80` | 0 | 64 x 64 | window 12288 |
| `0x81` | 2 | 32 x 32 | window 12288. With cid `0001` pid `55`: led type 21, 32 x 32 (mecha) |
| `0x82` | 4 | 32 x 16 | With cid `0001` pid `56`: led type 22, 32 x 16 (mecha) |
| `0x83` | 3 | 64 x 16 | |
| `0x84` | 1 | 96 x 16 | |
| `0x85` | 5 | 64 x 20 | |
| `0x86` | 6 | 128 x 32 | text height 32 |
| `0x87` | 7 | 144 x 16 | |
| `0x88` | 8 | 192 x 16 | |
| `0x89` | 9 | 48 x 24 | With cid `0001` pid `57`: led type 23, 48 x 24 (mecha). Text height 24 |
| `0x8A` | 10 | 64 x 32 | |
| `0x8B` | 11 | 96 x 32 | |
| `0x8C` | 12 | 128 x 32 | |
| `0x8D` | 13 | 96 x 32 | |
| `0x8E` | 14 | 160 x 32 | |
| `0x8F` | 15 | 192 x 32 | |
| `0x90` | 16 | 256 x 32 | image upload sends raw RGB instead of PNG for this type (`ui/gallery/ImageFragment.java:957`) |
| `0x91` | 17 | 320 x 32 | |
| `0x92` | 18 | 384 x 32 | |
| `0x93` | 19 | 448 x 32 | |
| `0x94` | 20 | 16 x 16 | mecha, text height 16 |
| `0x95` | 24 | 64 x 64 | "new" 64x64 |
| `0x96` | 25 | 96 x 64 | |
| `0x97` | 26 | 128 x 64 | |
| `0x98` | 27 | 160 x 64 | |
| `0x99` | 28 | 192 x 64 | |
| `0x9A` | 29 | 256 x 64 | |
| `0x9B` | 30 | 320 x 64 | |
| `0x9C` | 31 | 384 x 64 | |
| `0x9D` | 32 | 448 x 64 | |
| `0x9E` | 33 | 512 x 64 | |
| `0x9F` | 34 | 576 x 64 | |
| `0xA0` | 35 | 640 x 64 | |
| other | | | app disconnects (end of `setLedType`, `ChooseActivity.java`) |

The app does the mapping with signed bytes (`-127` etc.); the hex column is the same
value as unsigned. `pypixelcolor`/`go-ipxl` cover only `0x80..0x93` **[R]**.

### HW info (MCU version)

```
query   04 00 05 80
reply   08 00 05 80 <mcu_major> <mcu_minor> <wifi_major> <wifi_minor>   utils/OtaUpData.java:80-98
```

`mcuVersion = int(str(major) + two_digit(minor))`, e.g. `18`,`9` gives `1809`. `major`
is stored as `AppConfig.mcu`. Used for: `mcu > 4` gates slot handling (section 5);
`mcu == 2` means wifi board; `mcuVersion` in `1809..1899`, `1412..1499`, `2100..2699`,
`2800..5999` selects the **new text encoding** (section 5)
(`ui/text/TextActivity.java:1951-1965`) **[V]**.

### Password (only when `reply[10] == 1`)

```
verify  07 00 05 02 <p0> <p1> <p2>          core/send/BaseSend.java:308
set     08 00 04 02 <flag> <p0> <p1> <p2>   core/send/BaseSend.java:289
reply   05 00 05 02 01                       = ok   (ui/ChooseActivity$verifyPwd$1$1.java:34-36)
```

The 6-digit string is cut into pairs, each parsed as a decimal byte (`"12"` becomes
`0x0C`). Some boards (cid `0035`/pid `01`, cid `0001`/pid `130`) use 4 digits and pad
`<p2>` with `00` **[V]**.

## 4. Simple controls

All literals from `core/send/BaseSend.java` unless noted.

| function | frame | line | notes |
|---|---|---|---|
| power | `05 00 07 01 <1\|0>` | `:442` (`sendLedOnOff`) | **[X]** `pypixelcolor/commands/set_power.py` |
| brightness | `05 00 04 80 <v>` | `:242` (`setLedLight`) | `v` 0..100. The app slider floors at 10 and sends at most every 100 ms (`ui/text/TextEffectFragment$bindListener$2$1.java:36-47`) **[V]**. **[X]** `set_brightness.py` |
| orientation | `05 00 06 80 <0..3>` | `:337` (`setUpsideDown`) | UI offers 0, 1, 2, 3 (`ui/settings/SettingsMainFragment.java:880-897`). **[X]** `set_orientation.py` |
| delete ALL stored content | `04 00 03 80` | `:206` (`deleteAllData`) | **not a screen clear.** `pypixelcolor` calls it `clear`. Used by "delete all" in settings/channel list |
| exit current mode | `04 00 01 01` | `SendCore.java:1068` (`sendExitCmd`) | |
| week sync | `05 00 12 80 <dow>` | `:262` | day-of-week from `DateUtils.getWeekOfDate` **[I]** 1..7 |
| time sync | in the device info query (section 3) | | `pypixelcolor` also has `08 00 01 80 h m s 00` as `set_time` **[R]** |
| fun / DIY mode | `05 00 04 01 <mode>` | `:464` (`setDiyFunMode`) | `0` quit, discard, keep previous; `1` enter, clear current; `2` quit, keep current shown; `3` enter, do not clear (`ui/diy/DiyImageFun.java:13-16`). **[X]** `set_fun_mode.py` sends 0/1 |
| set pixel | `0A 00 05 01 00 <R> <G> <B> <x> <y>` | `SendCore.java:986-1014` | DIY paint, data type `05 01`, no CRC. The `option` byte (off 4) is `DiyImageMoveType`: `0` none, `1` h-mirror, `2` v-mirror, `3` move whole image (payload = direction numbers), `4` erase (`ui/diy/DiyImageMoveType.java`). With several points, payload is `R G B` followed by one byte per coordinate, **[I]** x then y pairs. **[X]** `set_fun_mode.py` `set_pixel`. x and y are single bytes, so this cannot address columns >= 256 |
| text speed | `05 00 03 01 <speed>` | `SendCore.java:1057` | standalone; the UI puts speed in the text header instead |
| clock mode | `0B 00 06 01 <style> <fmt24> <date> <yy> <mm> <dd> <dow>` | `:402` (`sendColockMode`) | `fmt24 = 1` for 24 h (`timeScale` flag is inverted in code), `date = 1` shows date, `yy = year - 2000`. The app sends `style = selectedIndex + 1` (`ui/clock/ColockActivity.java:590`), so styles are **1-based in the app**; `pypixelcolor` validates `0..8` and passes through **[X]** `set_clock_mode.py` |
| rhythm / music (level) | `06 00 00 02 <level 0..7> <mode 0\|1>` | `:154` (`sendRhythm`) | level is `round(volume * 7 / 100)` (`ui/rhythm/MicTestActivity.java:674`). **[X]** `set_rhythm_mode_2` (arg order `t`, `style`) |
| rhythm / music (spectrum) | `10 00 01 02 <style> <b0>..<b10>` | `:165` (`sendRhythmChart`) | 11 bands. Each `v = (sample * 15) / 255`; `0` is forced to `1`, anything above 15 is clamped to 15. `style` is the selected view index. **[X]** `set_rhythm_mode.py` allows style 0..4 |
| riding / sport | `07 00 06 00 <mode> <speed> <decimal>` | `:383` | |
| countdown | `07 00 0D 80 <flag> <min> <sec>` | `SendCore.java:4933` | |
| stopwatch | `05 00 09 80 <flag>` | `SendCore.java:4944` | `flag` 0 stop, 1 start, 2 pause per `pypixelcolor/commands/set_timer.py` **[R]** |
| scoreboard | `08 00 0A 80 <s1_lo> <s1_hi> <s2_lo> <s2_hi>` | `SendCore.java:4954-4957` | `short2Bytes` is big-endian and the code sends index `[1]` then `[0]`, so LE. **[X]** `set_scores.py` (values 0..99) |
| scheduled on/off | `09 00 11 80 <on\|off> <slot> <days> <hour> <min>` | `SendCore.java:4774-4850` | ack `05 00 11 80 01`. **[X]** `set_schedule.py` (`days` bitmask: MON 02, TUE 04, WED 08, THU 10, FRI 20, SUN 40, SAT 80, bit 0 set) |

**Not in the app, so not available here:** solid-colour fill, a built-in animation id
list for the whole panel, white/CCT, a "show N" effect picker. The only "effects" are
the ones below.

### Effects the app can select

| scope | ids | source |
|---|---|---|
| text effect (header byte, section 5) | `0` fixed, `1` scroll left, `2` scroll right, `3` scroll up, `4` scroll down, `5` blink, `6` breath, `7` snowflakes, `8` laser | `ui/text/TextEffectFragment.java:55-89` **[V]** |
| text border effects | `borderType`, `borderSpeed`, `borderEffects` bytes, value tables not read | `core/text/process/ITextProcess.java:27-47` |
| clock styles | `1..N`, N depends on panel (`ui/clock/ColockActivity.java:167-396`) | not enumerated here |
| rhythm | style `0..4` (spectrum), mode `0\|1` (level) | section 4 |

Direction flag: when the text direction is vertical the app adds `128` to the effect
byte (`ui/text/TextActivity.java:1818-1824`). Effects `1`, `2`, `7` are blocked for
vertical text and `3`, `4` for horizontal text on most panels
(`TextEffectFragment.java:233-260`).

## 5. Content upload

### Slots and the program list

* Stored content lives in numbered **slots**. `slot = 0` is not tracked by the app; the
  app allocates slots `1..` itself: the lowest id not yet used in its **local** map
  (`ui/channel/ChannelIndex.java:inc`). It never queries the device for the list.
  Max 100 saved entries (`ui/gallery/ImageFragment.java:1850`) **[V]**.
* Header byte 14 carries the slot for every window. For window 2+ (`option 02`) the app
  reuses the same slot (`ChannelIndex.index()`, `SendCore.java:300-345`).
* **Select / play slots** (program list): same command with a count and a list
  **[V]** (`ui/channel/ChannelListActivity.java:403-455`):

```
[len] 00 08 80 <count> 00 <slot1> <slot2> ...      len = 6 + count
07 00 08 80 01 00 <slot>                           one slot ("show slot")
reply 05 00 08 80 01                                ok
```

`len` is one byte here, so at most ~249 entries. **[X]** `pypixelcolor/commands/show_slot.py`.
Before saving a new image on `mcu > 4` boards the app first sends the one-slot form and
waits for `05 00 08 80 01`, then uploads (`ui/gallery/ImageFragment.java:1867-1925`).
For `mcu <= 4` it skips that step **[I]**.

* **Delete slots:** `[len_lo] [len_hi] 02 01 <n_lo> <n_hi> <slot> ...` with `len = 6 + n`
  (`core/SendCore.java:1044-1055`). One slot: `07 00 02 01 01 00 <slot>`.
  **[X]** `pypixelcolor/commands/delete.py`.
* **Delete everything:** `04 00 03 80` (section 4).

### Image / GIF

Payload is a **file**, not pixels:

| type | payload | source |
|---|---|---|
| image | PNG file at exactly the panel size, read from disk | `ui/gallery/ImageFragment.java:957-962`, `core/MediaTools.java:127` **[V]** |
| image on led type 16 (256x32) | raw RGB, 3 bytes per pixel, row-major, R G B order (`utils/BGRUtils.java:49-71`) | `ImageFragment.java:957` **[V]** |
| GIF | GIF file at panel size, built by the app's own encoder (`core/GifCore.java:90`) | **[V]** |
| live frame | raw RGB, window 12288 B, header `[len] 00 00 <opt> <u32 = ledFrameSize>` with no CRC, no slot | `SendCore.java:452-572`, used by games. `go-ipxl/bitmap.go` does the same **[X]** |

Image window frames, exact first-window example (PNG of N bytes, CRC `C`):

```
<15+min(N,W) lo,hi>  02 00  00  <N u32>  <C u32>  00  <slot>  <first W bytes>
```

with `W` from the window-size table. Later windows: same header with `option = 02`.

Brightness baked into frames: `payload()` (`SendCore.java:192-231`) can scale all payload
bytes by a percent (`changeLight`), default 100 = untouched.

### Text

App renders glyphs to 1-bit bitmaps itself; the device does no font rendering. Window
data type `00 01` (section 2). The window **payload** is built in
`core/text/process/CommonTextProcess.java` (legacy) and `NewCommonTextProcess.java`
(firmware range in section 3):

```
header (14 bytes, ITextProcess.getTextHead, ITextProcess.java:27-47)
  [count_lo] [count_hi]      number of char blocks
  [h_align] [v_align]
  [effect]                   section 4 table, +128 for vertical text
  [speed]
  [color_mode]               1 = one RGB colour, 2..9 = gradient preset, 0 = other
  [R] [G] [B]                text colour
  [bg_flag] [bgR] [bgG] [bgB]   bg_flag 0 when background is black
  + [borderType] [borderSpeed] [borderEffects]   only on led types 16..19 and >= 24
then count blocks, see below.   total payload capped at 102400 bytes
```

Char block, **legacy** (`CommonTextProcess.java:47-150`):

```
[size_type] [R] [G] [B] [bitmap ...]
```

| size_type | cell |
|---|---|
| `1` / `0` | 16 px high, square / half-width (8x16) |
| `3` / `2` | 32 px high, square / half-width |
| `5` / `4` | 48 px high |
| `7` / `6` | 64 px high |

The even value is used when `height / width == 2` (`ITextProcess.java:450-477`).
Bitmap: width rounded up to a multiple of 8, row-major, **LSB first** within each byte
(first pixel = bit 0) (`core/text/TextAgreement.java:585-616`). Emoji block:
`[08|0B|09|0A] [len u24 LE] [JPEG]` for 16/24/32/64 px (`CommonTextProcess.java`).
Digits get pre-made sprite tables (`numberToByteArr*`).

Char block, **new** (`NewCommonTextProcess.java`): `[80] [R] [G] [B] [w] [h] [bitmap]`,
explicit cell width and height; digits at 12/20/24 px use `[80][R][G][B][w][h]` with
fixed `(6,12)`, `(12,20)`, `(14,24)`.

`pypixelcolor/commands/send_text` builds the same layout: `num_chars` + `00 01 01
anim speed rainbow R G B bg_flag bgRGB` + blocks with opcode `(is_32 << 1) | is_wide`
**[X]**. Its bit order is the reverse of the app's unless its
`_logic_reverse_bits_order_bytes` is applied **[I]**, so check on hardware.

Text speed range: header byte, `pypixelcolor` allows 0..100 **[R]**; the app's slider
range was not read.

## 6. Differences: app vs `pypixelcolor` / `go-ipxl`

| topic | app | refs |
|---|---|---|
| service UUID | `000000fa-…` named | not named (bleak finds it) |
| name match | contains `LED_BLE`, or manufacturer id `0x5452` marker | `pypixelcolor`: name contains `LED` |
| chunk | 509 B | 244 B (`pypixelcolor`) |
| upload window | 4096 B, 12288 B only on 64x64/32x32/wifi | always 12288 |
| ACK status `00` | abort (error 10017) | continue |
| ACK wait | whitelist of 13 frames, 3 s re-send timer | 8 s timeout, any `05 .. .. .. 0/1/3` |
| `clear` | really delete-all (`04 00 03 80`) | exposed as "clear" |
| device types | `0x80..0xA0` plus `0x00`, pid special cases | `0x80..0x93` only |
| clock style | `index + 1` | `0..8` raw |
| orientation | 0..3 | 0..3 |
| text format | legacy or new char block chosen by MCU version | one format |
| slot select | `mcu > 4` gate | not gated |
| image on 256x32 | raw RGB | always PNG/GIF |
| `go-ipxl` | ports `payload()` and the raw "camera" frames only | |

## 7. Mapping onto LED Union

`Driver` fields:

| field | value | basis |
|---|---|---|
| `service` | `000000fa-0000-1000-8000-00805f9b34fb` | **[V]** |
| `writeChar` | `0000fa02-0000-1000-8000-00805f9b34fb` | **[V]** |
| notify | `0000fa03-0000-1000-8000-00805f9b34fb` | **[R]**, the interface has no field for it |
| `matches(name)` | `name.startsWith('LED_BLE')` (app uses *contains*) | **[V]** |
| `writeWithResponse` | `true` | **[R]** (app unspecified) |
| `chunkSize` | `244` | **[R]**, app's 509 depends on a negotiated MTU the browser does not report |
| `minGapMs` | `100` for brightness; uploads are paced by ACK, not time | **[V]** |

Maps cleanly:

| Driver method | frame |
|---|---|
| `power(on)` | `05 00 07 01 <1\|0>` |
| `brightness(pct)` | `05 00 04 80 <pct>`; clamp to 10..100 to match the app slider |
| `onConnect` | `08 00 01 80 HH MM SS 00` (+ `05 00 12 80 <dow>`, `04 00 05 80`) |
| `caps` | `rgb:false, white:false, cct:false, scenes:false, custom:false, sensitivity:false`; `speed`/`effects` only for text |

Does **not** map:

* `rgb(r,g,b)`: no command. A solid fill must be sent as content: a full-panel raw RGB
  "live frame" (`00 00` type, `W*H*3` bytes in 12 KB windows) **[I]**, or a one-colour
  PNG upload with `slot 0`. Needs the panel size, which the driver only learns from the
  device-info **reply**.
* `speed(pct)`: only meaningful for text. `05 00 03 01 <speed>` exists but is unused by
  the app's UI **[I]**.
* `effect(e)` / `effects()`: no panel-wide effect list. Return `[]` and `effects:false`,
  or expose rhythm as `06 00 00 02 <level> <mode>` and text effects as a text feature.
* `customEffect`: none.

New UI / plumbing needed:

| feature | what it needs |
|---|---|
| panel size | the `Driver` interface is request-only. Needs a notify subscription and a reply parser that returns `{width,height,mcu}` |
| text | glyph rasterisation to 1-bit bitmaps (canvas), char-block encoder, text header, CRC32, window sender with ACK wait |
| image / GIF | resize to panel size, PNG/GIF encoding (`canvas.toBlob`, GIF encoder), same window sender |
| clock | style picker, `0B 00 06 01 ...` |
| slot list | local slot bookkeeping, select (`08 80`) and delete (`02 01`) frames |
| rhythm | audio level to `06 00 00 02 ...` |

### Open questions only hardware can answer

1. **Window size.** Is 12288 B accepted on a 96x16 or 32-high panel, or must it be
   4096 B as the app does? Wrong value may produce ACK `02` or `00`.
2. **Notify char.** Confirm `fa03` carries the ACKs (the app only says "any notify char
   of service `00fa`").
3. **Write type.** Does the char accept write-without-response, and is it needed for
   speed? Browsers cannot tell which the app used.
4. **Service advertised?** Whether `000000fa` appears in the advertisement, since Web
   Bluetooth needs it in `optionalServices` or a filter; and whether some panels advertise
   only the `0x5452` manufacturer marker, with no `LED_BLE` name.
5. **Unlock.** Whether commands are ignored before the first device-info query, or when
   `reply[10] == 1` and the password has not been verified.
6. **Text bit order** (LSB-first per app vs the ref) and which of the legacy/new text
   formats a given MCU version needs.
7. **Clock style base** (0 or 1) and valid range per panel.
8. **Solid fill.** Whether a raw `00 00` frame is accepted without a prior mode command
   and how long it persists; whether slot `0` means "show now, do not save".
9. **Notify payload beyond bytes 4 and 10** of the device-info reply, and whether
   the notifications fit one ATT packet (they are 5 or 8 bytes in everything seen).
