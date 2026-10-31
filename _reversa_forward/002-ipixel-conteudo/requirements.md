# Requirements — 002 ipixel-conteudo

> Feature: Phase 2 — iPixel content: send text, image and GIF (phone gallery, URL, GIPHY search or Android share) to a panel slot, with a pixel-exact preview, no regression on current LEDs.
> Sources: `_reversa_sdd/sdd/panel-content-library.md`, `_reversa_sdd/sdd/ipixel-driver.md`, `_reversa_sdd/prd.md`, `docs/protocol/ipixel.md` §2 and §5, phase 1 hardware trace (2026-10-31).
> Confidence: 🟢 confirmed in legacy code, extraction or hardware trace · 🟡 planned / inferred · 🔴 gap.

## 1. Goal

🟡 From LED Union, turn a phone image, a GIF (file or URL) or a typed text into content on the user's iPixel panel: preview it at the panel's real resolution, upload it into a slot and see it play, so the panel no longer depends on the vendor app for content.

## 2. Legacy anchors

- 🟢 Phase 1 driver exists: `src/lib/protocol/ipixel.ts` (service `000000fa`, write `fa02`, notify `fa03`, device-info parse, `showSlot`, `deleteAll`) (`_reversa_forward/001-ipixel-fase1/legacy-impact.md`).
- 🟢 Hardware trace 2026-10-31: user's panel replies `0A 00 01 80 81 …` → type `0x81` = **32×32**, reply is 10 bytes (no password flag); brightness ACK `05 00 04 80 01` arrives on `fa03`; show-slot `07 00 08 80 01 00 01` got no reply.
- 🟢 Frame builders are pure, I/O lives in `ble.svelte.ts` (`_reversa_sdd/adrs/002-pure-driver-frame-builders.md`).
- 🟢 Writes per device are serialized by `WriteQueue` with coalescing (`_reversa_sdd/domain.md#Commanding`, BR-13, BR-14, ADR-004). 🟡 Upload windows must never be coalesced or dropped.
- 🟢 `writeFrame` already splits a frame into `driver.chunkSize` pieces (`src/lib/ble.svelte.ts` `writeFrame`).
- 🟢 Storage failures never block a command (BR-38); persisted store is `led-union/v1` in localStorage (`_reversa_sdd/persistence/`).
- 🟢 The app records what it sent, not device state (BR-30); phase 1 already adds read-back for panel info and ACKs only.
- 🟢 Every write and notify goes to the command trace (`src/lib/trace.ts`, phase 1 FR-20).

## 3. Scope

### In
1. 🟡 Upload transport: 15-byte window header, CRC32 of whole content, window payload 12288 B for type `0x80/0x81/0x00` and 4096 B otherwise, chunked writes, wait for ACK on `fa03` before the next window (`ipixel.md` §2).
2. 🟡 Image item: PNG/JPEG/WebP/GIF-first-frame from the file picker, fit (cover / contain / stretch), encoded as PNG at exactly panel W×H.
3. 🟡 GIF item: decode frames and delays, frame cap, re-encode as GIF at panel W×H.
4. 🟡 Text item: text, colour, effect 0–8, speed; glyphs rasterised in the browser to 1-bit blocks, text header + char blocks (`ipixel.md` §5 Text).
5. 🟡 Import by pasted URL, with a clear message when the site blocks it (CORS).
6. 🟡 Preview at panel resolution, nearest-neighbour scaled, animated with the GIF delays.
7. 🟡 Upload progress (windows sent / total), cancel, error mapping of ACK status `00` / `02` / timeout.
8. 🟡 HW-info query `04 00 05 80` on connect to learn the MCU version (selects legacy vs new text format).
9. 🟡 After a successful upload, show the slot and remember it as the device look (`look.panel = {kind:'slot', slot}`), so existing scenes can use it.
10. 🟡 Strings in en and pt-BR.
11. 🟡 GIF search inside the app through the GIPHY API with the user's own key (clarified 2026-10-31).
12. 🟡 Android share target: "Share → LED Union" from any GIF site or app opens the shared file or link in the editor (clarified 2026-10-31).

### Out
1. 🟡 Playlist and scene kind `item` / `playlist` (`sdd/panel-playlist.md`, `sdd/panel-scenes.md`) — later phase.
2. 🟡 Pixel drawing editor, clock, rhythm, scoreboard, schedule (`sdd/panel-content-library.md` NG-01, NG-04).
3. 🟡 Cloud sync of items (NG-03). Tenor (API shut down 2026-06-30), Klipy and other GIF providers besides GIPHY. GIPHY stickers, trending and categories (search only).
4. 🟡 Data-source placeholders in text (`{name}`, RF-12) — phase 4.
5. 🟡 Raw RGB image format for 256×32 panels (led type 16) and live/camera frames.
6. 🟡 CoolLED content.

## 4. Functional requirements

