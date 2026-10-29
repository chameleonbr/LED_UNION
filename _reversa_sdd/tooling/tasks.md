# Tooling, Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `tooling` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md` and `design.md` in this folder.

## Prerequisites
- [ ] `docs/protocol/*.tsv` present (the source of the effect tables)
- [ ] `protocol-drivers/` built (the emitter imports `drivers`)
- [ ] Node 24 (native type stripping); Python 3 for the scripts. Per the owner's convention, manage the Python tools with `uv` (`pyproject.toml` + `uv.lock`, `uv run …`); they use only the standard library today.
- [ ] For the difftest only: local decompiled vendor sources (jadx output), never committed (BR-52)
- [ ] GitHub repository with Pages enabled (custom domain, HTTPS)

## Tasks

- [ ] T-01, Effect-table generator: read the 9 TSVs (map in `design.md`), skip short rows, write `effects.ts` with the "generated" header and a default export. Add an `--out <path>` option (default `src/lib/protocol/effects.ts`), so it can run without overwriting the source.
  - Legacy source: `tools/gen-effects.py:1-58`
  - Done when: the output is byte-identical to the committed `effects.ts` (verified true today via a scratch run); sizes melk 241, elk 29, ledble 23, ledcar 23, leddmx 211, ledlike 8, ledpho 16, rgbOrders 12, rgbOrdersDmx02 6
  - Confidence: 🟢

- [ ] T-02, Make the generator fail loudly on a malformed TSV row (wrong column count or non-integer id) instead of skipping it
  - Legacy source: `tools/gen-effects.py:9-16`
  - Done when: a TSV with a broken row exits non-zero and names the file and line
  - Confidence: 🟡 (behaviour change)

- [ ] T-03, Java frame extractor: `METHOD_RE` method discovery with brace matching; array literals (`ARRAY_RE`, `split_args`); indexed buffers (`ASSIGN_RE`, alias following, checksum slots); `resolve` with the `CONSTANTS` map and signed→unsigned conversion; targets JSON input, walking directories
  - Legacy source: `tools/difftest/extract_java_frames.py:1-200`
  - Done when: on the owner's decompiled trees, the row count matches the legacy extractor's output
  - Confidence: 🟢 (🔴 to verify: needs the decompiled trees, F8)

- [ ] T-04, TS frame emitter: the 16 names, the probes and the command list as in `design.md`, as JSON rows
  - Legacy source: `tools/difftest/emit_ts_frames.ts:1-91`
  - Done when: it emits 259 rows on the current drivers
  - Confidence: 🟢

- [ ] T-05, Extend the emitter coverage (fixes F7):
  - `LEDCAR-01` with `variant: 'ble'` and `'dmx'` for every builder;
  - `LEDBLE-03-1`;
  - `ch` 0/1/2 on every builder that takes `ch` (power, brightness, speed, effect, soundMode), not only rgb;
  - `LEDBLE-02-1` as a name.
  - Legacy source: `tools/difftest/emit_ts_frames.ts:11-28,72-75`
  - Done when: the frames for anomalies C1 (LEDCAR-02 channels) and C3 (`smart`/`pho` sensitivity) from `protocol-drivers/contracts.md` appear in the output, so the difftest can judge them against the Java
  - Confidence: 🟢

- [ ] T-06, Comparator: header grouping, the tail filter, exact then prefix matching, the unmatched list, uncovered literals grouped by app, envelope and opcode, and exit 1 on unmatched
  - Legacy source: `tools/difftest/compare.py:1-105`
  - Done when: injecting a one-byte error into a driver makes it exit 1 and lists that frame
  - Confidence: 🟢
  - Note: translate the report to English (or make it bilingual) to match the default locale of the project docs.

- [ ] T-07, npm wiring: `test`, `check`, `gen:effects`, `difftest`. Write the difftest intermediates to a temp dir from `mktemp` instead of a fixed `/tmp` path, and fail early with a clear message when `$DIFFTEST_TARGETS` is unset.
  - Legacy source: `package.json:6-14`
  - Done when: `npm run difftest` without targets prints one clear error and exits non-zero without creating files
  - Confidence: 🟢

