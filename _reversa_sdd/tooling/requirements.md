# Tooling

> Reversa Writer · 2026-10-26 · unit `tooling` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `tools/gen-effects.py`, `tools/difftest/{extract_java_frames.py, emit_ts_frames.ts, compare.py, bledim_scene.js, README.md}`, `package.json` (scripts), `.github/workflows/deploy.yml`, `docs/protocol/*.tsv`, `adrs/006`, `adrs/012`

## Overview
The developer tooling that keeps the drivers honest and the site shipping:
1. **`gen-effects.py`** generates `effects.ts` from the vendor TSV tables.
2. **difftest** compares every frame the TypeScript drivers emit against the byte literals extracted from the decompiled vendor apps.
3. **`bledim_scene.js`** is a Frida script that runs the BLEDIM app's own scene builder for payloads the static extractor cannot see.
4. **CI** runs the tests, the type check and the build, then deploys to GitHub Pages over HTTPS.

None of this ships to users. 🟢

## Responsibilities
- Generate the effect and colour-order tables from `docs/protocol/*.tsv` 🟢
- Extract frame templates from decompiled Java (literal arrays, bare initialisers, indexed assignments) 🟢
- Emit every TS frame for representative names and probe values 🟢
- Classify TS frames as exact, prefix-only or unmatched, and list app literals not covered 🟢
- Capture runtime-built BLEDIM scene buffers (Frida) 🟢
- Gate deploys on tests and type checks; publish over HTTPS 🟢

