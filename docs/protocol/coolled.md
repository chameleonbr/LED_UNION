# CoolLED family (CoolLED / CoolLEDX / CoolLEDS / CoolLEDA / CoolLED536 / CoolLEDM / CoolLEDU / CoolLEDUX / iLedBike / iLedClock …)

Derived from `CoolLED1248 2.7.9` (`com.jtkj.led1248`). Paths below are relative to
`com/jtkj/led1248/light/` unless they start with `library/`.
Short names: **DM** = `device/DeviceManager.java`, **L32** = `utils/Light1632Utils.java`,
**LU** = `utils/LightUtils.java`, **FU** = `utils/FontUtils.java`.

Status tags: **[V]** read directly in the app source, **[V+R]** also matches the public
`coolledx-driver` reference, **[I]** inferred, **[?]** needs hardware.

No hardware was available. Every byte below comes from code reading, plus three asset
files (`UNICODE16`, `UNICODE12`, `arrays.xml`/layout XML from the APK resources).

Flutter note: `flutter_module1248` only holds container activities and UI for UX/iLedClock
extras (word game, fitness, business-hours template). The BLE stack is 100 % Java
(`DeviceManager`), so nothing in the transport or command layer is hidden in `libapp.so`.
What Dart might still do is build the *content* of the UX/iLedClock "template" programs
before handing bytes to Java. That part was not examined **[?]**.

---

## 1. Identification and transport

### 1.1 Transport (identical for every family) **[V+R]**

| item | value | source |
|---|---|---|
| service | `0000fff0-0000-1000-8000-00805f9b34fb` | DM:175 |
| write + notify characteristic | `0000fff1-0000-1000-8000-00805f9b34fb` | DM:174 |
| scan filter | service UUID `fff0` **and** exact (case-sensitive) advertised name from the list in 1.2 | DM:730, `library/fastble/scan/BleScanPresenter.java:105-125` |
| notifications | enabled 500 ms after connect (`notify` on fff1, up to 3 retries, then disconnect) | DM:1415-1425, 1523-1573 |
| write type | `WRITE_NO_RESPONSE` if the characteristic has property `0x04`, otherwise default (with response) | `library/fastble/bluetooth/BleConnector.java:356-358` |
| ack/response path | notifications on the same characteristic, same `01 … 03` framing | DM:1546-1565 |

Handshake on connect: **none** for CoolLED / CoolLEDX / CoolLEDA / CoolLED536.
Only a password check (section 2.4) for CoolLEDS, for CoolLEDX when the user turned
"password" on in the app (never for the 16x32 model), and for M/U/UD/UX/iLedClock.
The app also fetches `http://www.coolledx.com/CoolLEDX/<name>/config.json` on connect
(DM:1379); the result is not used for framing as far as the code shows **[?]**.

### 1.2 Families, tell-apart rules

The family is chosen **only by the advertised name** (`equalsIgnoreCase`, DM:772-1036).
Geometry/colour come from the **advertisement bytes**, not from a query, except for the
fixed-size models.

| advertised name | family | DEVICE_TYPE | matrix | colour | cmd set |
|---|---|---|---|---|---|
| `CoolLED` | original | 1 | 12 x 48 fixed (DM:895-903) | mono | basic (2.1) |
| `CoolLED536` | 5x36 | 2 | 5 x 36 fixed | mono | basic + GB2312 text (4.4) |
| `CoolLEDA` | A | 7 | 16 x 32 fixed | colour (8-level) **[I]** | basic (2.1) |
| `CoolLEDX` | X | 3,4,5,6 | from advert (below): 16 x 32 -> 3, 16 x 64 -> 4, 16 x 96 -> 6, 16 x >64 other -> 5 | from advert | basic (2.1) |
| `CoolLEDS` | S | 10,9,8,11 | same rule as X (32 -> 10, 64 -> 9, 96 -> 8, other -> 11) | from advert | basic + password always |
| `CoolLEDM` | M | 12-20 | from advert, rows 16 or 32 | from advert | advanced (2.3) |
| `CoolLEDU` | U | 21-29, 46, 47 | rows 16/20/24/32 | full RGB | advanced |
| `iLedBike` | UD | 30 | from advert | full RGB | advanced + drive state |
| `CoolLEDUX`, `iDevilEyes`, `iLedHat`, `iLedHatC`, `iLedOpen`, `iLedCar`, `iLedFitness` | UX | 37-45, 48, 49 | rows 16/20/24/32, `<=288` cols vs `>288` | full RGB | advanced + clock/score/colour |
| `iLedClock` | clock | 50 | from advert | RGB (colour type 4) | advanced + clock/alarm/pomodoro |

