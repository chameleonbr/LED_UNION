# Regression watch — 003 motion-mode

| ID | Origin (file, section) | Expected rule after change | Check type | Violation signal |
|---|---|---|---|---|
| W001 | `_reversa_sdd/domain.md#State and persistence` (BR-30) | Looks record what was sent, **except motion output**, which is not recorded and is undone on Stop by replaying the pre-Start snapshot. | redação | Re-extraction says motion writes update looks, or that Stop leaves the lights as motion left them. |
| W002 | `_reversa_sdd/domain.md#Commanding` (BR-12, BR-71) | User commands prompt to leave stealth; **motion never prompts and sends nothing while stealth is on** (including in-flight flashes and slot reverts). | redação | Motion described as leaving stealth, or as writing during stealth. |
| W003 | `_reversa_sdd/domain.md#State and persistence` (BR-35) | Forgetting a device removes its looks, labels, stealth snapshot entries, scene entries **and motion rule targets**. | presença | Forget rule omits motion targets. |
| W004 | `_reversa_sdd/domain.md#State and persistence` (BR-33) | Scene apply order unchanged (power → brightness → speed → colour → effect → panel slot), now via shared `applyScene`. | presença | Order changed or scenes apply differently from the Effects/Scenes tab. |
| W005 | `_reversa_sdd/domain.md#Commanding` (BR-14) | Motion map output goes through `pushLatest` per rule and is throttled to ≤ 10 writes/s per rule. | presença | Motion writes described as queued without coalescing. |
| W006 | `_reversa_sdd/domain.md#Engineering policy` | Difftest emitter md5 `98622b8733585ad72d2b82a0aa7767e0` unchanged by this feature. | presença | md5 differs without a deliberate driver change. |

## Observations (no regression weight)

- 🟡 Live positions are memory-only; saved places are stored only on the phone (NFR-03) — privacy, not a domain rule yet.
- 🟡 Locked phone stops sensors (Chrome); Dark screen is the PWA answer. Native shell is a candidate later phase.
- 🟡 A flash on a light with no recorded colour or effect ends dark; the Motion tab warns about it.
- 🟡 Thresholds untested on a real drive.

## Re-extraction history

## Archived
