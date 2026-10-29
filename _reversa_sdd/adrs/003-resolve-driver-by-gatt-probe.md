# ADR-003: Resolve the driver by probing GATT, not by name

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** d6d08c7, 249749e

## Context
Advertised names are unreliable (BLEDIM, LED_BLE_00203032 and MELK-xx all appear). BLEDIM exposes FFF0 but not FFF3.

## Decision
The name is only a first guess. `connect()` tries every known service, preferring the documented write characteristic and accepting any writable one. The error lists the characteristics it saw.

## Consequences
Devices with non-standard handles connect. Risk: a wrong family could claim a device that shares its service, which is mitigated by name-matching bledim first. 🟢
