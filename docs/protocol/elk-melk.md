# MELK / ELK (Magic Lantern, Lotus Lantern)

Derived from `Magic Lantern 6.11.06` and `Lotus Lantern 6.5.08`
(`com.easylink.colorful`).

## Transport

| item | value |
|---|---|
| service | `0000fff0-0000-1000-8000-00805f9b34fb` |
| write characteristic | `0000fff3-0000-1000-8000-00805f9b34fb` |
| frame size | **9 bytes**, `7E … EF` |
| checksum | **none** |
| write type | never set by the app → write-without-response in practice |
| handshake | **none** |
| notifications | not used |

Magic Lantern sleeps 5 ms between writes and runs a background flush every 100 ms.
Lotus Lantern has no throttle at all. The original app caps itself at 4 concurrent
GATT connections (LRU) — an app limit, not a protocol one.

## Frames — common to both generations

```
power on          7e 04 04 01 00 01 ff 00 ef
power off         7e 04 04 00 00 00 ff 00 ef
brightness 0..100 7e 04 01 <bri> <lightmode> ff ff 00 ef
rgb        0..255 7e 07 05 03 <r> <g> <b> 10 ef
cct        0..100 7e 06 05 02 <warm> <cold> ff 08 ef
white      0..100 7e 05 05 01 <w> ff ff 08 ef
speed      0..100 7e 04 02 <speed> ff ff ff 00 ef
mic on/off        7e 04 07 <on> ff ff ff 00 ef
mic sensitivity   7e 04 06 <sens> ff ff ff 00 ef
pin order         7e 06 81 <p0> <p1> <p2> ff 00 ef
```

`<lightmode>` is the channel selector: `ALL=0, RGB=1, W=2, CT=3`, with `255` meaning
unspecified. Brightness, speed, white and CCT are **0..100**. RGB is **0..255**.

## The generations differ in one command only: the effect

| generation | effect frame | table |
|---|---|---|
| **MELK-\*** (Magic Lantern) | `7e 05 03 <id> 06 ff ff 00 ef` | `melk_effects.tsv`, 213 effects in 8 groups |
| **MELK-\*** scenes | `7e 05 31 <id 1..28> 07 ff ff 01 ef` | `melk_effects.tsv`, the `Scenes` group |
| **ELK- / XSL- / CLK-** (Lotus) | `7e 05 03 <0x80+idx> 03 ff ff 00 ef` | `elk_effects.tsv`, 29 effects, `0x80..0x9C` |

`0x80..0x9C` is the canonical BLEDOM effect set. Lotus has no scene command.

Magic Lantern only: scenes (`0x31`), pixel count (`7e 07 21 …`), device clock
(`7e 07 83 …`).
Lotus only: laser (`7e 05 03 <m> 08 …`, `7e 05 05 01 <v> ff ff 10 ef`), countdown
(`7e 07 76 …`).

## Branching on the advertised name

**Magic Lantern: no wire-level difference.** The name only gates UI features:

| check | effect |
|---|---|
| `MELK-OC`, `MELK-OT` | shows the scenes tab |
| regex `^MELK-.+CT.*` | CCT slider sends `7e 06 05 02` instead of RGB |
| regex `^MELK-.+W.*` | white slider sends `7e 05 05 01` |
| `MELK-OE`, `MELK-OB`, `MELK-TX` | hides the microphone features |

**Lotus Lantern: two real wire-level branches.**

1. **Encryption.** `isEncryptedDevice(name)` is `name.contains("ELK-*")` — a
   **literal asterisk**, not a wildcard (`BluetoothLEService.java:1188`). When it
   matches **and** the opcode (byte 2) is `01` (brightness), `03` (mode) or `04`
   (power), the frame becomes 21 encrypted bytes with `bArr[0]=0xAA` and
   `bArr[8]=0x55`. Colour, CCT, pin order and timers always go out in the clear.
   **A rare path — implement it only if a device refuses commands.**
2. **`INTRO`** in the name: byte 3 of the power frame becomes `0xFF` instead of `0x01`.

Prefixes Lotus recognises: `ELK-`, `ELK~`, `XSL-`, `CLK-`, `ELK_`.

### The Lotus cipher, for `ELK-*` only

`com/szelk/ledlamppro/ble/EncryptionDecryptionKt.java`. An XOR keystream built from 12
random bytes `R` per frame:

```
presetKey = 2a 7f c1 94 33 de 45 e0 8b 11 5c a6 09 f2 7d b8

ks[i]     = ((R[i]*27) & 0xff) ^ ((R[(i+3)%12]+55) & 0xff) ^ (R[(i+7)%12] >> 2) ^ ((i*85) & 0xff)   , i=0..8
ct[0..8]  = plain9[i] ^ ks[i]
ct[9..20] = R[i] ^ presetKey[i % 16]
```

21 bytes total, written as a single GATT value.

## Advertising mesh (Lotus) — safe to ignore

Lotus also broadcasts commands as manufacturer data (ID `0xBEE8`, 25 bytes) with a
heartbeat. It is a parallel mesh path; direct GATT control does not need it.

## Effect tables

| file | rows | shape |
|---|---|---|
| `melk_effects.tsv` | 241 | `id \t group \t name` — the `Scenes` group uses opcode `0x31` |
| `elk_effects.tsv` | 29 | `id \t name` — ids `0x80..0x9C` (128..156) |

## BLEDIM

**Not part of this family.** See `bledim.md`. The initial assumption that BLEDIM was an
ELK-BLEDOM device was wrong — it is a dimmer controller from a different product line
that merely advertises the same service.
