# Spec: ipixel-driver

**Version:** 1.0
**Status:** Draft
**Author:** reversa-spec-sdd
**Date:** 2026-10-31
**Reviewers:** André Avila

> Selo 🟡 PLANEJADO em todos os itens. Protocol source: `docs/protocol/ipixel.md` (com.wifiled.ipixels 3.8.1).

---

## 1. Resumo (Summary)

🟡 A new protocol driver that lets LED Union discover, connect to and control iPixel Color LED matrices (`LED_BLE_*`): read the panel model/size, power, brightness, orientation, show saved slot, delete stored content, and a windowed upload transport (CRC32 + ACK) reused by content features. Phase 1 of the PRD.

---

## 2. Contexto (Context)

**Problem:** 🟡 The user owns an iPixel matrix (model unknown) used in the car and on the balcony; today it needs the vendor app. LED Union has no driver for service `000000fa-…`.

**Evidence:** 🟡 Protocol extracted from the decompiled vendor app and cross-checked with `pypixelcolor` and `go-ipxl` (`docs/protocol/ipixel.md` §1–7).

**Why now:** 🟡 Every later phase (scenes, content, playlist, motion, data sources) depends on this driver; the connection spike retires the top PRD risk.

---

## 3. Goals

- [ ] 🟡 G-01: The user's iPixel shows up in the Chrome device chooser and connects.
- [ ] 🟡 G-02: After connecting, the app shows the detected panel size (e.g. 32×32) from the device-info reply.
- [ ] 🟡 G-03: Power, brightness, orientation and show-slot commands change the real panel.
- [ ] 🟡 G-04: A reusable upload transport sends a content payload in windows and waits for ACK per window.

**Success metrics:**
| Metric | Current baseline | Target | Deadline |
|---|---|---|---|
| 🟡 User's iPixel recognised with size | 0 devices | 1 device | end of phase 1 |
| 🟡 Frame builder unit tests | 0 | ≥ 10 passing | end of phase 1 |
| 🟡 Existing tests and difftest md5 `98622b8733585ad72d2b82a0aa7767e0` | 65 pass | 65 pass, md5 unchanged | every PR |

---

## 4. Non-Goals

- NG-01: 🟡 Text rasterisation, GIF/PNG encoding and playlist logic (see `panel-content-library`, `panel-playlist`).
- NG-02: 🟡 Clock, rhythm/music, scoreboard, countdown, schedule and game "live frame" modes.
- NG-03: 🟡 Password unlock flow (`reply[10] == 1`): detected and reported only.
- NG-04: 🟡 OTA firmware update.
- NG-05: 🟡 Second-connection slot (`BleManager2`); each panel is just another device in LED Union.

---

## 5. Usuários (Users)

**Primary user:** 🟡 Driver and Resident personas (`personas.md`), advanced users with one iPixel panel.

**Current journey:** 🟡 Open the vendor iPixel app, connect, change brightness or slot, return to LED Union for the strip.

**Future journey:** 🟡 Tap "Add device" in LED Union, pick `LED_BLE_xxxx`, see its size on the card, use power/brightness/slot from the same card as every other light.

---

## 6. Requisitos Funcionais (Functional Requirements)

