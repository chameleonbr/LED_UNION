# ADR-001: Client-only PWA over Web Bluetooth

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** 285c830, ff9c71f, README

## Context
The vendor apps are unmaintained, each speaks one family and controls one device at a time. A single cross-family controller was wanted, with no install and no account.

## Decision
Build a Svelte 5 + Vite PWA that talks to the controllers directly through Web Bluetooth. No server; all state lives in localStorage.

## Consequences
Works on Chrome/Edge (desktop and Android) only; iOS is excluded. Needs HTTPS. Data is per browser profile, with no sync or backup. 🟢
