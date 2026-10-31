# Roadmap — 002 ipixel-conteudo

> Delta over the legacy described in `_reversa_sdd/` plus feature 001 (merged, PR #4). Requirements: `requirements.md` (0 open doubts).

## 1. Approach

🟡 Keep the phase 1 split: pure byte builders in `src/lib/protocol/`, I/O in `ble.svelte.ts`, browser rendering in a new `src/lib/panel/` folder, UI in a new **Panel** tab. The upload is **one** `WriteQueue.push` op that owns the device until every window is ACKed, so coalescing never touches it and other writes wait behind it (FR-06). ACKs are routed from the existing notify listener to a per-device waiter. GIF decoding uses the platform `ImageDecoder`; GIF encoding uses `gifenc` (the one dependency NFR-04 allows); PNG uses `canvas.toBlob`. The library lives in IndexedDB through a ~40-line wrapper, no dependency.

## 2. Principles applied

🟢 No `.reversa/principles.md`. Implicit principles from `_reversa_sdd/domain.md` and ADRs:

| Principle | How |
|---|---|
| ADR-002 pure builders | `windows()`, `crc32()`, `textPayload()`, `parseAck()`, `parseHwInfo()` are pure and byte-tested; canvas work stays in `panel/render.ts`. |
| ADR-004 serial queue + coalescing | Upload = single `push` op; no change to `WriteQueue`. |
| BR-30 record what was sent | `look.panel` set only after ACK `03`; failures leave the look unchanged. |
| BR-38 storage never blocks | IndexedDB errors surface as "Storage full" / warning; sending still works from the editor. |
| Phase 1 trace | Upload writes and ACKs go through `writeRaw` / notify trace; window hex truncated (FR-18). |

No conflicts.

## 3. Technical decisions

| # | Decision | Conf. |
|---|---|---|
| D1 | New pure module `src/lib/protocol/ipixel-content.ts`: `crc32(bytes)`, `windowSize(panel)`, `windows({dataType, subType, slot, content, size})`, `parseAck(data)`, `textPayload(blocks, opts)`, `charBlock(bitmap, w, h, rgb, format)`. | 🟡 |
| D2 | `ipixel.onConnect` returns `[deviceInfo, 04 00 05 80]`; `onNotify` also parses `08 00 05 80 maj min …` → `{panel:{mcu: maj*100+min}}`. `setPanel` is changed to merge any field it receives and only refuse to drop a known `width/height` (today it keeps only `locked`). | 🟡 |
| D3 | `ble.svelte.ts` gets `ackWaiters: Map<id, (d: Uint8Array) => void>`; the notify listener calls it before `onNotify`. `export async function upload(id, frames, {onProgress, signal, source})` does `queue.push(async () => for each window: write chunks with no gap (write-with-response paces them), await ACK ≤ 6000 ms, map status)`. | 🟡 |
| D4 | Chunk size for iPixel set to `244` (refs; MTU invisible in Web Bluetooth). Upload chunks skip the `minGapMs` sleep in `writeFrame` (a dedicated loop over `writeOnce`), so a 12 KB window is ~51 awaited writes, not 51 × 100 ms. | 🟡 |
| D5 | On `panel.mcu > 400` (major > 4) the upload first sends show-slot for the target slot and waits ≤ 2 s for `05 00 08 80 01`; no ACK is not an error (trace 2026-10-31: empty slot gave none). | 🟡 |
| D6 | Image: `createImageBitmap(file)` → canvas W×H with fit cover/contain/stretch, `imageSmoothingEnabled` on for downscale → `toBlob('image/png')`. | 🟡 |
| D7 | GIF: `new ImageDecoder({data, type:'image/gif'})`, iterate `decode({frameIndex})` up to cap (default 60), keep `duration/1000` ms delays → draw each to W×H → `gifenc` `quantize` (256 colours, global palette from first frame + `applyPalette` per frame) → `writeFrame(..., {delay})`. shortcut: no fallback decoder when `ImageDecoder` is missing (Web Bluetooth already requires Chrome ≥ 94, which has it); show "GIF not supported in this browser". | 🟡 |
| D8 | Text: rasterise each character with `fillText` on a canvas of the panel text height (32 px for 32×32), alpha > 127 → 1. Legacy block `[size_type R G B bitmap]` with half-width 16×32 (`2`) for normal glyphs and square 32×32 (`3`) when measured width > 16; new block `[80 R G B w h bitmap]` when `mcuVersion` in the new-format ranges (`ipixel.md` §3). Bit order LSB-first, flag in Debug to flip. Header: count, align 0/0, effect, speed, colour mode 1, RGB, bg 0. | 🟡 |
| D9 | Content limits: encoded bytes ≤ 512 KB (NFR-05), else refuse before any write. | 🟡 |
| D10 | Library: `src/lib/panel/library.ts` with IndexedDB db `led-union-items` v1, store `items` keyed by `id`: `PanelItem` (see `data-delta.md`). `list / put / remove`. Quota error → throw `StorageFull`. | 🟡 |
| D11 | Slot default (FR-15): `SavedDevice.panel.lastSlot` + 1, capped 100, stored after ACK `03`. | 🟡 |
| D12 | UI: new tab **Panel** (`src/lib/ui/Panel.svelte`): device picker (online iPixel devices; auto when one), item grid with thumbnails, buttons Import file / Import URL / New text. Editor (`PanelEditor.svelte`): preview canvas on top (W×H × scale, `image-rendering: pixelated`), settings below, slot input, "Send to slot N", progress bar + Cancel. | 🟡 |
| D13 | Errors mapped to strings: `00` "Panel rejected the content", `02` "Panel memory full", timeout "Panel did not answer", cancel "Cancelled", CORS "This site blocks direct import…". | 🟡 |
| D15 | GIPHY: `src/lib/panel/giphy.ts` with `search(key, q, offset)` → `{id,title,thumb,gif}` list via `fetch` (GIPHY allows browser calls); errors mapped per FR-23. Key in `Persisted.giphyKey`. Search UI is a section of `Panel.svelte` with "Powered by GIPHY" text mark. | 🟡 |
| D16 | Share target: manifest `share_target {action:'./share', method:'POST', enctype:'multipart/form-data', params:{title,text,url,files:[{name:'media',accept:['image/*']}]}}`. vite-plugin-pwa `workbox.importScripts: ['share-target.js']` (file in `public/`): a `fetch` listener for `POST …/share` reads `formData()`, puts the file (or the URL text) in Cache Storage `led-union-share` under a fixed key, and answers `Response.redirect('./?share=1', 303)`. The app on `?share=1` reads and deletes that cache entry, then opens the editor. | 🟡 |
| D17 | A share without file looks for the first `http(s)://` in `url`, then `text`; none → FR-26 message. | 🟡 |
| D14 | URL import: `fetch(url, {mode:'cors'})`; `TypeError` → CORS message; the `Blob` then follows the file path. | 🟡 |

## 4. Architectural delta

| File | Change |
|---|---|
| `src/lib/protocol/ipixel-content.ts` | **new**, pure builders (D1). |
| `src/lib/protocol/ipixel-content.test.ts` | **new**, ≥ 10 byte-exact tests (NFR-02). |
| `src/lib/protocol/ipixel.ts` | HW-info query + parse (D2), `chunkSize: 244` (D4). |
| `src/lib/protocol/ipixel.test.ts` | update onConnect test (2 frames), HW-info parse test. |
| `src/lib/protocol/types.ts` | `PanelInfo` gains `mcu?`. |
| `src/lib/store.svelte.ts` | `setPanel` merge fix (D2), `setLastSlot`. |
| `src/lib/persist.ts` | `SavedDevice.panel.lastSlot?`. |
| `src/lib/ble.svelte.ts` | ACK routing + `upload()` (D3, D4, D5). |
| `src/lib/panel/render.ts` | **new**, fit/draw, PNG, GIF decode+encode, text rasterise (D6–D8). |
| `src/lib/panel/library.ts` | **new**, IndexedDB (D10). |
| `src/lib/ui/Panel.svelte`, `PanelEditor.svelte` | **new** (D12). |
| `src/App.svelte` | Panel tab. |
| `src/lib/dict.ts` | en + pt-BR strings. |
| `package.json` | + `gifenc@1.0.3` (MIT). |
| `src/lib/panel/giphy.ts` | **new**, search client (D15) + small test of URL building / error mapping. |
| `public/share-target.js` | **new**, service-worker share handler (D16). |
| `vite.config.ts` | manifest `share_target`, `workbox.importScripts`. |
| `src/lib/persist.ts` | `Persisted.giphyKey?`. |

## 5. Data delta

See `data-delta.md`. localStorage additive (`panel.mcu`, `panel.lastSlot`); new IndexedDB db.

## 6. Contract delta

🟢 No external HTTP contract. BLE upload contract in `docs/protocol/ipixel.md` §2 and §5; `interfaces/` omitted.

## 7. Migration

🟢 None: new fields optional, IndexedDB created on first open. Rollback leaves an unused IndexedDB db.

## 8. Risks

| Risk | Mitigation |
|---|---|
| 🔴 Text bit order / format wrong on this MCU | Debug flag to flip bit order; trace shows MCU version; test text last. |
| 🔴 Window or chunk size refused | ACK status in trace; `windowSize` is one function to change. |
| 🟡 `gifenc` palette banding on photos | 32×32 is tiny; acceptable; could add dithering later. |
| 🟡 GIPHY changes terms or shuts the API (as Tenor did) | Search is isolated in `giphy.ts`; share target and file/URL import keep working. |
| 🟡 Share POST lands before the SW is active (first install) | Test after install; fallback is file import. |
| 🟡 Upload blocks other writes on that device for seconds | Expected (FR-06); progress bar makes it visible; cancel releases the queue. |

## 9. Definition of done

- 🟡 All FR in `requirements.md` implemented; NFR-01 tests + md5 unchanged; `npm run check`, `npm run build` green.
- 🟡 PNG, GIF and text each reach the user's 32×32 panel (hardware trace returned).
