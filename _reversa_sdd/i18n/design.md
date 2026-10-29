# Internationalization (i18n), Technical Design

> Reversa Writer · 2026-10-26 · unit `i18n` · 🟢 CONFIRMED · 🟡 INFERRED · 🔴 GAP
> Sources: `src/lib/dict.ts:1-231`, `src/lib/i18n.svelte.ts:1-35`, `src/lib/dict.test.ts`, `src/App.svelte:4,33-40`, `src/lib/store.svelte.ts` (`setLocale`), `index.html:2`, `adrs/013`

## Interface

### Pure module 🟢 (`dict.ts`, no Svelte)

| Symbol | Signature | Notes |
|---|---|---|
| `Dict` | `Record<string, string>` | flat dotted keys |
| `en`, `ptBR` | `Dict` | 83 keys each |
| `dicts` | `{ en, 'pt-BR': ptBR }` | the set of shipped locales |
| `DEFAULT_LOCALE` | `'en'` | |
| `resolveLocale` | `(tag?: string) => string` | exact → base language → `en` |
| `translate` | `(locale, key, params?) => string` | `dicts[locale][key] ?? en[key] ?? key`, then interpolation |

### Reactive module 🟢 (`i18n.svelte.ts`)

| Symbol | Signature | Notes |
|---|---|---|
| `detect` (private) | `() => string` | walks `navigator.languages ?? [navigator.language]` |
| `locale` | `() => string` | `store.locale ?? detect()` |
| `t` | `(key, params?) => string` | `translate(locale(), key, params)` |
| `chooseLocale` | `(next?: string) => void` | `setLocale(next)` (persisted; `undefined` deletes) |
| `locales` | `string[]` | `Object.keys(dicts)` |
| `localeName` | `Record<string,string>` | `{ en: 'English', 'pt-BR': 'Português' }`: each name is written in its own language |

### Key namespaces 🟢 (per dictionary)

| Prefix | Keys | Used by |
|---|---|---|
| `app.` | 2 | App shell (online counter) |
| `nav.` | 4 | the tabs: Devices, Effects, Scenes, Debug |
| `devices.` | 14 | `Devices.svelte` |
| `effects.` | 20 | `Effects.svelte`, `DeviceCard.svelte` |
| `custom.` | 7 | `CustomEffectEditor.svelte`, `DeviceCard.svelte` |
| `scenes.` | 3 | `Scenes.svelte` |
| `sound.` | 8 | DeviceCard sound panel |
| `strip.` | 7 | DeviceCard strip panel |
| `bledim.` | 2 | DeviceCard channel mode |
| `color.` | 11 | the 8 seeded colours + new / restore / … in `ColorSelect.svelte` |
| `common.` | 5 | save, cancel, remove, unsupported, unsupportedHint |

## Main Flow

### Resolving the locale 🟢
1. `locale()`: if `store.locale` is set, return it (explicit choice).
2. Else `detect()`:
   1. With no `navigator` (SSR or tests), return `en`.
   2. For each `tag` in `navigator.languages ?? [navigator.language]`:
      - `hit = resolveLocale(tag)`;
      - if `hit !== 'en'` (a non-default locale matched) **or** `tag.startsWith('en')`, return `hit`.
   3. Return `en`.

`resolveLocale(tag)` 🟢:
1. `!tag` → `en`.
2. `dicts[tag]` exists → `tag` (exact, case-sensitive).
3. `base = tag.split('-')[0].toLowerCase()`; the first shipped locale whose base matches → that locale.
4. Else `en`.

### Translating 🟢
1. `text = dicts[locale]?.[key] ?? en[key] ?? key`.
2. Without `params`, return `text`.
3. Otherwise `text.replace(/\{(\w+)\}/g, (m, name) => name in params ? String(params[name]) : m)`.

### Choosing 🟢
1. The header `<select value={locale()}>` lists `locales` with `localeName[l] ?? l`.
2. `onchange` → `chooseLocale(value)` → `setLocale(value)`: `store.locale = value`, `save()`.
3. Every `t()` call reads `store.locale` through `locale()`, so Svelte re-renders every label that depends on it. There is no reload and no event bus.

## Alternative Flows
- **Stored locale no longer shipped** 🟢 (e.g. `fr`): `locale()` returns `fr`; `translate` finds no dict and falls back to English per key; the select shows no matching option. There is no repair step.
- **Unknown key** 🟢: returns the key itself.
- **Missing param** 🟢: the `{name}` placeholder stays in the text.
- **Case-different tag** 🟡 (`pt-br`): no exact match, but the base match gives `pt-BR`. Correct.
- **Hardcoded strings (F6)** 🟢: bypass all of this and show Portuguese in every locale.

### Strings outside the dictionary (F6 inventory) 🟢

| Where | Strings |
|---|---|
| `src/lib/ble.svelte.ts` | `'(sem nome)'`; `explain()` hints (3); `resolveDriver` errors (2); `connect` "not paired, use Add"; `writeRaw` "Não conectado"; `sendFrames`, `inspect`, `sendRaw` "not paired"; `sendRaw` "characteristic not found" |
| `src/lib/hex.ts` | the `parseHex` error |
| `src/lib/ui/Debug.svelte` | every label, note and button (🟡 estimate: 20–30 strings; a grep finds 19 buttons/notes plus labels) |
| `src/lib/protocol/ffe0.ts` | `Modo N` effect labels (smart, sun) |
| `src/lib/protocol/bledim.ts` | `M N` labels (language-neutral; fine) |
| `src/lib/ui/DeviceCard.svelte` | `CHANNEL_MODES` labels `1CH · DIM` … (technical, language-neutral; fine) |
| `index.html` | `<html lang="pt-BR">`, plus any static title or meta text |

## Dependencies
- `persistence/`: `store.locale`, `setLocale`.
- Browser: `navigator.languages`, `navigator.language`.
- Consumers: every UI component (`t`), `App.svelte` (the selector).

## Identified Design Decisions

| Decision | Code evidence | Confidence |
|---|---|---|
| No i18n library | `dict.ts:1-6`, `adrs/013` | 🟢 |
| English is the source and the fallback | `dict.ts:2-3,224` | 🟢 |
| Pure `dict.ts` separated from the reactive `i18n.svelte.ts`, so the translator is unit-testable | file split, `dict.test.ts` | 🟢 |
| `locale` exported as a function, not `$derived` | `i18n.svelte.ts:19-21` | 🟢 |
| Locale names written in their own language | `i18n.svelte.ts:32-35` | 🟢 |
| An unknown placeholder is left visible on purpose | `dict.test.ts:30` | 🟢 |

## Internal State
- Persisted: `store.locale?: string`. 🟢
- No module state; detection runs on each `locale()` call, which is cheap. 🟢

## Observability
None. 🟢

## Risks and Gaps
- 🟢 **F6:** roughly 35–45 strings bypass the dictionary (🟡 count; inventory above).
- 🟢 **F17 (new):** `<html lang>` is fixed to `pt-BR`; `App` should set `document.documentElement.lang = locale()` reactively.
- 🟢 There is no UI path back to "follow the browser" (`chooseLocale(undefined)`).
- 🟡 A stored, unshipped locale is never repaired; `resolveLocale(store.locale)` on read would fix it.
- 🟡 Plurals are not handled (`{n} devices` reads "1 devices").
