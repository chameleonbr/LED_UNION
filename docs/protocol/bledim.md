# BLEDIM — recovered protocol

`BLEDIM`, package `com.forwell.bledim`. A Bluetooth LED dimmer / controller.

## Transport

| item | value |
|---|---|
| service | `0000fff0-0000-1000-8000-00805f9b34fb` |
| characteristic | **`0000fff1-0000-1000-8000-00805f9b34fb`** |

It advertises the same `FFF0` service as the ELK/MELK family, but **writes to `FFF1`,
not `FFF3`**, and its protocol has nothing in common with that family's `7E … EF`
envelope. Treat it as its own driver.

GATT details that differ from every other family here:

| item | value |
|---|---|
| write type | **with response** (`setWriteType(1)`) |
| fragmentation | **fixed 20 bytes**, mandatory |
| gap | 30 ms per fragment (15 ms with multiple GATT connections) |
| notifications | the same `FFF1` characteristic |
| CCCD `0x2902` | the app **never** writes it; real hardware notifies anyway |
| MTU | never negotiated |

The app fires fragments without waiting for `onCharacteristicWrite`, so the gap is the
only flow control the protocol has.

## Framing

A **variable-length** packet, unlike the fixed 9 bytes of the other families:

```
55 AA <seq> <cmd> <lenHi> <lenLo> <payload…> <checksum>
 [0] [1]   [2]    [3]     [4]     [5]        [6 .. 6+len-1]   [6+len]
```

- `55 AA` — sync (`SYNC_HB = 85`, `SYNC_LB = 170`)
- `<seq>` — free-running counter 0..255; the device does not validate it
- **length counts the payload only**, big-endian; total frame = `len + 7`
- receiver side: `packetSize = buf[4] * 256 + buf[5] + 7`

### Checksum

A plain additive sum — not XOR — of **every byte before it**, sync bytes and header
included:

```
sum = 0
for i in 0 .. len(frame)-2: sum += frame[i]
checksum = sum & 0xFF
```

## Payloads

| command | len | payload |
|---|---|---|
| `0x80` power | 1 | `[0\|1]` — no channel |
| `0x81` colour | 4 | `[W, R, G, B]` — **white first**, 0..255 |
| `0x88` speed/brightness | 6 | `[sceneNo, saveFlag, speed, brightness, strobe, 0]` |
| `0x86` channels | 1 | `[1..4]` — 1=DIM 2=CCT 3=RGB 4=RGBW |
| `0x82` effect | 72 | a whole scene structure (below) |
| `0x87` query | 1 | `[selector]` |
| `0x8B` mic enable | 4 | `[on, 0, 0, 0]` |
| `0x8C` mic sensitivity | 1 | `[0..255]` |
| `0x8D` saved colour | 6 | `[0, R, G, B, 0, 0]` |

**Ranges are 0..255**, not the 0..100 of the other families.

In `0x88`: `sceneNo = 255` means free mode; `saveFlag = 1` commits, `0` is a live
drag. Speed and brightness travel **in the same command**, so changing one means
resending the other. Defaults: speed 192, brightness 255, strobe 0.

### Scene structure — 72 bytes, command `0x82`

Total frame = 72 + 7 = **79** (`SCENE_PACKET_SIZE`).

| offset | field |
|---|---|
| 0 | fade (0/1) |
| 1 | speed |
| 2 | brightness |
| 3 | colour count (0..14) |
| 4 | scene slot |
| 6 | strobe |
| 11 | channel 4 = W |
| 12 | colour width |
| 13 | colour index |
| **14** | **effect id**: bits 0-6 = index 0..12, bit 7 = chase mode |
| 16..71 | up to 14 colour entries × 4 bytes `[W, R, G, B]` |

Byte 14 equal to `255` means "no effect" — a static colour scene. The app's own UI
labels these `M1..M13` from the index; it has no real names for them.

Offset 4 is the **scene slot**, and the app zeroes it on every buffer it builds. Do not
confuse it with the `0x88` command's own scene field, which does use 255.

The colour table ships **pre-filled with a palette** rather than zeroed, but with
`bClrQty = 1` only entry 0 is read, so the rest is inert.

## Handshake / binding

`Encrypt.java` does no cryptography: it is a 240-byte ASCII table plus three lookup
functions. The flow:

1. On connect the app sends `0x89` carrying `[seconds, milliseconds & 0xFF]` from its
   clock, and locally derives two passwords from those two nonces.
2. The device replies `0x92`. In the current variant the check is
   `getCmdPass(rcv[2]) + password2 == rcv[13]*256 + rcv[14]`, where `rcv[2]` is the
   **device's own** packet number. So this is a genuine challenge/response with two
   nonces.
3. It repeats every tick for up to 10 attempts, then disconnects.

**But the gate is client-side only.** `mblRegisterd` is a boolean in the app; nothing
shows the device refusing unauthenticated commands. A clean-room client can send
commands directly. We send the `0x89` anyway: it is what makes the device report its
state back.

