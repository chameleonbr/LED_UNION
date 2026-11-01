# Code → Spec Matrix

> Reversa Writer · 2026-10-26 · global · 🟢 covered by a unit spec · 🟡 partially covered or referenced only · n/a not covered (candidate for further analysis)
> Source list: `git ls-files` (78 tracked files). Unit folders are under `_reversa_sdd/<unit>/`.

## Application code — `src/`

| Legacy file | Unit(s) | Coverage |
|---|---|---|
| `src/lib/ble.svelte.ts` | `device-connection/` (lifecycle, resolve, connect, forget), `device-control/` (`applyTo`, `outputAt`, `writeRaw`, `writeOnce`), `custom-effects/` (`sendFrames`), `debug/` (`inspect`, `sendRaw`), `groups/` (`selection`, `apply`, `targets`) | 🟢 |
| `src/lib/queue.ts` | `device-control/` | 🟢 |
| `src/lib/queue.test.ts` | `device-control/` TT-01 | 🟢 |
| `src/lib/endpoint.ts` | `device-control/` | 🟢 |
| `src/lib/hex.ts` | `debug/` | 🟢 |
| `src/lib/store.svelte.ts` | `persistence/` (all helpers); used by `scenes/`, `groups/`, `custom-effects/`, `i18n/` | 🟢 |
| `src/lib/persist.ts` | `persistence/` | 🟢 |
| `src/lib/persist.test.ts` | `persistence/` TT-01 | 🟢 |
| `src/lib/dict.ts` | `i18n/` | 🟢 |
| `src/lib/dict.test.ts` | `i18n/` TT-01 | 🟢 |
| `src/lib/i18n.svelte.ts` | `i18n/` | 🟢 |
| `src/lib/protocol/index.ts` | `protocol-drivers/` | 🟢 |
| `src/lib/protocol/types.ts` | `protocol-drivers/` | 🟢 |
| `src/lib/protocol/fff0.ts` | `protocol-drivers/`, `effects/` | 🟢 |
| `src/lib/protocol/ffe0.ts` | `protocol-drivers/`, `effects/`, `custom-effects/`, `device-control/` (strip helpers) | 🟢 |
| `src/lib/protocol/bledim.ts` | `protocol-drivers/`, `effects/`, `custom-effects/`, `device-control/` (`switchChannelsFrame`) | 🟢 |
| `src/lib/protocol/effects.ts` | `effects/` (tables), `tooling/` (generated) | 🟢 |
| `src/lib/protocol/frames.test.ts` | `protocol-drivers/` TT-01, `effects/` TT-01, `custom-effects/` TT-01 | 🟢 |
| `src/lib/protocol/__fixtures__/bledim_scene.json` | `protocol-drivers/` (BLEDIM scene test fixture, `frames.test.ts:443`) | 🟢 |
| `src/lib/ui/Devices.svelte` | `device-connection/` (add, connect all, rows), `groups/` (selection, groups) | 🟢 |
| `src/lib/ui/Effects.svelte` | `device-control/` (endpoint list, Everything card), `scenes/` (save card), `custom-effects/` (editor host) | 🟢 |
| `src/lib/ui/DeviceCard.svelte` | `device-control/` (controls), `effects/` (select), `custom-effects/` (`supportsCustom`, `runCustom`) | 🟢 |
| `src/lib/ui/ColorSelect.svelte` | `device-control/` (picker), `persistence/` (palette) | 🟢 |
| `src/lib/ui/CustomEffectEditor.svelte` | `custom-effects/` | 🟢 |
| `src/lib/ui/Scenes.svelte` | `scenes/` | 🟢 |
| `src/lib/ui/Debug.svelte` | `debug/` | 🟢 |
| `src/App.svelte` | `device-connection/` (`restore` on mount, unsupported banner), `i18n/` (locale select) | 🟡 the tab shell, the online counter and the nav are not specified in a unit |
| `src/main.ts` | (app bootstrap: `mount(App)` + CSS) | 🟡 trivial, referenced only |
| `src/app.css` | — | n/a (visual styling) |

## Tooling and CI

| Legacy file | Unit(s) | Coverage |
|---|---|---|
| `tools/gen-effects.py` | `tooling/` | 🟢 |
| `tools/difftest/extract_java_frames.py` | `tooling/` | 🟢 |
| `tools/difftest/emit_ts_frames.ts` | `tooling/` | 🟢 |
| `tools/difftest/compare.py` | `tooling/` | 🟢 |
| `tools/difftest/bledim_scene.js` | `tooling/` | 🟢 |
| `tools/difftest/README.md`, `README.pt-BR.md` | `tooling/` (G1: the 221 vs 259 claim) | 🟢 |
| `tools/difftest/__pycache__/extract_java_frames.cpython-314.pyc` | `tooling/` T-12 (should be untracked, F13) | 🟡 |
| `package.json` | `tooling/` (scripts) | 🟢 |
| `.github/workflows/deploy.yml` | `tooling/` (CI/CD) | 🟢 |
| `.gitignore` | `tooling/` T-12 | 🟡 |

## Protocol reference data — `docs/protocol/`

