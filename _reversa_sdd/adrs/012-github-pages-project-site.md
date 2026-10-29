# ADR-012: Deploy as a GitHub Pages project site

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** d6c9e0d, 3f04c9c

## Context
Web Bluetooth needs HTTPS. A custom domain (led.avila.dev.br) was tried first.

## Decision
Publish under `/LED_UNION/` with `base` set only at build time (dev stays at the root for the adb tunnel) and a relative `start_url`. CI runs test, then check, then build, then deploy, with a single concurrency group.

## Consequences
Free TLS. A red test never ships. 🟡 Why the custom domain was dropped is not stated.
