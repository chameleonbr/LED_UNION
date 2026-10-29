# Independent source cross-review

Reviewed 2026-10-26. Paths below are relative to the repository; specification paths are relative to `_reversa_sdd/`. Evidence refers to the actual source, not the reverse-engineered descriptions. No generators, builds, commits or source edits were performed. Small Node probes ran in memory. Hardware behavior was not tested.

## Counts

| Primary problem type | Count |
|---|---:|
| Internal inconsistency | 4 |
| Cross-unit contradiction | 4 |
| Critical gap | 3 |
| Fragile claim | 8 |
| **Total distinct findings** | **19** |

Each finding has one primary type; related existing defect reports are not counted again. Explicitly labeled future requirements are not treated as contradictions merely because they differ from current code.

## Findings

### R01 — Concurrent connects contradict the acceptance criterion

- **Unit / file:** device-connection; `device-connection/requirements.md`, RF-06; `device-connection/design.md`, Alternative Flows.
- **Exact excerpts:** “Two quick `connect` calls produce one GATT connect”; “there is no guard on `state==='connecting'`, so two concurrent `connect(id)` calls run two GATT connects.”
- **Type:** Internal inconsistency. **Severity:** High.
- **Evidence:** `src/lib/ble.svelte.ts:194-204` checks only `online && l.char`, then starts `connectGatt`; it neither retains nor shares an in-flight promise. Multiple offline endpoint writes in `applyTo` can initiate this race (`src/lib/ble.svelte.ts:318-324`).
- **Suggested fix:** Describe the current online-only no-op accurately. Mark concurrent deduplication as intended behavior and tie RF-06 to the existing T-12 repair rather than claiming it already passes.

### R02 — Successful scene snapshots are green despite the documented blocking failure

- **Unit / file:** scenes; `scenes/requirements.md`, Data integrity NFR and RF-02; `scenes/design.md`, Saving.
- **Exact excerpts:** “Scenes are deep snapshots; invalid legacy scenes are dropped, not guessed” (green); “when `store.looks[key]` exists ... `structuredClone(proxy)` throws `DataCloneError`”.
- **Type:** Internal inconsistency. **Severity:** High.
- **Evidence:** `src/lib/store.svelte.ts:39,135,188-196` creates deep reactive state, returns the stored look, and clones it before pushing the scene. `src/lib/ui/Effects.svelte:42-47` has no catch. An in-memory probe using the installed Svelte runtime's `proxy` reproduced `DataCloneError`; cloning an ordinary empty object succeeded.
- **Suggested fix:** Split current behavior from intended snapshot behavior. Mark saving existing looks as broken by F14, qualify the green NFR, and retain the snapshot repair task. A stored empty object is also a proxy: the distinction is an absent look versus a stored look, not whether it has fields.

### R03 — Cancel-to-restore has an undocumented precondition in the requirements

- **Unit / file:** device-control; `device-control/requirements.md`, BR-CT7/RF-18; `device-control/design.md`, Alternative Flows.
- **Exact excerpts:** “Cancel re-sends the colour that was lit before the picker opened”; “Cancel with no previous colour ... the lights keep the last dragged colour.”
- **Type:** Internal inconsistency. **Severity:** Medium.
- **Evidence:** `src/lib/ui/ColorSelect.svelte:31-41` immediately sends a starting color and restores only a truthy `before`. The Everything picker receives no initial value (`src/lib/ui/Effects.svelte:113`), and no single color can represent differently colored endpoints. A prior effect is not restored by resending RGB either (`src/lib/ui/DeviceCard.svelte:66-70`).
- **Suggested fix:** Specify restoration of a known previous color only, with separate behavior for absent values, effects and heterogeneous broadcasts. If full cancellation is intended, require endpoint look snapshots and mode-aware replay.

### R04 — Missing difftest inputs do not continue the pipeline

- **Unit / file:** tooling; `tooling/requirements.md`, Missing inputs scenario.
- **Exact excerpt:** “the shell pipeline still runs the emitter and compare on an empty file”.
- **Type:** Internal inconsistency. **Severity:** Medium.
- **Evidence:** `package.json:13` uses `&&`, not unconditional sequencing or pipes. `tools/difftest/extract_java_frames.py:159-163,182-183` exits 1 without targets. Therefore subsequent commands do not run, although the extractor's output redirection can create/truncate its temporary output file.
- **Suggested fix:** Remove this inference and specify immediate failure after the usage message; distinguish it from malformed or missing target paths.

