# Internationalization (i18n), Implementation Tasks

> Reversa Writer · 2026-10-26 · unit `i18n` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Read with `requirements.md` and `design.md` in this folder.

## Prerequisites
- [ ] `persistence/` provides `store.locale` and `setLocale`
- [ ] No other dependency: this is the leaf unit every UI component imports
- [ ] There is no backend, no environment variables and no database

## Tasks

- [ ] T-01, Create the dictionaries `en` (source) and `pt-BR` with the same 83 keys in the 11 namespaces, and `dicts`, `DEFAULT_LOCALE = 'en'`
  - Legacy source: `src/lib/dict.ts:1-208`
  - Done when: `src/lib/dict.test.ts:5` ("every English key has a Portuguese translation") and `:37` pass
  - Confidence: 🟢

- [ ] T-02, Implement `resolveLocale(tag)`: exact match, then base-language match, then `en`
  - Legacy source: `src/lib/dict.ts:210-217`
  - Done when: `dict.test.ts:12` passes
  - Confidence: 🟢

- [ ] T-03, Implement `translate(locale, key, params)`: dictionary → `en` → key fallback, and `{word}` interpolation that leaves unknown placeholders visible
  - Legacy source: `src/lib/dict.ts:219-230`
  - Done when: `dict.test.ts:22,30` pass
  - Confidence: 🟢

- [ ] T-04, Implement `detect()`, `locale()` (explicit choice, else detection), `t()`, `chooseLocale()`, `locales` and `localeName`
  - Legacy source: `src/lib/i18n.svelte.ts:1-35`
  - Done when: the three detection or choice scenarios in `requirements.md` pass
  - Confidence: 🟢

- [ ] T-05, Add the header language select: options from `locales` labelled `localeName`; `onchange` → `chooseLocale`
  - Legacy source: `src/App.svelte:33-40`
  - Done when: switching the language re-renders every label without a reload, and the choice survives a reload
  - Confidence: 🟢

- [ ] T-06, Keep `document.documentElement.lang` equal to `locale()`, reactively from `App` (fixes F17); set a neutral default in `index.html` (`en`)
  - Legacy source: `index.html:2` (hardcoded `pt-BR`)
  - Done when: the "Document language follows the locale" scenario passes
  - Confidence: 🟢

- [ ] T-07, Move the hardcoded strings into the dictionaries (fixes F6):
  - the BLE errors and hints and `'(sem nome)'` (`ble.svelte.ts`);
  - the `parseHex` error (`hex.ts`);
  - the whole Debug tab (`Debug.svelte`);
  - the `Modo N` labels (`ffe0.ts`, through a `effects.modeN: 'Mode {n}'` key that the UI interpolates, keeping the drivers free of i18n).
  - Legacy source: see the F6 inventory in `design.md`
  - Done when: rendering in `en` shows no Portuguese anywhere; T-01's test still passes with the new keys
  - Confidence: 🟢
  - Note: the drivers and `ble.svelte.ts` should return codes or keys, with translation at the UI edge. That keeps the protocol layer pure.

- [ ] T-08, Add a "follow the browser" option to the select that calls `chooseLocale(undefined)`
  - Legacy source: `src/lib/i18n.svelte.ts:26-28` (capability exists, no UI)
  - Done when: after choosing it, `store.locale` is absent and the detection applies
  - Confidence: 🟡 (UX decision)

- [ ] T-09, Repair an unshipped stored locale on read: `locale() = store.locale ? resolveLocale(store.locale) : detect()`
  - Legacy source: `src/lib/i18n.svelte.ts:21`
  - Done when: a stored `fr` behaves as `en` and the select shows English
  - Confidence: 🟡

## Test Tasks

- [ ] TT-01, Port the 5 tests of `src/lib/dict.test.ts`
- [ ] TT-02, Happy path: `detect()` with mocked `navigator.languages` for `["fr-FR","pt-PT","en-US"]` → `pt-BR`; `["en-US","pt-BR"]` → `en`; `[]` → `en`
- [ ] TT-03, Main error case: an unknown key → the key; a missing param → the placeholder kept; a stored unshipped locale → English text
- [ ] TT-04, No-Portuguese check: render every component in `en` and assert that no string from the F6 inventory appears

## Data Migration Tasks
- [ ] TM-01, None. `store.locale` keeps its shape.

## Suggested Order
1. T-01 → T-02 → T-03 (pure, with TT-01 and TT-03).
2. T-04, T-05 (reactive layer and UI; TT-02).
3. T-06, T-07 (fix F17 and F6; TT-04). T-07 touches files from other units, so coordinate with `device-connection/`, `debug/` and `effects/`.
4. T-08, T-09 optional.

## Pending Gaps (🔴)
- None blocking.
- 🟡 Plurals (`{n} devices` → "1 devices"): decide whether to add a minimal `one`/`other` form.
