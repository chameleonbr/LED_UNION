# Spec: coolled-driver

**Version:** 1.0
**Status:** Draft (experimental, no hardware)
**Author:** reversa-spec-sdd
**Date:** 2026-10-31
**Reviewers:** André Avila

> Selo 🟡 PLANEJADO em todos os itens. Protocol source: `docs/protocol/coolled.md` (com.jtkj.led1248 2.7.9).

---

## 1. Resumo (Summary)

🟡 An experimental driver for CoolLED-family panels. Detects the family by exact advertised name, builds the `01 | esc(LEN CMD DATA) | 03` envelope, and offers power, brightness, speed and the 8 modes (basic family) or power/brightness/solid colour (UX/clock). Text/image upload is a later step reusing `panel-content-library` rendering. Phase 5; marked "experimental" in the UI until tested on hardware.

---

## 2. Contexto (Context)

**Problem:** 🟡 The user asked for CoolLED1248 support so all panels live in one app; no device is available for testing.

**Evidence:** 🟡 `coolled.md` §1–3 (verified in app code and `coolledx-driver`).

**Why now:** 🟡 Last phase, after iPixel features are proven.

---

## 3. Goals

- [ ] 🟡 G-01: Frame builders produce exactly the worked frames in `coolled.md` §2.1.
- [ ] 🟡 G-02: CoolLED names resolve to the `coolled` driver and never to `fff0`/`bledim`.
- [ ] 🟡 G-03: CoolLED panels can join scenes, stealth and action buttons with power/brightness/mode.

**Success metrics:**
| Metric | Current baseline | Target | Deadline |
|---|---|---|---|
| 🟡 Worked-frame tests | 0 | 100% of 6 pass (on, off, brightness, speed, mode 1, mode 2) | phase 5 |
| 🟡 Existing driver regressions | 0 | 0; difftest md5 unchanged | every PR |
| 🟡 Hardware validation | none | 1 device when available | open |

---

## 4. Non-Goals

- NG-01: 🟡 Text, image and animation upload in the first PR (follow-up after hardware test).
- NG-02: 🟡 Password flows (`0D`/`0E`), OTA, clock/alarm/pomodoro/scoreboard.
- NG-03: 🟡 Fetching `coolledx.com` config JSON.
- NG-04: 🟡 Music bars / rhythm.

---

## 5. Usuários (Users)

**Primary user:** 🟡 Any persona owning a CoolLED panel (none today).

**Current journey:** 🟡 Vendor CoolLED1248 app.

**Future journey:** 🟡 Add device → `CoolLEDX` → card with power, brightness, speed, mode list.

---

## 6. Requisitos Funcionais (Functional Requirements)

### 6.1 Main requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| RF-01 | 🟡 The system must use service `0000fff0-…` and char `0000fff1-…` (write + notify). | Must | Unit test on driver fields. |
| RF-02 | 🟡 The system must make `matches` accept only the exact names in `coolled.md` §1.2 (`CoolLED`, `CoolLED536`, `CoolLEDA`, `CoolLEDX`, `CoolLEDS`, `CoolLEDM`, `CoolLEDU`, `iLedBike`, `CoolLEDUX`, `iDevilEyes`, `iLedHat`, `iLedHatC`, `iLedOpen`, `iLedCar`, `iLedFitness`, `iLedClock`), case-insensitive. | Must | Table test; `MELK-01`, `BLEDIM`, `ELK-BLEDOM` not matched. |
| RF-03 | 🟡 The system must place the driver in `drivers` so that every existing name still resolves to the same driver as today. | Must | Test: resolution of all fixture names unchanged. |
| RF-04 | 🟡 The system must, in the envelope builder, escape `01→02 05`, `02→02 06`, `03→02 07` over LEN/CMD/DATA, LEN big-endian pre-escape. | Must | 6 worked frames match byte for byte. |
| RF-05 | 🟡 The system must build, for the basic family (CoolLED, 536, A, X, S): power `09 0/1`, brightness `08 vv` (0..255; CoolLED 12x48 10..255), speed `07 vv`, mode `06 1..8`. | Must | Builder tests. |
| RF-06 | 🟡 The system must build, for the advanced family (M, U, UD, UX, clock): power `05 0/1`, brightness `04 vv` (5..255). | Must | Builder tests. |
| RF-07 | 🟡 UX/clock: `rgb()` must build `13 01 0R GB` with the RGB444 mapping in §3.2. | Should | Red → `01 00 04 13 02 05 0F 00 03`. |
| RF-08 | 🟡 The system must ensure writes are split into 20-byte chunks with ≥ 15 ms gap (basic family). | Must | `chunkSize: 20`, `minGapMs ≥ 15`. |
| RF-09 | 🟡 `caps` per family: basic `rgb:false, speed:true, effects:true`; UX/clock `rgb:true`. | Must | Caps test. |
| RF-10 | 🟡 The device card must show an "experimental" badge for this driver. | Must | Badge visible. |
| RF-11 | 🟡 The user must be able to set panel rows/cols/colour type manually (Web Bluetooth cannot read the advert without `watchAdvertisements`). | Should | Values saved on device. |

