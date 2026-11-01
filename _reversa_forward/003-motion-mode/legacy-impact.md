# Legacy impact — 003 motion-mode

> 2026-11-01 · feature `003-motion-mode` · branch `feat/motion-mode`

| Affected file | Component (`_reversa_sdd/architecture.md`) | Type | Severity | Justification |
|---|---|---|---|---|
| `src/lib/motion/engine.ts`, `engine.test.ts` | new `motion/` (pure) | componente-novo | MEDIUM | Speed, G, calibration, map/trigger/place rules; 10 tests |
| `src/lib/motion/run.ts` | new `motion/` executor | componente-novo | HIGH | Writes to every family through `applyTo` with `force`; stealth gate replaced by "drop while stealth" |
| `src/lib/motion/sensors.svelte.ts` | new browser adapter | delta-de-contrato-externo | MEDIUM | Geolocation, DeviceMotion, Wake Lock, Vibration |
| `src/lib/persist.ts` | persistence | delta-de-dados | MEDIUM | `Persisted.motion` (rules, places, calibration); migrate; rekey moves rule targets; `dropMotionTargets` |
| `src/lib/store.svelte.ts` | store | regra-alterada | LOW | `forgetDevice` prunes motion targets (BR-35) |
| `src/lib/look.ts` | look / scenes | regra-alterada | MEDIUM | `applyLook(…, record)` and new `applyScene(…, record)`; default records as before |
| `src/lib/ui/Scenes.svelte` | ui · scenes | regra-alterada | LOW | Uses `applyScene`; same order, same prompt |
| `src/lib/ui/Motion.svelte`, `MotionRuleEditor.svelte` | ui | componente-novo | LOW | Motion tab, gauges, rules, places, dark screen |
| `src/App.svelte` | ui shell | regra-alterada | LOW | 6th tab; nav grid 3 columns; main bottom padding 130 px |
| `src/lib/ui/Debug.svelte` | debug | regra-nova | LOW | "Simulate drive" |
| `src/lib/dict.ts` | i18n | regra-nova | LOW | `nav.motion`, `motion.*` en + pt-BR |
| `README.md`, `README.pt-BR.md` | docs | regra-nova | LOW | Motion mode section; iPixel row now hardware-tested |

## Conceptual diff

- **Commanding:** a new caller of `applyTo` that always passes `force:true` and a coalesce key `motion:<ruleId>`. It never asks to leave stealth; it sends nothing while stealth is on, including in-flight flashes and timed slot reverts.
- **State:** motion output is **not** recorded as looks (`record=false`). Start snapshots the looks of every target (and of scenes used by rules); Stop replays them with `applyLook(force)`, which records them. Stop during stealth skips the replay (stealth restores its own snapshot).
- **Persistence:** additive `motion` field; live positions never stored; saved places are personal data kept only in `led-union/v1`.
- **Drivers:** untouched (difftest md5 unchanged).

## Preserved (🟢 rules of `_reversa_sdd/domain.md`)

BR-01..07, BR-10, BR-11, BR-13, BR-14, BR-15, BR-16..21, BR-31, BR-32, BR-33 (order unchanged), BR-34, BR-36..38, BR-40, BR-41, BR-50..53, BR-60..67, BR-70, BR-72, BR-73.

## Modified

- **BR-30** — looks record what was sent, **except motion output**, which is transient and undone on Stop.
- **BR-12 / BR-71** — the leave-stealth prompt applies to user commands; motion never prompts and drops its writes while stealth is on.
- **BR-35** — forgetting a device also removes it from motion rule targets.
