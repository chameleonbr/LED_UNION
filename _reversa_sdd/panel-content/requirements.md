# Panel Content

> Reversa Writer (incremental re-extraction) · 2026-11-01 · unit `panel-content` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/ui/Panel.svelte`, `src/lib/ui/PanelEditor.svelte`, `src/lib/panel/*`, `src/lib/protocol/ipixel-content.ts`, `src/lib/ble.svelte.ts#upload`, `public/share-target.js`, `vite.config.ts`, `docs/protocol/ipixel.md` §2 §5, `_reversa_forward/002-ipixel-conteudo/`

## Overview
A library of images, GIFs and texts that the owner sends to numbered slots of an iPixel LED panel, with a pixel-exact preview, GIPHY search and Android share. 🟢 Verified on a 32×32 panel (mcu 317) on 2026-11-01, except share target.

## Responsibilities
- Import content from a file, a URL, a GIPHY search or an Android share 🟢
- Render it at the panel's exact size and preview it 🟢
- Encode PNG / GIF / text glyphs and upload to a chosen slot, one ACK per window 🟢
- Keep items in an IndexedDB library with the slot used per device 🟢

## Business Rules
BR-60 … BR-67 in `../domain.md#Panel content`; BR-13/15 (one queue op, never coalesced); BR-30 (slot recorded after success); BR-38 (storage never blocks); BR-71 (stealth gate).

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | 🟢 Panel tab lists devices whose driver has `showSlot`; picker when more than one | Must | One iPixel → no picker |
| RF-02 | 🟢 Import file (`image/*`), URL (CORS fetch; failure shows CORS hint) and new text; GIF detected by `GIF8` magic | Must | A `.gif` with empty MIME opens as GIF |
| RF-03 | 🟢 Editor renders at `panel.width × height` with fit cover/contain/stretch on black; GIF up to `maxFrames` (default 60) via `ImageDecoder` | Must | Preview animates at the GIF's delays |
| RF-04 | 🟢 Text: value, colour, effect 0–8, speed 0–100; glyphs at panel height, half-width cells unless wider | Must | "Nº 123" scrolls on the panel |
| RF-05 | 🟢 Encode: text → `textPayload` (legacy or new block by mcu, LSB-first unless Debug switch); >1 frame → GIF (global palette); else PNG | Must | One-frame GIF uploads as type `02 00` |
| RF-06 | 🟢 Refuse content > 512 KB before sending, with the size in KB | Must | Error, no write |
| RF-07 | 🟢 Slot input defaults to the item's slot on this device, else `lastSlot + 1`; clamped 1..100 | Must | Second new item defaults to previous slot + 1 |
| RF-08 | 🟢 Send: leave stealth → encode → save → `upload` with progress and cancel → `showSlot` (force) → `setLook(panel.slot)` → `patchPanel(lastSlot)` → save slot | Must | Status "sent to slot N"; panel shows it |
| RF-09 | 🟢 Upload: window header + CRC32, chunks 244 B, wait ACK 6 s per window; `rejected`/`full`/timeout/cancel → error message, slot not recorded | Must | Cancel mid-GIF stops writes |
| RF-10 | 🟢 Pre-select slot before upload only when mcu ≥ 500; silence tolerated | Should | mcu 317 → no pre-select write |
| RF-11 | 🟢 Library in IndexedDB: list newest first, edit, duplicate (slots cleared), delete with confirm; saved before upload and on close | Must | Item survives a failed upload |
| RF-12 | 🟢 GIPHY: owner saves own key; search 24 per page, "more", attribution "Powered by GIPHY", remove key; errors bad key / rate limit / network | Must | Search "cat" → grid; pick → editor |
| RF-13 | 🟢 Android share target (`share_target` POST multipart `media`); SW stores the share, redirects `./?share=1`; Panel opens the file or fetches the first URL | Should | 🔴 not yet verified on hardware |

## Non-Functional Requirements
- 🟢 NFR-05: 512 KB content cap. NFR-08: GIPHY key never traced or committed.
- 🟢 No new runtime dependency beyond `gifenc` 1.0.3 (MIT).
- 🟢 Chromium only (`ImageDecoder`, Web Bluetooth); no fallback GIF decoder (`shortcut:` in code).

## Acceptance Criteria

```gherkin
Scenario: PNG to a slot
  Given a connected iPixel 32x32
  When the owner imports a PNG and sends it to slot 1
  Then each window is ACKed, the panel shows the image and the item shows "Slot 1"

Scenario: Panel rejects an upload
  Given an upload in progress
  When the panel answers 05 00 02 00 00
  Then the editor shows the rejection and the look is not changed

Scenario: Storage full
  Given IndexedDB quota is exceeded
  When the owner sends an item
  Then "storage full" is shown and the upload still goes out
```

## Priority (MoSCoW)
Must: RF-01..09, 11, 12 · Should: RF-10, 13

## Code Traceability
| RF | Code |
|---|---|
| RF-01, 02, 11, 12, 13 | `src/lib/ui/Panel.svelte`, `src/lib/panel/library.ts`, `src/lib/panel/giphy.ts`, `public/share-target.js`, `vite.config.ts` |
| RF-03..08 | `src/lib/ui/PanelEditor.svelte`, `src/lib/panel/render.ts` |
| RF-05, 09 | `src/lib/protocol/ipixel-content.ts`, `src/lib/ble.svelte.ts#upload` |
