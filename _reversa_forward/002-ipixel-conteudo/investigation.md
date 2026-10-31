# Investigation — 002 ipixel-conteudo

## Sources
- `docs/protocol/ipixel.md` §2 (window header, ACKs, window size), §3 (HW info, MCU ranges), §5 (image/GIF/text payloads).
- Phase 1 trace 2026-10-31: type `0x81` 32×32, 10-byte reply, ACK `05 00 04 80 01` on `fa03`.
- `gifenc` 1.0.3 (MIT, mattdesl): `GIFEncoder()`, `quantize(rgba, 256)`, `applyPalette`, `writeFrame(index, w, h, {palette, delay})`, `finish()`, `bytes()` (ctx7 `/mattdesl/gifenc`).
- WebCodecs `ImageDecoder` (Chrome 94+): `decode({frameIndex})` → `VideoFrame` with `duration` µs; `tracks.selectedTrack.frameCount`.

## Alternatives evaluated

| Topic | Option | Verdict |
|---|---|---|
| GIF decode | `ImageDecoder` | ✅ platform, Chrome only — same as Web Bluetooth. |
| | `gifuct-js` / `omggif` | ❌ extra dependency, no need on Chrome. |
| GIF encode | `gifenc` | ✅ small, fast, MIT, one allowed dependency. |
| | hand-written LZW | ❌ more code than the dependency it avoids. |
| Binary storage | IndexedDB raw API | ✅ Blobs native, quota large. |
| | `idb-keyval` | ❌ dependency for ~40 lines. |
| | localStorage base64 | ❌ 5 MB, strings only. |
| Chunk size | 244 B (pypixelcolor) | ✅ fits common ATT MTU 247; browser hides MTU. |
| | 509 B (vendor app) | ❌ needs MTU 512, not guaranteed in Chrome. |
| CRC32 | table-based, 10 lines | ✅ `CompressionStream` exposes no CRC. |

## Patterns
- Reuse `writeOnce` and trace entries from phase 1; upload is a loop over them inside one queue op.
- ACK waiter = `Promise` resolved by the notify listener, raced with a 6000 ms timer and an `AbortSignal`.
