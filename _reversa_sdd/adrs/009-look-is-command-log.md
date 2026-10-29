# ADR-009: A look is a log of sent commands, not device state

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** 50de5fb, persist.ts, README

## Context
BLE gives no state back, and the vendor app can change the device in between.

## Decision
Persist the last command per endpoint (`Look`). The UI shows it as "last sent". Scenes snapshot looks with `structuredClone`.

## Consequences
Cheap and offline, but it drifts. ⚠️ Incomplete: white, CCT and sound are not logged (F5). 🟢