### R05 — Global selection definition contradicts the groups unit

- **Unit / file:** groups / global domain; `domain.md`, Domain Vocabulary; `groups/requirements.md`, BR-G9.
- **Exact excerpts:** “The endpoint keys that the next command targets”; “No command consumes the selection”.
- **Type:** Cross-unit contradiction. **Severity:** High.
- **Evidence:** `src/lib/ble.svelte.ts:300-303,335-346` defines `targets` and `apply`, but neither has a caller in `src/`. DeviceCard commands explicitly use `[dkey]` (`src/lib/ui/DeviceCard.svelte:61-79`); Everything uses `allKeys` (`src/lib/ui/Effects.svelte:53-75`). Scene checkboxes use separate local `picked` state (`src/lib/ui/Effects.svelte:36-45`).
- **Suggested fix:** Define current selection as Devices-tab selection/group CRUD state. Label targeting the next command as intended behavior, and explicitly distinguish scene selection. F15 is confirmed, but “no consumer” must mean no command consumer: selection does have UI and persistence consumers.

### R06 — Pure-driver ADR contradicts the documented BLEDIM implementation

- **Unit / file:** protocol-drivers / architecture; `adrs/002-pure-driver-frame-builders.md`; `architecture.md`, TD-04; `protocol-drivers/requirements.md`, Overview/BR-PD9.
- **Exact excerpts:** “`Driver` has pure functions that return `Uint8Array`”; “BLEDIM keeps module-global `states` (keyed by name) and `seq`”.
- **Type:** Cross-unit contradiction. **Severity:** High.
- **Evidence:** `src/lib/protocol/bledim.ts:75-83,214-217,229-249,259-264` retains and mutates state. `src/lib/ui/DeviceCard.svelte:38-40` calls the mutating custom-effect builder during support detection, which deletes the remembered static color. This is behavior, not just a theoretical purity distinction.
- **Suggested fix:** Amend the ADR and green overview to distinguish the intended architecture from the current stateful exception. Require side-effect-free capability detection and per-device state ownership in the target design.

### R07 — A scene snapshots a custom-effect reference, not its contents

- **Unit / file:** scenes / custom-effects / persistence; `scenes/requirements.md`, BR-32; `custom-effects/requirements.md`, RF-03.
- **Exact excerpts:** “A scene is a snapshot: later changes to the lights do not change it”; “Editing an effect and saving changes it in place (same id)”.
- **Type:** Cross-unit contradiction. **Severity:** High.
- **Evidence:** `src/lib/persist.ts:36-45,62-66` stores only `customEffectId` inside a scene look. `src/lib/ui/Scenes.svelte:33-37` fetches the current effect by that ID. `src/lib/store.svelte.ts:170-181` edits/deletes the live effect without changing scene snapshots. Thus an existing/migrated scene's replay changes after an edit, or silently loses its upload after deletion, regardless of a future F14 fix.
- **Suggested fix:** Define whether custom effects are live references or immutable snapshots. Qualify BR-32 if references are intentional; otherwise embed/version the sequence, fade and speed. Document edit behavior, not only the already noted deletion case.

### R08 — “Every label” translation contradicts the Debug and protocol units

- **Unit / file:** i18n / debug / effects; `i18n/requirements.md`, Overview/RF-04 and explicit-choice scenario; `debug/requirements.md`, BR-D10.
- **Exact excerpts:** “Translates every user-facing string”; “Switching to Português changes every label without a reload”; “Every Debug string is hardcoded in Portuguese.”
- **Type:** Cross-unit contradiction. **Severity:** Medium.
- **Evidence:** `src/lib/protocol/ffe0.ts:171` generates `Modo N`; `src/lib/ble.svelte.ts:142-155` returns hardcoded Portuguese hints. `src/lib/ui/Debug.svelte` supplies its own literal Portuguese labels rather than dictionary calls. Locale selection in `src/App.svelte:37-44` cannot translate those literals.
- **Suggested fix:** Scope current translation guarantees to dictionary-backed text. Mark universal coverage as the intended F6 repair and qualify the acceptance criteria accordingly.

