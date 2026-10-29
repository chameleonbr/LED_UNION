# ADR-011: White is an intent, not a channel

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** 4af1427, 835a910

## Context
`[W,0,0,0]` on 3-channel RGB hardware zeroed the colour and turned the strip off.

## Decision
Drive `white()` only when a real W wire exists (caps plus BLEDIM channel mode ≠ 3); otherwise send r=g=b, labelled as such.

## Consequences
Matches what the user means. The BLEDIM channel mode selector moved to the top of the card because it changes what the controls below it mean. 🟢
