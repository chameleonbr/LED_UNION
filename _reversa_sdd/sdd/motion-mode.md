# Spec: motion-mode

**Version:** 1.0
**Status:** Draft
**Author:** reversa-spec-sdd
**Date:** 2026-10-31
**Reviewers:** André Avila

> Selo 🟡 PLANEJADO em todos os itens.

---

## 1. Resumo (Summary)

🟡 A foreground mode that reads phone sensors (GPS speed via Geolocation, acceleration and G-force via DeviceMotion) and maps them to light actions on any connected endpoint (existing strips/RGB LEDs and panels): brightness or colour by speed, flash on hard braking, panel item or slot on thresholds (e.g. G > 0.5 shows a "whoa" GIF). Phase 3.

---

## 2. Contexto (Context)

**Problem:** 🟡 The Driver wants lights and the in-car iPixel to react to the drive; no current app does it.

**Evidence:** 🟡 Driver journey step 4; PRD §4 phase 3.

**Why now:** 🟡 After drivers, scenes and stealth exist.

---

## 3. Goals

- [ ] 🟡 G-01: Brightness or colour of chosen endpoints follows GPS speed.
- [ ] 🟡 G-02: A G-force threshold (braking, cornering, acceleration) fires a configured action.
- [ ] 🟡 G-03: Works on existing LEDs and on iPixel at the same time.

**Success metrics:**
| Metric | Current baseline | Target | Deadline |
|---|---|---|---|
| 🟡 Sensor → write latency | n/a | < 300 ms | phase 3 |
| 🟡 BLE writes per endpoint | n/a | ≤ 10 per second | phase 3 |
| 🟡 False triggers on smooth drive | n/a | 0 in a 10 min test | phase 3 |

---

## 4. Non-Goals

- NG-01: 🟡 Background or screen-off operation (browser limit).
- NG-02: 🟡 OBD-II / CAN data from the car.
- NG-03: 🟡 Recording or uploading trips; nothing leaves the phone.
- NG-04: 🟡 Audio/music reactivity (existing sound features stay as they are).

---

## 5. Usuários (Users)

**Primary user:** 🟡 Driver, phone in holder, LED Union open.

**Current journey:** 🟡 Not possible.

**Future journey:** 🟡 Open Motion → pick rules → Start → lights react → Stop.

---

## 6. Requisitos Funcionais (Functional Requirements)

### 6.1 Main requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| RF-01 | 🟡 The system must request Geolocation and DeviceMotion permissions on "Start" (user gesture; iOS-style `requestPermission` when present). | Must | Denied permission → rule disabled with message. |
| RF-02 | 🟡 The system must compute speed (km/h) from `coords.speed`, falling back to distance/time between fixes. | Must | Test with recorded fixes. |
| RF-03 | 🟡 The system must compute longitudinal and lateral G from `accelerationIncludingGravity`, low-pass filtered (configurable, default 0.3 s), with a "calibrate" action that zeros orientation in the holder. | Must | Test with recorded samples: 0.5 G braking detected. |
| RF-04 | 🟡 Rule type **map**: input (speed, G long, G lat, G total) → output (brightness 0–100 or colour gradient) on selected endpoints, with input range. | Must | Speed 0→100 km/h maps brightness 20→100. |
| RF-05 | 🟡 Rule type **trigger**: input crosses threshold for ≥ hold time → action (scene, panel item/slot, flash colour N times, action button), with cooldown. | Must | Threshold crossed once → action once within cooldown. |
| RF-06 | 🟡 Writes must go through the existing queue with coalescing and be rate-limited to ≤ 10/s per endpoint. | Must | Queue test with 60 Hz input. |
| RF-07 | 🟡 Stop must restore the looks that were active before Start. | Must | Snapshot restored. |
| RF-08 | 🟡 Stealth must suspend motion output immediately. | Must | 0 writes during stealth. |
| RF-09 | 🟡 The system must hold a Screen Wake Lock while running and show live speed and G on screen. | Must | Lock acquired; values update. |

### 6.2 Happy Path

1. 🟡 The user opens Motion, enables "Brightness by speed" on the strip and "Braking GIF" on the iPixel.
2. 🟡 Taps Start; grants permissions; calibrates.
3. 🟡 Drives; strip brightness follows speed.
4. 🟡 Brakes hard (> 0.5 G for 300 ms); iPixel shows the GIF slot.
5. 🟡 Result: taps Stop; previous looks return.

