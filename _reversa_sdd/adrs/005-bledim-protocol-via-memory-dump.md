# ADR-005: Recover BLEDIM via a runtime memory dump

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** 929e6bd, 114847e, c13ed33

## Context
Four BLEDIM APK versions are packed, with entropy 7.9–8.0, so static analysis failed.

## Decision
Run the app in containerized Android (redroid + binderfs) and dump the decrypted DEX with frida-dexdump. Capture real ScenePara buffers with `bledim_scene.js` as a test fixture.

## Consequences
Revealed the FFF1 write characteristic and the `55 AA` checksummed protocol (21 commands). The method is documented in docs/protocol/bledim.md. The driver itself was never tried on hardware. 🟢