### R09 — Queue latency is not bounded by a single gap

- **Unit / file:** device-control; `device-control/requirements.md`, Performance NFR.
- **Exact excerpt:** “Slider latency bounded by one gap per device (5–50 ms), with no backlog: superseded values are dropped” (green).
- **Type:** Fragile claim. **Severity:** High.
- **Evidence:** `src/lib/queue.ts:23-24,31-47` appends work to the existing FIFO chain. Coalescing replaces only a pending operation of the same key; other streams, FIFO commands and slow writes remain ahead of it. `src/lib/ble.svelte.ts:279-284` can occupy a queue operation for several paced chunks. Reconnection adds further latency before enqueueing (`:324`).
- **Suggested fix:** Specify minimum pacing and per-key backlog reduction, with no fixed end-to-end latency bound. Qualify “last value always lands” on transport success and eventual queue progress.

### R10 — Superseding callers can receive success for failed writes

- **Unit / file:** device-control; `device-control/requirements.md`, BR-CT3.
- **Exact excerpt:** “A failed write does not break the queue chain; the caller still gets the rejection.”
- **Type:** Fragile claim. **Severity:** High.
- **Evidence:** `src/lib/queue.ts:32-34` returns `this.#tail` to a superseding caller, while `:49-52` replaces that tail with a rejection-swallowing promise. An in-memory probe submitted two same-key operations before execution and made the replacement throw: the original promise rejected; the superseding promise fulfilled.
- **Suggested fix:** Qualify the current promise contract. If every waiter should observe the replacement outcome, retain a separate per-slot result promise and specify what superseded callers await. Keep this distinct from `applyTo` swallowing results at a higher layer.

### R11 — F18 overclaims physical behavior

- **Unit / file:** device-control / user stories; `user-stories/connect-and-control.md:64`.
- **Exact excerpt:** “🟢 LEDCAR-02: only the effect carries the channel byte; colour and brightness reach both outputs (F18).”
- **Type:** Fragile claim. **Severity:** High.
- **Evidence:** `src/lib/protocol/ffe0.ts:40,182-183,206-208,227-228,247-248,269-270` confirms dmxs power/RGB/brightness/speed omit `ch`, while effect includes it. Source establishes identical command bytes for either selected output, not which physical outputs firmware changes.
- **Suggested fix:** Keep selector omission green; mark “both outputs” yellow pending model/firmware hardware evidence. Include power and speed in the limitation. Do not invent a selector byte without a vendor reference.

### R12 — Migration does not validate arbitrary invalid containers

- **Unit / file:** persistence; `persistence/requirements.md`, BR-P3.
- **Exact excerpt:** “Invalid `looks`, `labels` or `customEffects` become empty containers on load”.
- **Type:** Fragile claim. **Severity:** High.
- **Evidence:** `src/lib/persist.ts:120-122` accepts arrays as looks/labels because they are objects; customEffects validates only its outer array, not entries. `:127,143` assumes iterable devices and filterable scenes. For example `scenes: {}` throws and `src/lib/store.svelte.ts:29-36` discards the entire load, rather than repairing that field while retaining other data.
- **Suggested fix:** State the exact shallow checks and whole-load fallback. Specify object-record checks, element validation and recovery granularity separately as target behavior; do not claim comprehensive validation from these guards.

### R13 — Handshake-before-any-command is not a general guarantee

- **Unit / file:** protocol-drivers / device-connection; `protocol-drivers/contracts.md`, Transport contract.
- **Exact excerpt:** “Handshakes are written once per connection, before any command” (green).
- **Type:** Fragile claim. **Severity:** High.
- **Evidence:** `src/lib/ble.svelte.ts:209-212` sets online then enqueues one handshake frame at a time, awaiting each. An already-online connection returns immediately (`:196`), so a racing command could precede later handshake frames for a multi-frame driver. Current drivers return at most one handshake, but concurrent initial connects are not deduplicated. Debug explicitly bypasses `connect` at `:435-440`, permitting raw commands without a handshake on a newly established GATT link.
- **Suggested fix:** Scope the guarantee to the normal single-connect path and current single-frame handshakes; exempt Debug. Specify a shared connection-ready promise and atomic handshake batch if the stronger general contract is required.

### R14 — One probe cannot classify all other bytes as constants