| Legacy file | Unit(s) | Coverage |
|---|---|---|
| `melk_effects.tsv`, `elk_effects.tsv`, `ble_mode.tsv`, `car_mode.tsv`, `dmx_model.tsv`, `like_mode.tsv`, `pho_mode.tsv`, `rgb_order.tsv`, `rgb_order_dmx02.tsv` | `effects/`, `tooling/` (generator inputs) | 🟢 |
| `dmx03_model.tsv`, `select_mode.tsv`, `timer_model_dmx.tsv` | `tooling/` (listed as **unused** by the generator) | 🟡 candidates: LEDDMX-03 effects, mode select, timers are not implemented |
| `docs/protocol/README.md`, `bledim.md`, `elk-melk.md`, `ledble.md`, `variants.md` | `protocol-drivers/` (human reference cited by the drivers and Debug) | 🟡 referenced, not re-specified |
| `docs/protocol-pt-br/*.md` (5) | Portuguese twins of the above | 🟡 referenced |

## Build, configuration and assets

| Legacy file | Unit(s) | Coverage |
|---|---|---|
| `index.html` | `i18n/` (`<html lang>`, F17) | 🟢 |
| `vite.config.ts` | — (PWA manifest, base `/LED_UNION/`, dev server on `.ts.net`) | 🟡 referenced in `adrs/001`, `adrs/012` and `permissions.md`; **no unit spec for the PWA, the build or the offline behaviour** |
| `README.md`, `README.pt-BR.md` | `tooling/` T-12 (G1 claim) | 🟡 |
| `svelte.config.js` | — | n/a (framework config) |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | — | n/a (compiler config; used by `npm run check`) |
| `package-lock.json` | — | n/a (lockfile) |
| `.vscode/extensions.json` | — | n/a (editor) |
| `LICENSE` | — | n/a |
| `public/icon.svg`, `public/apple-touch-icon.png`, `public/pwa-192.png`, `public/pwa-512.png`, `public/pwa-512-maskable.png` | — | n/a (PWA icons) |

## Coverage summary

| Group | Files | 🟢 | 🟡 | n/a |
|---|---|---|---|---|
| `src/` | 29 | 26 | 2 | 1 |
| `tools/` + CI + `package.json` + `.gitignore` | 11 | 9 | 2 | 0 |
| `docs/protocol*` | 22 | 9 | 13 | 0 |
| build, config, assets, root docs | 16 | 1 | 3 | 12 |
| **Total** | **78** | **45** | **20** | **13** |

- **Mapped to a unit (🟢 + 🟡): 65 of 78 files = 83%.**
- **Behaviour-bearing code (`src/` 29 + `tools/` 8, minus `app.css` = 36 files): 36 of 36 = 100% mapped (🟢 or 🟡); 33 of 36 = 92% 🟢.** The three 🟡 are `App.svelte`, `main.ts` and the tracked `.pyc`.

## Candidates for further analysis (n/a and 🟡 gaps)
1. **PWA and build** (`vite.config.ts`, `public/*`): auto-update service worker, manifest, base path, offline behaviour. No unit specifies them; a small `pwa-shell/` unit could cover them, together with the `App.svelte` tab shell.
2. **Unused protocol tables** (`dmx03_model.tsv`, `select_mode.tsv`, `timer_model_dmx.tsv`): features of the vendor apps (LEDDMX-03 effect table, mode select, timers) that LED Union does not implement. Decide whether they are out of scope.
3. **`App.svelte` shell:** tabs (Devices, Effects, Scenes, Debug), the online counter (`app.online`), and the unsupported banner layout.

## Re-extraction 2026-11-01 (`374da11..56af9f9`)

| Legacy file | Unit | Coverage |
|---|---|---|
| `src/lib/protocol/ipixel.ts`, `ipixel.test.ts` | `protocol-drivers/` (RF-13..15) | 🟢 |
| `src/lib/protocol/ipixel-content.ts`, `.test.ts` | `protocol-drivers/` (RF-16), `panel-content/` | 🟢 |
| `src/lib/protocol/types.ts` (`PanelInfo`, `DeviceReport`, `onNotify`, `showSlot`, `chunkSize`) | `protocol-drivers/` | 🟢 |
| `src/lib/ble.svelte.ts` (listen, upload, stealth gate, heardAdvert) | `device-connection/` (RF-15..18), `panel-content/` | 🟢 |
| `src/lib/stealth.ts` | `device-control/` (RF-20, 21) | 🟢 |
| `src/lib/look.ts` | `scenes/` (RF-10, 11) | 🟢 |
| `src/lib/trace.ts`, `trace.test.ts` | `debug/` (RF-11, 12) | 🟢 |
| `src/lib/persist.ts`, `store.svelte.ts`, `persist.test.ts` | `persistence/` (RF-15..18) | 🟢 |
| `src/lib/panel/*` | `panel-content/` | 🟢 |
| `src/lib/ui/Panel.svelte`, `PanelEditor.svelte` | `panel-content/` | 🟢 |
| `src/lib/ui/DeviceCard.svelte` (iPixel controls), `Debug.svelte` (trace, msbFirst), `Scenes.svelte`, `App.svelte` (Panel tab, stealth) | `device-control/`, `debug/`, `scenes/`, n/a (shell) | 🟢 / n/a |
| `public/share-target.js`, `vite.config.ts` (share_target, importScripts) | `panel-content/` (RF-13) | 🟢 (🔴 untested on device) |
| `docs/protocol/ipixel.md`, `coolled.md` | reference only | n/a |
