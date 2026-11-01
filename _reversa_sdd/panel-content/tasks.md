# Panel Content, Implementation Tasks

> Reversa Writer (incremental re-extraction) · 2026-11-01 · unit `panel-content` · all implemented in `1257909` (feature 002)

## Prerequisites
- [x] `protocol-drivers/` ipixel driver with `showSlot`, `chunkSize`, `onNotify` (mcu)
- [x] `device-connection/` notify listener and ACK waiters

## Tasks
- [x] T-01, Upload bytes: `windows`, `crc32`, `windowSize`, `parseAck`, `textPayload` — `protocol/ipixel-content.ts` — Done: 10 tests pass — 🟢
- [x] T-02, Upload I/O: `upload`, `listenFor`, `writeAndWait`, `UploadError` — `ble.svelte.ts` — Done: PNG/GIF/text on hardware — 🟢
- [x] T-03, Renderer: fit, GIF decode, PNG/GIF encode, text raster — `panel/render.ts` — 🟢
- [x] T-04, Library (IndexedDB) — `panel/library.ts` — 🟢
- [x] T-05, Editor and Panel views — `ui/PanelEditor.svelte`, `ui/Panel.svelte` — 🟢
- [x] T-06, GIPHY search — `panel/giphy.ts` (3 tests) — Done: verified on hardware — 🟢
- [x] T-07, Share target — `public/share-target.js`, `vite.config.ts` — Done when: share from another app opens the editor — 🔴 untested
- [ ] T-08, Insist on ACK `03` for the last window (TD-16) — 🟡 optional
- [ ] T-09, Scrolling text preview (TD-17) — 🟡 optional
