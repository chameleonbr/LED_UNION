# Legacy impact — 001 ipixel-fase1

**Date:** 2026-10-31 · **Feature:** 001-ipixel-fase1 · **Branch:** `feat/ipixel-phase1`

## Affected files

| Affected file | Component (`_reversa_sdd/architecture.md`) | Type | Severity | Justification |
|---|---|---|---|---|
| `src/lib/protocol/ipixel.ts` | protocol-drivers | componente-novo | MEDIUM | New family driver; isolated, pure builders (ADR-002). |
| `src/lib/protocol/types.ts` | protocol-drivers | regra-nova | LOW | Optional `Driver` members only; existing drivers unchanged. |
| `src/lib/protocol/index.ts` | protocol-drivers | regra-nova | LOW | `ipixel` registered last; name resolution of every existing name unchanged. |
| `src/lib/ble.svelte.ts` | device-connection / device-control | regra-alterada | HIGH | Notify path, stealth guard in `applyTo`/`sendFrames`, empty-frame skip, trace hooks, `namePrefix` chooser filters, confirmed `driverId` preferred over name guess. |
| `src/lib/look.ts` | scenes | componente-novo | MEDIUM | `applyLook` moved out of `Scenes.svelte`, plus panel slot step. |
| `src/lib/stealth.ts` | device-control | componente-novo | MEDIUM | Enter/exit stealth. |
| `src/lib/trace.ts` | debug | componente-novo | LOW | Command log, own storage key. |
| `src/lib/persist.ts` | persistence | delta-de-dados | MEDIUM | Optional `SavedDevice.panel`, `Look.panel`, `Persisted.stealth`; rekey moves stealth snapshot. |
| `src/lib/store.svelte.ts` | persistence | regra-alterada | LOW | `setPanel`, `setOrientation`, `setDriverId`; forget drops stealth snapshot entries. |
| `src/lib/ui/Scenes.svelte` | scenes | regra-alterada | MEDIUM | Uses shared `applyLook`; one stealth confirm per scene; source tag. |
| `src/lib/ui/DeviceCard.svelte` | ui | regra-nova | LOW | iPixel block. |
| `src/lib/ui/Debug.svelte` | debug | regra-nova | LOW | Trace view and download. |
| `src/App.svelte` | ui | regra-nova | LOW | Stealth toggle. |
| `src/lib/dict.ts` | i18n | regra-nova | LOW | New strings en + pt-BR. |
| `README.md`, `README.pt-BR.md` | docs | regra-nova | LOW | iPixel row, marked untested on hardware. |

## Conceptual diff per component

- **protocol-drivers:** a fourth family. `LED_BLE_xx` is claimed by both `ffe0` (by name) and `ipixel`; `ffe0` stays the name guess and the GATT probe moves an iPixel panel to `ipixel` because it has no FFE0 service. Families without colour/speed/effect return empty frames, which `applyTo` now skips.
- **device-connection:** after a successful probe the confirmed driver id is saved, and `track`/`restore` use it before the name guess. Drivers with `notifyChar` get notifications started before the handshake; replies feed `setPanel`. Chooser also filters by `namePrefix`.
- **device-control:** `applyTo` and `sendFrames` take an optional `{ force, source }` and return `false` when stealth blocked them, so cards skip recording a look that was never sent (BR-30). While stealth is on, a non-forced call asks to leave stealth; declining writes nothing. Connecting during stealth powers every output off right after the handshake and adds it to the snapshot, so it is restored on exit.
- **scenes:** apply path is `look.ts#applyLook`, same order, with `showSlot` appended. Scene apply asks once about stealth, then runs forced.
- **persistence:** three optional fields; no migration; store key unchanged.
- **debug:** every frame, notification and link change is traced, persisted under `led-union/trace` (2000 entries), downloadable as JSON.

## Preserved (🟢 rules intact)

- BR-01 advertised name never edited.
- BR-03 any writable characteristic in the family's service is accepted.
- BR-04 bledim before fff0.
- BR-05 / BR-06 outputs and effect tables per model.
- BR-10 / BR-11 endpoint targeting and broadcast limits.
- BR-13 / BR-14 serialized writes, last slider value lands.
- BR-15 ordered uploads never coalesced.
- BR-16 .. BR-20 colour/white/effect rules.
- BR-21 no fake commands (iPixel returns empty frames, skipped).
- BR-31 / BR-32 / BR-34 scene scope, snapshot, old-format drop.
- BR-36 / BR-37 / BR-38 hardware settings saved first, palette re-seed, storage never blocks.
- Difftest emitter md5 `98622b8733585ad72d2b82a0aa7767e0` unchanged; 65 legacy tests still pass (81 total).

## Modified (🟢 rules changed or extended)

- **BR-02** name is a hint, probe confirms → extended: the probe's result is now persisted (`driverId`) and preferred over the name on later loads.
- **BR-12** a command on an offline device reconnects first → now gated: while stealth is on, a non-forced command first asks to leave stealth.
- **BR-30** app records what it sent, BLE gives nothing back → extended: families with `notifyChar` report panel info, stored on the device (looks are still a record of what was sent).
- **BR-33** scene apply order power → brightness → speed → colour → effect → extended with panel slot last.
- **BR-35** forgetting a device removes everything keyed to it → also removes its stealth snapshot entries.
