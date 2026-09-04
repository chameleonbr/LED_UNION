# Known frame variants — cross-checked against an external source

The frames in `elk-melk.md` and `ledble.md` come from decompiling the original apps.
The [`dave-code-ruiz/elkbledom`](https://github.com/dave-code-ruiz/elkbledom) project
(a Home Assistant integration covering 24 models) derived its own from sniffing real
hardware.

The two sources agree on the UUIDs and on many frames, and **diverge on byte 1 and on
padding bytes**. The conclusion is not that one of them is wrong: firmware varies
between units that advertise the same name. That is why elkbledom keeps 24 model
entries with per-model overrides, and why sweeping candidates beats assuming one.

## UUIDs — confirmed by both sources

| write | read | families |
|---|---|---|
| `0000fff3` | `0000fff4` | ELK-BTC, ELK-BTCW, ELK-BLEDOB, ELK-BLEDDM, ELK-BLEDOM, ELK-BLE, ELK-BULB, ELK-LAMPL, MELK-*, XSL-, LED LIGHT STRIP |
| `0000ffe1` | `0000ffe2` | LEDBLE |
| `0000ffe1` | `0000ffe1` | LED-, JACKYLED, XROCKER |
| `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | `6e400003-…` | DMRRBA-007 (Nordic UART) |

## Divergences

| command | LED Union (from the apps) | elkbledom (from hardware) |
|---|---|---|
| ELK power on | `7E 04 04 01 00 01 FF 00 EF` | `7E 04 04 F0 00 01 FF 00 EF` |
| ELK power off | `7E 04 04 00 00 00 FF 00 EF` | identical |
| ELK colour | `7E 07 05 03 r g b 10 EF` | `7E 07 05 03 r g b 0A EF` |
| ELK effect | `7E 05 03 v 03 FF FF 00 EF` | `7E 07 03 v 03 FF FF 00 EF` |
| ELK brightness | `7E 04 01 i FF FF FF 00 EF` | `7E 04 01 i 01 FF 02 01 EF` |
| MELK power on | `7E 04 04 01 00 01 FF 00 EF` | `7E 00 04 01 00 00 00 00 EF` |
| MELK colour | `7E 07 05 03 r g b 10 EF` | `7E 00 05 03 r g b 00 EF` |
| MELK effect | `7E 05 03 v 06 FF FF 00 EF` | **identical** |
| MELK speed | `7E 04 02 v FF FF FF 00 EF` | **identical** |
| MELK CCT | `7E 06 05 02 w c FF 08 EF` | **identical** |
| LEDBLE power on | `7E FF 04 01 00 FF FF 00 EF` | `7E 00 04 01 00 00 00 00 EF` |
| LEDBLE colour | `7E FF 05 03 r g b FF EF` | `7E 00 05 03 r g b 00 EF` |

Byte 1 looks like a length or type field that most controllers ignore — but clearly
**not all of them**, or the two sources would have converged.

## Findings the apps did not show

**MELK login.** elkbledom writes this *before* resolving characteristics, on devices
whose name starts with `melk` or `modelx`:

```
7E 07 83
7E 04 04
```

Two 3-byte frames, no response expected. Nothing like it appears in the Magic Lantern
code.

**State query.** Not implemented here, but it exists:

```
ELK/MELK   7E 00 01 FA 00 00 00 00 EF
LEDBLE     7E 00 10
```

**Detection by handle.** elkbledom refines the model using the characteristic *handle*
— for example `handle=13` separates one ELK-BLEDOM variant from another that
advertises the same name.

## BLEDIM

**Not among elkbledom's 24 models.** Nobody has published its protocol. Since it
advertises `FFF0`, the candidates above were the search space — which is what the
sweep in the app's Debug tab is for.