| ID | Requirement | Conf. | Source |
|---|---|---|---|
| FR-01 | The driver exposes a pure builder that turns `(dataType, subType, slot, content bytes, windowSize)` into the list of window frames: header `len u16 LE, type 2 B, option (00 first / 02 later), total u32 LE, crc32 u32 LE, subType, slot` + payload slice. | 🟡 | `ipixel.md` §2 |
| FR-02 | CRC32 (IEEE, as `zlib.crc32`) is computed over the whole content and repeated in every window. | 🟡 | `ipixel.md` §2 |
| FR-03 | Window payload size is 12288 B when the panel type is `0x00`, `0x80` or `0x81` (or MCU major 2), else 4096 B. | 🟡 | `ipixel.md` §2 window table |
| FR-04 | The upload sender writes each window (chunked by `chunkSize`) and waits for an ACK `05 00 <t0> <t1> <status>` whose `t0 t1` echo the data type: `01` → next window, `03` → done, `00` → error "panel rejected", `02` → error "no space". | 🟡 | `ipixel.md` §2 ACK frames |
| FR-05 | No ACK within 6000 ms aborts the upload with "panel did not answer"; nothing is retried automatically. | 🟡 | `sdd/panel-content-library.md` EC-03 |
| FR-06 | Upload windows bypass coalescing: every window is sent once, in order; other writes to the same device wait until the upload ends or is cancelled. | 🟡 | BR-13, BR-14 |
| FR-07 | The user can cancel; the sender stops before the next window and reports "cancelled". | 🟡 | RF-09 |
| FR-08 | Image: the file is drawn onto a canvas of exactly panel W×H with the chosen fit mode and encoded with `canvas.toBlob('image/png')`; data type `02 00`, sub-type `00`. | 🟡 | RF-05, RF-08; `ipixel.md` §5 |
| FR-09 | GIF: frames and delays are decoded in the browser (`ImageDecoder`; no fallback decoder, see roadmap D7 shortcut), capped at 60 frames by default, each frame fitted to W×H, re-encoded as GIF; data type `03 00`, sub-type `02`. | 🟡 | RF-03, RF-04; `ipixel.md` §5 |
| FR-10 | Text: text header (count, align, effect 0–8, speed, colour mode 1, RGB, black bg) + one char block per character, glyphs rasterised on a canvas at the panel text height (32 px on 32×32), bitmap row-major, width rounded up to 8, bit order configurable (LSB-first default); legacy or new block format chosen by MCU version; data type `00 01`. | 🟡 | RF-07; `ipixel.md` §5 Text |
| FR-11 | On connect the driver also sends `04 00 05 80`; a reply `08 00 05 80 <maj> <min> …` is saved as `panel.mcu` on the device. | 🟡 | `ipixel.md` §3 HW info |
| FR-12 | Import by URL: `fetch` the URL; on network/CORS failure show "This site blocks direct import. Download the file and import it." | 🟡 | RF-02 |
| FR-13 | Preview: canvas showing the exact W×H output scaled up with `image-rendering: pixelated`, animated with the decoded delays; it shows what will be sent, not the source file. | 🟡 | RF-06 |
| FR-14 | Send is disabled while the panel size is unknown, with "Read panel size first". | 🟡 | EC-02 |
| FR-15 | Target slot: the user picks the slot number (1..100) on every send; the default is the last slot LED Union used on that device + 1 (1 when none). The send button names the slot ("Send to slot N") so overwriting vendor content is never silent. | 🟡 | `ipixel.md` §5 Slots; clarified 2026-10-31 |
| FR-16 | On ACK `03` the system sends show-slot for that slot, sets `look.panel = {kind:'slot', slot}` and shows "Sent to slot N". | 🟡 | phase 1 FR-17 |
| FR-17 | Progress bar shows windows sent / total and is visible until done, error or cancel. | 🟡 | RF-09 |
| FR-18 | Every window write and ACK appears in the command trace with source `upload:<kind>`; payload hex is truncated to the header + first 16 bytes so the log stays readable. | 🟡 | phase 1 FR-20 |
| FR-19 | Library: each item (kind, name, source file, settings, last slot per device) is saved in IndexedDB and listed as thumbnails; the user can re-send, rename, duplicate and delete it. Quota error shows "Storage full" and saves nothing partial. | 🟡 | RF-10, RF-11, EC-04; clarified 2026-10-31 |
| FR-20 | Settings hold an optional GIPHY API key, saved only on the device (store `giphyKey`), with a link to developers.giphy.com and a "Remove key" action. Without a key the search box is replaced by "Add a GIPHY key to search". | 🟡 | clarified 2026-10-31 |
| FR-21 | Search: `GET https://api.giphy.com/v1/gifs/search?api_key&q&limit=24&offset&rating=pg-13`; results shown as a grid of `fixed_width_small` stills/animations; "More" loads the next page. | 🟡 | GIPHY docs |
| FR-22 | Tapping a result fetches its `downsized` (or `original` when smaller than 2 MB) GIF and opens it in the editor as a GIF item named after the result title; the item records `source.giphyId`. | 🟡 | FR-09 |
| FR-23 | GIPHY errors: `401/403` → "Invalid GIPHY key", `429` → "GIPHY limit reached, try again in a while", network → "No connection to GIPHY". Search never blocks the rest of the app. | 🟡 | GIPHY beta key 100 calls/hour |
| FR-24 | The search view shows the "Powered by GIPHY" attribution where results appear. | 🟡 | GIPHY terms |
| FR-25 | The web manifest declares a `share_target` (POST, multipart, files `image/*`, plus `title`/`text`/`url`). The service worker answers the share POST, keeps the shared file or link, and redirects to the app, which opens the editor with it: a file follows the import path (FR-08/FR-09), a link follows the URL import (FR-12). | 🟡 | Web Share Target |
| FR-26 | A shared text that contains no URL and no file shows "Nothing to import from this share" and opens nothing. | 🟡 | edge case |