- **Unit / file:** protocol-drivers; `protocol-drivers/contracts.md`, How to read the tables.
- **Exact excerpt:** “Where a probe appears in a frame, the position is that parameter's slot. Every other byte is a constant of the contract.”
- **Type:** Fragile claim. **Severity:** High.
- **Evidence:** `src/lib/protocol/ffe0.ts:225-230` transforms brightness through `scale32`, so input 42 produces both 0D and 2A; 0D is not constant. `src/lib/protocol/bledim.ts:128-145,229-244` encodes remembered state and transformed values. BLEDIM frames also contain sequence/checksum fields. The tables can be correct examples without proving field invariance.
- **Suggested fix:** Call these sample frames. Annotate computed/stateful/checksum/sequence fields and derive constants from builder expressions or differential probes, not occurrence of the literal probe value.

### R15 — “Every builder clamps” is broader than the source

- **Unit / file:** protocol-drivers; `protocol-drivers/requirements.md`, RF-10.
- **Exact excerpt:** “Every builder clamps its numeric inputs (`pct`, `byte`, `clamp` round)”.
- **Type:** Fragile claim. **Severity:** Medium.
- **Evidence:** `src/lib/protocol/types.ts:107-111` does not reject NaN or guarantee a finite clamped result: `pct(NaN)` and `byte(NaN)` return NaN. Typed-array construction subsequently converts that value to zero rather than reporting invalid input. The RF-10 acceptance example “`power`/`rgb` with 300 → 255” also incorrectly treats power's boolean parameter as a numeric color channel (`src/lib/protocol/ffe0.ts:179-180`; `src/lib/protocol/bledim.ts:201`). BLEDIM payloads do receive byte clamping centrally (`src/lib/protocol/bledim.ts:42`), including the selector helper.
- **Suggested fix:** Scope the green guarantee to finite numeric inputs and enumerate their domains. Specify invalid-number handling separately and correct the power example to a boolean case.

### R16 — Scene busy state does not reliably prevent duplicate runs

- **Unit / file:** scenes; `scenes/design.md`, Alternative Flows; `scenes/requirements.md`, BR-SC5.
- **Exact excerpts:** “Same scene clicked twice ... the button is disabled while busy”; “only that scene's Apply button is disabled; other scenes can run concurrently.”
- **Type:** Fragile claim. **Severity:** High.
- **Evidence:** `src/lib/ui/Scenes.svelte:6,53-62,81` uses one scalar busy ID. Start A, then B: busy becomes B and A's button is enabled while A still runs. When either finishes, it clears busy even if the other remains active. There is no in-flight guard inside `run`.
- **Suggested fix:** Document the actual concurrency failure. Specify either a set of running scene IDs with per-ID guards or a global replay lock, then align the task and acceptance criterion with that choice.

### R17 — BLEDIM replay order loses saved static brightness

- **Unit / file:** scenes / protocol-drivers; `scenes/requirements.md`, BR-33 and headline scenario.
- **Exact excerpts:** “power → brightness → speed → colour → (custom effect | effect)”; “every light goes to its saved state”.
- **Type:** Critical gap. **Severity:** High.
- **Evidence:** `src/lib/ui/Scenes.svelte:23-31` sends brightness before RGB. `src/lib/protocol/bledim.ts:155-165,214-217` makes RGB emit a static scene with brightness 255 and unscaled RGB, overriding the earlier brightness. An in-memory probe of `bledim.brightness(40, name)` followed by `bledim.rgb(200,100,0,name)` produced payload brightness 255 and red 200. This affects stored/imported scenes today and remains after F14 is fixed.
- **Suggested fix:** Add a family-aware static replay rule and regression example, such as RGB followed by brightness for BLEDIM, while preserving effect startup ordering. Specify the final emitted state, not merely a universal command order. This is separate from already documented F12 missing custom-effect speed.

### R18 — White does not invalidate BLEDIM's remembered RGB

