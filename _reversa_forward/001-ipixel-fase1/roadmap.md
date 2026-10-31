# Roadmap — 001 ipixel-fase1

> Delta over the legacy described in `_reversa_sdd/`. Requirements: `requirements.md` (0 open doubts).

## 1. Approach

🟡 Add one driver file (`ipixel.ts`) and one registry line, as the legacy extension point prescribes (`_reversa_sdd/architecture.md#6. Extension points`). Extend `Driver` with **optional** members only, so fff0/ffe0/bledim are untouched. Add a small notify path in `ble.svelte.ts` used only by drivers that declare a notify characteristic. Move scene `applyLook` out of `Scenes.svelte` into a shared module so stealth restore reuses the same path. Stealth is a store flag plus a guard in `applyTo`.

## 2. Principles applied

🟢 No `.reversa/principles.md` exists. Implicit principles from `_reversa_sdd/domain.md` and ADRs are respected:

| Principle | How |
|---|---|
| ADR-002 pure builders | `ipixel.ts` builds bytes only; parsing the reply is a pure function too. |
| ADR-003 resolve by GATT probe | iPixel resolves through `resolveDriver` like every family; a device found by service filter but with another name still probes to `ipixel`. |
| ADR-004 serial queue + coalescing | Brightness uses `pushLatest`; show-slot and power use `push`. `minGapMs: 100`. |
| BR-21 no fake commands | No `rgb`/effect/speed frames for iPixel: builders return an empty array frame and caps hide controls. |
| BR-30 record what was sent | Looks still record what was sent; only `panel` info is read back. |
| BR-33 apply order | `applyLook` keeps power → brightness → speed → colour → effect, and appends panel action last. |
| BR-38 storage never blocks | Panel info and stealth saved via existing `save()` (already try/catch). |

No conflicts.

## 3. Technical decisions

| # | Decision | Conf. |
|---|---|---|
| D1 | `Driver` gains optional `notifyChar?: string`, `onNotify?(data: Uint8Array): DeviceReport \| undefined`, `showSlot?(slot, name)`, `orientation?(v, name)`, `deleteAll?(name)`, `namePrefix?: string`. | 🟡 |
| D2 | `rgb`, `speed`, `effect` on iPixel return `new Uint8Array(0)`; `applyTo` today skips only `undefined` (`if (!frame) return`), so it changes to `if (!frame?.length) return`. | 🟢 checked in `ble.svelte.ts` |
| D3 | `addDevice` filters = existing service filters + `{ namePrefix }` for drivers that set it (`LED_BLE`), so the panel shows up whether it advertises the service or only the name (clarification FR-02). | 🟡 |
| D4 | After `resolveDriver`, if `driver.notifyChar`, `connectOnce` gets the service again, `startNotifications()`, and routes `characteristicvaluechanged` to `driver.onNotify`; a report with `panel` calls `setPanel(id, panel)` in the store. Failure to start notify is logged, not fatal (FR-04 fallback). | 🟡 |
| D5 | `onConnect(name, now)` for iPixel returns `[08 00 01 80 HH MM SS 00]` (existing hook, existing `now` param). | 🟢 hook exists (`types.ts`) |
| D6 | Size table copied from `docs/protocol/ipixel.md#Device type byte to panel` as a const map. | 🟡 |
| D7 | `src/lib/look.ts` (new) exports `applyLook(key, look)` moved verbatim from `Scenes.svelte`, plus panel step: `look.panel?.kind === 'slot'` → `applyTo(keys, d => d.showSlot?.(slot, n))`. | 🟡 |
| D8 | Stealth: `store.stealth?: { snapshot: Record<string, Look> }`. `enterStealth()` snapshots `store.looks` for online endpoint keys, then `applyTo(keys, power(false), undefined, { force: true })`. `exitStealth()` clears flag and runs `applyLook` per snapshot entry with force. | 🟡 |
| D9 | `applyTo` gets an optional 4th arg `{ force?: boolean }`. When `store.stealth` and not force: `confirm(t('stealth.leave'))`; yes → `store.stealth = undefined` and continue; no → return. | 🟡 |
| D10 | On connect while stealth: after `onConnect` frames, `connectOnce` pushes `power(false)` for every output. | 🟡 |
| D11 | Card for `driver.id === 'ipixel'`: size badge (or "size unknown" + Retry = resend `onConnect`), slot input 1..100 + Show (sets `look.panel`), orientation select 0..3 (saved on `SavedDevice.panel.orientation`, BR-36 style), Delete all with `confirm`. | 🟡 |
| D13 | Trace: `src/lib/trace.ts` (new) with `trace(entry)`, ring buffer 2000, persisted under `led-union/trace` (try/catch), `exportTrace()` building a JSON Blob + `<a download>`. Hooked in `writeOnce` (write + result), notify listener, `connectOnce` / disconnect handler. Source tag passed through an optional `source` field in the `applyTo` / `sendFrames` options object (same object as `force`). | 🟡 |
| D12 | CRC32 and window upload are **not** in this feature (phase 2). | 🟢 scope |

