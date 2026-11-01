# Investigation: Chinese LED apps (APKs analysed 2026-11-01)

Read-only static analysis: jadx and strings, never executed. Confidence: [C] confirmed in code/capture, [I] inferred, [G] gap.

## Magic Light BLE (com.Zengge.LEDBluetoothV2). jadx: src-magiclight/sources/
Classic Zengge/LEDENET protocol. Not compatible with ffe0.ts or fff0.ts. Needs a new driver.

## Identification
- [C] By name only, no advert parsing. Names: LEDBLE, LEDBlue, LEDSpeaker, LEDShoe, TIBURN; anything else (e.g. FluxBlue) is the timer client.
  - Files: t0/a.java, q0/c.java, BLEPeripheralClientTimer.java.
- [C] Type comes from state reply byte 1, version from byte 10.
- [I] LEDBLE* collides with the ffe0 NEEDS_AUTH pattern. Decide by GATT: FFE5/FFE9 = Magic Light, FFE0/FFE1 = LED+LAMP.

## GATT
- [C] Write: service FFE5, characteristic FFE9.
- [C] Notify: service FFE0, characteristic FFE4.
- [C] Frames of 20 bytes or less: write without response. Longer frames: 20-byte chunks, 60 ms apart. State query: write with response.
- [C] No bonding, no crypto, no cloud.

## Commands [C] (r0/g.java)
- Query: EF 01 77. Reply is 12 bytes: 66 type pwr(23=on) mode 21 speed R G B W ver 99.
- Power: CC 23 33 on, CC 24 33 off.
- RGB: 56 R G B 00 F0 AA.
- White: 56 00 00 00 W 0F AA. Type 84/5 uses 56 R G B W 5A AA.
- Type 4 is the only one with a checksum: 31 00 00 00 W 00 00 CS (sum & FF).
- Effect: BB mode (31-s) 44, where s = 0..30 and 1 is fastest.
  - Modes: 0x25..0x38 (20). Type 35 uses 08..1E; type 247 uses 25..32.
- Custom sequence: 99 + 16×RGB + speed + kind (3A/3B/3C) + FF 66.
- Music: the phone analyses audio and streams 78 R G B 00 F0 EE.
- Clock: 10 14 YY MM DD hh mm ss dow 00 01. Timers: 23/24.
- [I] Brightness: no opcode; the app scales RGB.

## ZENGGE (com.zengge.blev2, Flutter). jadx: src-zengge/sources/
LEDnetWF / ZGHB protocol, the same family as HA led-ble. No overlap with our drivers. Needs a new driver.

## GATT
- [C] Service 0000ffff-0000-1000-8000-00805f9b34fb.
  - Write characteristic ff01. Notify characteristic ff02.
  - OTA (do not use): fe00/ff11/ff22.
- [C] Names: contains LEDnetWF or IOTWF.

## Advertisement
- [C] Manufacturer data, 29 bytes:
  - [1..2] family id: 0x5A20..2F, 5A50..5B, 5A5D, 5A60..8F
  - [3] bleVersion
  - [10..11] productId
  - [13] ledVersion
  - [16..26] state
- Company id varies, so do not filter by it.

## Framing
- [C] v0 (bleVersion<8): 00 seq 80 00 Nhi Nlo N+1 cmdId payload.
- [C] v1 (bleVersion>=8): 01 seq 80 00 Nhi Nlo (N+1)hi (N+1)lo cmdId payload.
- seq starts at 1, +1 per write.
- cmdId: 0B no reply, 0A wait for reply, 0C state push.
- Checksum: sum8 at the end of the payload.

## Commands
- [C] Power, classic: 71 23 0F A3 on, 71 24 0F A4 off.
- [C] Power, ledVersion>=5: 3B 23 00x7 32 00 00 90 on; 3B 24 ... 91 off.
  - Framed on: 00 01 80 00 00 0D 0E 0B 3B 23 00 00 00 00 00 00 00 32 00 00 90
- [C] RGB: 31 R G B 00 00 F0 0F ck.
  - Framed red: 00 04 80 00 00 09 0A 0B 31 FF 00 00 00 00 F0 0F 2F