### 6.1 Main requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| RF-01 | 🟡 The system must register a driver `ipixel` with service `000000fa-0000-1000-8000-00805f9b34fb`, write char `0000fa02-…`, notify char `0000fa03-…`, and include the service in `allServices`. | Must | Unit test: `driverFor('LED_BLE_1A2B')?.id === 'ipixel'` and `allServices` contains the uuid. |
| RF-02 | 🟡 The driver must match names that contain `LED_BLE`. | Must | `matches('LED_BLE_00')` true; `matches('LEDBLE-00')` false. |
| RF-03 | 🟡 On connect the system must subscribe to notifications and send device info `08 00 01 80 HH MM SS 00` with the local time. | Must | Builder test with fixed `Date` gives exact bytes. |
| RF-04 | 🟡 The system must parse the device-info reply: byte 4 = device type mapped to width×height via the 36-entry table in `ipixel.md` §3; byte 10 = password flag. | Must | Parser test per table row; unknown type returns `undefined` size. |
| RF-05 | 🟡 The system must persist the detected size and type on the saved device and show it on the device card. | Must | After reconnect without reply, card still shows last known size. |
| RF-06 | 🟡 `power(on)` must build `05 00 07 01 <1\|0>`. | Must | Builder test. |
| RF-07 | 🟡 `brightness(pct)` must build `05 00 04 80 <v>` with `v` clamped to 10..100. | Must | `brightness(0)` → `…80 0a`; `brightness(150)` → `…80 64`. |
| RF-08 | 🟡 The system must send orientation `05 00 06 80 <0..3>` from a card setting. | Should | Builder test; value outside 0..3 rejected. |
| RF-09 | 🟡 The system must send show-slot `07 00 08 80 01 00 <slot>` and accept reply `05 00 08 80 01` as success. | Must | Builder test; fake notify resolves the promise. |
| RF-10 | 🟡 The system must offer "delete all stored content" `04 00 03 80` behind a confirmation dialog. | Should | Dialog shown; frame written only on confirm. |
| RF-11 | 🟡 The system must provide an upload transport: split payload into windows of `W` bytes, prefix each with the 15-byte header (length, type, option, total size u32, CRC32 u32, slot), write in chunks, and wait for the ACK `05 00 t0 t1 st` before the next window. | Must | Test with a fake GATT: 3 windows sent in order, each after an ACK; CRC32 matches a reference. |
| RF-12 | 🟡 `W` must come from a per-type table (4096 default, 12288 where `ipixel.md` lists it), overridable from the Debug screen. | Must | Table test; Debug override changes `W` on next upload. |
| RF-13 | 🟡 `caps` must report `rgb:false, white:false, cct:false, effects:false, scenes:false, custom:false, sensitivity:false`, `speed:false`. | Must | Caps test; card hides colour pickers. |
| RF-14 | 🟡 The driver must keep frame builders pure (no I/O), in line with ADR-002. | Must | Code review: builders import nothing from `ble.svelte.ts`. |

### 6.2 Happy Path

1. 🟡 The user taps "Add device" and picks `LED_BLE_xxxx` in the Chrome chooser.
2. 🟡 The system connects, enables notify on `fa03`, sends device info.
3. 🟡 The panel replies; the system decodes type → 32×32 and saves it.
4. 🟡 The user moves the brightness slider; the system writes `05 00 04 80 <v>` at most every 100 ms.
5. 🟡 Result: the card shows "iPixel 32×32", power and brightness work.

### 6.3 Alternative flows

**Flow A — No reply within 5000 ms:** 🟡 the device stays connected, card shows "size unknown", power/brightness remain enabled, upload features stay disabled until a size is known or set manually in Debug.

**Flow B — Password flag set:** 🟡 card shows "panel is password-locked; unlock in vendor app" and commands are still attempted.

---

## 7. Requisitos Não-Funcionais (Non-Functional)

| ID | Requirement | Target value | Note |
|---|---|---|---|
| RNF-01 | Performance | 🟡 Upload throughput ≥ 2 KB/s with chunk 244 B, write-with-response | Measured on hardware; refines chunk size. |
| RNF-02 | Write pacing | 🟡 Brightness writes ≤ 1 per 100 ms (`minGapMs: 100`) | Matches vendor slider throttle. |
| RNF-03 | Reliability | 🟡 ACK timeout 6000 ms; 3 consecutive failures abort the upload | Same as vendor `SendBleDataThread`. |
| RNF-04 | Compatibility | 🟡 Zero change in output for fff0, ffe0, bledim | Difftest md5 unchanged. |

---

## 8. Design e Interface

**Affected components:** 🟡 `src/lib/protocol/ipixel.ts` (new), `src/lib/protocol/index.ts`, `src/lib/ble.svelte.ts` (notify subscription + reply routing), `src/lib/persist.ts` (device panel info), `DeviceCard.svelte`, `Debug.svelte`, `dict.ts`.

