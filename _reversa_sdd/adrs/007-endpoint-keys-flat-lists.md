# ADR-007: Logical devices as flat endpoint-key lists

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** 6d29a4e, 767e061, endpoint.ts

## Context
One controller can feed several lights, and selection, groups and scenes needed to address outputs.

## Decision
Encode an endpoint as `deviceId` or `deviceId#i` and keep every collection a flat string list. Since `767e061`, `i` is the index into the model's outputs rather than a channel byte.

## Consequences
Simple storage, with migration from the old `#ch` keys. ⚠️ Naming debt: `parseEp().ch` and `Group.deviceIds` still suggest the old meaning, and `forgetDevice` misses `#i` keys in groups (F2). 🟢
