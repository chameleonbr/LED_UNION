# Magic Light (Zengge BLE, classic LEDENET)

App: **Magic Light - BLE** (`com.Zengge.LEDBluetoothV2`, JM Zengge). Derived from the
decompiled Java (`r0/g.java` builders, `com/blebulb/core/*` transport). Not yet tested on
hardware.

## Discovery and GATT

| what | value |
|---|---|
| names | `LEDBLE…`, `LEDBlue…`, `LEDSpeaker…`, `LEDShoe…`, `TIBURN…`; other names (e.g. `FluxBlue`) use the app's timer client |
| write | service `FFE5`, characteristic `FFE9`, write without response |
| notify | service `FFE0`, characteristic `FFE4` |
| pairing / crypto | none |

`LEDBLE-xx` names collide with the LED+LAMP family (`FFE0`/`FFE1`). The GATT probe
chooses the driver: `FFE5`/`FFE9` means Magic Light, `FFE0`/`FFE1` means LED+LAMP.

Frames longer than 20 bytes go in 20-byte pieces, 60 ms apart.

## Commands

| function | bytes |
|---|---|
| state query | `EF 01 77` |
| power on / off | `CC 23 33` / `CC 24 33` |
| RGB (most types) | `56 R G B 00 F0 AA` |
| RGB (types 3, 19) | `56 R G B 00 AA` |
| white (most types) | `56 00 00 00 W 0F AA` |
| white (types 84, 5) | `56 00 00 00 W 5A AA` |
| white (type 4) | `31 00 00 00 W 00 00 CS`, CS = sum of the first 7 bytes |
| built-in mode | `BB mode (31 − s) 44`, s = round(speed% × 30 / 100), so `01` is fastest |
| colour list | `99` + 16 × RGB (unused = `01 02 03`) + speed + `3A` fade / `3B` jump / `3C` strobe + `FF 66` (53 bytes) |
| music (phone audio) | `78 R G B 00 F0 EE`, streamed |
| set clock | `10 14 YY MM DD hh mm ss dow 00 01` |

No brightness opcode: the app scales the RGB (or W) value, and so does the driver.

Modes `0x25..0x38` (20): seven-colour cross fade; red, green, blue, yellow, cyan,
purple, white gradual change; red/green, red/blue, green/blue cross fade; seven-colour
strobe; red … white strobe; seven-colour jump.

## State reply

12 bytes: `66 type power(23 on) mode 21 speed R G B W version 99`. The type byte picks
the frame variants above.

## Not covered

The timer client's extra `FFF0` power service (`FFF1` enable `04`, `FFF2` `3F`/`00`),
timers (`23`/`24`), the LEDSpeaker frames and the Xmas mode lists for types 35/247.
