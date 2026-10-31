# Spec: stealth-mode

**Version:** 1.0
**Status:** Draft
**Author:** reversa-spec-sdd
**Date:** 2026-10-31
**Reviewers:** André Avila

> Selo 🟡 PLANEJADO em todos os itens.

---

## 1. Resumo (Summary)

🟡 A single global toggle that switches off every connected light (strip, RGB LEDs, iPixel, CoolLED, any driver) and pauses everything that could turn them back on (playlist, motion mode, data refresh, action buttons). Toggling it off restores the exact state captured before stealth. Phase 1 of the PRD.

---

## 2. Contexto (Context)

**Problem:** 🟡 The Driver must black out all lights at once (traffic stop, parking). Today each card must be switched off one by one, and automatic features would turn lights back on.

**Evidence:** 🟡 Driver journey steps 6–7 in `personas.md`; PRD §4 phase 1.

**Why now:** 🟡 Must exist before motion mode and playlists, which write to lights automatically.

---

## 3. Goals

- [ ] 🟡 G-01: One tap turns off every connected endpoint.
- [ ] 🟡 G-02: While active, no automatic feature writes to any light.
- [ ] 🟡 G-03: A second tap restores the previous looks of every endpoint.

**Success metrics:**
| Metric | Current baseline | Target | Deadline |
|---|---|---|---|
| 🟡 Taps to black out N devices | N taps | 1 tap | phase 1 |
| 🟡 Time from tap to last power-off write queued | n/a | < 500 ms for 5 devices | phase 1 |
| 🟡 Automatic writes during stealth | n/a | 0 | phase 1 |

---

## 4. Non-Goals

- NG-01: 🟡 Disconnecting devices; stealth only powers off.
- NG-02: 🟡 Triggering stealth from hardware buttons, voice or background (screen off).
- NG-03: 🟡 Scheduled or location-based auto-stealth (could come with motion-mode later).
- NG-04: 🟡 Powering off devices that are not connected at tap time.

---

## 5. Usuários (Users)

**Primary user:** 🟡 Driver persona, phone in holder.

**Current journey:** 🟡 Tap power on each card; playlist/motion would keep lighting things.

**Future journey:** 🟡 Tap the stealth button in the header; everything goes dark; tap again to restore.

---

## 6. Requisitos Funcionais (Functional Requirements)

### 6.1 Main requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| RF-01 | 🟡 The system must show a stealth toggle visible on every screen (app header). | Must | Toggle present on Devices, Scenes, Effects screens. |
| RF-02 | 🟡 On activation the system must snapshot the current look of every endpoint key. | Must | Snapshot equals `store.looks` for connected keys at tap time. |
| RF-03 | 🟡 On activation the system must queue `power(false)` for every connected endpoint across all drivers, including each output of multi-output controllers. | Must | Fake transport receives one power-off per endpoint key. |
| RF-04 | 🟡 While active, the system must block writes from playlist, motion mode, data sources and action buttons. | Must | Test: motion tick during stealth produces 0 writes. |
| RF-05 | 🟡 While active, manual control on a card must ask "Leave stealth?" before writing. | Should | Dialog shown; cancel produces 0 writes. |
| RF-06 | 🟡 On deactivation the system must re-apply the snapshot (power + look) through the same path as scene apply. | Must | Fake transport receives the same frames as applying the snapshot as a scene. |
| RF-07 | 🟡 The system must persist stealth state so a reload keeps stealth active. | Must | Reload during stealth: toggle still on, no automatic writes. |
| RF-08 | 🟡 A device that connects while stealth is active must receive `power(false)` right after its `onConnect` frames. | Should | Connect during stealth → power-off written. |
| RF-09 | 🟡 The stealth button in the header must change colour and label ("Stealth ON") while active. | Must | Visual state switches on toggle. |

### 6.2 Happy Path

