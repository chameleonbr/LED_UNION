# ADR-006: Differential test against the decompiled vendor Java

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** 58fff5d, 50de5fb

## Context
Hand transcription errors cannot be caught by hand-written tests.

## Decision
Extract every frame literal from the jadx output (3 shapes, alias resolution) and match it against the TS output by header, with free positions.

## Consequences
Caught real bugs: the BLEDIM offset 4, the dmxs dim opcode, the LEDCAR-01 power frame and the dmxs music variant. ⚠️ It is not reproducible from the repo (decompiled trees absent, F8), it exercises no variants (F7), and the README (221) disagrees with the commits (259) (G1). 🟡
