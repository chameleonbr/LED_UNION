# LEDBLE / LEDDMX / LEDCAR / LEDSMART / LEDSUN / LEDLIKE / LEDPHO

Derived from `LED+LAMP 4.3.5` (`com/home/net/NetConnectBle.java`,
`com/home/constant/CommonConstant.java`).

## Transport

| item | value |
|---|---|
| service | `0000ffe0-0000-1000-8000-00805f9b34fb` |
| write + notify characteristic | `0000ffe1-0000-1000-8000-00805f9b34fb` |
| `0000ffe2` | declared, never used |
| frame size | **always 9 bytes**, never fragmented |
| checksum | **none** |
| write type | never set by the app → default (with response) |
| CCCD | `0x2902` = `0100` to enable notifications |

**Pacing observed in the original app.** Note it is a time gate, not a queue: writes
that arrive inside the window are dropped, not delayed.

| command | minimum gap |
|---|---|
| RGB | 50 ms |
| brightness | 30 ms |
| list uploads (DIY, colours) | 100 ms |
| dynamic DIY | 300 ms |

## Header and trailer per family

Byte 0 and byte 8 are fixed per family, selected by the **advertised name prefix**.
Nothing is read back from the controller to decide the format.

| header | trailer | family |
|---|---|---|
| `7E` | `EF` | LEDBLE-00/01/02/03, LEDSTAGE, LEDLIGHT, LEDCAR-00/01 (BLE mode) |
| `7B` | `BF` | LEDDMX-00..04, LEDCAR-01 (DMX mode), LEDCAR-02 |
| `7D` | `DF` | LEDSMART |
| `7A` | `AF` | LEDSUN |
| `70` | `0F` | LEDLIKE |
| `72` | `2F` | LEDPHO |
| `7C` | `CF` | graffiti (DMX-02/04, CAR-02) |
| `8E` / `8B` | `EF` / `BF` | timers |
| `2A` | `AF` | password / auth |

## Connection handshake

If the name contains `LEDBLE`, `LEDDMX` or `LEDCAR`, the app waits **300 ms** after
connecting and sends:

```
2A 02 <p0> <p1> <p2> <p3> <tb> <min> AF
```

- `<p0..p3>` — password, **default `A1 23 45 67`**
- `<tb>` — `(weekIndex << 5) | hour24`, where
  `weekIndex = {7,1,2,3,4,5,6}[DAY_OF_WEEK-1]`
- `<min>` — current minute

Password status query, which is also what enables notifications:

```
2A 05 FF FF FF FF FF FF AF
```

Reply: `2A 05 <status>` — `1` wrong password, `2` password is all the same digit,
`3` resend.

This is the **only notification frame the app decodes**. There is no general state
frame.

## LEDBLE frames (`7E … EF`)

Standard layout is `7E <sub> <cmd> <p1> <p2> <p3> <p4> <p5> EF` with `<sub> = FF`.

```
power on      7E FF 04 01 00 FF FF 00 EF
power off     7E FF 04 00 00 FF FF 00 EF
rgb           7E FF 05 03 <r> <g> <b> FF EF
warm white    7E FF 05 01 <w 0..100> FF FF FF EF
cct, 2 ch     7E FF 05 02 <warm> <cool> FF FF EF
brightness    7E FF 01 <0..100> 00 FF FF FF EF
speed         7E FF 02 <0..100> 00 FF FF FF EF
effect        7E FF 03 <modeId> 03 FF FF FF EF   NetConnectBle:830
mic mode      7E 00 0E <mode> FF FF FF FF EF
music mode    7E 02 0E <mode> FF FF FF FF EF
mic sens.     7E FF 07 <sens> FF FF FF FF EF
rgb order     7E FF 08 <order> FF FF FF FF EF
```

Brightness and speed are **0..100**, not 0..255.

### Channels (LEDBLE-02) — two independent outputs

The `LEDBLE-02` branch uses **byte 7** as the output selector. The values come from
the radio group in `MainActivity_BLE` (`rbBLE02RgbALL` / `rbBLE02RgbLED1` /
`rbBLE02RgbLED2`):