- [ ] T-08, Keep the Frida BLEDIM scene capture script as a documented one-off tool
  - Legacy source: `tools/difftest/bledim_scene.js`
  - Done when: the README documents how to run it and what to compare (byte 14 for a static colour: `00` vs `FF`, see `design.md`)
  - Confidence: 🟢

- [ ] T-09, CI pipeline: on push to `main` and on manual dispatch, `npm ci` → `npm test` → `npm run check` → `npm run build` → Pages upload and deploy; least-privilege permissions; one concurrent deploy
  - Legacy source: `.github/workflows/deploy.yml:1-56`
  - Done when: a red test blocks the deploy; a green run publishes `dist` over HTTPS
  - Confidence: 🟢

- [ ] T-10, Add a CI drift check: regenerate the effect tables to a temp path and `diff` against `src/lib/protocol/effects.ts`; fail on a difference
  - Legacy source: none (gap)
  - Done when: editing a TSV without regenerating fails CI
  - Confidence: 🟢

- [ ] T-11, Commit a contract snapshot: a script that emits the `protocol-drivers/contracts.md` probe frames as JSON, plus a checked-in golden file diffed in CI. This gives a reproducible byte-drift guard that does not need the decompiled trees (mitigates F8).
  - Legacy source: none; modelled on `emit_ts_frames.ts`
  - Done when: changing any byte in any builder fails CI, with the frame named
  - Confidence: 🟡 (new tool; owner agreement)

- [ ] T-12, Repository hygiene: untrack `tools/difftest/__pycache__/` and add `__pycache__/` to `.gitignore` (F13); update the "221 of 221" claims in `README.md` and `tools/difftest/README.md` to the current count, once re-verified (G1)
  - Legacy source: `.gitignore`, `README.md:183`, `tools/difftest/README.md:55`
  - Done when: `git ls-files | grep pycache` is empty; the READMEs state the verified count and date
  - Confidence: 🟢

## Test Tasks

- [ ] TT-01, Generator: the scratch output equals the committed `effects.ts`; a malformed TSV fails (after T-02)
- [ ] TT-02, Comparator unit tests: `compatible` and `prefix_compatible` truth tables (length mismatch, variable slots, prefix < 4)
- [ ] TT-03, Extractor unit tests on small Java snippets: a literal array, a bare initialiser, indexed assignment with an alias, a checksum slot, `(byte) -126` → `0x82`, a constants-map token
- [ ] TT-04, Main error case: `compare.py` with one injected wrong frame → exit 1 and that frame listed
- [ ] TT-05, CI dry run: a branch with a failing test shows the deploy job skipped

## Data Migration Tasks
- [ ] TM-01, None.

## Suggested Order
1. T-01, T-04, T-06 (core tools; TT-01, TT-02, TT-04), then T-03 (TT-03) when the decompiled trees are at hand.
2. T-09 (CI), then T-10 (drift check) and T-07 (npm hygiene).
3. T-05 (coverage), then re-run the difftest locally to settle C1, C3 and G1.
4. T-11, T-12, T-08, T-02.

## Owner Additions [Owner, 2026-10-26]
- [ ] T-13, Commit the extracted vendor frames (`java_frames.json`, never the decompiled sources, BR-52) as a fixture and run `compare.py` against it in CI.
  - Legacy source: `package.json:13`, `tools/difftest/compare.py`, `.github/workflows/deploy.yml`
  - Done when: CI fails if a driver frame drifts from the vendor frames; the 221 vs 259 count (G1) is settled by the fixture
  - Confidence: 🟢 owner approved

## Pending Gaps (🔴)
- 🟡 **F8:** resolved by T-13 once the owner commits `java_frames.json` [Owner, 2026-10-26]. Until then only the owner's machine can re-verify.
- 🟡 Whether the vendor app sets byte 14 = `FF` or `00` for BLEDIM static colours (run the Frida capture).
