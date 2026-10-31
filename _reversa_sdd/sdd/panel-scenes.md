# Spec: panel-scenes

**Version:** 1.0
**Status:** Draft
**Author:** reversa-spec-sdd
**Date:** 2026-10-31
**Reviewers:** André Avila

> Selo 🟡 PLANEJADO em todos os itens.

---

## 1. Resumo (Summary)

🟡 Extend existing scenes so one scene can drive strips, RGB LEDs and LED panels together. A panel entry in a scene holds power, brightness and one panel action: show a saved slot, play a library item, or play a playlist. Existing scene entries keep their format and behaviour. Phase 1 (slot) and phase 2 (item/playlist).

---

## 2. Contexto (Context)

**Problem:** 🟡 Scenes today snapshot `Look` (power, colour, brightness, white, cct, effect) per endpoint key. Panels have no colour; the scene has no way to say "show house number on the iPixel".

**Evidence:** 🟡 PRD success metric "scenes with strip + RGB LEDs + iPixel"; `persist.ts` `Scene.entries: { key, look }[]`.

**Why now:** 🟡 It is the user's primary success criterion.

---

## 3. Goals

- [ ] 🟡 G-01: Saving a scene while an iPixel is selected stores its panel state.
- [ ] 🟡 G-02: Applying the scene sets strip, RGB LEDs and panel in one tap.
- [ ] 🟡 G-03: Scenes saved before this change load and apply exactly as before.

**Success metrics:**
| Metric | Current baseline | Target | Deadline |
|---|---|---|---|
| 🟡 Devices in one mixed scene | strip + RGB only | strip + RGB + iPixel | phase 1 |
| 🟡 Legacy scene regression tests | existing | 100% pass | every PR |
| 🟡 Apply time for 3-device scene (panel slot) | n/a | < 2 s to last ACK | phase 1 |

---

## 4. Non-Goals

- NG-01: 🟡 Uploading content during scene apply in phase 1 (only show already-stored slot).
- NG-02: 🟡 Timed scene sequences (that is the playlist component).
- NG-03: 🟡 Colour on iPixel panels (no protocol command).
- NG-04: 🟡 Changing how strip/RGB entries are stored.

---

## 5. Usuários (Users)

**Primary user:** 🟡 Driver (driving scene), Resident (balcony scene).

**Current journey:** 🟡 Apply scene in LED Union for the strip; open vendor app to set panel.

**Future journey:** 🟡 Select strip, RGB LEDs and iPixel; save scene; apply it later with one tap.

---

## 6. Requisitos Funcionais (Functional Requirements)

### 6.1 Main requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| RF-01 | 🟡 The system must give `Look` an optional `panel` field: `{ kind: 'slot', slot } \| { kind: 'item', itemId } \| { kind: 'playlist', playlistId }`. | Must | Type compiles; old JSON without `panel` parses. |
| RF-02 | 🟡 The system must, when saving a scene, snapshot `panel` for panel endpoints the same way it snapshots looks today. | Must | Unit test on `addScene`. |
| RF-03 | 🟡 The system must, when applying a scene, send, per panel entry: power, brightness, then the panel action. | Must | Fake transport order: power → brightness → show-slot. |
| RF-04 | 🟡 The system must run entries for different devices in parallel and frames for one device in order. | Must | Test with 2 devices: interleaving allowed across devices only. |
| RF-05 | 🟡 Kind `item` must upload the item to a reserved slot (default 1..N mapping kept by library) only if the panel does not already hold that item version, then show it. | Should | Second apply sends only show-slot. |
| RF-06 | 🟡 Kind `playlist` must start the playlist component on that endpoint. | Should | Playlist state becomes "playing". |
| RF-07 | 🟡 The scene editor must show panel entries with their action summary ("Slot 3", "House number", "Playlist Night"). | Must | Rendered label per kind. |
| RF-08 | 🟡 Strip, RGB LEDs and existing drivers must apply with the same frames as before this change. | Must | Difftest md5 `98622b8733585ad72d2b82a0aa7767e0` unchanged; scene tests green. |
| RF-09 | 🟡 Scene apply must respect stealth (blocked while active). | Must | Apply during stealth asks to leave stealth. |