## 5. Non-functional requirements

| ID | Requirement | Conf. |
|---|---|---|
| NFR-01 | Zero regression: all current tests pass and difftest emitter md5 stays `98622b8733585ad72d2b82a0aa7767e0`. | 🟢 policy |
| NFR-02 | Window builder, CRC32, text header and char-block encoder unit-tested with exact bytes (≥ 10 tests), including a 2-window case. | 🟡 |
| NFR-03 | Upload of a 32×32 GIF with 20 frames finishes in < 15 s. | 🟡 `sdd/panel-content-library.md` metrics |
| NFR-04 | At most one small GIF encoder dependency (e.g. `gifenc`); everything else uses platform APIs (Canvas, `ImageDecoder`, `CompressionStream` not needed). | 🟡 RNF-03 |
| NFR-05 | Encoded content ≤ 512 KB; larger content is refused with a message before any write. | 🟡 RNF-02 |
| NFR-06 | Preview renders a frame in < 100 ms on a mid-range phone. | 🟡 RNF-01 |
| NFR-07 | Images never leave the phone except to the panel; the only server calls are the user's URL fetch and GIPHY search (query text + key go to GIPHY). | 🟡 spec §12 |
| NFR-08 | The GIPHY key is never committed, logged in the command trace, or sent anywhere but `api.giphy.com`. | 🟡 |

## 6. Acceptance criteria

- 🟡 **Given** the 32×32 panel connected, **when** the user imports a PNG and taps Send, **then** the panel shows that image and the card says "Sent to slot N".
- 🟡 **Given** a 20-frame GIF, **when** sent, **then** the panel plays the animation at the original speed within 15 s of tapping Send.
- 🟡 **Given** the text "Nº 123" with effect scroll left, **when** sent, **then** the panel scrolls it in the chosen colour.
- 🟡 **Given** a URL from a site that blocks CORS, **when** imported, **then** the message asks to download and import the file, and nothing is sent.
- 🟡 **Given** an upload in progress, **when** the user taps Cancel, **then** no further window is written (visible in the trace).
- 🟡 **Given** the panel answers status `02`, **then** the user sees "Panel memory full" and the look is unchanged.
- 🟡 **Given** a successful upload, **when** the user downloads the log, **then** it lists every window header, every ACK and the final show-slot.
- 🟡 **Given** a valid GIPHY key, **when** the user searches "cat eyes" and taps a result, **then** the editor opens it with a 32×32 preview ready to send.
- 🟡 **Given** the app installed on Android, **when** the user shares a GIF from another app or site to LED Union, **then** the editor opens with that GIF.
- 🟡 **Given** strip and RGB LEDs connected, **when** a scene saved before this feature is applied, **then** the frames are identical to the previous build.

## 7. Risks and hardware unknowns

- 🔴 Text bit order and legacy/new format on the user's MCU (`ipixel.md` Open question 6). Mitigation: FR-10 bit order switch in Debug; first text test on hardware.
- 🔴 Window size and chunk size accepted by Chrome + this panel (open question 1; MTU not visible in Web Bluetooth). Mitigation: chunk 244 B (refs), window 12288 B for `0x81`; trace shows ACK status.
- 🔴 Whether show-slot on an empty slot is silent (trace 2026-10-31 showed no ACK) — affects how "done" is confirmed. Mitigation: rely on upload ACK `03`, not on show-slot ACK.
- 🟡 GIPHY beta key: 100 calls/hour, 50 results per call; enough for one person. Production key needs GIPHY approval.
- 🟡 Share target works only when the PWA is installed; some apps share only a page link (not the GIF), which may hit CORS (FR-12 message).
- 🟡 GIF decoding: `ImageDecoder` exists in Chrome Android; fallback decoder size must stay small.

## 8. Clarifications

| Date | Question | Answer |
|---|---|---|
| 2026-10-31 | Which slot does an upload use? | User picks per send, default last used + 1 (FR-15). |
| 2026-10-31 | Keep sent items? | Yes, IndexedDB library with re-send (FR-19). |
| 2026-10-31 | Search GIF sites from the app? | Yes: GIPHY search with own key (FR-20..24) and Android share target (FR-25, FR-26). Tenor API is shut down. |

---
Gerado por reversa-requirements em 2026-10-31