### 6.2 Happy Path

1. 🟡 The user adds `CoolLEDX`.
2. 🟡 The system resolves `coolled`, connects, enables notify after 500 ms.
3. 🟡 The user toggles power and picks mode "Left".
4. 🟡 Result: frames `01 00 02 06 09 02 05 03` and `01 00 02 06 06 02 06 03` written in 20-byte chunks.

### 6.3 Alternative flows

**Flow A — Advert size available:** 🟡 if `watchAdvertisements` works, read rows/cols/colour from manufacturer data and skip manual entry.

---

## 7. Requisitos Não-Funcionais (Non-Functional)

| ID | Requirement | Target value | Note |
|---|---|---|---|
| RNF-01 | Compatibility | 🟡 0 change to fff0/bledim/ffe0 frames | Shares service `fff0`. |
| RNF-02 | Pacing | 🟡 20 B chunks, 15 ms gap | Proven by vendor app. |

---

## 8. Design e Interface

**Affected components:** 🟡 `src/lib/protocol/coolled.ts` (new), `index.ts`, `DeviceCard.svelte` (badge, manual size), `dict.ts`.

**Expected behaviour:** 🟡 Card with power, brightness, speed, mode list (8 items); UX/clock also colour picker.

**UI states:**
- Empty: 🟡 size unknown → "Set panel size" link.
- Loading: 🟡 none (fire-and-forget commands).
- Error: 🟡 notify enable failed 3× → disconnect with message.
- Success: 🟡 normal card + experimental badge.

---

## 9. Modelo de Dados (Data Model)

```
SavedDevice (extended) {
  panel?: { rows: number; cols: number; color: 0 | 1 | 2 | 4 }   // shared field with ipixel (width/height naming unified at implementation)
}
```

**Migrations:** 🟡 No.

---

## 10. Integrações e Dependências (Dependencies)

| Dependency | Type | Impact if unavailable |
|---|---|---|
| 🟡 Web Bluetooth | Required | — |
| 🟡 `watchAdvertisements` | Optional | Manual size entry. |
| 🟡 Hardware for validation | Required for leaving experimental | Driver stays experimental. |

---

## 11. Edge Cases

| Scenario | Trigger | Expected behaviour |
|---|---|---|
| EC-01: Name collision on `fff0` | Unknown name on service `fff0` | 🟡 Existing resolution order unchanged; CoolLED only by exact name. |
| EC-02: Notify enable failure or timeout | 3 failed attempts, 5000 ms each | 🟡 Disconnect, show error (vendor behaviour). |
| EC-03: Password-protected (S family) | Panel ignores commands | 🟡 Show "password required; not supported yet". |
| EC-04: Escape inside chunk boundary | Split falls between `02` and its pair | 🟡 Allowed (vendor does the same); test covers it. |

---

## 12. Segurança e Privacidade (Security)

- **Authentication:** 🟡 Password flows not supported (NG-02).
- **Authorization:** 🟡 N/A.
- **Sensitive data:** 🟡 None.
- **Audit:** 🟡 Debug log.

---

## 13. Plano de Rollout (Rollout)

- **Strategy:** 🟡 Phase 5 PR, behind "experimental" badge.
- **Rollback:** 🟡 Revert; names fall back to unsupported.
- **Monitoring:** 🟡 Hardware test when a device is available.

---

## 14. Open Questions

| # | Question | Impact | Owner | Deadline |
|---|---|---|---|---|
| OQ-01 | 🟡 Plane format for mono and full-RGB X panels (app only builds 7-colour). | High | hardware owner | open |
| OQ-02 | 🟡 Speed direction (does a low value mean slower or higher scroll speed)? | Low | hardware owner | open |

---

## 15. Decisões Tomadas (Decision Log)

| Decision | Alternatives | Rationale |
|---|---|---|
| 🟡 Exact-name match | Service probe | Shares `fff0` with existing drivers (ADR-003 resolves by name first). |
| 🟡 Experimental until tested | Ship as supported | No hardware. |

---

## Appendix

### References
- `docs/protocol/coolled.md`, `src/lib/protocol/index.ts`

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
