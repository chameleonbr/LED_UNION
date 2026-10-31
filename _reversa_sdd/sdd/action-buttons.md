# Spec: action-buttons

**Version:** 1.0
**Status:** Draft
**Author:** reversa-spec-sdd
**Date:** 2026-10-31
**Reviewers:** André Avila

> Selo 🟡 PLANEJADO em todos os itens.

---

## 1. Resumo (Summary)

🟡 User-defined buttons on a large-tap "Action pad" screen. Each button runs an `ActionRef`: apply a scene, show a panel item/slot temporarily (then revert), flash a colour on endpoints, toggle stealth, start/stop a playlist or motion mode. Works on existing LEDs and panels. Phase 3.

---

## 2. Contexto (Context)

**Problem:** 🟡 The Driver wants one tap to fire a reaction GIF on the iPixel or a flash on the strip, without navigating cards.

**Evidence:** 🟡 Driver journey step 5; user request "definir botões para ações e gifs entrarem na cena".

**Why now:** 🟡 Reuses scenes, library and stealth; also referenced by motion-mode triggers.

---

## 3. Goals

- [ ] 🟡 G-01: Create a button that shows a GIF on the iPixel for N seconds then reverts.
- [ ] 🟡 G-02: Create a button that flashes the strip and RGB LEDs.
- [ ] 🟡 G-03: Action pad usable with one hand in the car holder.

**Success metrics:**
| Metric | Current baseline | Target | Deadline |
|---|---|---|---|
| 🟡 Taps to fire a reaction | ≥ 4 (navigate + pick) | 1 | phase 3 |
| 🟡 Buttons supported | 0 | ≥ 12 | phase 3 |
| 🟡 Tap → first write queued | n/a | < 200 ms | phase 3 |

---

## 4. Non-Goals

- NG-01: 🟡 Physical/Bluetooth remote buttons or steering-wheel controls.
- NG-02: 🟡 Multi-step macros with conditions (only one action or a fixed list per button).
- NG-03: 🟡 Sharing buttons between users.

---

## 5. Usuários (Users)

**Primary user:** 🟡 Driver. **Secondary:** Resident (quick balcony reactions).

**Current journey:** 🟡 Open card, pick content, send.

**Future journey:** 🟡 Open Action pad → tap "LOL" → GIF on iPixel for 5 s → back to previous content.

---

## 6. Requisitos Funcionais (Functional Requirements)

### 6.1 Main requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| RF-01 | 🟡 The user must create, edit, reorder and delete buttons (label, emoji/icon, colour). | Must | CRUD persisted. |
| RF-02 | 🟡 Each button must hold a list of 1–5 `ActionRef` steps run in order. | Must | 2-step button runs both. |
| RF-03 | 🟡 `ActionRef` kinds: `scene`, `panelItem` (with optional duration), `panelSlot` (with optional duration), `flash` (colour, count, interval, endpoints), `stealth` (toggle), `playlist` (start/stop), `motion` (start/stop). | Must | Each kind has an execution test with fake transport. |
| RF-04 | 🟡 With a duration, the system must restore the previous look/slot of the affected endpoints after it ends. | Must | Previous slot shown after N s. |
| RF-05 | 🟡 A second tap during a running timed action must restart the timer, not stack. | Should | Only one restore. |
| RF-06 | 🟡 The system must show the Action pad as a grid with tiles ≥ 64×64 px. | Must | Layout check at 360 px width. |
| RF-07 | 🟡 Buttons other than `stealth` must be blocked while stealth is active. | Must | 0 writes. |
| RF-08 | 🟡 `ActionRef` must be the shared type used by motion-mode triggers. | Must | Same executor function. |

### 6.2 Happy Path

1. 🟡 The user creates "LOL" → panelItem `laugh.gif`, 5 s, on car iPixel.
2. 🟡 Opens Action pad; taps "LOL".
3. 🟡 The system shows the item (upload if missing, else show slot).
4. 🟡 After 5 s it shows the previous slot.
5. 🟡 Result: one tap reaction.

### 6.3 Alternative flows

**Flow A — Flash:** 🟡 "Hazard" → flash amber 6× at 250 ms on strip + RGB, then restore looks.

---

## 7. Requisitos Não-Funcionais (Non-Functional)

| ID | Requirement | Target value | Note |
|---|---|---|---|
| RNF-01 | Latency | 🟡 < 200 ms tap → first write queued | |
| RNF-02 | Accessibility | 🟡 Labels readable at arm length (≥ 18 px text) | |

---

## 8. Design e Interface

**Affected components:** 🟡 new `ActionPad.svelte`, `ActionEditor.svelte`, `src/lib/actions.ts` (executor), `persist.ts`, `dict.ts`.

**Expected behaviour:** 🟡 Grid of tiles; long-press opens editor.

**UI states:**
- Empty: 🟡 "Create your first button".
- Loading: 🟡 tile shows progress while uploading.
- Error: 🟡 tile shakes; toast with cause.
- Success: 🟡 tile pulses while timed action runs.

---

## 9. Modelo de Dados (Data Model)

```
ActionButton { id: string; label: string; icon?: string; color?: string; steps: ActionRef[] }
ActionRef =
  | { kind: 'scene'; sceneId: string }
  | { kind: 'panelItem'; key: string; itemId: string; durationS?: number }
  | { kind: 'panelSlot'; key: string; slot: number; durationS?: number }
  | { kind: 'flash'; keys: string[]; color: string; count: number; intervalMs: number }
  | { kind: 'stealth' }
  | { kind: 'playlist'; key: string; playlistId: string; op: 'start' | 'stop' }
  | { kind: 'motion'; op: 'start' | 'stop' }
```

**Migrations:** 🟡 No.

---

## 10. Integrações e Dependências (Dependencies)

| Dependency | Type | Impact if unavailable |
|---|---|---|
| 🟡 Scenes, stealth | Required | Kinds hidden. |
| 🟡 Library, playlist, motion | Optional | Kinds hidden until shipped. |

---

## 11. Edge Cases

| Scenario | Trigger | Expected behaviour |
|---|---|---|
| EC-01: Target missing | Scene/item deleted | 🟡 Step skipped; tile marked with warning. |
| EC-02: Device offline | Endpoint not connected | 🟡 Step skipped; toast. |
| EC-03: Upload timeout | ACK timeout | 🟡 Abort step; continue next step. |
| EC-04: Restore after disconnect | Device dropped during duration | 🟡 Skip restore for it. |

---

## 12. Segurança e Privacidade (Security)

- **Authentication:** 🟡 N/A.
- **Authorization:** 🟡 N/A.
- **Sensitive data:** 🟡 None.
- **Audit:** 🟡 N/A.

---

## 13. Plano de Rollout (Rollout)

- **Strategy:** 🟡 Phase 3 PR with motion-mode.
- **Rollback:** 🟡 Revert; stored buttons ignored.
- **Monitoring:** 🟡 Hardware test: each kind once.

---

## 14. Open Questions

| # | Question | Impact | Owner | Deadline |
|---|---|---|---|---|
| OQ-01 | 🟡 Should the Action pad be the default screen when motion mode runs? | Low | André | phase 3 |

---

## 15. Decisões Tomadas (Decision Log)

| Decision | Alternatives | Rationale |
|---|---|---|
| 🟡 Shared `ActionRef` for buttons and motion triggers | Separate types | One executor, one test suite. |

---

## Appendix

### References
- `_reversa_sdd/personas.md`, `motion-mode.md`

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