- **Unit / file:** device-control / protocol-drivers; `device-control/requirements.md`, BR-16; `protocol-drivers/requirements.md`, BR-19.
- **Exact excerpts:** “the slider drives `white()`”; “BLEDIM brightness rescales the remembered static colour ... when one is set”.
- **Type:** Critical gap. **Severity:** High.
- **Evidence:** `src/lib/protocol/bledim.ts:214-222` remembers RGB but `white` neither clears nor replaces it. `:229-239` later brightness rescales that old RGB and emits W=0. Sequence: RGB red → real-white command → brightness emits red again. `src/lib/ui/DeviceCard.svelte:89-92` supplies no additional state transition.
- **Suggested fix:** Specify the RGB-to-real-white mode transition and what a following brightness command controls. Add a distinct driver-memory rule/test and represent white in the look if replay is intended. F5 already covers missing persisted white, but does not capture this immediate stale-memory behavior.

### R19 — Ordered upload is not an isolated upload transaction

- **Unit / file:** custom-effects / device-control; `custom-effects/requirements.md`, BR-15/RF-09.
- **Exact excerpts:** “Ordered multi-frame uploads are never coalesced: a missing colour corrupts the sequence”; “All per-colour frames and the start frame arrive in order”.
- **Type:** Critical gap. **Severity:** High.
- **Evidence:** `src/lib/ble.svelte.ts:365-367` queues one frame and awaits it before queueing the next. `src/lib/queue.ts:23-24` serializes individual operations only. A second upload or card command can enter the chain between those pushes; concurrent scene replay is also allowed (`src/lib/ui/Scenes.svelte:81`). Relative order within one upload is preserved, but an uninterrupted sequence is not guaranteed.
- **Suggested fix:** Specify whether interleaving is permitted by each protocol. If uploads must be uninterrupted, enqueue the whole sequence as one paced operation/batch or acquire a per-device transaction lock. Add a concurrent-upload/control case; do not infer physical corruption without device evidence.

## Sanity check of F14–F19

| Defect | Verdict | Source evidence / qualification |
|---|---|---|
| F14 | **Confirmed** | `src/lib/store.svelte.ts:39,135,193` passes a stored Svelte proxy to structuredClone. Installed-runtime in-memory probe threw DataCloneError. `src/lib/ui/Effects.svelte:42-47` has no catch. Missing looks return a plain object and can clone; even an existing empty stored look is proxied. No browser/BLE session was run. See R02. |
| F15 | **Confirmed for command consumption** | `apply` and `targets` are defined at `src/lib/ble.svelte.ts:300-303,335-346`, with no callers in src/. UI selection/group save/reselect still works; Effects has its own independent scene selection. See R05. |
| F16 | **Confirmed and reproduced** | `src/lib/persist.ts:130-134` reads/writes overlapping keys with a no-overwrite guard. Inputs ch 1/2 with #111111/#222222 produced #0=#111111, #1=#111111, and orphan #2=#222222. This is failure to migrate output 2, not an actual overwrite of its old #2 value. |
| F17 | **Confirmed** | `index.html:2` fixes lang to pt-BR. `src/App.svelte:28,37-44` mounts restore and handles locale selection without updating document language; `src/lib/i18n.svelte.ts:21-28` changes translation locale/store only. The HTML attribute is outside src/ but is the direct claim under review. |
| F18 | **Partially confirmed; green hardware conclusion unsupported** | LEDCAR-02 dmxs effect carries ch; power, RGB, brightness and speed do not. Identical frame bytes for output 1/2 are confirmed; “reach both outputs” needs hardware evidence. See R11. |
| F19 | **Cannot identify the reported claim** | No F19 definition/reference was found in repository Markdown (including `_reversa_sdd/`, docs and protocol documentation). Do not assign a guessed meaning or report it confirmed. Supply/restore its exact defect text and source location for verification. This missing identifier is recorded here, not counted as an invented behavioral finding. |

## Verification scope and limits

The review checked unit requirements, relevant design/task contracts, globals, source handlers, persistence transformations, driver builders and tooling scripts. Existing acknowledged F1–F13 issues were not re-listed solely to increase counts. Findings above identify contradictory wording, stronger-than-code guarantees or additional behavior needing an explicit contract. Generated byte examples show what the implementation emits; they cannot independently establish vendor fidelity or physical behavior. Decompiled input trees and BLE devices were not available for differential/hardware validation.

Read-only probes: installed Svelte proxy versus structuredClone; direct migrate call for overlapping channel/index keys; direct BLEDIM brightness/RGB frame inspection; same-key WriteQueue failure settlement. No fixture/test/source files were created for these probes.
