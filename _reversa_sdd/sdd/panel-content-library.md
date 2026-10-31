# Spec: panel-content-library

**Version:** 1.0
**Status:** Draft
**Author:** reversa-spec-sdd
**Date:** 2026-10-31
**Reviewers:** André Avila

> Selo 🟡 PLANEJADO em todos os itens.

---

## 1. Resumo (Summary)

🟡 A local library of panel content items: text (font size, colour, scroll effect 0–8, speed), image and GIF imported from the phone (crop, scale, frame cap, preview). Items are rendered in the browser to the panel's exact size and sent through the `ipixel-driver` upload transport into a slot. Phase 2.

---

## 2. Contexto (Context)

**Problem:** 🟡 The Resident and Content creator want house number, cat eyes and internet GIFs on the matrix; the vendor app UI is inflexible and LED Union has no content support.

**Evidence:** 🟡 Personas 2–3 journeys; `ipixel.md` §5 (PNG/GIF payload at panel size, text glyph blocks, effects 0–8).

**Why now:** 🟡 Needed by panel-scenes kind `item` and by the playlist.

---

## 3. Goals

- [ ] 🟡 G-01: Import a GIF from the phone and see it on the matrix.
- [ ] 🟡 G-02: Create a scrolling text item and see it on the matrix.
- [ ] 🟡 G-03: Items persist and can be re-sent without re-importing.

**Success metrics:**
| Metric | Current baseline | Target | Deadline |
|---|---|---|---|
| 🟡 Steps from GIF file to matrix | not possible | ≤ 4 taps | phase 2 |
| 🟡 Upload of 32×32 GIF, 20 frames | n/a | < 15 s | phase 2 |
| 🟡 Library capacity | 0 | ≥ 50 items within 5 MB storage | phase 2 |

---

## 4. Non-Goals

- NG-01: 🟡 Pixel-by-pixel drawing editor (could come later; set-pixel frame exists).
- NG-02: 🟡 Searching GIF websites from inside the app; import is from a file or a pasted URL.
- NG-03: 🟡 Syncing the library across devices or to a cloud.
- NG-04: 🟡 Clock, rhythm and template modes.
- NG-05: 🟡 CoolLED content upload (separate in `coolled-driver`, later).

---

## 5. Usuários (Users)

**Primary user:** 🟡 Content creator; **Secondary:** Resident.

**Current journey:** 🟡 Vendor app gallery; limited import and editing.

**Future journey:** 🟡 Open Library → Import GIF → crop/scale with live preview → Send → it plays on the panel; item saved.

---

## 6. Requisitos Funcionais (Functional Requirements)

### 6.1 Main requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| RF-01 | 🟡 The user must be able to import PNG, JPEG, GIF and WebP from a file picker. | Must | Each format imports in the browser test. |
| RF-02 | 🟡 The user must be able to import from a pasted image URL; on CORS failure the system shows "download the file and import it". | Should | Blocked URL shows that message. |
| RF-03 | 🟡 The system must decode GIF frames and delays in the browser (`ImageDecoder` when available, fallback decoder otherwise). | Must | 20-frame GIF yields 20 frames with delays. |
| RF-04 | 🟡 The user must set fit mode (cover / contain / stretch), crop offset and frame cap (default 60). | Must | Preview changes per setting. |
| RF-05 | 🟡 The system must render every item to exactly `panel.width × panel.height`. | Must | Output canvas size equals panel size. |
| RF-06 | 🟡 The preview must show the item at panel resolution, scaled with nearest-neighbour, animated at the GIF delays. | Must | Visual check; pixels crisp. |
| RF-07 | 🟡 A text item must have: text, colour, font size, effect (0 fixed … 8 laser), speed; the system rasterises glyphs to 1-bit blocks as in `ipixel.md` §5 Text. | Must | Builder test vs a captured vendor frame. |
| RF-08 | 🟡 The system must encode images as PNG and animations as GIF at panel size, then upload via the driver transport to a slot. | Must | Fake transport receives header + CRC matching the encoded file. |
| RF-09 | 🟡 The system must show upload progress (windows sent / total) and allow cancel. | Must | Cancel stops before next window. |
| RF-10 | 🟡 Items must persist (IndexedDB for binary, store for metadata) and survive reload. | Must | Reload shows same items. |
| RF-11 | 🟡 The user must be able to rename, duplicate and delete items. | Should | Actions reflected in list. |
| RF-12 | 🟡 A text item may contain `{name}` placeholders bound to data sources (see `data-sources`). | Could | Placeholder rendered with current value. |

### 6.2 Happy Path

1. 🟡 The user opens Library and taps "Import".
2. 🟡 The user picks `cat-eyes.gif`.
3. 🟡 The system decodes frames and shows a 32×32 preview.
4. 🟡 The user taps "Send to iPixel".
5. 🟡 The system encodes a GIF, uploads to slot N with progress, shows the slot.
6. 🟡 Result: matrix plays cat eyes; item saved.

### 6.3 Alternative flows

**Flow A — Text item:** 🟡 New → Text → type "Nº 123", choose scroll left → preview → Send.

---

## 7. Requisitos Não-Funcionais (Non-Functional)