## Business Rules
- **BR-50** 🟢 "The frame builders are the whole product; a red test must not reach the domain": CI runs `npm test`, then `npm run check`, then `npm run build`, before deploying. (`deploy.yml:33-36`)
- **BR-51** 🟢 Hand-written tests only assert what the author understood, so the transcription is also checked mechanically against the decompiled apps (difftest).
- **BR-52** 🟢 Vendor APKs and decompiled sources are not redistributed. Only the facts extracted from them live in `docs/protocol/`. Consequence: difftest needs local inputs (`$DIFFTEST_TARGETS`) and cannot run in CI (F8).
- **BR-T1** 🟢 `effects.ts` is **generated**; it is never edited by hand. The header says so.
- **BR-T2** 🟢 TSV rows with fewer columns than expected are skipped silently; ids are parsed as integers; MELK rows carry a group column.
- **BR-T3** 🟢 Compatibility: same length, and every position the Java template pins to a constant must equal the TS byte. Variable positions are free. Prefix-compatible: the Java template is shorter (≥ 4 bytes) and matches the TS prefix (payloads memcpy'd in loops). Candidates are grouped by header byte, and by trailer byte when the trailer is constant.
- **BR-T4** 🟢 `compare.py` exits **1** when any TS frame is unmatched, otherwise 0. Uncovered literals are reported but do not fail the run.
- **BR-T5** 🟢 The extractor resolves jadx signed-byte artefacts to unsigned and follows buffer aliases (`byte[] a = b;`); checksum buffers and templates without a constant header are skipped.
- **BR-T6** 🟢 The emitter's probe values are `R=11 G=22 B=33`, percent 50, cct 30/70, sound mode 3, rgb on channels 0/1/2 (only for drivers with `hasChannels`), and handshakes at 2026-09-02 14:37. It covers 16 representative names.
- **BR-T7** 🟢 Deploy concurrency: one Pages deploy at a time, and newer runs cancel older ones ("a half-published service worker is worse than a delay").
- **BR-T8** 🟡 **F7:** the emitter never passes `variant` and has no `LEDBLE-03` name, so the LEDCAR-01 RGB envelope and the LEDBLE-03 effect shift are never diffed.
- **BR-T9** 🟢 **G1:** the README says "221 of 221 frames match", while the emitter produces **259** frames today (owner, G1). That the 259 match cannot be re-verified without the decompiled trees (F8).

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | `npm run gen:effects` regenerates `src/lib/protocol/effects.ts` from 9 TSVs (melk, elk, ble, car, dmx, like, pho, rgb_order, rgb_order_dmx02) and prints the table sizes | Must | Regenerating on a clean checkout produces no diff |
| RF-02 | `extract_java_frames.py <targets.json>` prints JSON rows `{app, file, method, args, len, head, tail, template, raw}` for every frame literal in the given files or directories; missing paths are reported on stderr | Must | — |
| RF-03 | `emit_ts_frames.ts` prints JSON rows `{driver, name, command, frame}` for every builder × representative name | Must | 259 rows today (G1) |
| RF-04 | `compare.py java.json ts.json` prints the counts, the prefix-only matches, the unmatched TS frames, and the uncovered literals grouped by app, envelope and opcode; exit code per BR-T4 | Must | An injected wrong byte in a driver makes it exit 1 |
| RF-05 | `npm run difftest` chains the three, with inputs from `$DIFFTEST_TARGETS` | Should | Fails clearly without targets (usage message) |
| RF-06 | `bledim_scene.js`, run with Frida against the BLEDIM app, prints the scene buffers built by the app's own code | Could | — |
| RF-07 | CI on push to `main`: `npm ci` → `npm test` → `npm run check` → `npm run build` → upload `dist` → deploy Pages | Must | A failing test blocks deploy |
| RF-08 | The emitter covers every output selector: `variant` for LEDCAR-01, `LEDBLE-03`, and ch on every builder that takes one | Should | Fails today (F7) |
| RF-09 | CI checks that `effects.ts` is in sync with the TSVs (regenerate and `git diff --exit-code`) | Should | Not present today |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Reproducibility | difftest runs only on a machine that holds decompiled sources; it writes to `/tmp` | `package.json` `difftest` script | 🟢 (F8) |
| Portability | Python tools use the standard library only | `tools/gen-effects.py:3`, `compare.py:14-16` | 🟢 |
| Security | Deploy uses OIDC (`id-token: write`) and least-privilege `pages: write`, `contents: read` | `.github/workflows/deploy.yml:8-12` | 🟢 |
| Availability | HTTPS hosting is a hard requirement of Web Bluetooth | `deploy.yml:6-7`, `adrs/012` | 🟢 |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: Effect tables regenerate identically
  Given a clean checkout
  When the developer runs "npm run gen:effects"
  Then src/lib/protocol/effects.ts is unchanged
  And the printed sizes include melk 241 and leddmx 211

Scenario: A transcription error is caught
  Given a driver that emits "7E FF 05 03 R G B FE EF" instead of the vendor trailer
  When the difftest runs against the decompiled app
  Then compare.py lists the frame under "SEM CORRESPONDÊNCIA"
  And exits with code 1

Scenario: Missing inputs
  Given $DIFFTEST_TARGETS is unset
  When "npm run difftest" runs
  Then the extractor prints its usage
  # 🟢 the script chains with `&&` (package.json:13): the extractor exits 1 and the emitter and compare do not run; the redirect may still create or truncate /tmp/java_frames.json [external review R04]

Scenario: Deploy gate
  Given a commit on main where npm test fails
  When CI runs
  Then nothing is deployed to GitHub Pages
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-01 generator, RF-07 CI gate | Must | Every release depends on them (BR-50) |
| RF-02..04 difftest core | Must | Fidelity guarantee (BR-51) |
| RF-05 npm chain, RF-08 coverage, RF-09 drift check | Should | Workflow and coverage improvements |
| RF-06 Frida capture | Could | One-off, BLEDIM only |

> Priority inferred from the owner's engineering policy (BR-50, BR-51) and the dependency chain.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `tools/gen-effects.py` | `tsv`, `main` | 🟢 |
| `tools/difftest/extract_java_frames.py` | `resolve`, `split_args`, `methods_of`, `buffer_frames`, `extract`, `main` | 🟢 |
| `tools/difftest/emit_ts_frames.ts` | `NAMES`, `framesFor` | 🟢 |
| `tools/difftest/compare.py` | `compatible`, `prefix_compatible`, `main` | 🟢 |
| `tools/difftest/bledim_scene.js` | `hex`, `dump` (Frida) | 🟢 |
| `package.json` | `test`, `check`, `gen:effects`, `difftest` | 🟢 |
| `.github/workflows/deploy.yml` | `build`, `deploy` jobs | 🟢 |
