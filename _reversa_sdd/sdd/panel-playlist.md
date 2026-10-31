# Spec: panel-playlist

**Version:** 1.0
**Status:** Draft
**Author:** reversa-spec-sdd
**Date:** 2026-10-31
**Reviewers:** André Avila

> Selo 🟡 PLANEJADO em todos os itens.

---

## 1. Resumo (Summary)

🟡 Ordered playlists of library items (GIFs, images, texts) for a panel. Two modes: **device** mode uploads items to slots and sends the iPixel program list (`<len> 00 08 80 <count> 00 <slots…>`), so the panel loops on its own even with the phone away; **app** mode steps through items with per-item duration, weekdays/time windows and live data refresh, which needs LED Union open. Phase 2.

---

## 2. Contexto (Context)

**Problem:** 🟡 The Resident wants the balcony matrix to cycle house number, cat eyes and fun GIFs, with more control than the vendor app (order, duration, loop).

**Evidence:** 🟡 Resident journey steps 5–6; `ipixel.md` §5 "Slots and the program list".

**Why now:** 🟡 Core of the balcony use case.

---

## 3. Goals

- [ ] 🟡 G-01: Build a playlist of ≥ 2 items and send it; the panel loops them without the phone (device mode).
- [ ] 🟡 G-02: Set per-item duration in app mode and see it respected ± 1 s.
- [ ] 🟡 G-03: Reorder, enable/disable and delete items in the playlist.

**Success metrics:**
| Metric | Current baseline | Target | Deadline |
|---|---|---|---|
| 🟡 Playlist items supported | vendor list only | ≥ 20 items | phase 2 |
| 🟡 App-mode timing error | n/a | ≤ 1 s per item | phase 2 |
| 🟡 Device-mode survives phone leaving | n/a | 100% (panel keeps looping) | phase 2 |

---

## 4. Non-Goals

- NG-01: 🟡 Cross-device playlists (several panels in sync) in v1; scenes cover multi-device.
- NG-02: 🟡 Running app mode with the screen off / in background.
- NG-03: 🟡 Transitions between items beyond what the panel does natively.
- NG-04: 🟡 Server-side scheduling.

---

## 5. Usuários (Users)

**Primary user:** 🟡 Resident.

**Current journey:** 🟡 Vendor app channel list with fixed behaviour.

**Future journey:** 🟡 New playlist → add items → order/duration → Send → panel loops.

---

## 6. Requisitos Funcionais (Functional Requirements)

### 6.1 Main requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| RF-01 | 🟡 The user must create, rename and delete playlists. | Must | CRUD reflected after reload. |
| RF-02 | 🟡 The user must add library items, reorder by drag or up/down, and toggle each item on/off. | Must | Order persisted. |
| RF-03 | 🟡 Device mode: the system must upload each enabled item to its slot (skip if unchanged) then send the program list with those slots in order. | Must | Fake transport: uploads then `08 80` list frame with N slots. |
| RF-04 | 🟡 App mode: the system must show each item for its duration (1–3600 s) and loop. | Must | Timer test with fake clock. |
| RF-05 | 🟡 App mode must refresh data-bound text items before showing them. | Should | Fresh value shown per cycle. |
| RF-06 | 🟡 App mode must support optional time window (start–end hour) and weekdays per playlist. | Could | Outside window: playlist idle. |
| RF-07 | 🟡 Playback state (playing / stopped, current index) must be visible on the panel card. | Must | Card shows "Playing 3/7". |
| RF-08 | 🟡 Stealth must stop app-mode playback; leaving stealth resumes it. | Must | 0 writes during stealth. |
| RF-09 | 🟡 Device mode must reject playlists over the slot limit (100) with a clear message. | Must | 101 items → error shown. |

### 6.2 Happy Path

1. 🟡 The user creates "Balcony" with house number, cat eyes, funny GIF.
2. 🟡 The user chooses device mode and taps Send.
3. 🟡 The system uploads changed items and sends the program list.
4. 🟡 Result: the matrix loops the 3 items; the phone can leave.

### 6.3 Alternative flows

**Flow A — App mode:** 🟡 user sets 10 s / 30 s / 5 s; system shows each slot in turn via show-slot while the page is visible, with Wake Lock held.

---

## 7. Requisitos Não-Funcionais (Non-Functional)

| ID | Requirement | Target value | Note |
|---|---|---|---|
| RNF-01 | Timing | 🟡 ≤ 1 s drift per item (app mode) | Uses wall clock, not interval accumulation. |
| RNF-02 | Power | 🟡 Wake Lock held only while app mode plays | Released on stop. |

---

## 8. Design e Interface

**Affected components:** 🟡 new `Playlists.svelte`, `src/lib/panel/playlist.ts`, `persist.ts`, `DeviceCard.svelte`, `dict.ts`.

**Expected behaviour:** 🟡 List of playlists; editor with item rows (thumbnail, duration, toggle).

**UI states:**
- Empty: 🟡 "Add items from the Library".
- Loading: 🟡 upload progress per item.
- Error: 🟡 failing item highlighted, rest kept.
- Success: 🟡 "Playing on <device>".

---

## 9. Modelo de Dados (Data Model)

```
Playlist {
  id: string
  name: string
  mode: 'device' | 'app'
  items: { itemId: string; durationS: number; enabled: boolean }[]
  window?: { from: number; to: number; days: number[] }   // app mode only
}
SlotMap (per device) = Record<itemId, { slot: number; crc: number }>
```

**Migrations:** 🟡 No; new optional collections.

---

## 10. Integrações e Dependências (Dependencies)

| Dependency | Type | Impact if unavailable |
|---|---|---|
| 🟡 `panel-content-library` | Required | No items to add. |
| 🟡 `ipixel-driver` (upload, show-slot, program list) | Required | No playback. |
| 🟡 Screen Wake Lock API | Optional | App mode warns that the screen must stay on. |

---

## 11. Edge Cases

| Scenario | Trigger | Expected behaviour |
|---|---|---|
| EC-01: Item deleted from library | Missing `itemId` | 🟡 Skip item, mark row "missing". |
| EC-02: Upload failure mid-list | ACK timeout | 🟡 Stop, send program list with items already uploaded, toast. |
| EC-03: Page hidden in app mode | `visibilitychange` | 🟡 Pause; resume on visible. |
| EC-04: Slot conflict with vendor content | Slot used by vendor app | 🟡 Use reserved range from OQ-01 of `panel-scenes`. |

---

## 12. Segurança e Privacidade (Security)

- **Authentication:** 🟡 N/A.
- **Authorization:** 🟡 N/A.
- **Sensitive data:** 🟡 None.
- **Audit:** 🟡 N/A.

---

## 13. Plano de Rollout (Rollout)

- **Strategy:** 🟡 Phase 2 PR after library.
- **Rollback:** 🟡 Revert; panel keeps its last program list.
- **Monitoring:** 🟡 Hardware test on balcony panel: 3-item device-mode loop for 1 h.

---

## 14. Open Questions

| # | Question | Impact | Owner | Deadline |
|---|---|---|---|---|
| OQ-01 | 🟡 Does the device-mode program list support per-item duration natively? | Medium | André (hardware) | phase 2 |

---

## 15. Decisões Tomadas (Decision Log)

| Decision | Alternatives | Rationale |
|---|---|---|
| 🟡 Two modes | App mode only | Balcony panel must loop without the phone. |

---

## Appendix

### References
- `docs/protocol/ipixel.md` §5

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
