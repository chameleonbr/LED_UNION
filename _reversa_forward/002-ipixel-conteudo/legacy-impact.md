# Legacy impact — 002 ipixel-conteudo

**Date:** 2026-10-31 · **Feature:** 002-ipixel-conteudo · **Branch:** `feat/ipixel-phase2` · **Builds on:** 001-ipixel-fase1 (PR #4)

## Affected files

| Affected file | Component (`_reversa_sdd/architecture.md`) | Type | Severity | Justification |
|---|---|---|---|---|
| `src/lib/protocol/ipixel-content.ts` | protocol-drivers | componente-novo | MEDIUM | Pure window/CRC/ACK/text builders (ADR-002). |
| `src/lib/protocol/ipixel.ts` | protocol-drivers | regra-alterada | LOW | `onConnect` adds HW-info query `04 00 05 80`; `onNotify` parses firmware version; `chunkSize: 244`. iPixel only. |
| `src/lib/protocol/types.ts` | protocol-drivers | regra-nova | LOW | `DeviceReport.mcu?`. |
| `src/lib/ble.svelte.ts` | device-control | regra-nova | HIGH | `upload()`: one `WriteQueue.push` op for all windows, ACK listener per device, timeout after write, cancel; `writeRaw`/`writeFrame` gain optional brief-log / no-gap parameters (defaults unchanged). |
| `src/lib/store.svelte.ts` | persistence | regra-alterada | LOW | `setOrientation` replaced by `patchPanel(id, {orientation, mcu, lastSlot})`. |
| `src/lib/persist.ts` | persistence | delta-de-dados | LOW | Optional `panel.mcu`, `panel.lastSlot`, `Persisted.giphyKey`. |
| `src/lib/panel/render.ts` | (new) panel content | componente-novo | MEDIUM | Canvas fit, PNG, GIF decode (`ImageDecoder`) and encode (`gifenc`), glyph raster. |
| `src/lib/panel/library.ts` | (new) panel content | componente-novo / delta-de-dados | MEDIUM | IndexedDB `led-union-items`. |
| `src/lib/panel/giphy.ts` | (new) external | delta-de-contrato-externo | MEDIUM | GIPHY search API with owner's key. |
| `public/share-target.js`, `vite.config.ts` | (new) PWA shell | delta-de-contrato-externo | MEDIUM | Manifest `share_target`; SW handles `POST …/share`. |
| `src/lib/ui/Panel.svelte`, `PanelEditor.svelte` | ui | componente-novo | MEDIUM | Panel tab, editor, GIPHY, share pickup. |
| `src/App.svelte` | ui | regra-alterada | LOW | Panel tab; `?share=1` opens it. |
| `src/lib/ui/DeviceCard.svelte` | ui | regra-alterada | LOW | Uses `patchPanel`. |
| `src/lib/ui/Debug.svelte` | debug | regra-nova | LOW | Text bit-order switch (session only). |
| `src/lib/dict.ts` | i18n | regra-nova | LOW | en + pt-BR strings. |
| `package.json` | tooling | delta-de-dados | LOW | + `gifenc` 1.0.3 (MIT), the first runtime dependency besides Svelte. |

## Conceptual diff

- **device-control:** until now every write was a short frame, coalesced or pushed. Uploads add a long, ordered, ACK-paced operation that holds a device's queue until done; other writes to that device wait (expected, FR-06). Other families are untouched.
- **device-connection:** the iPixel connect handshake now sends two frames; the notify listener also feeds upload ACK waiters.
- **persistence:** a second store (IndexedDB) for binary content; localStorage store unchanged in shape except optional fields.
- **external:** first outbound HTTP calls besides user-supplied URLs (GIPHY, only with the owner's key).

## Preserved

- 🟢 BR-02, BR-04 (driver resolution and order), BR-12 (offline reconnect, also for uploads), BR-13/BR-14 (queue + coalescing, no change to `WriteQueue`), BR-21, BR-30 (look set only after ACK done), BR-31..BR-35, BR-36, BR-38.
- 🟢 Frames of fff0, ffe0, bledim: difftest md5 `98622b8733585ad72d2b82a0aa7767e0` unchanged.

## Modified

- 🟢 BR-13 (writes serialized per device): still true; an upload is one serialized op that can last seconds.
- 🟢 BR-30 (records what was sent): uploads also read the panel's ACKs; look recorded only on ACK `03`.