| value | target |
|---|---|
| `0` | all outputs |
| `1` | LED1 |
| `2` | LED2 |

```
rgb         7E FF 05 03 <r> <g> <b> <ch> EF     NetConnectBle:725
power       7E FF 04 <1|0> 00 FF FF <ch> EF     NetConnectBle:394
brightness  7E FF 01 <bri> 00 FF FF <ch> EF     NetConnectBle:2206
speed       7E FF 02 <spd> 00 FF FF <ch> EF     NetConnectBle:2217
effect      7E FF 03 <id> 03 FF FF <ch> EF      NetConnectBle:861
sound mode  7E <0|2> 0E <id> FF FF FF <ch> EF  NetConnectBle:1850
```

**Observed on hardware** (LEDBLE-00-9B67, a car controller driving a strip plus door
handle plus door sill lights): the default colour frame, with byte 7 = `FF`, changed
**only the door handle**. So the firmware treats byte 7 as an output selector even
though the device advertises `LEDBLE-00`, and `FF` does not mean "all". Which value
reaches which light is still unmapped.

The code says **two** outputs, not three. On the other branches (`LEDBLE-00`, `-01`)
byte 7 is fixed — `FF` for colour, `00` for power — and no output selection is
documented, so a controller that physically separates lights while advertising
`LEDBLE-00` needs confirmation on the device itself.

### Layout variants

- **LEDBLE-03** shifts everything: `cmd` moves to byte 1 and the `FF` filler is
  dropped. `7E 09 <modeId> <flag> FF FF FF FF EF`,
  `7E 01 <bri> <flag> FF FF FF FF EF`.
- **LEDBLE-02** repurposes byte 1 and byte 7 as the channel:
  `7E FF 05 03 <r> <g> <b> <ch> EF`.
- **LEDBLE-03 RGBW**: `7E 05 <r> <g> <b> <w> FF FF EF`.
- **LEDSTAGE / LEDLIGHT** use a different power frame:
  `7E FF 04 <1|0> FF FF FF FF EF`.

## LEDDMX and LEDCAR frames (`7B … BF`)

Two layouts. DMX-00/01/03 and CAR-01 use `7B FF <cmd> …`; **DMX-02/04 and CAR-02 drop
the `FF` filler and shift every parameter one byte left**.

```
              7B FF (00/01/03, CAR-01)                7B (02/04, CAR-02)
power on/off  7B 04 04 <1|0> FF FF FF FF BF           7B 04 <1|0> FF FF FF FF FF BF
rgb           7B FF 07 <r> <g> <b> 00 FF BF           7B 07 <r> <g> <b> <w> FF FF BF
brightness    7B FF 01 <(v*32)/100> <v> <f> FF FF BF  7B 01 <v> <f> FF FF FF FF BF
speed         7B FF 02 <spd> FF 00 FF FF BF           7B 02 <spd> 00 FF FF FF FF BF
built-in mode 7B FF 03 <mode> FF FF FF FF BF          7B 03 <mode> FF FF FF FF FF BF
DIY mode      7B FF 13 <mode> FF FF FF FF BF          7B 13 <mode> FF FF FF FF FF BF
dim           7B FF 09 <(v*32)/100> <v> FF FF FF BF   7B 09 <v> FF FF FF FF FF BF
direction     7B FF 0D <d> FF FF FF FF BF             7B 0D <d> FF FF FF FF FF BF
cct           —                                       7B 0A <cw> FF FF FF FF FF BF
```

⚠️ **`0x03` and `0x13` are easy to confuse.** `0x03` selects a **built-in** mode, from
the 211-entry table. `0x13` selects the user's own **DIY** patterns. Sending built-in
ids to `0x13` produces nothing.

**LEDCAR-01 has its own power frame.** The app branches on the name *before* the
envelope:

```
LEDBLE / LEDCAR-00   7E FF 04 01 00 FF FF 00 EF
LEDCAR-01            7B FF 04 01 FF FF FF FF BF
LEDCAR-02            7B 04 01 FF FF FF FF FF BF
LEDDMX               7B 04 04 01 FF FF FF FF BF
```

