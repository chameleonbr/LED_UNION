# Custom Effects, Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `custom-effects` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md` and `design.md` in this folder.

## Prerequisites
- [ ] `device-control/` is done: `applyTo`, `WriteQueue.push`, `writeRaw` with chunking, `outputAt`, the device card and its effect select
- [ ] `device-connection/` is done: `connect`, `live`
- [ ] `protocol-drivers/` provides `layoutFor`, `isStage`, `f`, the BLEDIM `frame` and `stateFor`, and `byte`
- [ ] `persistence/` provides `store.customEffects`, `store.looks`, `uid`, `save`, `setLook`
- [ ] `i18n/` has the `custom.*` keys (`title`, `hint`, `name`, `addColor`, `jump`, `fade`, `unsupported`) and `effects.myEffects`, `effects.newEffect`
- [ ] There is no backend, no environment variables and no database

## Tasks

- [ ] T-01, Define `CustomEffect` (persisted: id, name, hex colours, speed, fade) and `CustomEffectSpec` (driver input: rgb colours, fade)
  - Legacy source: `src/lib/persist.ts:51-59`, `src/lib/protocol/types.ts:23-32`
  - Done when: both types compile and match the shapes in `design.md`
  - Confidence: 🟢

- [ ] T-02, Implement `addCustomEffect`, `updateCustomEffect` and `removeCustomEffect`. Remove deletes `customEffectId` from every look that points to the removed id; each call ends with `save()`.
  - Legacy source: `src/lib/store.svelte.ts:161-183`
  - Done when: after remove, no look references the id, and the change survives a reload
  - Confidence: 🟢

- [ ] T-03, Implement `ffe0.customEffect(spec, name, ch, variant)`:
  - return `[]` for sun/like/pho or for 0 colours;
  - 1-based index; mode `FE` for fade, `FD` for jump;
  - one frame per colour, using the 5 layout cases;
  - a start frame only for `dmxs`, `dmx` and the non-stage `ble` layout.
  - Legacy source: `src/lib/protocol/ffe0.ts:76,88-94,361-416`
  - Done when: the ffe0 custom-effect tests in `src/lib/protocol/frames.test.ts:575-613` pass
  - Confidence: 🟢

- [ ] T-04, Implement `bledim.customEffect(spec, name)`:
  - cap at 14 colours, and return `[]` when there are none;
  - clear the remembered colour;
  - build one `0x82` scene: `p[0]` fade, `p[3]` count, `p[14]=FF`, colours from byte 16 as `[0,R,G,B]`.
  - Legacy source: `src/lib/protocol/bledim.ts:252-282`
  - Done when: the bledim custom-effect tests in `frames.test.ts:620-650` pass; 20 input colours produce a frame with exactly 14 entries
  - Confidence: 🟢

- [ ] T-05, Leave `customEffect` undefined on fff0
  - Legacy source: `src/lib/protocol/fff0.ts` (absent); `frames.test.ts:610`
  - Done when: `fff0.customEffect === undefined`
  - Confidence: 🟢

- [ ] T-06, Implement `sendFrames(key, build)`:
  - throw when the device is not tracked; connect when offline;
  - resolve the output; `push` each frame in order and await it.
  - Legacy source: `src/lib/ble.svelte.ts:348-369`
  - Done when: four frames are written in order with the family gap between them; none is coalesced
  - Confidence: 🟢

- [ ] T-07, Add support detection to the card without side effects. Expose `supportsCustom(name, variant)` on the driver, or a capability flag, instead of calling the builder (fixes F4).
  - Legacy source: `src/lib/ui/DeviceCard.svelte:38-41` (currently calls the builder)
  - Done when: rendering a BLEDIM card any number of times leaves its driver memory untouched; MELK, LEDSUN, LEDLIKE and LEDPHO report false; LEDBLE, LEDDMX, LEDSMART and BLEDIM report true
  - Confidence: 🟡 (a strict port would keep the probe, but the probe is a known defect)

