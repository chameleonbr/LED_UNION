# Actions — 002 ipixel-conteudo

> Source: `roadmap.md` (D1–D17), `data-delta.md`, `requirements.md` (FR-01..FR-26). `[//]` = parallelizable with the other `[//]` tasks of its phase.

## Summary

- Total actions: 24
- Parallelizable `[//]`: 12
- Longest dependency chain: T001 → T005 → T010 → T011 → T017 → T019 → T023 (7)

## 1. Preparation

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T001 | `[//]` `PanelInfo.mcu?`, `SavedDevice.panel.lastSlot?`, `Persisted.giphyKey?` (data-delta). | — | `[//]` | `src/lib/protocol/types.ts`, `src/lib/persist.ts` | 🟡 | [X] |
| T002 | `[//]` Add `gifenc@1.0.3` dependency. | — | `[//]` | `package.json` | 🟢 | [X] |
| T003 | `[//]` en + pt-BR strings: Panel tab, import file/URL, new text, fit modes, frames, text fields, slot, send to slot N, progress, cancel, errors (D13, FR-23, FR-26), GIPHY key/search/more/attribution, storage full, GIF unsupported. | — | `[//]` | `src/lib/dict.ts` | 🟡 | [X] |

## 2. Tests

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T004 | `[//]` Tests: `crc32` known vectors; `windows()` single and 2-window cases (header bytes, option 00/02, total + crc repeated, slot); `windowSize` 12288 for `0x81`, 4096 for `0x8A`; `parseAck` next/done/rejected/no-space/ignore non-ack; `textPayload` header + legacy and new char block bytes, LSB-first bit packing. | — | `[//]` | `src/lib/protocol/ipixel-content.test.ts` | 🟡 | [X] |
| T005 | `[//]` Update ipixel tests: `onConnect` returns device-info + `04 00 05 80`; `onNotify` on `08 00 05 80 12 09 …` → `{panel:{mcu:1209}}`; `chunkSize` 244. | T001 | `[//]` | `src/lib/protocol/ipixel.test.ts` | 🟡 | [X] |
| T006 | `[//]` Tests: `setPanel` keeps known size and now merges `mcu`; GIPHY URL building + error mapping (401/429/network). | T001 | `[//]` | `src/lib/persist.test.ts`, `src/lib/panel/giphy.test.ts` | 🟡 | [X] |

## 3. Core

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T007 | `[//]` Pure builders: `crc32`, `windowSize`, `windows`, `parseAck`, `textPayload`, `charBlock` (D1, D8 bytes). | T004 | `[//]` | `src/lib/protocol/ipixel-content.ts` | 🟡 | [X] |
| T008 | HW-info query in `onConnect`, `parseHwInfo` in `onNotify`, `chunkSize: 244` (D2, D4). | T005 | | `src/lib/protocol/ipixel.ts` | 🟡 | [X] |
| T009 | `setPanel` merges every received field, refuses only to drop known width/height; `setLastSlot(id, slot)` (D2, D11). | T006 | | `src/lib/store.svelte.ts` | 🟡 | [X] |
| T010 | Notify listener routes data to per-device `ackWaiters` before `onNotify` (D3). | T008 | | `src/lib/ble.svelte.ts` | 🟡 | [X] |
| T011 | `upload(id, frames, {onProgress, signal, source})`: one `queue.push` op, optional pre show-slot on mcu > 400 (D5), chunk loop over `writeOnce` without gap, ACK wait 6000 ms, status mapping, cancel between windows, trace with truncated hex (FR-04..07, FR-18). | T007, T010 | | `src/lib/ble.svelte.ts` | 🟡 | [X] |
| T012 | `[//]` Render: `fitDraw(bitmap, w, h, mode)`, `encodePng`, `decodeGif` (ImageDecoder, cap, delays; unsupported → error), `encodeGif` (gifenc), `rasterText(text, h, rgb)` → glyph bitmaps (D6–D8), 512 KB guard (D9). | T002 | `[//]` | `src/lib/panel/render.ts` | 🟡 | [X] |
| T013 | `[//]` IndexedDB library: open `led-union-items` v1, `list`, `put`, `remove`, quota → `StorageFull` (D10). | T001 | `[//]` | `src/lib/panel/library.ts` | 🟡 | [X] |
| T014 | `[//]` GIPHY client: `search(key, q, offset)` → items, error mapping (D15, FR-21..23). | T006 | `[//]` | `src/lib/panel/giphy.ts` | 🟡 | [X] |
| T015 | `[//]` Share handler: SW `fetch` listener for `POST …/share`, store file or URL text in Cache `led-union-share`, 303 to `./?share=1` (D16). | — | `[//]` | `public/share-target.js` | 🟡 | [X] |

## 4. Integration

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T016 | Manifest `share_target` + `workbox.importScripts: ['share-target.js']` (D16). | T015 | | `vite.config.ts` | 🟡 | [X] |
| T017 | Editor: preview canvas (pixelated, animated), fit mode, frame cap, text fields, slot input (default lastSlot + 1), Send to slot N → render + build windows + `upload`, progress + cancel, on done show-slot + `look.panel` + `setLastSlot` + save item (FR-13..17, FR-19). | T009, T011, T012, T013 | | `src/lib/ui/PanelEditor.svelte` | 🟡 | [X] |
| T018 | Panel tab: iPixel device picker, item grid (thumbs, rename, duplicate, delete, re-send), Import file, Import URL (CORS message), New text, opens editor (FR-12, FR-19). | T017 | | `src/lib/ui/Panel.svelte` | 🟡 | [X] |
| T019 | GIPHY section in Panel: key field + link + remove, search, grid, More, "Powered by GIPHY", tap → fetch GIF → editor (FR-20..24). | T014, T018 | | `src/lib/ui/Panel.svelte` | 🟡 | [X] |
| T020 | On `?share=1`: read + delete cache entry, file → editor, URL → URL import, nothing → FR-26 message; switch to Panel tab. | T016, T018 | | `src/App.svelte` | 🟡 | [X] |
| T021 | Add Panel tab to the tab bar. | T018 | | `src/App.svelte` | 🟢 | [X] |
| T022 | Debug: text bit-order flip switch used by `rasterText` / `charBlock` (risk mitigation). | T012 | | `src/lib/ui/Debug.svelte` | 🟡 | [X] |

## 5. Polish

| ID | Description | Dependencies | Parallelism | Target file | Confidence | Status |
|---|---|---|---|---|---|---|
| T023 | Run `npm test`, `npm run check`, `npm run build`; difftest emitter md5 `98622b8733585ad72d2b82a0aa7767e0` unchanged (NFR-01). | T019, T020, T021, T022 | | — | 🟢 | [X] |
| T024 | `[//]` README / README.pt-BR: iPixel row → phase 2 (content, GIPHY, share), "not yet tested on hardware". | — | `[//]` | `README.md`, `README.pt-BR.md` | 🟢 | [X] |
