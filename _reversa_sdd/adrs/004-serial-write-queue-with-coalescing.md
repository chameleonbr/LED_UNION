# ADR-004: Per-device serial write queue with coalescing

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** ff9c71f, 6d29a4e, queue.ts

## Context
The controllers drop or mangle concurrent writes. The vendor apps throttle by discarding writes inside the window, which loses the final slider value.

## Decision
One FIFO chain per device with a family-specific minimum gap. Slider streams use `pushLatest(key)`, keyed per output; uploads, power and handshakes use `push`.

## Consequences
The final value always lands, and two outputs do not cancel each other. Queue tests depend on timing (`207e909` added 2 ms of slack). 🟢
