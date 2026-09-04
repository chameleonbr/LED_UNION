import { test } from 'node:test'
import assert from 'node:assert/strict'
import { en, ptBR, dicts, resolveLocale, translate, DEFAULT_LOCALE } from './dict.ts'

test('every English key has a Portuguese translation', () => {
  const missing = Object.keys(en).filter((k) => !(k in ptBR))
  assert.deepEqual(missing, [], 'keys missing from pt-BR')
  const extra = Object.keys(ptBR).filter((k) => !(k in en))
  assert.deepEqual(extra, [], 'pt-BR keys with no English source')
})

test('browser tags map onto the locales we actually ship', () => {
  assert.equal(resolveLocale('pt-BR'), 'pt-BR')
  // Portuguese from Portugal or a bare `pt` still gets Portuguese rather than English.
  assert.equal(resolveLocale('pt'), 'pt-BR')
  assert.equal(resolveLocale('pt-PT'), 'pt-BR')
  assert.equal(resolveLocale('en-GB'), 'en')
  assert.equal(resolveLocale('de'), DEFAULT_LOCALE)
  assert.equal(resolveLocale(undefined), DEFAULT_LOCALE)
})

test('a missing translation falls back to English, never to a raw key', () => {
  assert.equal(translate('de', 'nav.devices'), en['nav.devices'])
  assert.equal(translate('pt-BR', 'nav.devices'), ptBR['nav.devices'])
  // A key that exists nowhere is the only case that returns the key, and that is a
  // developer bug rather than something a user should ever see.
  assert.equal(translate('en', 'no.such.key'), 'no.such.key')
})

test('placeholders are filled, and an unknown one is left visible', () => {
  assert.equal(translate('en', 'app.selected', { n: 3 }), '3 selected')
  assert.equal(translate('pt-BR', 'devices.output', { n: 2 }), 'Saída 2')
  assert.equal(translate('en', 'app.selected'), '{n} selected')
  assert.equal(translate('en', 'app.selected', { other: 1 }), '{n} selected')
})

test('both dictionaries are reachable by name', () => {
  assert.deepEqual(Object.keys(dicts).sort(), ['en', 'pt-BR'])
})
