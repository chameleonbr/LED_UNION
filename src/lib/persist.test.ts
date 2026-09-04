import { test } from 'node:test'
import assert from 'node:assert/strict'
import { empty, migrate, seedColors } from './persist.ts'

test('a fresh install starts with a usable palette', () => {
  const s = migrate(null)
  assert.equal(s.devices.length, 0)
  assert.equal(s.colors.length, 8)
  assert.deepEqual(s.looks, {})
  assert.deepEqual(s.customEffects, [])
  // Seeded colours carry a key so the UI can translate their names.
  assert.ok(s.colors.every((c) => c.key))
})

test('an install from before looks and colours keeps its devices', () => {
  const old = {
    devices: [
      {
        id: 'abc',
        name: 'LEDBLE-00-9B67',
        label: 'Carro',
        driverId: 'ffe0',
        outputs: [
          { ch: 0, label: 'Todas' },
          { ch: 1, label: 'fita' },
          { ch: 2, label: 'maçaneta' },
        ],
        strip: { pixels: 120, order: 3 },
      },
    ],
    groups: [{ id: 'g1', name: 'carro', deviceIds: ['abc'] }],
  }
  const s = migrate(old)
  assert.equal(s.devices.length, 1)
  assert.equal(s.devices[0].label, 'Carro')
  // Channel 0 is dropped: it overlapped the real outputs and the global All card, and
  // showed up as a third, duplicate light in the list.
  assert.equal(s.devices[0].outputs?.length, 2)
  assert.deepEqual(s.devices[0].outputs?.map((o) => o.ch), [1, 2])
  assert.deepEqual(s.devices[0].outputs?.map((o) => o.label), ['fita', 'maçaneta'])
  assert.equal(s.devices[0].strip?.pixels, 120)
  assert.equal(s.groups.length, 1)
  // Fields that did not exist before are filled in rather than left undefined.
  assert.equal(s.colors.length, 8)
  assert.deepEqual(s.looks, {})
})

test('a device whose only output was channel 0 becomes a plain single device', () => {
  const s = migrate({
    devices: [{ id: 'a', name: 'LEDBLE-00', driverId: 'ffe0', outputs: [{ ch: 0, label: 'Todas' }] }],
  })
  assert.equal(s.devices[0].outputs, undefined)
})

test('scenes from the old single-colour shape are dropped, not misapplied', () => {
  // They recorded one colour with no notion of which device it was for, so there is no
  // faithful mapping onto per-device entries. Keeping them would apply someone's old
  // "night" scene to whatever happens to be selected.
  const s = migrate({
    scenes: [
      { id: '1', name: 'noite', color: '#ff0000', brightness: 50 },
      { id: '2', name: 'nova', entries: [{ key: 'abc#1', look: { colorHex: '#00ff00' } }] },
    ],
  })
  assert.equal(s.scenes.length, 1)
  assert.equal(s.scenes[0].name, 'nova')
  assert.equal(s.scenes[0].entries[0].key, 'abc#1')
})

test('an emptied palette is re-seeded rather than left blank', () => {
  assert.equal(migrate({ colors: [] }).colors.length, 8)
  assert.equal(migrate({ colors: undefined }).colors.length, 8)
  // A palette the user actually customised is left alone.
  const mine = [{ id: 'x', name: 'meu', hex: '#123456' }]
  assert.deepEqual(migrate({ colors: mine }).colors, mine)
})

test('garbage in storage does not take the app down', () => {
  for (const junk of [null, undefined, 42, 'nope', [], { looks: 'no' }]) {
    const s = migrate(junk)
    assert.ok(Array.isArray(s.devices))
    assert.ok(Array.isArray(s.scenes))
    assert.equal(typeof s.looks, 'object')
    assert.ok(s.colors.length > 0)
  }
})

test('seedColors returns a fresh array each call', () => {
  const a = seedColors()
  a[0].hex = '#000000'
  assert.notEqual(seedColors()[0].hex, '#000000')
  assert.equal(empty().colors.length, 8)
})
