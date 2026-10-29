# Spec Impact Matrix — LED UNION

> Reversa Architect · 2026-10-24
> How to read it: **rows = component changed**, **columns = component affected**.
> ● direct (imports or calls it; a change breaks or alters behaviour) · ○ indirect (through a type or data contract) · – none

## Component × component

| Changed ↓ / Affected → | types | fff0 | ffe0 | bledim | effects.ts | registry | queue | endpoint | ble | persist | store | i18n | Devices | Effects | DeviceCard | Scenes | Debug | difftest | tests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **types.ts** (Driver, Caps…) | – | ● | ● | ● | ● | ● | – | – | ● | ○ | ○ | – | ○ | ○ | ● | ● | – | ● | ● |
| **fff0.ts** | – | – | – | – | – | ● | – | – | ○ | – | – | – | – | ○ | ○ | ○ | – | ● | ● |
| **ffe0.ts** | – | – | – | – | – | ● | – | – | ○ | – | – | – | ○ | ○ | ● | ○ | – | ● | ● |
| **bledim.ts** | – | – | – | – | – | ● | – | – | ○ | – | – | – | – | ○ | ● | ○ | – | ● | ● |
| **effects.ts** (generated) | – | ● | ● | – | – | – | – | – | – | ○ | ○ | – | – | – | ● | ○ | – | ● | ● |
| **docs/protocol/*.tsv** | – | ○ | ○ | – | ● | – | – | – | – | – | – | – | – | – | ○ | – | – | – | ○ |
| **registry** (index.ts) | – | – | – | – | – | – | – | – | ● | – | – | – | – | – | – | – | – | ● | ● |
| **queue.ts** | – | – | – | – | – | – | – | – | ● | – | – | – | – | – | – | – | – | – | ● |
| **endpoint.ts** (key format) | – | – | – | – | – | – | – | – | ● | ● | ● | – | ● | ● | ○ | ○ | – | – | – |
| **ble.svelte.ts** | – | – | – | – | – | – | – | – | – | – | ● | – | ● | ● | ● | ● | ● | – | – |
| **persist.ts** (schema, migrate) | – | – | – | – | – | – | – | – | – | – | ● | – | ○ | ○ | ○ | ○ | – | – | ● |
| **store.svelte.ts** | – | – | – | – | – | – | – | – | ● | – | – | ● | ● | ● | ● | ● | – | – | – |
| **dict.ts / i18n** | – | – | – | – | – | – | – | – | – | – | – | – | ● | ● | ● | ● | – | – | ● |
| **DeviceCard.svelte** | – | – | – | – | – | – | – | – | – | – | – | – | – | ● | – | – | – | – | – |
| **Effects.svelte** | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | ○ | – | – | – |

Notes:
- 🟢 `ble.svelte.ts` → `store.svelte.ts` is a ● because `track`/`forget` call `rememberDevice`/`forgetDevice`. `store` → `ble` is a ● through `store.devices` (read by `restore` and `track`).
- 🟢 Changing the **endpoint key format** touches the most: storage (looks, labels, groups, scenes), migration, selection, coalescing keys and every view. Any change needs a `migrate()` step.
- 🟢 Changing **`Driver` method signatures** breaks every call site's `build` callbacks. The F1 class of bug lives exactly here: the parameters are optional, so a missing `variant` compiles.

## Open findings × affected components (for the Writer)

| Finding | Primary fix location | Also touches | Test to add |
|---|---|---|---|
| F1 / TD-01 Scenes drop the variant | `Scenes.svelte` `applyLook` | (optional) make `variant` mandatory in the `applyTo` build type | Scene apply on LEDCAR-01 RGB emits the `7E` envelope + car_mode id |
| F2 / TD-02 / G6 Group semantics | `store.forgetDevice`, `persist.Group`, `Devices.svelte` | `migrate` (rename or normalise keys), i18n `devices.count` | Forgetting a multi-output device clears `id#i` from groups |
| G6 intent: groups that control all | `Devices.svelte` / `Effects.svelte` (group target) | `ble.applyTo` (already accepts a key list) | Applying a colour to a group writes to every member |
| F3 / TD-04 BLEDIM state by name | `bledim.ts` `states` key | `Driver` signature (needs a device id), `ble.applyTo` build args, every driver | Two BLEDIMs do not share brightness |
| F4 Impure `supportsCustom` probe | `DeviceCard.svelte` | `Driver` (add a `supportsCustom(name, variant)` capability) | BLEDIM colour survives a re-render |
| F5 / TD-06 Look gaps | `DeviceCard.svelte` | `persist.Look` (+white, cct, sound), `Scenes.applyLook`, `migrate` | Scene round-trips white and CCT |
| F6 / TD-07 i18n | `ble.svelte.ts`, `hex.ts`, `Debug.svelte`, `ffe0.effects` | `dict.ts` | Errors are translated in `en` |
| TD-03 Silent failures | `ble.applyTo` | DeviceCard / Effects error display | Failed write surfaces an error |
| TD-13 / G2 LEDBLE multi-output | `ffe0.outputsFor` | `Devices`/`Effects` (already generic), `effects()`, difftest names | Owner's model gives ≥2 outputs with distinct channel bytes |
| TD-14 Orphan custom effect in scenes | `store.removeCustomEffect` | — | Deleting an effect prunes or flags scene entries |
| G1 / TD-11 Stale README | `README.md`, `tools/difftest/README.md` | — | — |

## Feature (spec unit) × component
Units follow `[specs] granularity = feature`.

| Feature unit | protocol | ble/queue | store/persist | i18n | UI |
|---|---|---|---|---|---|
| device-connection | registry, `onConnect` | ● connect, resolve, restore, forget | devices | errors | Devices |
| device-control | ● all builders | ● applyTo, queue | looks | ● | DeviceCard, Effects (Everything) |
| effects | ● `effects()`, `effect()`, effects.ts | applyTo | looks.effect | ● | DeviceCard |
| custom-effects | ● `customEffect()` | ● sendFrames | customEffects | ● | CustomEffectEditor, DeviceCard |
| scenes | builders | applyTo, sendFrames | ● scenes, looks | ● | Scenes, Effects |
| groups | – | applyTo (target) | ● groups | ● | Devices |
| persistence | Effect type | – | ● persist, store | – | – |
| i18n | `Modo N` | errors | locale | ● | App |
| debug | candidates (hex) | ● inspect, sendRaw | – | (bypassed) | Debug |
| protocol-drivers | ● | – | – | – | – |
| tooling | ● (validated) | – | – | – | – |

## Reviewer notes (2026-10-26, checked against the import graph of `src/`)
- 🟢 **ble → store is not ●.** `store.svelte.ts` imports only `persist.ts`; it is `ble.svelte.ts` that imports the store (`rememberDevice`, `forgetDevice`). A change to `ble` does not affect `store`. The cell should be –; the note above describes `store → ble`, which stays ●.
- 🟢 **types → Scenes is ○, not ●.** `Scenes.svelte` imports only `ble`, `i18n` and `store`; it reaches driver types through the `applyTo` build callback and `Look`.
- 🟡 **endpoint → persist / store are data-contract ○.** Neither file imports `endpoint.ts`; they store keys in its format. The impact is real (the F16 migration bug lives here), but it is a contract, not an import.
- 🟢 Missing columns: `ColorSelect.svelte` and `CustomEffectEditor.svelte` depend on `store` and `i18n` (●), and `DeviceCard` imports `ColorSelect`.
- 🟢 The *Feature × component* table has no rows for `debug` (ble ● `inspect`/`sendRaw`, hex, Debug.svelte) or `tooling` (effects.ts generated, difftest ● every driver, CI).

### Findings found after the Architect (F14–F24)
| Finding | Primary fix location | Also touches | Test to add |
|---|---|---|---|
| F14 scene save throws | `store.addScene` | — | Save from a used card succeeds |
| F15 selection has no command consumer | `Effects.svelte` / `Devices.svelte` target | `ble.apply`, `targets` | A group colour reaches every member |
| F16 outputs migration key collision | `persist.migrate` | labels | ch 1/2 legacy looks land on `#0`/`#1` |
| F17 fixed `<html lang>` | `i18n.chooseLocale` | `index.html` | `lang` follows the locale |
| F18 LEDCAR-02 selector only on effect | `ffe0.ts` dmxs | hardware check (G2) | — until a vendor frame is known |
| F19 sensitivity on smart/pho | `DeviceCard` (hide) or `ffe0.soundSensitivity` | — | No `7E` frame to LEDSMART |
| F20 superseded `pushLatest` result | `queue.ts` | — | Both waiters see a rejection |
| F21 whole-load loss on a bad field | `persist.migrate`, `store.load` | — | `scenes: {}` keeps devices |
| F22 scalar scene `busy` | `Scenes.svelte` | — | A runs, B starts, A stays disabled |
| F23 BLEDIM colour resets brightness | `bledim.rgb` or callers | `Scenes.applyLook`, `DeviceCard` | brightness → colour keeps 40 % |
| F24 BLEDIM white keeps old colour | `bledim.white` | — | rgb → white → brightness emits no red |