1. 🟡 The user taps "Stealth".
2. 🟡 The system snapshots looks, writes power-off to every endpoint, pauses automations.
3. 🟡 The header shows "Stealth ON".
4. 🟡 The user taps again.
5. 🟡 Result: every endpoint returns to its previous look; automations resume.

### 6.3 Alternative flows

**Flow A — Device dropped during stealth:** 🟡 on restore, the system skips unreachable endpoints and lists them in a toast.

---

## 7. Requisitos Não-Funcionais (Non-Functional)

| ID | Requirement | Target value | Note |
|---|---|---|---|
| RNF-01 | Latency | 🟡 All power-off frames queued < 500 ms after tap | Queue coalescing (ADR-004) applies. |
| RNF-02 | Accessibility | 🟡 Button ≥ 48×48 px, `aria-pressed` reflects state | Used while driving. |
| RNF-03 | Compatibility | 🟡 No change to driver frames | Uses existing `power()` builders only. |

---

## 8. Design e Interface

**Affected components:** 🟡 `App.svelte` header, `store.svelte.ts` (stealth flag + snapshot), `ble.svelte.ts` write gate, `dict.ts`.

**Expected behaviour:** 🟡 Single toggle; active state high-contrast.

**UI states:**
- Empty: 🟡 no connected devices → toggle still works, snapshot empty.
- Loading: 🟡 none; actions are queued.
- Error: 🟡 toast listing endpoints whose write failed.
- Success: 🟡 "Stealth ON" / normal label.

---

## 9. Modelo de Dados (Data Model)

```
Persisted (extended) {
  stealth?: { since: string; snapshot: Record<string, Look> }  // absent = off
}
```

**Migrations:** 🟡 No; optional field.

---

## 10. Integrações e Dependências (Dependencies)

| Dependency | Type | Impact if unavailable |
|---|---|---|
| 🟡 Existing drivers' `power()` | Required | Driver without power falls back to brightness 0 where supported. |
| 🟡 Scene apply path | Required | Restore reuses it. |

---

## 11. Edge Cases

| Scenario | Trigger | Expected behaviour |
|---|---|---|
| EC-01: Write failure | GATT error on power-off | 🟡 Retry once; then toast "X did not turn off". |
| EC-02: Double tap | Two taps < 300 ms | 🟡 Debounce; second tap ignored. |
| EC-03: Reload during stealth | Page reload | 🟡 Stealth stays on; snapshot kept. |
| EC-04: Device disconnected on restore | Endpoint unreachable | 🟡 Skip, list in toast, keep snapshot entry for next connect. |
| EC-05: Look changed by user during stealth | Confirmed manual control | 🟡 Stealth ends; snapshot discarded for that endpoint only. |

---

## 12. Segurança e Privacidade (Security)

- **Authentication:** 🟡 N/A, local app.
- **Authorization:** 🟡 N/A.
- **Sensitive data:** 🟡 None.
- **Audit:** 🟡 Writes visible in Debug log.

---

## 13. Plano de Rollout (Rollout)

- **Strategy:** 🟡 Feature branch → PR → merge on user request.
- **Rollback:** 🟡 Revert commit; persisted `stealth` field ignored by older builds.
- **Monitoring:** 🟡 Hardware check with strip + RGB LEDs + iPixel.

---

## 14. Open Questions

| # | Question | Impact | Owner | Deadline |
|---|---|---|---|---|
| OQ-01 | 🟡 Should stealth also lower the screen brightness / show a black screen? | Low | André | phase 1 |

---

## 15. Decisões Tomadas (Decision Log)

| Decision | Alternatives | Rationale |
|---|---|---|
| 🟡 Power off, keep connected | Disconnect | Reconnect needs a user gesture per device in Chrome. |
| 🟡 Restore via scene-apply path | Separate restore code | One code path, already tested. |

---

## Appendix

### References
- `_reversa_sdd/prd.md`, `_reversa_sdd/personas.md`, `_reversa_sdd/adrs/004-serial-write-queue-with-coalescing.md`

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
