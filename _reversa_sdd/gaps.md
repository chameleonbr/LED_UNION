# Open Gaps — LED UNION

> Reversa Reviewer · 2026-10-26 · gaps that remain 🔴 after the review and the owner's answers

| # | Gap | Where | Blocks | How to close it |
|---|---|---|---|---|
| G2 | Byte-7 meaning on the owner's ffe0 controllers. The owner has a LEDBLE-00 and a LEDBLE-01, does not remember which one has two outputs (one RGB, one addressable), and sees "the same colour on everything" | `protocol-drivers/design.md`, `contracts.md` C2, `device-control/tasks.md` T-16, `protocol-drivers/tasks.md` T-12, `user-stories/connect-and-control.md` | `outputsFor` for those models, ADR-008, power default `00` | Debug tab channel sweep on both devices; record which values reach which output |
| BR-CE10 | Output selector for a custom effect on a channel-selected controller (LEDBLE-02 / LEDCAR-02). The owner wants the outputs independent | `custom-effects/requirements.md`, `custom-effects/tasks.md` T-12 | Per-output custom effects on channel-selected models | Depends on G2; a vendor capture of a per-output DIY upload |
| R19 | Whether the firmware tolerates other commands interleaving with a custom-effect upload | `custom-effects/requirements.md` BR-15, `tasks.md` T-13 | Whether uploads need a lock | Send a colour mid-upload on hardware |
| F8 | The difftest cannot be re-run without the decompiled trees | `tooling/design.md`, `tooling/tasks.md` | Vendor-fidelity checks by anyone but the owner | Owner approved: commit `java_frames.json` (tooling T-13) |
| G6 | Commanding a group is not implemented (F15) | `user-stories/scenes-and-groups.md` US-24, `groups/tasks.md` T-07..T-09 | The groups feature | Implementation; the design is now fully decided (T-08 answered) |

Resolved during this review: groups and effects (T-08), custom effects in scenes are live references (R07), concurrent scenes allowed (R16), difftest fixture approved (F8 path), F14 evidence upgraded.