Rows with several DEVICE_TYPE values split on column count (<=96, 97-192, >192; UX uses
<=288 / >288). DEVICE_TYPE only selects UI and which `*Utils` builds frames; for the X
family all builders emit the same command bytes (section 3).

**Advertisement layout used by the app** (`getDeviceRow/Column/ColorTye/Version`,
DM:9901-9931). Offsets index the **raw `ScanRecord.getBytes()`**:

| raw offset | meaning |
|---|---|
| 9-10 | little-endian company ID, shown as "device id" `hex(b10)+hex(b9)` |
| 11-16 | MAC (matches the reference's "manufacturer data [0..5]") |
| 17 | **rows** |
| 18-19 | **columns**, big-endian 16 bit |
| 20 | **colour type**: 0 mono, 1 seven-colour, 2 full RGB (UD/U/UX force 2, clock forces 4) |
| 21 | firmware version. The app parses the *hex string* of the byte in **base 20** (`Integer.parseInt(hex, 20)`), so `0x10` reads as 20. Quirk, keep as is if you compare against app thresholds. |

In Web Bluetooth these are the manufacturer data entry (the 2-byte company ID is the map
key, the value starts at the MAC): `rows = v[6]`, `cols = v[7]<<8|v[8]`, `colour = v[9]`,
`fw = v[10]`. This is what `coolledx-driver` does **[V+R]**. Reading it needs
`watchAdvertisements()`, so a driver should fall back to a name/size picker.

### 1.3 MTU, chunking, pacing **[V]**

| item | value | source |
|---|---|---|
| MTU request | 247, only for names `CoolLEDM`, `CoolLEDU`, `CoolLEDUX`, `iDevilEyes`, `iLedHat`, `iLedHatC`, `iLedOpen`, `iLedBike`, `iLedClock`, `iLedCar`, `iLedFitness` | DM:1491-1521 |
| write split size | **180** after MTU success on those names, otherwise **20** | DM:1503-1513 |
| CoolLED / CoolLEDX / CoolLEDS / CoolLEDA / CoolLED536 | never request MTU -> **20-byte writes** | DM:1519 |
| gap between split writes | 15 ms, fire-and-forget (does not wait for the write callback; `sendNextWhenLastSuccess = false`) | DM:1593, `library/fastble/bluetooth/SplitWriter.java:71-100` |
| split unit | the *escaped* frame is split at the byte count; splits can fall inside an escape pair | `SplitWriter.splitByte` |
| queue | one logical frame list at a time; new UI events clear the pending queue (`mDataStrings.clear()`) | DM:7239-7260 |
| ack timeout (data upload) | 5000 ms per chunk (`CoroutineLiveDataKt.DEFAULT_TIMEOUT`), 3 retries per chunk, then restart the whole upload up to 3 times | DM:5502-5545 |
| basic commands (switch, speed, brightness, mode) | sent and forgotten; the app never waits for an ack | DM:7331-7397 |

Reference driver sends each whole frame in one write; works because BlueZ/Bleak
negotiates a large MTU. For Web Bluetooth use **20 bytes + 15 ms** for the X family
(proven by the app) or chunk to `MTU-3` if you can see it. Never send more than one
unacknowledged data chunk.

---

## 2. Framing

### 2.1 Envelope **[V+R]** (`L32:430-456`, identical in `Light1248/1664/1696/16192/1632A/536Utils`, `CoolledM/U/UD/UX/ILedClockUtils`)

```
01 | esc( LEN_hi LEN_lo | CMD | DATA… ) | 03
```

| field | rule |
|---|---|
| start / end | `01` / `03` |
| `LEN` | big-endian count of `CMD + DATA` bytes, **pre-escape** (`LU:224-250`) |
| escaping | applied to `LEN`, `CMD`, `DATA` (not to the `01`/`03` envelope): `01 -> 02 05`, `02 -> 02 06`, `03 -> 02 07` (`b -> 02 (b^04)` for b in 1..3). `00` is **not** escaped (`L32:441-456`) |
| checksum | **none at envelope level**. Chunked uploads carry their own XOR (2.2) |
| unescape (rx) | take bytes between `01` and `03`, undo escapes, drop the 2 length bytes (`L32:458-482`). Frames in a notification are found by scanning for `01 … 03` (`LU:367-405`) |

Worked frames (computed with the rules above, not captured):

| command | bytes |
|---|---|
| switch on (`09 01`) | `01 00 02 06 09 02 05 03` |
| switch off (`09 00`) | `01 00 02 06 09 00 03` |
| brightness 0x80 (`08 80`) | `01 00 02 06 08 80 03` |
| speed 0x7F (`07 7F`) | `01 00 02 06 07 7F 03` |
| mode 1 (`06 01`) | `01 00 02 06 06 02 05 03` |
| mode 2 (`06 02`) | `01 00 02 06 06 02 06 03` |

Note the `02 06` after `01`: that is the *length low byte* `0x02` being escaped.

### 2.2 Chunked upload (text, image, animation) **[V+R]**

Used by CoolLED / CoolLEDX / CoolLEDS / CoolLEDA. The payload is cut into **128-byte**
pieces (`L32:381-413`, `L32:146-200`). Each piece is one envelope frame:

```
CMD | 00 | TOTAL_hi TOTAL_lo | IDX_hi IDX_lo | CLEN | piece[CLEN] | XOR
```

| field | rule |
|---|---|
| `CMD` | `02` text, `03` image/icon, `04` animation |
| `00` | constant, purpose unknown **[?]** |
| `TOTAL` | length of the **whole** payload before cutting, 16 bit (`getDataStringLength(whole)`) |
| `IDX` | piece index from 0, 16 bit |
| `CLEN` | bytes in this piece (<=128; 8 bit) |
| `XOR` | XOR of every byte from the `00` up to the last piece byte (`CMD` excluded) (`L32:415-423`) |

So the largest payload is 65535 bytes. All pieces of one payload are sent one by one;
the next piece waits for the ack of the previous one.

**Ack** (notification, after unescape and dropping the length, `DM:1966-2030`):

| byte | meaning |
|---|---|
| 0 | `02`/`03`/`04`, echoes the command |
| 1 | not read by the app |
| 2-3 | index of the acked piece, big-endian |
| 4 | status: `00` ok. Anything else: the app does nothing and lets the 5 s timeout resend |

The reference names the non-zero values (`01` transmission failed, `02` device
abnormal, `03` data error, `04` length error, `05` id error, `06` checksum error)
**[R, not in the X path of the app]**. The M path does map 1/2/3 to distinct errors (DM:4684-4705).

### 2.3 Advanced framing (M, U, UD, UX, iLedClock) **[V]**

Same envelope and escaping (`CoolledMUtils.java:889-915`). Differences:

| item | value |
|---|---|
| program start | `02 | CRC32(4) | SIZE(4) | a | b` (`CoolledMUtils.java:1534-1542`); `SIZE` = uncompressed program bytes, `a`/`b` = program index / program count |
| program data | LZSS-compressed program, cut into **1024-byte** pieces: `03 | 00 | COMPSIZE(4) | IDX(2) | CLEN(2) | piece | XOR` (`CoolledMUtils.java:943-971`). UX/clock use package size negotiated per device (`UX_PACKAGE_SIZE=1024`, DM:1038-1048) |
| CRC32 | poly `0x04C11DB7`, init `0xFFFFFFFF`, MSB first, no final XOR, but each byte is fed as a **32-bit word** (`CoolledMUtils.java:572-615`, `getCrc32CheckCode2`) i.e. the STM32 hardware CRC with one byte per word |
| compressor | Okumura LZSS, N=512, F=18, THRESHOLD=2 (`CoolledMUtils.java:~640-860`) |
| ack | 5 bytes `03 00 IDX IDX STATUS`; status 0 ok, 1 send error, 2 device error, 3 data error (DM:4684-4705) |
| speed/mode | not global; stored inside each program block |

Only the container (header) was traced. The inner block formats (text, graffiti,
animation, frame) are in `CoolledMUtils.java:1025-1500` and the U/UX/clock equivalents;
they were not reduced to byte tables here.

### 2.4 Password **[V]** (all families that use it)

Frames (`Light1696Utils.java:1526-1580`, `CoolledMUtils.java:1602-1638`; same in U/UD/UX/clock):

```
check: 0D R  (d0^R) (d1^R) … (d5^R)  X
set  : 0E R  (d0^R) (d1^R) … (d5^R)  X
```

`R` random byte, `d_i` the digit value of each password character (parsed as a **hex
digit**, default password `"000000"`), `X` = XOR of the masked digits (cmd and `R`
excluded). Reply: 2 payload bytes `0D 00` ok / `0D xx` bad, `0E 00` ok (DM:1971-2010).

When it is used: CoolLEDS always; CoolLEDX only if the user enabled it **and** it is not
the 16x32 model (DM:1316-1324); M/U/UD/UX/clock always. Whether the *device* refuses
other commands before a successful check is not visible in the app **[?]**; the app only
blocks its own UI.

---

## 3. Basic commands

### 3.1 CoolLED, CoolLEDX, CoolLEDS, CoolLEDA, CoolLED536 **[V+R]**

Payload (`CMD [arg]`) inside the envelope of 2.1. The constants are identical in
`Light1248Utils`, `Light1632Utils`, `Light1664Utils`, `Light1696Utils`,
`Light16192Utils`, `Light1632AUtils`, `Light536Utils` (lines 19-73 of each).

| function | payload | range | source | notes |
|---|---|---|---|---|
| power | `09 01` / `09 00` | | `L32:103-112` | `0` blanks the display, strip keeps state **[?]** |
| brightness | `08 vv` | X/S/A/536: `0..255`; CoolLED (12x48): `10..255` (UI adds 10) | `L32:96-101`, `coolledx/device1632/LightFragment1632.java:206-208`, `coolled1248/LightFragment1248.java:204` | layout `max=255` (X), `max=245`+10 (1248) |
| speed | `07 vv` | `0..255`, UI default 127 | `L32:89-94`, `LightFragment1632.java:221-223` | direction (low = slow or fast) not stated in code **[?]** |
| mode | `06 mm` | `1..8` | `L32:82-87`, `LightFragment1632.java:382` | table below |
| built-in icon | `05 ii` | | `L32:114-119` | app UI never reaches it for X **[?]** |
| music bars | `01 h0..h7` | each `0..rows` | `L32:121-126`, `music/LocalMusicManager.java:640-675` | see 4.5 |
| transfer begin | `0A` | | `Light536Utils.java:180-184` | only 536 posts it (text, icon) |
| mirror (536) | `15 00/01` | | `Light536Utils.java:226-235` | |

Mode ids, app label order = id - 1 (`res/values/arrays.xml` `mode_string`; sent as
`modeIndex+1`, `LightFragment1632.java:382`):

| id | name (app) |
|---|---|
| 1 | Static |
| 2 | Left (scroll) |
| 3 | Right (scroll) |
| 4 | Up |
| 5 | Down |
| 6 | Snowflake |
| 7 | Picture |
| 8 | Laser |

Same 8 ids on the 12x48 and 5x36 models. Text uploads set the mode first (see 4.1);
the mode applies to the *uploaded* content, there is no standalone "effect" on this
family.

**No RGB solid colour, no white, no CCT** on this family. The panel only shows what you
upload. A "solid colour" is a full-panel image (4.2).

### 3.2 Advanced family (M, U, UD, UX, iLedClock) **[V]**

All use the envelope of 2.1 and the same command bytes. Source: `utils/Coolled{M,U,UD,UX}Utils.java`, `ILedClockUtils.java`, "get*" methods near the end of each file.

| function | payload | notes |
|---|---|---|
| device info | `1F` | reply 7 payload bytes `1F sw bright mirror micSupported micOn ?` (DM:2398-2440, 4895-4940) |
| power | `05 01` / `05 00` | **not** `09` |
| brightness | `04 vv` | UI range `5..255` (`progress+5`, layout `max=250`) |
| mirror | `0C 00/01` | U/M. UX/clock use `0C <rotate>` (`setRotate`) |
| music | `01 type b0..b7` | 8 bars; `06 t` selects rhythm source (device mic types `1..`) |
| rhythm source | `06 t` | `DeviceMicEvent` (DM:7190) |
| password | `0D`, `0E` | 2.4 |
| program start / data | `02`, `03` | 2.3; U/UX also use `1A` as an alternate start (`getStartDataForProgram(list, i)`) |
| OTA | `FE` (start), `FF` (data), UX/clock `FD` (OTA version) | out of scope |
| bike drive state (UD, UX) | UD: `1B s` set, `1C` get. UX/clock: `1C 01 s` set, `1C 02` get | |
| set time (UX, clock) | `09 yy mm dd wd hh mm ss`, `yy = year-2000`, `wd` Monday=1 … Sunday=7 | `CoolledUXUtils.java:5453-5500` |
| stopwatch / countdown / scoreboard | `10 01..04`, `0F 01..03`, `11 01..04` | UX/clock |
| pomodoro / alarm / night mode / reminder / volume | `15 01/02`, `16 02`, `14 01/02`, `1A 01..03`, `1E 06` | clock only (`ILedClockUtils`) |
| temperature/humidity | `19 …` | clock only |
| **solid colour** | `13 01 0R GB` | UX/clock (`CoolledUXUtils.java:5682-5688`). RGB444: each channel `v>=238 -> 15`, `v<=47 -> 0`, else `(v-47)/14+1`; byte 0 = `0R`, byte 1 = `(G<<4)|B`. Red example: `01 00 04 13 02 05 0F 00 03` |
| colour speed | `13 02 ss` | |
| colour mode (31 presets) | `13 03 a [b] n <n colour bytes>` | `setColorMode(1..31)` carries its own RGB444 palette; `a`, `b`, `n` per preset (`CoolledUXUtils.java:5714-5830`) |
| power guard | scale RGB so `r+g+b <= 612` when columns > 96 | `adjustPower`, `CoolledUXUtils.java:5690` |

Mode lists for these families (`arrays.xml`, ids 1-based, used per program block):
1 Static, 2 Shift left continuously, 3 Shift right continuously, 4 Up, 5 Down,
6 Accumulation, 7 Picture scroll, 8 Flashing, 9 Pan to the left, 10 Pan to the right,
11 Override left, 12 Override right, 13 Horizontal interspersed (`coolledu_mode_string`
and `mode_32_string`). The ids are the list position + 1 **[I]** (dialogs store `i+1`).

---

## 4. Content upload (X family, the app's main path)

### 4.1 Text **[V]**

Order the app sends for one text item (`DM:7289-7312`, `coolledx/device1632/TextFragment1632.java:246-296`):

1. `06 mode` (mode of the item)
2. text chunks, `CMD=02`, 2.2 framing, one ack per chunk
3. after the last ack (`ResponseEvent(3)`), `07 speed` with the slider value (`LightFragment1632.java:410-413`)

Payload of the text (the "whole" that gets cut into 128-byte pieces), current
(emoji-capable) layout `L32:227-282`, 7-colour devices:

| bytes | field |
|---|---|
| 23 | `00` x 23 |
| 2 | item count (text/emoji items), big-endian |
| 80 | `00` x 80 (legacy per-character table, unused here) |
| 2 | `DLEN` = byte length of the bitmap data, big-endian |
| DLEN | bitmap data (below) |

Legacy layout (`L32:146-200`, also used by `CoolLEDA`): `00 x 24`, 1 byte character
count, 80-byte table (one byte per character: bytes of that glyph, padded with `00`),
`DLEN(2)`, data.

The two layouts have the same size (105 bytes before `DLEN`). The reference sends
`00 x 24 | count(1) | 80 x 0x30 …`, so the device ignores those 80 bytes **[V+R]**.

**Bitmap data = three colour planes concatenated: R, then G, then B.** Each plane is the
full strip, column-major, left to right. One column = `ceil(rows/8)` bytes, **MSB = top
row**. 16-row panels: 2 bytes per column (`FU:4159-4300`). A pixel is one bit per
plane, so the colour is one of the 7 combinations (+ black). Mapping from the app's
colour tables (`L32:1013-1060`):

| colour | R | G | B |
|---|---|---|---|
| red | 1 | 0 | 0 |
| green | 0 | 1 | 0 |
| blue | 0 | 0 | 1 |
| yellow | 1 | 1 | 0 |
| purple | 1 | 0 | 1 |
| cyan | 0 | 1 | 1 |
| white | 1 | 1 | 1 |

(The mono / full-RGB X variants are not built by the app: for `colour type 0`/`2`
`sendTextData` posts `TextIconEvent(null)` (`TextFragment1632.java:261-270`). Treat X
as 7-colour; a mono X would presumably read only plane R **[?]**.)

**Font rendering (the part a PWA replaces).** The app does not rasterise: it reads a
prebuilt font asset, 32 bytes per BMP code point at offset `c*32` (`FU:3330-3343`,
asset `UNICODE16`, 2 MB = 65536 x 32). Verified layout of the asset: 16 columns x 2
bytes, big-endian, MSB = top row; ASCII glyphs occupy the left 8 columns and the rest is
blank, e.g. `'A'` = `07fc 0880 1080 2080 1080 0880 07fc 0000 …`. Bold uses `UNICODE16_bold`.
Then the app (`FU:4159-4300`):

- trims blank columns (`deleteEmptyColumnFor16`), so text is proportional,
- applies the per-item rotation (0/90/180/270),
- **mode 2/3 (scroll left/right)**: appends 2 blank bytes (one empty column) after each
  glyph and concatenates,
- **other modes**: concatenates into pages of `COLS` columns (`32 / 64 / 96` for the
  X sizes, `DEVICE_COLUMN` for 16x192+). A glyph that does not fit the rest of the
  page starts a new page; otherwise one blank column separates glyphs
  (`checkSegment16`, `FU:2180-2198`); the last page is centred (`dealSegmentResult16`,
  `FU:2706-2740`),
- optional horizontal mirror flag.

A canvas-rendered bitmap of the same orientation reproduces this. The page rules only
matter for non-scroll modes.

### 4.2 Image / "graffiti" / icon **[V+R]**

`CMD=03`, 2.2 framing (`L32:340-380`, drawing via `L32:1013-1114`).

| bytes | field |
|---|---|
| 24 | `00` x 24 |
| 2 | `DLEN` big-endian |
| DLEN | R plane, G plane, B plane (as 4.1, `COLS` columns each) |

The outer 2.2 header repeats the *total* (`24 + 2 + DLEN`). Reference: same layout,
text rendered as an image (`render.py` `create_image_output`) **[R]**. A solid-colour
fill is simply every bit set in the wanted planes.

### 4.3 Animation **[V+R]**

`CMD=04`, 2.2 framing (`L32:1219-1250`).

| bytes | field |
|---|---|
| 24 | `00` x 24 |
| 1 | frame count (max 255) |
| 2 | frame delay in **ms**, big-endian. Editor slider: `delay = 900 - progress + 100`, i.e. 100..1000 ms (`AnimationEdit1632Activity.java:125`, layout `max=900`) |
| … | **all R frames, then all G frames, then all B frames**; one frame = `COLS x ceil(rows/8)` bytes |

Reference uses the same order (`render.py:436-474`) **[R]**. Total size = 27 + 3 x frames x
frame bytes, so a 32x16 strip fits ~100 frames in 65535 bytes. No palette, no RLE.

### 4.4 CoolLED 12x48 and CoolLED536

| model | text | draw / icon |
|---|---|---|
| CoolLED 12x48 (type 1) | same `02` chunks, legacy layout (`Light1248Utils.java:296-350`); glyph from `UNICODE12`, **24 bytes** = 12 columns x 2 bytes, MSB top, rows 0-11 (verified: `'A'` = `0fe0 1100 2100 4100 2100 1100 0fe0 …`); mono, one plane | `03` / `04` as above with 48 columns x 2 bytes, mono (`Light1248Utils.java:162-213, 793-857`) |
| CoolLED536 (type 2) | **no bitmap**: `0A` (begin) then `02 <GB2312 bytes of the text>`; the device holds its own font (`Light536Utils.java:169-178, 214-224`). Arabic/Hebrew text is reversed first | `03` + 36 bytes, one per column, 5 bits used (bit 7 = top row), plus `0A` first (`Light536Utils.java:68-80`) |

Music on a colour-type-1 CoolLED 12x48 adds a second set of 8 colour bytes
(`Light1248Utils.java:121-160`).

### 4.5 Music / rhythm **[V]**

X family (`LocalMusicManager.java:640-675`, `L32:121-126`, `Light1664Utils.java:132`):

- App sets `isMusic = true`, captures FFT (`Visualizer`, capture size 128, or the
  microphone), every `timeCycle = 100` ms builds 8 values `min(hypot(re, im), ROWS)` and
  sends `01 b0 b1 b2 b3 b4 b5 b6 b7` (no ack). Any other command sets `isMusic=false`.
- The reference sends 16 bytes (8 heights + 8 colours) **[R]**. The app's X path sends 8.
  Colours on 12x48 colour-type-1 only (above).

Advanced family: `01 type b0..b7`, plus `06 t` to pick phone vs device microphone
(`CoolledMUtils.java:1654-1666`).

### 4.6 Clock (iLedClock, UX) **[V]**

Time sync `09 yy mm dd wd hh mm ss` (3.2). Everything else (alarm, pomodoro, night mode,
reminders, volume, temperature/humidity, stopwatch, scoreboard) is in section 3.2 by
command byte; the argument layouts live in `ILedClockUtils.java` (e.g.
`getSetNightMode` takes 10 ints). Not reduced further here; clock **display programs**
(`ILedClockManager.ILedClockProgram`) use the 2.3 container.

---

## 5. Differences: app vs `coolledx-driver`

| topic | app (truth) | reference |
|---|---|---|
| X command bytes | `09/08/07/06` | same **[V+R]** |
| M/U/UX power, brightness | `05` / `04` | defines `09`/`08` only; "CoolLEDM/U/UX" classes are stubs |
| `00` escape | not escaped | `escape_byte()` helper would escape `<4` incl. `00`, but the framing path (`escape_bytes`) does not. Consistent in practice |
| write type | no-response if the characteristic supports it | `response=True` only for commands that expect a notify |
| split | 20 B + 15 ms (X) | whole frame, relies on large MTU |
| text header | emoji layout `23 + count(2) + 80 x 00`, or legacy `24 + count(1) + 80-byte table` | `24 + count + 80 x 0x30` |
| music | 8 bytes | 8 heights + 8 colours |
| initialize `23 01` | never sent | `Initialize` command, "works on CoolLEDM" |
| power-down `12`, power-on `13`, invert `0C`, `0D` "clear" | none of them exist in the app's X path. `0D` is *check password* in the app | named "unproven" |
| password | implemented (0D/0E) | not implemented; marks S as "special security" |
| speed unit | 0..255 raw | 0..255 raw |
| brightness on 12x48 | 10..255 | 0..255 |
| firmware version byte | parsed base 20 | plain byte |
| ack nonzero | no action, timeout resend | error names |

---

## 6. Mapping onto LED Union

Suggested driver identity: `id: 'coolled'`, `service: '0000fff0-…'`, `writeChar:
'0000fff1-…'`, `matches(name)` = exact (case-insensitive) match on `CoolLEDX`, `CoolLED`,
`CoolLEDS`, `CoolLEDA`. Keep M/U/UX/clock out of the first cut (different command
bytes and LZSS/CRC upload).

| `Driver` member | X family value | status |
|---|---|---|
| `chunkSize` | 20 | [V] |
| `minGapMs` | 15 | [V] |
| `writeWithResponse` | `false` (characteristic offers no-response) | [V] |
| `onConnect` | none (password only if the user enabled it) | [V] |
| `power(on)` | `09 01/00` | [V+R], clean |
| `brightness(pct)` | `08 round(pct*2.55)`; use 10..255 on `CoolLED` 12x48 | [V], clean |
| `speed(pct)` | `07 round(pct*2.55)` | [V], clean; direction [?] |
| `effect(e)` | `06 id`, ids 1..8 | [V], maps cleanly **but** only affects content already uploaded |
| `effects(name)` | the 8 modes above | [V] |
| `caps` | `rgb:false, white:false, cct:false, speed:true, effects:true, scenes:false, custom:false, sensitivity:false` | |
| `rgb(r,g,b)` | **no native command.** Emulate by uploading a solid 7-colour image (4.2) or declare `rgb:false` | needs new path |
| `soundMode(source)` | `music` source only: stream `01 b0..b7` at 10 Hz from Web Audio FFT; no on-device mic mode on the X family | [V], optional |
| `customEffect` | none | |
| `hasChannels` / `outputs` | none | |

Features that need **new UI** (no Driver method fits):

- **Text**: input, colour per item, mode, speed; client-side rasteriser to column-major
  bitmaps (Canvas, 16 or 12 rows, trim blank columns, 1 px gap, page rule for non-scroll
  modes); multi-chunk upload with ack handling and 5 s / 3-retry logic.
- **Image / graffiti**: pixel editor or image import, quantise to 7 colours.
- **Animation**: frame list, 100..1000 ms delay.
- **Panel size**: manufacturer-data read or manual picker (rows, columns, colour type).
- A new `Driver` hook for "upload content" plus a notification listener; the current
  interface only has fire-and-forget builders.

Clock/UX extras (time sync, `13 01` RGB444 solid colour, 31 colour presets, stopwatch,
scoreboard) would need their own driver; the UX `13 01` is the only true "solid colour".

### Open questions only hardware can answer

1. **Biggest**: what the device does with a mono (type 0) or full-RGB (type 2) X strip:
   the app never builds text or images for them. Which planes are read? Does the strip
   ignore G/B?
2. Does the device reject commands before a password check when a password is set?
3. Speed polarity (`07 00` slow or fast) and what brightness `0` does.
4. Maximum payload accepted in practice (frame count vs RAM) and whether upload keeps
   playing the previous content until the last ack.
5. Whether `writeValueWithoutResponse` of whole `<=128+header` frames (bigger than 20 B)
   works on all firmware, as the reference implies, or only 20 B pieces.
6. Meaning of the constant `00` byte and the 24 reserved zero bytes in upload headers.
7. UX/clock inner program blocks, and whether Dart code builds any of them.
8. Whether the strip answers `09`/`08`/`07`/`06` with an ack (reference expects one for
   `07`/`08`/`09`, the app ignores it).