| ID | Requirement | Target value | Note |
|---|---|---|---|
| RNF-01 | Performance | 🟡 Preview render < 100 ms per frame on mid-range phone | Canvas 2D. |
| RNF-02 | Storage | 🟡 Item binary ≤ 512 KB after encoding | Reject or downscale larger. |
| RNF-03 | Dependencies | 🟡 At most one small GIF encoder dependency (e.g. `gifenc`) | Decision log. |

---

## 8. Design e Interface

**Affected components:** 🟡 new `Library.svelte`, `ItemEditor.svelte`, `src/lib/panel/render.ts` (fit, rasterise), `src/lib/panel/encode.ts`, `src/lib/panel/library.ts` (IndexedDB), `dict.ts`.

**Expected behaviour:** 🟡 Grid of item thumbnails; editor with preview on top and settings below.

**UI states:**
- Empty: 🟡 "No items yet. Import a GIF or create a text."
- Loading: 🟡 decoding spinner; upload progress bar.
- Error: 🟡 "Could not decode file" / "Panel rejected upload (status X)".
- Success: 🟡 toast "Sent to slot N".

---

## 9. Modelo de Dados (Data Model)

```
PanelItem {
  id: string
  name: string
  kind: 'text' | 'image' | 'gif'
  source?: Blob            // original file (IndexedDB)
  text?: { value: string; color: string; size: number; effect: 0..8; speed: number }
  fit?: { mode: 'cover' | 'contain' | 'stretch'; x: number; y: number; maxFrames: number }
  rendered?: { width: number; height: number; bytes: Blob; crc: number }  // cache per panel size
  updatedAt: string
}
```

**Migrations:** 🟡 New IndexedDB store `led-union-items`; localStorage store unchanged.

---

## 10. Integrações e Dependências (Dependencies)

| Dependency | Type | Impact if unavailable |
|---|---|---|
| 🟡 `ipixel-driver` upload transport | Required | No sending; editing still works. |
| 🟡 Canvas 2D, `ImageDecoder` | Required / Optional | Fallback GIF decoder when `ImageDecoder` missing. |
| 🟡 IndexedDB | Required | Fallback: session-only items with warning. |

---

## 11. Edge Cases

| Scenario | Trigger | Expected behaviour |
|---|---|---|
| EC-01: Huge GIF | > 300 frames or > 10 MB | 🟡 Cap to `maxFrames`, warn. |
| EC-02: Panel size unknown | `panel` undefined | 🟡 Send disabled; "Read panel size first". |
| EC-03: Upload timeout | No ACK in 6000 ms | 🟡 Abort, toast, item unchanged. |
| EC-04: Storage quota | IndexedDB quota error | 🟡 Show "Storage full", no partial save. |
| EC-05: Unsupported glyph | Character missing in font | 🟡 Render with browser fallback font. |

---

## 12. Segurança e Privacidade (Security)

- **Authentication:** 🟡 N/A.
- **Authorization:** 🟡 N/A.
- **Sensitive data:** 🟡 User images stay on the device; nothing uploaded to servers.
- **Audit:** 🟡 N/A.

---

## 13. Plano de Rollout (Rollout)

- **Strategy:** 🟡 Phase 2 PR; feature appears only for devices with known panel size.
- **Rollback:** 🟡 Revert; IndexedDB data remains and is ignored.
- **Monitoring:** 🟡 Hardware test: 1 PNG, 1 GIF, 1 text.

---

## 14. Open Questions

| # | Question | Impact | Owner | Deadline |
|---|---|---|---|---|
| OQ-01 | 🟡 Text bit order (LSB-first per app) on user's MCU version? | Medium | André (hardware) | phase 2 |
| OQ-02 | 🟡 Max GIF bytes the panel accepts per slot? | High | André (hardware) | phase 2 |

---

## 15. Decisões Tomadas (Decision Log)

| Decision | Alternatives | Rationale |
|---|---|---|
| 🟡 Render in browser at panel size | Send original file | Panel expects exact-size PNG/GIF. |
| 🟡 IndexedDB for binaries | localStorage base64 | localStorage ~5 MB and strings only. |

---

## Appendix

### References
- `docs/protocol/ipixel.md` §5, `_reversa_sdd/personas.md`

### Revision history
| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-10-31 | reversa-spec-sdd | Initial |

---

## Relatório de avaliação

Iterations: 1

```
  SCORE TOTAL: 100.0/100  —  ⭐ Excelente — Pronta para implementação

  BREAKDOWN POR DIMENSÃO:
  Dimensão             Score      Peso     Contribuição
  --------------------------------------------------
  Completude           100%       30%     30.0/pt
  Testabilidade        100%       25%     25.0/pt
  Clareza              100%       20%     20.0/pt
  Escopo               100%       15%     15.0/pt
  Edge Cases           100%       10%     10.0/pt

  ✅ PONTOS FORTES:
     ✅ Seção 1 (Resumo) presente e preenchida
     ✅ Seção 2 (Contexto) presente e preenchida
     ✅ Seção 3 (Goals) presente e preenchida
     ✅ Seção 4 (Non-Goals) presente e preenchida
     ✅ Seção 5 (Usuários) presente e preenchida
```