Brightness scaling differs between the two layouts: the `7E` family sends a raw
`0..100`, while `7B FF` sends `(v*32)/100` in byte 3 **and** the raw value in byte 4.

## The other families

Verified byte for byte against the `new int[]{…}` literals in `NetConnectBle`.

### LEDSMART (`7D … DF`)

```
power        7D 01 01 <1|0> FF FF FF FF DF
rgb          7D 02 01 FF <r> <g> <b> FF DF
brightness   7D 02 02 <v> FF FF FF FF DF
speed        7D 02 04 <v> FF FF FF FF DF
mode         7D 02 05 <m> FF FF FF FF DF
dim / white  7D 02 07 <v> FF FF FF FF DF
diy          7D 02 03 <i> <r> <g> <b> <qty> DF
custom rgb   7D 02 08 <i4> <r> <g> <b> <i5> DF
query        7D 01 05 <i> FF FF FF FF DF
```

### LEDSUN (`7A … AF`) — **no RGB channel**

```
power        7A 01 <1|0> FF FF FF FF FF AF
brightness   7A 02 <v> FF FF FF FF FF AF
speed        7A 03 <v> FF FF FF FF FF AF
cct / warm   7A 05 <v> FF FF FF FF FF AF
mode         7A 06 <m> FF FF FF FF FF AF
voice mode   7A 07 <m> FF FF FF FF FF AF
sensitivity  7A 08 <s> FF FF FF FF FF AF
```

### LEDLIKE (`70 … 0F`) — **no RGB channel**

```
power        70 01 <1|0> FF FF FF FF FF 0F
brightness   70 02 <v> FF FF FF FF FF 0F
speed        70 03 <v> FF FF FF FF FF 0F
mode         70 FF <m> FF FF FF FF FF 0F
mic mode     70 04 <m> 00 FF FF FF FF 0F
voice mode   70 FF <m> 01 FF FF FF FF 0F
sensitivity  70 08 <s> FF FF FF FF FF 0F
```

There are two distinct mode commands: the generic one (`70 FF <m>`, used by
`setRgbMode`) and the LEDLIKE-specific one (`70 04 <m> <flag>`, `setLikeMode`).

### LEDPHO (`72 … 2F`) — carries a group address

The **last three parameter bytes are the group address** (`A`, `B`, `C` in
`MainActivity_PHO`). They start at `0, 0, 0`, which reaches every fixture.

```
power         72 01 <on> <seg> FF <A> <B> <C> 2F
brightness    72 02 <v> <seg> FF <A> <B> <C> 2F
hsi           72 03 <h> <s> <i> <A> <B> <C> 2F
rgb           72 04 <r> <g> <b> <A> <B> <C> 2F
cct           72 05 <ct> FF FF <A> <B> <C> 2F
cct trim      72 06 <v> <v2> FF <A> <B> <C> 2F
colour gel    72 07 <v> FF FF <A> <B> <C> 2F
effect        72 08 <fx> FF FF <A> <B> <C> 2F
effect speed  72 09 <spd> FF FF <A> <B> <C> 2F
aisle         72 0A <v> <v2> FF <A> <B> <C> 2F
add group     72 10 <g> <n> FF FF FF <x> 2F
delete group  72 11 <g> FF FF FF FF FF 2F
query         72 12 00 FF FF FF FF FF 2F
reset groups  72 14 FF FF FF FF FF FF 2F
```

## Sound-reactive mode

Two distinct sources, and most families use **the same opcode with a flag byte** to
pick between them:

| family | controller's microphone | audio from the phone |
|---|---|---|
| LEDBLE / LEDCAR-00 | `7E 00 0E <m> FF FF FF FF EF` | `7E 02 0E <m> FF FF FF FF EF` |
| LEDDMX / LEDCAR-01 | `7B FF 0B <m> 00 FF FF FF BF` | `7B FF 0B <m> 01 FF FF FF BF` |
| LEDLIKE | `70 FF <m> 01 FF FF FF FF 0F` | `70 04 <m> 00 FF FF FF FF 0F` |
| LEDSUN | `7A 07 <m> FF FF FF FF FF AF` | — |
| LEDDMX-02/04 | `7B 0B <m> FF FF FF FF FF BF` | — |
| LEDCAR-02 | `7B 0B <m> 00 FF FF FF FF BF` | — |

