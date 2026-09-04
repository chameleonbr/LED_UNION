# Differential testing

*[Leia em português](README.pt-BR.md)*

The drivers in `src/lib/protocol/` were transcribed **by hand** from the decompiled
Java of the original apps. Hand-written tests cannot catch a transcription error: they
assert what the author understood, not what the app does.

This compares the two mechanically.

## How it works

1. **`extract_java_frames.py`** walks the decompiled trees and extracts every BLE frame
   the apps build, in three different shapes:
   - `new byte[]{…}` — a literal (LED+LAMP)
   - `byte[] x = {…}` — a bare initialiser (Lotus Lantern)
   - `buf[0] = 85; buf[1] = -86; …` — indexed assignment (Magic Lantern, BLEDIM)

   Two traps that cost real time, both handled:
   - jadx **re-aliases the same buffer** inside a method
     (`byte[] bArr = sendDatas2; … byte[] bArr2 = sendDatas2;`), scattering one frame
     across several names. Without resolving aliases every frame comes out truncated —
     Magic Lantern yielded 5 frames instead of 17, which reads as "no coverage" rather
     than "broken extractor".
   - jadx resolves ordinary integers to unrelated library constants that happen to
     share the value (`WebSocketProtocol.PAYLOAD_SHORT` = 126 = `0x7E`). These are
     decompiler artifacts, not dependencies.

2. **`emit_ts_frames.ts`** runs our drivers with distinctive probe values
   (`R=0x11 G=0x22 B=0x33`, so a swapped position is obvious) and emits JSON.

3. **`compare.py`** matches each of our frames against the literals of the same family.
   A literal matches when every position it pins to a constant equals ours; positions
   it fills from a variable are free.

   - **exact** — same length, every fixed position agrees
   - **prefix** — the app memcpy's the payload, so the literal only pins the header
     (only BLEDIM's scene frame lands here)
   - **unmatched** — no frame of that shape exists in the original app at all. That is
     our bug.

## Running it

```bash
python3 tools/difftest/extract_java_frames.py targets.json > java.json
node tools/difftest/emit_ts_frames.ts > ts.json
python3 tools/difftest/compare.py java.json ts.json
```

`targets.json` is a list of `{"app": "...", "path": "..."}` pointing at the decompiled
trees (a file or a directory).

## Result

**221 of 221 frames match** the original apps, across three drivers and nine wire
layouts. One matches by prefix only — BLEDIM's 72-byte scene, whose payload is copied
in a loop.

### What it caught

**Five bugs**, all invisible to hand-written tests, because those tests asserted
exactly what had been misunderstood.

**1. `iSceneNo` in BLEDIM's scene structure (offset 4).** It was set to `0xFF`,
confused with the `0x88` command's scene field, which does use 255. All four buffers
the app builds (`FlushEmptyBuf`, `FlushStaticBuf`, `FlushChaseColor`, `FlushChaseAuto`)
zero that offset.

**2. LEDCAR-01's power frame.** It had been grouped with LEDDMX because both use the
`7B FF` envelope. But the app's `turnOn` branches on the **name before the envelope**:

```
LEDBLE / LEDCAR-00   7E FF 04 01 00 FF FF 00 EF
LEDCAR-01            7B FF 04 01 FF FF FF FF BF   ← its own
LEDCAR-02            7B 04 01 FF FF FF FF FF BF
LEDDMX               7B 04 04 01 FF FF FF FF BF
```

**3. Dim on LEDDMX-02 / LEDCAR-02.** We had invented borrowing the white slot of the
RGB frame (`7B 07 00 00 00 <w> …`). The app has a dedicated opcode:
`7B 09 <v> FF FF FF FF FF BF`.

**4. BLEDIM's speed/brightness state was module-global.** Those two values travel in
the same command, so changing one means resending the other — and the memory lived in a
single module object. With two BLEDIM controllers, setting brightness on one would push
that brightness onto the other. It is now per device.

This one surfaced because a fixture test failed: earlier tests had mutated the global
state, so the scene came out with speed 0. The symptom read as "flaky test"; the cause
was a real bug.

**5. The sound-reactive mode on the shifted DMX layout.** We assumed symmetry with the
other families and emitted a phone-audio variant. The app has none there — only the
microphone mode, and with a different flag byte between LEDCAR-02 and LEDDMX-02/04.

## The dynamic part

BLEDIM's 72-byte scene payload is copied in a loop, so the static extractor can only
pin the header. `bledim_scene.js` closes that gap: it runs inside the app, calls **its
own** `ScenePara.EnPackToDb()` and prints the resulting buffer.

```bash
frida -H 127.0.0.1:27042 -p <pid> -l tools/difftest/bledim_scene.js
```

The captured vectors live in `src/lib/protocol/__fixtures__/bledim_scene.json` and are
asserted in `frames.test.ts`. They confirmed:

- offsets 0–15 of our frame match byte for byte
- `[1]=0xC0` speed and `[2]=0xFF` brightness really are the defaults
- `[14]` carries the effect, with `0xFF` as the "no effect" sentinel
- the colour table ships **pre-filled with a palette** rather than zeroed — but with
  `bClrQty=1` only entry 0 is read, so the rest is inert

## The 289 literals we do not emit

They are not gaps. Almost all are out of scope by choice:

| category | examples |
|---|---|
| scheduling | `sendTime`, `endTime`, `closeTime`, `timeSun`, `setSmartTimer*` |
| hardware configuration | `setSPIModel`, `setConfigSPI`, pixel count, direction, pin order |
| car-specific | `setCar02SetWelcomeMode`, `TurnMode`, `BrakeMode`, `Motor*` |
| audio streaming | `sendAudioBuf`, `enableHwAudio`, `setSensitivity`, `setMusicMicroMode` |
| graffiti / pixel art | `setCar02Graffiti`, `setDmx0204Graffiti` (envelope `7C`) |
| DIY colour lists | `setDiy`, `setCustomCycle`, `setChangeColor`, `setCollectMode` |
| LEDPHO groups | `setPhoAddGroup`, `setPhoDelectGroup`, `setPhoResetGroup` |
| per-channel variants | `7B FF 04 <03\|05\|07>` — power per channel, 43 shapes |

**One category is worth implementing**: the **state query**
(`readControllerInfo` `0x87`, `setCheck` `72 12`, `setSmartCheck` `7D 01 05`,
`setPasswordFeedback` `2A 05`). Today the UI assumes the state; with these it could
read the device — power, current colour, scene, channel count.

## The limit

This validates **transcription**, not behaviour. It proves we emit the bytes the app
emits; it does not prove the device accepts them, nor that the sequence and timing are
right. Only hardware answers that.