- [C] HSV: 3B A1 hh ll V 00 00 0 0 0 0 0 ck, where hh:ll = (H<<7)|S, V 0..100.
- [C] White: 31 00 00 00 WW CW 0F 0F ck.
- CCT: 35 B1 cool% bright% 00 00 t t ck. [C] structure, [I] meaning.
- Brightness: 47 v ck. [I]
- Modes: 61 mode speed 0F ck. [C] structure, [I] ids 0x25..0x38.
- [C] State query: 81 8A 8B 96 sent with cmdId 0A.
  - Framed: 00 05 80 00 00 04 05 0A 81 8A 8B 96
  - Reply: 81 type 23/24 mode speed R G B WW ? ledVer flags ck

## Gaps and notes
- [G] Symphony/pixel (E0/E1...), music, scenes. These live in Dart AOT only and need blutter or a snoop log.
- [C] No pairing; no cloud needed for BLE.
- [G] A Dart-side cipher is not 100% excluded.
- Wi-Fi, SIG mesh, Matter and the advert-broadcast mode are out of reach for Web Bluetooth.

## MohuanLED (com.kimoji.flutter.bleled)
Not covered by any existing driver. Needs a new one.
- [C] Service 0000eea0-0000-1000-8000-00805f9b34fb (libapp.so offset 0x28c19).
- [C] Write characteristic 0000ee01-0000-1000-8000-00805f9b34fb (0x5944d). Write without response. No notify.
- [C] Names: BJ_LED, BJ_LED_M, BJ_LED_HC, BJ_LED_MHC. Match by prefix BJ_LED. [G] What HC/MHC change.
- Frame: 69 96 LEN CMD DATA.
  - Off: 69 96 02 01 00
  - On: 69 96 02 01 01. The app also sends 69 96 06 01 01 ff ff ff 7f.
  - RGB: 69 96 05 02 R G B max(R,G,B)
  - Brightness: no command; the app scales RGB. [I]
  - Effect: 69 96 03 04 MODE SPEED. The capture shows CMD 04; bj_led code uses CMD 03 with speed fixed at 03. [G] Test on hardware.
  - Modes 0x00..0x15 (22): colorloop, 7 fades, 3 cross fades, rainbow fade, color strobe, 7 strobes, color jump, RGB jump.
  - Speed: 01 fastest .. 0a slowest.
  - Time: 69 96 06 07 <unix BE u32> 00. [I]
- [G] Music, timer, groups, state.
- Sources:
  - https://github.com/8none1/bj_led (bjled.py, bt_snoops/gatt_bytes.txt)
  - https://github.com/Walkercito/MohuanLED-Bluetooth_LED

## LampSmart Pro (com.jingyuan.lamp, Shenzhen Jingyuan)
- [C] Control is by raw BLE ADVERTISING, not GATT: the phone broadcasts and the lamp scans.
  - Pairing: a pair command (0x28) broadcast within about 5 s of lamp power-up.
  - forced_id is the group id; index is slots 0..15.
- [C] Web Bluetooth has no advertise/peripheral API (WebBluetoothCG spec; W3C requests open since 2017 and 2020). A PWA cannot control these lamps.
- Codecs, in ha-ble-adv codecs/fanlamp.py:
  - lampsmart_pro_v1 (header 77 F8): CRC16 plus whitening.
  - lampsmart_pro_v2/v3 (F0 08): AES-128 sign plus whitening table.
- Commands:
  - 0x10/0x11 on/off
  - 0x21 CCT
  - 0x22 RGB
  - 0x1E/0x1F effect
  - 0x23 night
  - 0x28 pair, 0x45 unpair
  - 0x6F all off
- Alternatives:
  - ESP32 running ESPHome ble_adv.
  - ESP32 GATT-to-advert bridge, which fits the PWA. [I]
  - Native Android BluetoothLeAdvertiser.
  - Linux/BlueZ host.
- Sources: https://github.com/NicoIIT/ha-ble-adv, https://github.com/NicoIIT/esphome-components