**Expected behaviour:** 🟡 iPixel cards show power, brightness, orientation, slot number input + "Show", and a panel badge with size.

**UI states:**
- Empty: 🟡 no slot shown until the user enters a number.
- Loading: 🟡 "Reading panel…" badge for up to 5000 ms after connect.
- Error: 🟡 "Panel did not answer" badge; Retry button resends device info.
- Success: 🟡 badge "W×H".

---

## 9. Modelo de Dados (Data Model)

```
SavedDevice (extended) {
  panel?: { type: number; width: number; height: number; mcu?: number }  // last device-info reply
}
```

**Migrations:** 🟡 No. Field is optional; older stores load unchanged.

---

## 10. Integrações e Dependências (Dependencies)

| Dependency | Type | Impact if unavailable |
|---|---|---|
| 🟡 Web Bluetooth (Chrome) | Required | Driver cannot be used; existing message for unsupported browser. |
| 🟡 iPixel firmware notify on `fa03` | Required for size and uploads | Fallback: basic commands only (Flow A). |
| 🟡 CRC32 (inline, ~15 lines) | Required | None; no new npm dependency. |

---

## 11. Edge Cases

| Scenario | Trigger | Expected behaviour |
|---|---|---|
| EC-01: Unknown device type | Reply byte 4 not in table | 🟡 Save type, size `undefined`; Debug shows raw reply; uploads disabled. |
| EC-02: Reply timeout | No notify within 5000 ms | 🟡 Flow A; Retry button. |
| EC-03: ACK error | ACK status `00` or `02` | 🟡 Abort upload, show "Panel rejected window N (status X)"; if first window and `W`=12288, retry once with 4096. |
| EC-04: Disconnect mid-upload | GATT disconnect event | 🟡 Abort, mark upload failed, no auto-resume. |
| EC-05: Service not exposed | `getPrimaryService` fails | 🟡 Error "iPixel service not found"; log uuids seen in Debug. |
| EC-06: Name without `LED_BLE` | Panel advertises only manufacturer `0x5452` | 🟡 Out of match; documented in OQ-03. |

---

## 12. Segurança e Privacidade (Security)

- **Authentication:** 🟡 None; BLE device chosen by user gesture.
- **Authorization:** 🟡 Chrome per-origin Bluetooth permission.
- **Sensitive data:** 🟡 None; the time sent to the panel is local time only.
- **Audit:** 🟡 Frames visible in the existing Debug log.

---

## 13. Plano de Rollout (Rollout)

- **Strategy:** 🟡 Feature branch → PR → merge on explicit user request (deploy to GitHub Pages).
- **Rollback:** 🟡 Revert merge commit; iPixel devices then fall back to "unsupported".
- **Monitoring:** 🟡 User hardware test checklist: connect, size, power, brightness, slot, one 3-window upload.

---

## 14. Open Questions

| # | Question | Impact | Owner | Deadline |
|---|---|---|---|---|
| OQ-01 | 🟡 Window size accepted by the user's model (4096 vs 12288)? | High | André (hardware test) | phase 1 |
| OQ-02 | 🟡 Does `fa03` carry the ACKs and the device-info reply? | High | André | phase 1 |
| OQ-03 | 🟡 Does the user's panel advertise `LED_BLE` in its name? | High | André | phase 1 |
| OQ-04 | 🟡 Write-without-response accepted for upload chunks? | Medium | André | phase 1 |

---

## 15. Decisões Tomadas (Decision Log)

| Decision | Alternatives | Rationale |
|---|---|---|
| 🟡 Chunk 244 B | 509 B (vendor) | Browser does not expose negotiated MTU; 244 works on MTU 247. |
| 🟡 Panel size read from device, persisted | Ask user to pick model | Vendor app does the same; user does not know the model. |
| 🟡 No new npm dependency for CRC32 | `crc-32` package | ~15 lines; ponytail rule. |

---

## Appendix

### References
- `docs/protocol/ipixel.md`, `_reversa_sdd/prd.md`, `_reversa_sdd/adrs/002-pure-driver-frame-builders.md`

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
