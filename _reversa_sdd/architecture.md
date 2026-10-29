# Architecture — LED UNION

> Reversa Architect · 2026-10-24 · doc level **completo**
> See: `c4-context.md`, `c4-containers.md`, `c4-components.md`, `erd-complete.md`, `traceability/spec-impact-matrix.md`, `adrs/`

## 1. Style 🟢
- A **client-only PWA** with no backend (ADR-001).
- **Hexagon-lite:**
  - pure protocol **drivers** form the core (ADR-002);
  - an I/O **adapter** (`ble.svelte.ts` + `WriteQueue`) talks to Web Bluetooth;
  - a **state** module (`store` + `persist`) talks to localStorage;
  - **Svelte views** sit on top.
- State is held as Svelte 5 runes (`$state`) in module singletons.

```
┌──────────────────────── Views (Svelte) ─────────────────────────┐
│ App · Devices · Effects/DeviceCard · Scenes · Debug · Palette   │
└──────────────┬──────────────────────────────┬───────────────────┘
               │ intents (build callbacks)    │ reads/mutations
┌──────────────▼───────────────┐   ┌──────────▼──────────────┐
│ ble.svelte.ts                │   │ store.svelte.ts         │
│  conns / selection           │──►│  rememberDevice/forget  │
│  connect → resolveDriver     │   │  looks / scenes / groups│
│  applyTo / sendFrames / raw  │   └──────────┬──────────────┘
│  WriteQueue per device       │              │ persist.ts (pure)
└──────────────┬───────────────┘              ▼
               │ Uint8Array          localStorage 'led-union/v1'
┌──────────────▼───────────────┐
│ protocol/ (pure)             │◄── effects.ts ◄── docs/protocol/*.tsv (gen-effects)
│  bledim · fff0 · ffe0        │◄── difftest vs decompiled Java (dev time)
└──────────────┬───────────────┘
               ▼
        Web Bluetooth GATT  →  LED controllers
```

## 2. Key flows
| Flow | Path | Notes |
|---|---|---|
| Add a device | Devices → `addDevice` → chooser → `track` → `connect` → `resolveDriver` → `onConnect` handshake | Driver confirmed by GATT probing (ADR-003) |
| Restore | App mount → `restore` → seed `conns` from the store → `getDevices` → connect all (silent) | Needs browser permission; a user gesture may be needed |
| Command | DeviceCard or Everything → `applyTo(keys, build, coalesceKey)` → `outputAt` → driver builder → queue → `writeRaw` | Auto-reconnect; errors swallowed (TD-03) |
| Custom effect | DeviceCard or Scenes → `sendFrames` (never coalesced) → then speed | BLEDIM sends 1 frame; ffe0 sends N+1 |
| Scene | Effects (save the ticked endpoints) → `addScene` snapshot; Scenes → `applyLook` per entry, in sequence | Drops the variant (F1) |
| Debug | `inspect` (GATT listing) / `sendRaw` (any characteristic) / sweeps | Stays in production by design (G7) |

## 3. External integrations 🟢
| Integration | Direction | Protocol / format | Notes |
|---|---|---|---|
| Web Bluetooth GATT, FFE0/FFE1 | out | 9-byte frames, 7 envelopes, write without response, 50 ms gap | Time-based auth `2A` handshake |
| Web Bluetooth GATT, FFF0/FFF3 | out | 9-byte `7E…EF`, 5 ms gap | — |
| Web Bluetooth GATT, FFF0/FFF1 | out | `55 AA` variable length + sum8, chunks of 20 bytes, write **with** response, 30 ms gap | `0x89` serial handshake |
| localStorage | in/out | JSON document | Silent failure |
| Service worker / Pages | in | static assets over HTTPS | Path `/LED_UNION/` |

No HTTP APIs, webhooks or message queues. No telemetry.

