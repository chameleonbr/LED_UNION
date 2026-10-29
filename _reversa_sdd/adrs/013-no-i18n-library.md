# ADR-013: Hand-rolled i18n with English fallback

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** 14d10e9, dict.ts

## Context
Two languages and a few dozen strings.

## Decision
Plain dictionaries, a `translate()` fallback chain (locale, then en, then key) and an explicit choice that beats browser detection.

## Consequences
No dependency. ⚠️ The Debug tab and the BLE errors bypass it (F6). 🟢