### 6.2 Happy Path

1. 🟡 The user sets strip colour, RGB LED colour and iPixel slot 3.
2. 🟡 The user saves scene "Night drive".
3. 🟡 Later the user taps "Night drive".
4. 🟡 The system writes strip and RGB frames and iPixel power, brightness, show-slot 3.
5. 🟡 Result: all three match the saved state.

### 6.3 Alternative flows

**Flow A — Panel offline:** 🟡 other entries apply; toast "iPixel not connected".

---

## 7. Requisitos Não-Funcionais (Non-Functional)

| ID | Requirement | Target value | Note |
|---|---|---|---|
| RNF-01 | Performance | 🟡 Mixed scene without upload < 2 s | Measured to last ACK. |
| RNF-02 | Compatibility | 🟡 Persisted store version stays `led-union/v1` | Additive optional field. |

---

## 8. Design e Interface

**Affected components:** 🟡 `persist.ts` (`Look.panel`), `store.svelte.ts` (`addScene`, apply), `Scenes.svelte`, `DeviceCard.svelte` (panel action picker), `dict.ts`.

**Expected behaviour:** 🟡 Panel cards show an action picker (slot / library item / playlist); scenes capture it.

**UI states:**
- Empty: 🟡 panel with no action → scene stores power + brightness only.
- Loading: 🟡 spinner on the scene button while uploads run.
- Error: 🟡 toast per failed endpoint.
- Success: 🟡 scene button highlighted as last applied.

---

## 9. Modelo de Dados (Data Model)

```
Look (extended) {
  panel?: { kind: 'slot'; slot: number }
        | { kind: 'item'; itemId: string }
        | { kind: 'playlist'; playlistId: string }
}
```

**Migrations:** 🟡 No.

---

## 10. Integrações e Dependências (Dependencies)

| Dependency | Type | Impact if unavailable |
|---|---|---|
| 🟡 `ipixel-driver` | Required | No panel entries. |
| 🟡 `panel-content-library` | Optional (kind item) | Kind `item` hidden; fallback to slot. |
| 🟡 `panel-playlist` | Optional (kind playlist) | Kind `playlist` hidden. |

---

## 11. Edge Cases

| Scenario | Trigger | Expected behaviour |
|---|---|---|
| EC-01: Item deleted | Scene references missing `itemId` | 🟡 Skip panel action, apply power/brightness, toast. |
| EC-02: Upload failure | ACK error or timeout | 🟡 Keep other entries applied; panel shows previous content; toast. |
| EC-03: Panel size changed | Scene item made for another size | 🟡 Re-render item to current size before upload. |
| EC-04: Legacy scene | No `panel` field | 🟡 Applied exactly as before. |

---

## 12. Segurança e Privacidade (Security)

- **Authentication:** 🟡 N/A.
- **Authorization:** 🟡 N/A.
- **Sensitive data:** 🟡 None.
- **Audit:** 🟡 Debug log.

---

## 13. Plano de Rollout (Rollout)

- **Strategy:** 🟡 Slot kind in phase 1 PR; item/playlist kinds in phase 2 PR.
- **Rollback:** 🟡 Revert; scenes with `panel` keep working for non-panel entries.
- **Monitoring:** 🟡 Hardware test: one mixed scene, applied 10 times.

---

## 14. Open Questions

| # | Question | Impact | Owner | Deadline |
|---|---|---|---|---|
| OQ-01 | 🟡 Which slot range does LED Union reserve on the panel so it does not overwrite vendor-app content? | Medium | André | phase 2 |

---

## 15. Decisões Tomadas (Decision Log)

| Decision | Alternatives | Rationale |
|---|---|---|
| 🟡 Extend `Look` with optional `panel` | New `PanelScene` type | Reuses snapshot/apply code and endpoint keys. |

---

## Appendix

### References
- `_reversa_sdd/prd.md`, `src/lib/persist.ts`, `src/lib/store.svelte.ts`

### Revision history
| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-10-31 | reversa-spec-sdd | Initial |

---

## Relatório de avaliação

Iterations: 2

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
