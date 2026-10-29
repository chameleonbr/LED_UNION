# ADR-002: Drivers are pure frame builders behind one interface

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** ff9c71f, types.ts, README

## Context
Protocols were reverse-engineered and needed byte-level verification. I/O in the drivers would make them hard to test.

## Decision
`Driver` has pure functions that return `Uint8Array`. All I/O lives in `ble.svelte.ts`. Adding a family means one file plus one registry line.

> **Exception** 🟢 [external review R06]: BLEDIM is not pure. It keeps module-global `states` (per name) and `seq` and mutates them in its builders (`bledim.ts:75-83,214-217,229-249,259-264`). `DeviceCard.svelte:38-40` calls `customEffect` to test support, which clears the remembered colour (F4). A re-implementation should keep detection side-effect-free and own state per device.

## Consequences
Every builder is unit-tested against the documented templates. ⚠️ Partially violated: the BLEDIM driver keeps module state (`states`, `seq`), and the UI probes `customEffect` in a `$derived`, which has side effects (F4). 🟢