## 4. Architectural delta

| File | Change |
|---|---|
| `src/lib/protocol/types.ts` | + optional Driver members (D1), `DeviceReport`, `PanelInfo` types. |
| `src/lib/protocol/ipixel.ts` | **new** driver + `parseDeviceInfo` + size table. |
| `src/lib/protocol/index.ts` | register `ipixel` (order: after bledim/fff0/ffe0 is fine, its service is unique). |
| `src/lib/protocol/frames.test.ts` or new `ipixel.test.ts` | ≥ 10 byte-exact tests. |
| `src/lib/ble.svelte.ts` | D3 filters, D4 notify, D9 guard, D10 stealth on connect, empty-frame skip. |
| `src/lib/look.ts` | **new**, `applyLook` moved + panel step. |
| `src/lib/ui/Scenes.svelte` | import `applyLook` from `look.ts`; show "Slot N" summary. |
| `src/lib/store.svelte.ts` | `setPanel`, `enterStealth`, `exitStealth`. |
| `src/lib/persist.ts` | `SavedDevice.panel?`, `Look.panel?`, `Persisted.stealth?`; merge keeps them. |
| `src/App.svelte` | stealth toggle in header. |
| `src/lib/ui/DeviceCard.svelte` | iPixel controls (D11); hide caps-false controls (already caps-driven). |
| `src/lib/dict.ts` | en + pt-BR strings. |
| `src/lib/trace.ts` | **new**, trace buffer, persistence, export (D13). |
| `src/lib/ui/Debug.svelte` | trace view (last 100), Download / Clear / record switch. |

## 5. Data delta

See `data-delta.md`. All additive and optional; store key stays `led-union/v1`.

## 6. Contract delta

🟢 No external HTTP/queue contracts. BLE frame contract documented in `docs/protocol/ipixel.md`; `interfaces/` omitted.

## 7. Migration

🟢 None. Older stores load; new fields absent mean "unknown size", "no panel action", "stealth off".

## 8. Risks

| Risk | Mitigation |
|---|---|
| 🔴 Chrome cannot see/connect the panel | First action: spike with Debug `inspect` on the real panel before UI work. |
| 🔴 No reply on `fa03` | D4 non-fatal; Debug lists notifications; size can stay unknown in phase 1 without blocking power/brightness/slot. |
| 🟡 `confirm()` repeats while dragging a slider in stealth | After "yes" stealth is off, so it prompts once; "no" re-prompts per event — acceptable, documented. |
| 🟡 Moving `applyLook` changes scene frames | Pure move; existing scene behaviour verified by hardware check + unchanged difftest. |

## 9. Definition of done

- All FR-01..FR-19 implemented; acceptance criteria in `requirements.md` §6 checked on hardware (strip + RGB LEDs + user's iPixel).
- `npm test` green (65 existing + new), `npm run check` clean, `npm run build` ok.
- Difftest emitter md5 `98622b8733585ad72d2b82a0aa7767e0` unchanged.
- PR opened; merge only on explicit user request.
