import { DEFAULT_LOCALE, dicts, resolveLocale, translate } from './dict.ts'
import { setLocale, store } from './store.svelte.ts'

export { dicts, DEFAULT_LOCALE } from './dict.ts'

function detect(): string {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  for (const tag of navigator.languages ?? [navigator.language]) {
    const hit = resolveLocale(tag)
    if (hit !== DEFAULT_LOCALE || tag.startsWith('en')) return hit
  }
  return DEFAULT_LOCALE
}

/**
 * An explicit choice wins over the browser. A browser set to English does not mean the
 * person wants English — plenty of people run an English system and read Portuguese.
 */
// A function rather than $derived: Svelte does not allow exporting derived state from
// a module. Reading `store` inside keeps it reactive at every call site all the same.
export const locale = () => store.locale ?? detect()

export const t = (key: string, params?: Record<string, string | number>) =>
  translate(locale(), key, params)

export function chooseLocale(next: string | undefined) {
  setLocale(next)
}

export const locales = Object.keys(dicts)

export const localeName: Record<string, string> = {
  en: 'English',
  'pt-BR': 'Português',
}
