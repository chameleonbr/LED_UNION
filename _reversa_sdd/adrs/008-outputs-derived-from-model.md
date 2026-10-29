# ADR-008: Outputs are derived from the model, not declared

- **Status:** Accepted (retroactive)
- **Date:** 2026-09-04 (repository history)
- **Evidence:** 767e061 (reverses 6d29a4e, 835a910)

## Context
At first, outputs were opt-in and editable per device (add, remove, renumber), on the assumption that only the owner knows the wiring. Two of the author's own changes collided: an RGB output that vanished, and a phantom ch 0 card.

## Decision
Copy the vendor apps: LEDBLE-02 and LEDCAR-02 always have LED1/LED2, LEDCAR-01 always has RGB/SPI, and the rest have one light. The editing UI was removed; renaming stays.

## Consequences
Fewer UI states and no stored output list. 🔴 G2: the user's LEDBLE-00 apparently has several outputs (`44bfd0f`) but is now modelled as a single light. This is a reversal worth validating.
