# ADR-010: BLEDIM static colour sent as a one-colour scene

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** e632713, 835a910

## Context
`0x81` is only a live preview and is forgotten on power cycle; slot 0 is seeded white by the app.

## Decision
Send the static colour as `0x82` FlushStaticBuf (speed 192, brightness 255) and fold brightness into the RGB while a colour is showing.

## Consequences
The headlight comes back in the chosen colour. Brightness and speed semantics depend on the mode (colour vs effect). 🟢
