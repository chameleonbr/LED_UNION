# Internationalization (i18n)

> Reversa Writer · 2026-10-26 · unit `i18n` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/dict.ts`, `src/lib/i18n.svelte.ts`, `src/lib/dict.test.ts`, `src/App.svelte` (locale select), `index.html`, `adrs/013`

## Overview
Translates every **dictionary-backed** user-facing string into English (source and default) or Brazilian Portuguese, without a library. Not covered today 🟢: generated effect names (`Modo N`, `ffe0.ts:171`), the support hints (`ble.svelte.ts:142-155`) and the whole Debug tab are hardcoded Portuguese (F6). [external review R08] It picks the language from an explicit user choice, else from the browser's language list, and falls back to English and then to the key, so a raw identifier never shows unless the key is missing everywhere. 🟢

## Responsibilities
- Hold the dictionaries (`en`, `pt-BR`), about 83 keys each 🟢
- Resolve a browser tag to a shipped locale 🟢
- Detect the locale from `navigator.languages` 🟢
- Persist an explicit choice; follow the browser when there is none 🟢
- Translate keys with `{name}` interpolation and fallbacks 🟢
- Offer a language selector in the header 🟢

## Business Rules
- **BR-40** An explicit language choice beats the browser. An English browser does not imply English: the detection walks `navigator.languages` and **any** later non-default match (e.g. `pt`) wins over a non-English, non-matching tag; an `en*` tag stops the walk with English. 🟢 (`i18n.svelte.ts:6-21`)
- **BR-41** A missing translation falls back to English, then to the key. 🟢 (`dict.ts:219-230`)
- **BR-I1** `resolveLocale(tag)`: an exact match first; otherwise a match on the base language (`pt`, `pt-PT` → `pt-BR`); otherwise `en`. Undefined → `en`. 🟢 (`dict.ts:210-217`)
- **BR-I2** Interpolation replaces `{word}` with `params[word]`; an unknown placeholder is **left visible** (so a missing param is noticed). 🟢 (`dict.ts:226-229`)
- **BR-I3** The explicit choice is stored in `store.locale`; `chooseLocale(undefined)` deletes it, so the app follows the browser again. 🟢 (`i18n.svelte.ts:26-28`, `store.svelte.ts` `setLocale`)
- **BR-I4** `locale()` is a function, not exported `$derived` (Svelte forbids exporting derived module state); reading `store` inside keeps every call site reactive. 🟢 (`i18n.svelte.ts:19-21`)
- **BR-I5** Every English key must have a Portuguese translation (enforced by test). 🟢 (`dict.test.ts:5`)
- **BR-I6** Seeded palette colours are translated through `color.<key>`; user colours are never translated. 🟢 (`ColorSelect.svelte:19-22`)
- **BR-I7 / F6** Some strings bypass the dictionary and are hardcoded in Portuguese: BLE error hints and errors (`explain`, `resolveDriver`, `connect`, `sendFrames`, `sendRaw`, `inspect`), `'(sem nome)'`, `parseHex` errors, the whole Debug tab, and `Modo N` effect labels. 🟢 defect
- **BR-I8** `index.html` declares `<html lang="pt-BR">` and nothing updates it, while the default locale is `en`. 🟢 defect

## Functional Requirements

| ID | Requirement | Priority | Acceptance criterion |
|----|-------------|----------|---------------------|
| RF-01 | `t(key, params?)` returns the text for the current locale with interpolation and fallbacks | Must | `dict.test.ts:22,30` |
| RF-02 | `resolveLocale` maps tags per BR-I1 | Must | `dict.test.ts:12` |
| RF-03 | `locale()` = `store.locale` or `detect()` | Must | With no choice and `navigator.languages = ['fr', 'pt-PT']`, `locale()` is `pt-BR` |
| RF-04 | The header select lists each shipped locale by its own name (`English`, `Português`) and calls `chooseLocale(value)` on change; the whole UI re-renders | Must | Switching to Português changes every dictionary-backed label without a reload (hardcoded strings stay, F6) [external review R08] |
| RF-05 | The choice persists across reloads | Must | — |
| RF-06 | A way to return to "follow the browser" (`chooseLocale(undefined)`) | Could | Not reachable from the UI today |
| RF-07 | Every user-visible string goes through `t()`, including errors, Debug and generated effect labels | Should | Fails today (F6) |
| RF-08 | The document language (`<html lang>`) follows the current locale | Should | Fails today (BR-I8) |
| RF-09 | `en` and `pt-BR` dictionaries have the same key set | Must | `dict.test.ts:5,37` |

## Non-Functional Requirements

| Type | Inferred requirement | Code evidence | Confidence |
|------|--------------------|---------------------|-----------|
| Footprint | No i18n library; two plain objects and a 10-line translator | `src/lib/dict.ts`, `adrs/013` | 🟢 |
| Accessibility | Screen readers rely on `<html lang>`; it is wrong for English users today | `index.html:2` | 🟢 |
| Robustness | A missing key or param never crashes; it shows the key or the placeholder | `src/lib/dict.ts:226-229` | 🟢 |

> Inferred from the code. Validate with the owner.

## Acceptance Criteria

```gherkin
Scenario: Browser list prefers Portuguese after a non-matching tag
  Given no explicit choice
  And navigator.languages is ["fr-FR", "pt-PT", "en-US"]
  When the app renders
  Then the locale is "pt-BR"

Scenario: English tag first wins
  Given no explicit choice
  And navigator.languages is ["en-US", "pt-BR"]
  When the app renders
  Then the locale is "en"

Scenario: Explicit choice beats the browser
  Given navigator.languages is ["pt-BR"]
  When the user picks "English"
  Then every dictionary-backed label is English
  And after a reload it is still English

Scenario: Missing translation
  Given a key present only in "en"
  When it is rendered in "pt-BR"
  Then the English text shows, not the key

Scenario: Unknown placeholder stays visible
  Given the text "{n} devices"
  When translated with no params
  Then the result is "{n} devices"

Scenario: Document language follows the locale
  Given the locale is "en"
  When the page renders
  Then <html lang> is "en"
  # Fails today (BR-I8)
```

## Priority (MoSCoW)

| Requirement | MoSCoW | Justification |
|-----------|--------|---------------|
| RF-01..05, RF-09 | Must | Every label in the UI depends on them |
| RF-07 full coverage, RF-08 html lang | Should | Correctness for English users; workaround is reading Portuguese |
| RF-06 follow-browser option | Could | Rare need |

> Priority inferred from call frequency and position in the dependency chain.

## Code Traceability

| File | Function / Class | Coverage |
|---------|-----------------|-----------|
| `src/lib/dict.ts` | `Dict`, `en`, `ptBR`, `dicts`, `DEFAULT_LOCALE`, `resolveLocale`, `translate` | 🟢 |
| `src/lib/i18n.svelte.ts` | `detect`, `locale`, `t`, `chooseLocale`, `locales`, `localeName` | 🟢 |
| `src/lib/store.svelte.ts` | `setLocale`, `store.locale` | 🟢 |
| `src/App.svelte` | locale `<select>` | 🟢 |
| `src/lib/dict.test.ts` | 5 tests | 🟢 |
| `index.html` | `<html lang="pt-BR">` | 🟢 |