- [ ] T-08, In the card's effect select:
  - when supported, show "My effects" (only if there are any) and "New effect…";
  - otherwise show the `custom.unsupported` hint;
  - `__new__` calls `onEditCustom()`.
  - Legacy source: `src/lib/ui/DeviceCard.svelte:102-108,274-305`
  - Done when: the "Family without a colour-list command" scenario passes
  - Confidence: 🟢

- [ ] T-09, Implement `runCustom(fx)`:
  - `sendFrames` with the hex colours converted to rgb, plus fade;
  - then `applyTo(speed(fx.speed))`;
  - then `setLook({customEffectId: fx.id, effect: undefined})`.
  - Legacy source: `src/lib/ui/DeviceCard.svelte:116-135`
  - Done when: the "Create and run a strobe on LEDBLE" scenario passes
  - Confidence: 🟢
  - Note: catch a failed upload and tell the user (currently an unhandled rejection).

- [ ] T-10, Build the editor component:
  - chips to load or delete saved effects;
  - name input;
  - colour rows with ↑ / ↓ / ✕;
  - Add colour, capped at 14;
  - speed 0..100 and Jump / Fade;
  - Save, disabled on a blank name or no colours; then reset and close.
  - Legacy source: `src/lib/ui/CustomEffectEditor.svelte:1-120`
  - Done when: the "Colour limit", "Save needs a name" and "Delete clears the looks" scenarios pass; editing keeps the same id
  - Confidence: 🟢

- [ ] T-11, Host the editor once in the Effects tab, toggled by `onEditCustom` and closed by `onclose`
  - Legacy source: `src/lib/ui/Effects.svelte:38,94-99`
  - Done when: "New effect…" from any card opens one editor under the cards
  - Confidence: 🟢

- [ ] T-12, Add a channel byte to ffe0 uploads for multi-output models (BR-CE10)
  - Legacy source: not in the legacy code (`src/lib/protocol/ffe0.ts:369-416` ignores `ch`)
  - Done when: a sequence run on LEDBLE-02 "LED 2" reaches only that output
  - Confidence: 🔴 (no vendor reference for which byte would carry it; needs a hardware check, see G2)

## Test Tasks

- [ ] TT-01, Port `frames.test.ts:575-650` (ffe0 per layout, unsupported layouts, empty spec, fff0 absent, BLEDIM single frame and 14-colour cap)
- [ ] TT-02, Happy path: `runCustom` on a fake LEDBLE endpoint writes 3 colour frames + start + speed in order, then sets the look
- [ ] TT-03, Main error case: the second frame's write fails → the third frame, the speed and the look are not sent or set; the user sees an error
- [ ] TT-04, Store: add → update keeps the id → remove clears the looks
- [ ] TT-05, Side-effect-free support detection: render a BLEDIM card twice; the remembered static colour survives

## Data Migration Tasks
- [ ] TM-01, None for the shape. `migrate()` in `persistence/` replaces an invalid `customEffects` with `[]`.

## Suggested Order
1. T-01, T-02 (data), then T-03, T-04, T-05 (pure builders, test with TT-01).
2. T-06 (transport), then T-07, T-08 (card gate).
3. T-09 (run), then T-10, T-11 (editor UI).
4. T-12 only after a hardware check.

## Review Additions [external review]
- [ ] T-13, Decide whether an upload must be uninterrupted (BR-15). If so, queue the whole sequence as one paced op or take a per-device lock.
  - Legacy source: `src/lib/ble.svelte.ts:360-367`, `src/lib/queue.ts:23-24`
  - Done when: a card command sent mid-upload lands after the start frame
  - Confidence: 🟡 (the interleaving is in code; its effect on the firmware is untested) [external review R19]

## Pending Gaps (🔴)
- **T-12 / BR-CE10:** which byte selects the output for a sequence on LEDBLE-02 / LEDCAR-02. No vendor frame is known.
- 🟡 **G5:** run a BLEDIM custom effect on the owner's headlight to confirm `p[14]=FF` plays the colour list.
- 🟡 Decide whether a newly saved effect should run right away (`onsaved` is unused today).
