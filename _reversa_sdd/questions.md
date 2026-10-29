# Validation Questions — LED UNION

> Reversa Reviewer · 2026-10-26 · answer_mode: chat (answers are recorded here as they come in)

---

## Question 1 — G2: byte 7 on the owner's multi-output controller

**Context:** `src/lib/protocol/ffe0.ts` — the `ble` layout defaults byte 7 to `00` for power and `FF` for everything else; on LEDBLE-02, `00` = all outputs and `1`/`2` select one (`44bfd0f`). ADR-008 now models LEDBLE-00 as a single light, although commit `44bfd0f` suggests it has several outputs.
**Spec affected:** `protocol-drivers/design.md`, `protocol-drivers/contracts.md` C1/C2, `device-control/tasks.md` T-16, `user-stories/connect-and-control.md`
**Question:** On your controller, which byte-7 values reach which output, and does your LEDBLE-00 have more than one output? (The Debug tab's channel sweep answers it.)
**Impact:** Decides `outputsFor` for your model, whether power should stop defaulting to `00`, and fixes "the same colour on everything".

**Response:** ⏳ Partial — the owner has a LEDBLE-00 and a LEDBLE-01 and does not remember which one has two outputs. Stays 🔴 until the Debug channel sweep is run on both.

---

## Question 2 — Groups and effects (groups T-08)

**Context:** `groups/design.md` "Intended design"; F15 (no command reads groups today).
**Spec affected:** `groups/requirements.md` RF-07/08, `groups/tasks.md` T-08
**Question:** When every member of a group is the same family (same effect table), should the group also offer effects and custom effects, or only power, colour and brightness?
**Impact:** Scope of the group control card and its tests.

**Response:** ✅ Answered — mixed-family groups: power, colour, brightness only. Same family (same table): effects too. T-08 is 🟢.

---

## Question 3 — Custom effect on one output (BR-CE10)

**Context:** `src/lib/protocol/ffe0.ts` customEffect carries no output byte; no vendor frame for it is known.
**Spec affected:** `custom-effects/requirements.md` BR-CE10, `custom-effects/tasks.md` T-12
**Question:** Do you need a custom sequence to run on one output of LEDBLE-02 / LEDCAR-02 only, or is "whole device" acceptable?
**Impact:** If one output is needed, a hardware/vendor capture is required before T-12; otherwise T-12 is dropped.

**Response:** ✅ Answered — the two outputs are one RGB and one addressable, and should be independent. Matches the LEDCAR-01 variant model; if the device is a LEDBLE-00/01 it depends on Q1.

---

## Question 4 — Custom effects inside scenes: reference or snapshot? (R07)

**Context:** `src/lib/persist.ts:36-45` stores `customEffectId` only; `Scenes.svelte:33-37` looks the effect up at replay.
**Spec affected:** `scenes/requirements.md` BR-32, `custom-effects/requirements.md` RF-03
**Question:** If you edit a custom effect after saving a scene, should the scene replay the **edited** version (live reference, today's behaviour), or the version it was saved with (snapshot)?
**Impact:** Snapshot means embedding colours, fade and speed in the scene entry plus a migration; reference keeps today's model but deleting the effect should then warn or prune.

**Response:** ✅ Answered — edited version (live reference). Deleting an effect should warn or prune scenes (scenes T-12).

---

## Question 5 — Running two scenes at once (R16 / F22)

**Context:** `src/lib/ui/Scenes.svelte:6,53-62` — one scalar `busy`.
**Spec affected:** `scenes/requirements.md` BR-SC5, `scenes/tasks.md` T-10
**Question:** Should scenes be allowed to run concurrently (each button disabled only while its own scene runs), or should one replay lock all Apply buttons?
**Impact:** Per-scene set vs global lock in T-10 and TT tests.

**Response:** ✅ Answered — scenes may run concurrently; per-scene set of running ids (scenes T-10).

---

## Question 6 — Difftest inputs (F8)

**Context:** `tools/difftest/extract_java_frames.py` needs locally decompiled vendor trees that are not in the repo.
**Spec affected:** `tooling/requirements.md`, `tooling/tasks.md` (F8)
**Question:** Can the extracted Java frames (`java_frames.json`, not the decompiled sources) be committed as a fixture so CI can re-run `compare.py`?
**Impact:** Yes → vendor-fidelity becomes a CI check; No → it stays a manual check on your machine and the spec keeps 🔴.

**Response:** ✅ Answered — yes, `java_frames.json` may be committed; tooling T-13 adds the CI check.
