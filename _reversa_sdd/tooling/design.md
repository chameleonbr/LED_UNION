# Tooling, Technical Design

> Reversa Writer · 2026-10-26 · unit `tooling` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `tools/gen-effects.py:1-58`, `tools/difftest/extract_java_frames.py:1-200`, `tools/difftest/emit_ts_frames.ts:1-91`, `tools/difftest/compare.py:1-105`, `tools/difftest/bledim_scene.js`, `package.json:6-14`, `.github/workflows/deploy.yml:1-56`

## Interface

### Commands 🟢

| Command | Input | Output | Exit |
|---|---|---|---|
| `npm run gen:effects` → `python3 tools/gen-effects.py` | `docs/protocol/*.tsv` (cwd = repo root) | **overwrites** `src/lib/protocol/effects.ts`; prints the table sizes | 0 / Python error |
| `python3 tools/difftest/extract_java_frames.py <targets.json>` | JSON `[{path, app}]`; a path may be a file or a directory (walked for `*.java`) | JSON rows on stdout | 1 without args; 0 otherwise |
| `node tools/difftest/emit_ts_frames.ts` | the drivers | JSON rows on stdout (259 today) | 0 |
| `python3 tools/difftest/compare.py <java.json> <ts.json>` | both JSONs | report on stdout (Portuguese) | 1 when any TS frame is unmatched |
| `npm run difftest` | `$DIFFTEST_TARGETS` | `/tmp/java_frames.json`, `/tmp/ts_frames.json`, report | exit of `compare.py` |
| `frida -H 127.0.0.1:27042 -p <pid> -l bledim_scene.js` | the BLEDIM app running on a device | scene buffers via `send()` | — |
| `npm test` | `src/**/*.test.ts` | `node:test` report | non-zero on failure |
| `npm run check` | `svelte-check` (app tsconfig) + `tsc -p tsconfig.node.json` | diagnostics | non-zero on error |

### Data shapes 🟢

| Row | Fields |
|---|---|
| Java template | `{ app, file, method /* "name" or "name[buffer]" */, args, len, head, tail, template: (int\|null)[], raw: string[] }` (`null` = variable position) |
| TS frame | `{ driver, name, command, frame: int[] }` |

TSV columns: `id \t name` (MELK: `id \t group \t name`).

## Main Flow

### Effect table generation 🟢 (`gen-effects.py`)
1. For each of the 9 tables (`melk`, `elk`, `ledble`, `ledcar`, `leddmx`, `ledlike`, `ledpho`, `rgbOrders`, `rgbOrdersDmx02`), read the TSV and split on tabs; skip rows with fewer columns; `id = int`.
2. Write the header comment, `import type { Effect } from './types'`, then `export const <name>: Effect[] = [ … ]` with one `json.dumps(row, ensure_ascii=False)` per line, then a default export of every table.
3. Print `{table: count}`.

TSV → table map:

| TSV | Table |
|---|---|
| `melk_effects.tsv` | `melk` |
| `elk_effects.tsv` | `elk` |
| `ble_mode.tsv` | `ledble` |
| `car_mode.tsv` | `ledcar` |
| `dmx_model.tsv` | `leddmx` |
| `like_mode.tsv` | `ledlike` |
| `pho_mode.tsv` | `ledpho` |
| `rgb_order.tsv` | `rgbOrders` |
| `rgb_order_dmx02.tsv` | `rgbOrdersDmx02` |

`dmx03_model.tsv`, `select_mode.tsv` and `timer_model_dmx.tsv` exist in `docs/protocol/` but are **not consumed**. 🟢

Verified 2026-10-26: running the generator into a scratch path reproduces the committed `effects.ts` byte for byte. 🟢

### Java frame extraction 🟢 (`extract_java_frames.py`)
1. For each target, read the file (UTF-8, errors replaced), or walk a directory for `*.java`.
2. `methods_of(src)` finds each method header (`METHOD_RE`) and yields `(name, args, body)` by brace matching.
3. Three frame shapes per body:
   - **Array literal** (`ARRAY_RE`): `new byte[]{…}`, `new int[]{…}`, or a bare `byte[] x = {…}`. Split on top-level commas (`split_args`) and resolve each token. Kept when it has ≥ 5 elements and constant first and last bytes.
   - **Indexed assignment** (`ASSIGN_RE`, `buffer_frames`): `buf[i] = v;`, with buffer aliases (`ALIAS_RE`) followed up to 10 levels; indexes over 200 ignored; a value that calls `calAcc|checksum|crc|sum(` makes that slot variable. Kept when the size is ≥ 5 and the first byte is constant.
4. `resolve(token)`:
   - a known constant from the `CONSTANTS` map, which holds the decompiler's artefacts (e.g. `WebSocketProtocol.PAYLOAD_SHORT` = 126 = `7E`);
   - `(byte) -n` → `n & FF`;
   - a decimal or `0x` literal → `& FF`;
   - anything else → `null` (variable).

### TS frame emission 🟢 (`emit_ts_frames.ts`)
For each of 16 names, use the driver from `drivers.find(matches)`, then add:
- `power_on`, `power_off`, `rgb(11,22,33)`, `brightness(50)`, `speed(50)`, `white(50)`, `cct(30,70)`;
- `effect(first table entry)`;
- `sound_mic`, `sound_music` (mode 3), `sound_on`, `sound_sens(50)`;
- `custom_i` (`[112233, 000000]`, jump) and `custom_fade_i` (`[112233]`, fade);
- `rgb_ch0/1/2` when `hasChannels`;
- `on_connect` at `2026-09-02 14:37`.