Note that **LEDLIKE swaps** which opcode carries which source, and that the shifted
layout has **no phone-audio variant** — only the microphone mode, with a different
flag byte between LEDCAR-02 and LEDDMX-02/04.

Sensitivity:

```
LEDBLE      7E FF 07 <s> FF FF FF FF EF
LEDDMX      7B FF 0C <s> 00 FF FF FF BF
LEDDMX-02   7B 0C <s> FF FF FF FF FF BF
LEDSUN      7A 08 <s> FF FF FF FF FF AF
LEDLIKE     70 08 <s> FF FF FF FF FF 0F
```

**Streaming the phone's audio** (`sendAudioBuf`) is not implemented: it would mean
capturing PCM and pushing it over BLE continuously. Switching the device into "music"
mode works; feeding it the audio is a separate problem.

## Addressable strips (SPI / pixel)

The **LEDDMX** and **LEDCAR** families drive individually addressable strips. The
built-in effects only render correctly once the controller knows how the strip is
physically wired. Getting this wrong does not produce an error — it produces the wrong
colours, or only part of the strip lighting up.

```
config     7B FF 05 04 <pixHi> <pixLo> <order> FF BF      (DMX-00/03, CAR-01)
           7B 05 <order> <pixHi> <pixLo> FF FF FF BF      (DMX-02/04, CAR-02)
direction  7B FF 0D <d> FF FF FF FF BF   /  7B 0D <d> FF FF FF FF FF BF
```

The first parameter byte (`bannerType`) is **hard-coded to 4** in the app —
`ChipSelectActivity` never exposes it to the user.

⚠️ **`setSPIModel` is misleadingly named.** Despite the name it does **not** select a
chip. It is called from the mode picker (`seekBarMode`, `listNubmer`) and emits
`7B FF 03 <id>` — that is, it is the **built-in effect** command for these families.

The pixel count is **big-endian** across two bytes. Note that the shifted layout
**reorders the parameters**: the channel order comes first, and there is no type
field.

From `ChipSelectActivity`, which is what names the parameters:

```java
setConfigSPI(bannerType, (byte)(bannerPix >> 8), (byte)bannerPix, bannerSort)
//           type         pixel count (hi, lo)                    RGB order
```

| table | file | values |
|---|---|---|
| channel order | `rgb_order.tsv` | 12: RGB, RBG, GRB, GBR, BRG, BGR plus the four W variants |
| order (shifted) | `rgb_order_dmx02.tsv` | 6: the RGB permutations only |

Effects for these families live in `dmx_model.tsv`: 211 entries, with `255 = AUTO`.

### Handshake

The `2A` frame is only sent to `LEDBLE`, `LEDDMX` and `LEDCAR`. The other four
families never receive it in the original app.

### Effect tables for these families

| family | file | entries |
|---|---|---|
| LEDLIKE | `like_mode.tsv` | 8 (ids 0..7) |
| LEDPHO | `pho_mode.tsv` | 16 (ids 0..15) |
| LEDSMART, LEDSUN | — | no table ships in the resources; ids are exposed directly |

## Effect tables

Extracted from `res/values/arrays.xml`:

| file | entries | id range |
|---|---|---|
| `ble_mode.tsv` | 23 | 135..157 |
| `car_mode.tsv` | 23 | 135..157 |
| `dmx_model.tsv` | 211 | 1..255 |
| `dmx03_model.tsv` | 211 | 1..255 |
| `select_mode.tsv` | 5 | 0..4 |

## Known bugs in the original app — do not replicate

- CT brightness at `NetConnectBle:1215` sends trailer `0F` instead of `EF`.
- LEDCAR-02 brightness at `:1162` emits a LEDLIKE frame (`70 … 0F`).