### 6.3 Alternative flows

**Flow A — No GPS fix:** 🟡 speed rules hold last value; G rules keep working.

---

## 7. Requisitos Não-Funcionais (Non-Functional)

| ID | Requirement | Target value | Note |
|---|---|---|---|
| RNF-01 | Latency | 🟡 < 300 ms sensor to queued write | |
| RNF-02 | Privacy | 🟡 Location never persisted or sent | Memory only. |
| RNF-03 | Safety | 🟡 UI usable with one tap: Start/Stop ≥ 64 px | Used while driving. |

---

## 8. Design e Interface

**Affected components:** 🟡 new `Motion.svelte`, `src/lib/motion/sensors.ts`, `src/lib/motion/rules.ts`, `persist.ts` (rules), `dict.ts`.

**Expected behaviour:** 🟡 Big speed/G gauges, rule list with toggles, Start/Stop.

**UI states:**
- Empty: 🟡 "Add a rule".
- Loading: 🟡 "Waiting for GPS fix…".
- Error: 🟡 "Permission denied" / "Sensors not available".
- Success: 🟡 live gauges, active rule highlighted on trigger.

---

## 9. Modelo de Dados (Data Model)

```
MotionRule {
  id: string; enabled: boolean
  input: 'speed' | 'gLong' | 'gLat' | 'gTotal'
  kind: 'map' | 'trigger'
  targets: string[]                       // endpoint keys
  map?: { from: number; to: number; out: 'brightness' | 'gradient'; min: number; max: number; colors?: string[] }
  trigger?: { threshold: number; holdMs: number; cooldownMs: number; action: ActionRef }
}
```

**Migrations:** 🟡 No.

---

## 10. Integrações e Dependências (Dependencies)

| Dependency | Type | Impact if unavailable |
|---|---|---|
| 🟡 Geolocation API | Optional | Speed rules disabled. |
| 🟡 DeviceMotion API | Optional | G rules disabled. |
| 🟡 Screen Wake Lock | Optional | Warning to keep screen on. |
| 🟡 `action-buttons` ActionRef | Optional | Trigger limited to scene/slot. |

---

## 11. Edge Cases

| Scenario | Trigger | Expected behaviour |
|---|---|---|
| EC-01: GPS jitter at standstill | Speed noise 0–5 km/h | 🟡 Dead band below 3 km/h = 0. |
| EC-02: Phone moved in holder | Orientation changes | 🟡 Prompt to recalibrate when gravity vector shifts > 20°. |
| EC-03: Page hidden | `visibilitychange` | 🟡 Pause output; resume on visible. |
| EC-04: BLE write failure | GATT error | 🟡 Drop sample; keep running; error counter on screen. |
| EC-05: Sensor timeout | No samples 2 s | 🟡 Show "sensor lost", hold last look. |

---

## 12. Segurança e Privacidade (Security)

- **Authentication:** 🟡 N/A.
- **Authorization:** 🟡 Browser permissions for location and motion.
- **Sensitive data:** 🟡 Location is PII: kept in memory only, never stored or sent.
- **Audit:** 🟡 N/A.

---

## 13. Plano de Rollout (Rollout)

- **Strategy:** 🟡 Phase 3 PR, labelled "beta".
- **Rollback:** 🟡 Revert; rules in store ignored.
- **Monitoring:** 🟡 Test drive checklist with recorded sample logs (local download only).

---

## 14. Open Questions

| # | Question | Impact | Owner | Deadline |
|---|---|---|---|---|
| OQ-01 | 🟡 Default G thresholds for braking/cornering the user wants? | Low | André | phase 3 |
| OQ-02 | 🟡 Can iPixel accept the update rate needed for speed-driven panel content? | Medium | André (hardware) | phase 3 |

---

## 15. Decisões Tomadas (Decision Log)

| Decision | Alternatives | Rationale |
|---|---|---|
| 🟡 Foreground only + Wake Lock | Native app | PRD non-goal: stays PWA. |
| 🟡 Rules engine with map/trigger | Hard-coded effects | User asked for flexibility. |

---

## Appendix

### References
- `_reversa_sdd/prd.md`, `_reversa_sdd/personas.md`

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