### Clone check

`IsFake()` flags a device whose name is `JDY-10` or `Ble_Light` — the factory names of
generic BLE-UART modules. Legitimate names: `BLEDIM` and `LanQianTech`.

## Commands (`Protocol.java`)

| value | constant |
|---|---|
| `0x80` | `CMD_ONOFF` |
| `0x81` | `CMD_SELECT_COLOR` |
| `0x82` | `CMD_SEND_IMMEDIATE_SCENE` |
| `0x83` | `CMD_SEND_SCHEDULE` / `CMD_CONTROLLER_SCHEDULE_INFO` |
| `0x84` | `CMD_SCHEDULE_ONOFF` |
| `0x85` | `CMD_SYNC_SYMTEM_TIME` |
| `0x86` | `CMD_SWITCH_CHANNELS` |
| `0x87` | `CMD_READ_CONTROLLER_INFO` |
| `0x88` | `CMD_UPDATE_SPEED_BRIGHTNESS` |
| `0x89` | `CMD_SEND_SERIAL_CODE` |
| `0x8A` | `CMD_SEND_AUDIO_BUF` |
| `0x8B` | `CMD_ENABLE_HW_AUDIO` |
| `0x8C` | `CMD_SET_AUDIO_SENSE` |
| `0x8D` | `CMD_SELECT_COLOR_SAVE` |
| `0x8E` | `CMD_UPDATE_CHASE_PARA` |
| `0x8F` | `CMD_SAVE_CHASE_RGB_SEC` |
| `0x90` | `CMD_CONTROLLER_ACK` |
| `0x91` | `CMD_CONTROLLER_SCENE_INFO` |
| `0x92` | `CMD_CONTROLLER_PASSWORD` |
| `0x93` | `CMD_CONTROLLER_TIME` |
| `0x94` | `CMD_CLOCK_UNEXIST` |

Other constants: `SCENE_PACKET_SIZE = 79`, `SCENE_PARA_SIZE = 72`,
`SCENE_PACKETS_BASE = 13`, `MAX_PROTOCOL_BUFSIZE = 1024`.

## How the code was recovered

Static analysis is impossible. All four versions tested are packed — 3.11 and 3.16
with 360 Jiagu, 3.13 with Bangcle/SecNeo, and versionCode 41 from 2020 with Jiagu.
None contains a plaintext DEX; the payloads measure 7.9–8.0 bits of entropy.

What worked was a **memory dump inside a containerised Android**, entirely on the
desktop, with no phone and no root on the phone:

```bash
# binderfs is built into the Arch kernel already (it shows in /proc/filesystems)
sudo mount -t binder binder /dev/binderfs

sudo docker run -itd --name redroid --privileged \
  -v "$PWD/redroid-data:/data" -p 5555:5555 \
  redroid/redroid:11.0.0-latest androidboot.redroid_gpu_mode=guest

adb connect 127.0.0.1:5555 && adb root
# --abi x86_64 is mandatory: without it the packer extracts the wrong .so and the app
# dies with UnsatisfiedLinkError (EM_X86_64 vs EM_AARCH64)
adb install --abi x86_64 -r BLEDIM_3.11_APKPure.apk
adb push frida-server /data/local/tmp/ && adb shell chmod 755 /data/local/tmp/frida-server
adb shell "nohup /data/local/tmp/frida-server >/dev/null 2>&1 &"
adb forward tcp:27042 tcp:27042
adb shell am start -n com.forwell.bledim/.Activity2

# frida lists the process by app label ("BLEDIM"), not by package
frida-dexdump -H 127.0.0.1:27042 -p <pid>
```

The dumped DEX files come out with an invalid checksum and signature, and jadx rejects
them with `No classes for decompile!`. Repair them first:

```python
struct.pack_into('<I', d, 32, len(d))            # file_size
d[12:32] = hashlib.sha1(bytes(d[32:])).digest()  # signature
struct.pack_into('<I', d, 8, zlib.adler32(bytes(d[12:])) & 0xffffffff)
```

Result: 20 DEX files, 553 Java classes, including `Protocol.java`, `BlueToothLe.java`,
`BluetoothLeService.java` and `Encrypt.java`.

`jiagu_unpacker` (SafaSafari) does **not** work on any of these versions: it reads the
shell length from the last 4 bytes as big-endian and gets garbage, and its AES keys
(`bajk3b4j3bvuoa3h` / `mers46ha35ga23hn`) produce no DEX at any offset.

## What the original app's UI shows

- An RGB colour wheel with 7 presets (R G B Y M C W).
- **13 built-in effects plus 2 DIY slots.**
- Brightness and speed sliders.
- Microphone and music player.
- Settings: `1CH-DIMMING` / `2CH-CT` / `3CH-RGB` / `4CH-RGBW`.
- Addressable (chase) LEDs with a pixel count.
- Its own grouping ("Group needs 2 or more devices").
