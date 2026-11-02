# ZENGGE (LEDnetWF / ZGHB)

App: **ZENGGE** (`com.zengge.blev2`, Flutter). The transport is in the app's Java
(`com/zengge/hagallbjarkan/*`), and the classic payload builders are in
`com/zengge/wifi/COMM/Protocol/*`. The product table and the per-product command choice
come from the open-source [lednetwf_ble](https://github.com/8none1/lednetwf_ble)
project, which reads the vendor's own device json. Not yet tested on hardware.

## Discovery and GATT

| what | value |
|---|---|
| names | `LEDnetWF<mac>` |
| write | service `FFFF`, characteristic `FF01` |
| notify | `FF02` |
| pairing / crypto | none for control |

The model is only in the advertisement. Manufacturer data comes under company ids
`0x5A00..0x5AFF`; after the id, the 27 bytes are:

| offset | field |
|---|---|
| 0 | status |
| 1 | BLE version |
| 2..7 | MAC |
| 8..9 | product id, big-endian |
| 10 | firmware |
| 11 | LED version |
| 14..24 | state (BLE version ≥ 5) |

Newer firmware moves the header into service data under `FFFF` (16 or 29 bytes: BLE version at 3, product at 10..11, LED version at 13); the manufacturer record then holds state only and is ignored.

Chrome only exposes manufacturer data for ids listed in `optionalManufacturerData`, so
a device added before this driver existed has to be added again.

## Transport header

`00 seq 80 00 len_hi len_lo len+1 cmdId payload` for BLE version < 8, and
`01 seq 80 00 len_hi len_lo (len+1)_hi (len+1)_lo cmdId payload` from version 8.
`seq` starts at 1 per device. `cmdId` is `0B` for commands, `0A` when a reply is
expected. Payloads end in a sum-8 checksum.

## Payloads

| function | bytes |
|---|---|
| power, LED version ≥ 5 or unknown | `3B 23/24 00 00 00 00 00 00 00 32 00 00 CS` (0.5 s fade) |
| power, LED version < 5 | `71 23/24 0F CS` |
| RGB, simple products | `31 R G B 00 00 F0 0F CS`, brightness baked into RGB |
| RGB, symphony/unknown products | `3B A1 hs_hi hs_lo V 00 00 00 00 00 00 00 CS`, hs = (hue << 7) \| sat |
| white / CCT | `31 00 00 00 WW CW 0F 0F CS` |
| dim-only brightness | `3B 01 00 00 B 00 B 00 00 00 00 00 CS` |
| effect, simple | `61 id speed 0F CS`, ids 37..56, speed 1 (fast) .. 31 |
| effect, symphony | `42 id speed% bright% CS`, ids 1..100 |
| effect, ring 0x53 | `38 id speed% bright%` (no checksum) |
| state query | `81 8A 8B 96` with cmdId `0A` |

The 3B colour's bytes 7..9 are a fade time, not RGB: anything but zero makes the device
fade over seconds or hours.

## Not covered

Products 8, 51, 60, 84 and 91 take effects through `0x38` with an id list we could not
pin down, so they get colour and power only. Also not covered: music and mic modes,
addressable segments, IOTBT devices, and the Wi-Fi, mesh and Matter variants.