## 4. Quality attributes
| Attribute | How it is achieved | Confidence |
|---|---|---|
| Correctness of bytes | Unit tests (39 frame tests) and the differential test against vendor Java (259 frames emitted, G1) | 🟢 / 🟡 not reproducible |
| Responsiveness | Coalescing queue; write without response | 🟢 |
| Robustness | GATT retry with backoff; driver probing; any writable characteristic accepted; fallback when storage fails | 🟢 |
| Offline | PWA service worker; no network needed after load | 🟢 |
| Hardware verification | ffe0 LEDBLE-00 and LEDCAR-01 (incl. strip effects), BLEDIM colours | 🟢 from the owner. ELK/MELK and the other layouts are unverified 🟡 |
| Portability | Chromium only; no iOS | 🟢 |

## 5. Technical debt
| ID | Debt | Impact | Ref |
|---|---|---|---|
| TD-01 | **The variant is dropped on some call paths.** `applyTo` hands the builder 4 arguments, but Scenes uses 3. Nothing enforces it: the builder signature makes `variant` optional. | Wrong envelope or effect table on LEDCAR-01 RGB in scenes | F1 |
| TD-02 | **Endpoint vs device semantics are muddled.** `Group.deviceIds` holds endpoint keys; the `parseEp().ch` field is an index. | Orphan keys, wrong counts; groups only *select* (G6 intent: control all) | F2, G6 |
| TD-03 | **Silent failures.** `applyTo` uses `allSettled`; DeviceCard and Effects never surface write errors. | The user cannot tell a command did not land | F9 |
| TD-04 | **Impure driver.** BLEDIM keeps module-global `states` (keyed by name) and `seq`; the UI probes `customEffect` inside `$derived`. | Shared state across BLEDIMs; colour memory wiped | F3, F4 |
| TD-05 | **Abstraction leak.** The UI imports `ffe0.spiConfigFrame`, `directionFrame`, `isAddressable`, `rgbOrdersFor` and `bledim.switchChannelsFrame` directly. Capability checks branch on `driver.id === 'bledim'`. | A new family needs UI edits | c4-components |
| TD-06 | **Incomplete look.** White, CCT and sound are not recorded. | Scenes cannot capture them | F5 |
| TD-07 | **i18n bypass.** Debug and BLE errors are in Portuguese. | English UI shows Portuguese errors | F6 |
| TD-08 | **Duplication.** The `rgb(hex)` helper is copied in DeviceCard, Effects and Scenes; `sleep` and `sleepMs`; `audioSenseFrame` vs `soundSensitivity`. | Drift risk | F11 |
| TD-09 | **Dead code.** `apply`, `targets`, `passwordQueryFrame`, `readInfoFrame`; an orphan comment and blank lines in `store.svelte.ts`. | Noise | F11 |
| TD-10 | **No tests for the I/O layer.** `ble.svelte.ts`, the store mutators and the UI are untested; the most bug-prone path (call-site argument passing) has no coverage. | Regressions like F1 | Tests |
| TD-11 | **difftest is not reproducible** and its coverage misses variants and LEDBLE-03; the README count is stale (221 vs 259). | False confidence | F7, F8, G1 |
| TD-12 | **Event listener leak.** `track()` adds a `gattserverdisconnected` listener on every call. | Duplicate handlers | F10 |
| TD-13 | **Multi-output LEDBLE not modelled.** `outputsFor` treats LEDBLE-00 as a single light, so byte 7 = `FF`; the owner reports the "same colour on everything". | Core use case degraded | G2 |
| TD-14 | **Orphan custom effect in scenes.** `removeCustomEffect` does not prune scene snapshots. | The scene silently skips the effect | erd-complete |
| TD-15 | `__pycache__/*.pyc` tracked in git. | Repo hygiene | F13 |

Dependencies are current (Svelte 5.57, Vite 8, TS 6); none is critically outdated 🟢.

## 6. Extension points 🟢
- **New family:** add one `Driver` file and one registry line (bledim must stay ahead of any family that shares FFF0).
- **New layout in ffe0:** add a branch to `layoutFor` and to every builder `switch`, plus difftest names.
- **New multi-output model:** add it to `outputsFor` (and to `effects()` if each output uses its own table).
- **New language:** add one dictionary to `dicts`, plus `localeName`.