Names: `LEDBLE-00-9B67, LEDSTAGE-1, LEDDMX-00-1, LEDDMX-02-1, LEDCAR-00-1, LEDCAR-01-1, LEDCAR-02-1, LEDSMART-1, LEDSUN-1, LEDLIKE-1, LEDPHO-1, MELK-OC-1, MELK-OBCT-1, ELK-BLEDOM, XSL-Light, BLEDIM`.

### Comparison 🟢 (`compare.py`)
1. Index the Java rows by `head`.
2. For each TS frame:
   - candidates = same head, and the tail is constant-equal or null;
   - the first `compatible` candidate (same length, constants equal) is an **exact** match;
   - otherwise the first `prefix_compatible` candidate (Java shorter, ≥ 4, matching the prefix) is a **prefix** match;
   - otherwise the frame is **unmatched**.
3. Uncovered = Java rows not used and not compatible with any TS frame, grouped by `(app, head, tail, first constant in bytes 1..3)`.
4. Print the counts, the prefix list, the unmatched list and the uncovered groups; return 1 when there are unmatched frames.

### BLEDIM runtime capture 🟢 (`bledim_scene.js`)
Frida hooks the BLEDIM app's `ScenePara`, builds scenes with its own constructor and mutations (default, `effect0_chase` with `bSubFunction=0x80`, `effect4_chase` with `0x84`, `static_color` with `0xFF`), and prints the 72-byte buffers. It closes the gap left by the memcpy'd payload, which the static extractor can only prefix-match.

### CI / CD 🟢 (`deploy.yml`)
- Trigger: a push to `main`, or manual. Permissions: `contents: read`, `pages: write`, `id-token: write`. Concurrency group `pages`, which cancels in-progress runs.
- `build`: checkout → Node 24 + npm cache → `npm ci` → `npm test` → `npm run check` → `npm run build` → upload `dist`.
- `deploy` (needs `build`): `actions/deploy-pages@v4` to the `github-pages` environment.

## Alternative Flows
- **No `$DIFFTEST_TARGETS`** 🟢: the extractor prints its usage and exits 1, but the `&&` chain stops there. 🟡 The redirect has already created an empty `/tmp/java_frames.json`.
- **Missing target path** 🟢: reported on stderr; the other targets continue.
- **A driver claims no name** 🟢: the emitter logs `no driver claims <name>` and skips it.
- **TSV with a short row** 🟢: skipped silently. A typo in a TSV can therefore drop an effect without an error.

## Dependencies
- Python 3, standard library only (`json`, `os`, `re`, `sys`, `collections`).
- Node 24 (types stripped natively, so `.ts` runs directly).
- Frida (only for `bledim_scene.js`); the decompiled sources (jadx output) for the difftest, kept outside the repo (BR-52).
- GitHub Actions and Pages.

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| Generate the effect tables from the vendor TSVs | `gen-effects.py:2` | 🟢 |
| Differential testing against the decompiled Java, not only hand-written tests | `compare.py:1-12`, `adrs/006` | 🟢 |
| Grouping by header avoids matching across families | `compare.py:38-41` | 🟢 |
| Prefix matching for memcpy'd payloads, completed by the Frida capture | `compare.py:27-31`, `bledim_scene.js:1-8` | 🟢 |
| Deploy gated on tests and the type check; HTTPS Pages | `deploy.yml:31-36`, `adrs/012` | 🟢 |
| Vendor binaries and decompiled trees kept out of git | `.gitignore`, BR-52 | 🟢 |

## Internal State
None persisted. The difftest writes `/tmp/java_frames.json` and `/tmp/ts_frames.json`. 🟢

## Observability
Console output only: generator sizes, the difftest report (Portuguese), CI logs. 🟢

## Risks and Gaps
- 🔴 **F8:** the difftest cannot run from the repo or in CI (it needs local decompiled trees), so the "all frames match" claim is not reproducible by anyone else. Owner approved committing `java_frames.json` (2026-10-26, `tasks.md` T-13); open until that lands.
- 🟢 **F7:** the emitter misses `variant` (LEDCAR-01 RGB), `LEDBLE-03`, and `ch` on every builder except rgb; anomalies C1 and C3 in `protocol-drivers/contracts.md` would not be caught.
- 🟢 **G1:** the README says 221/221; the emitter produces 259 today.
- 🟢 **F13:** `tools/difftest/__pycache__/*.pyc` is tracked in git.
- 🟢 There is no CI check that `effects.ts` matches the TSVs (it is in sync today, verified by a scratch regeneration).
- 🟢 `gen-effects.py` writes straight into `src/`, with no dry-run or output flag.
- 🟢 Three TSVs are unused (`dmx03_model`, `select_mode`, `timer_model_dmx`).
- 🟡 The Frida capture labels a static colour with `bSubFunction = 0xFF`, while the driver's `staticScene` leaves byte 14 at `00` (asserted in `frames.test.ts:282`). Static colours work on the owner's BLEDIM (G5), so `00` is accepted; whether `FF` is what the vendor sends is unconfirmed.
- 🟡 The difftest report and the README are in Portuguese (README has an English twin); the difftest output is not translated.
