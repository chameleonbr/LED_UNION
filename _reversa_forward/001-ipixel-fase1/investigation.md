# Investigation — 001 ipixel-fase1

## Background

- 🟢 Protocol extracted from com.wifiled.ipixels 3.8.1 (jadx), cross-checked with `pypixelcolor` and `go-ipxl`: `docs/protocol/ipixel.md`.
- 🟢 Legacy extension model: one `Driver` per family, probe-based resolution (`_reversa_sdd/architecture.md`, ADR-002/003/004).
- 🟢 Difftest emitter iterates a fixed `NAMES` list (`tools/difftest/emit_ts_frames.ts`); none contains `LED_BLE`, so adding the driver cannot change the md5.

## Alternatives evaluated

| Topic | Option A (chosen) | Option B | Why A |
|---|---|---|---|
| Panel read-back | Optional `notifyChar` + `onNotify` on `Driver` | Ask the user to pick a model | User does not know the model; vendor app reads it. |
| Chooser filter | Service filters + `namePrefix: 'LED_BLE'` | `acceptAllDevices` | Lists only plausible devices; covers panels that do not advertise `00fa`. |
| Stealth gate | Guard in `applyTo` with `force` flag | Gate in every UI control | One choke point; every write already goes through `applyTo`/`sendFrames`. |
| Restore path | Shared `applyLook` (moved from `Scenes.svelte`) | Separate restore code | Same order rules (BR-33) in one place. |
| Unsupported commands | Empty frame skipped in `applyTo` | Make `rgb/speed/effect` optional on `Driver` | Optional would touch every caller; empty frame is local. |
| Chunking | none in phase 1 (all frames ≤ 10 B) | 244 B chunks | Uploads are phase 2. |

## Web Bluetooth notes

- `requestDevice` filters are OR-ed; `optionalServices` must list `000000fa-…` (already via `allServices`).
- `namePrefix` is the only name matcher (no "contains"), so names must start with `LED_BLE`; service filter covers the rest.
- `startNotifications()` needs the CCCD; failure is caught and the driver keeps working without size.

## Hardware spike (first task)

1. Add device with the new filters; record name and advertised services.
2. Debug → Inspect: confirm `00fa`, `fa02` (write props), `fa03` (notify).
3. Send `08 00 01 80 HH MM SS 00` via Debug raw; capture any notify.
4. Send `05 00 07 01 00` / `01`; observe panel.
