import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropMotionTargets, empty, migrate, rekeyDevice, seedColors } from './persist.ts'

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
  // Outputs are derived from the model now, so the stored list goes — but the names
  // the owner typed are carried across, in order, onto the new endpoint keys.
  assert.equal((s.devices[0] as Record<string, unknown>).outputs, undefined)
  assert.equal(s.labels['abc#0'], 'Todas')
  assert.equal(s.labels['abc#1'], 'fita')
  assert.equal(s.labels['abc#2'], 'maçaneta')
  assert.equal(s.devices[0].strip?.pixels, 120)
  assert.equal(s.groups.length, 1)
  // Fields that did not exist before are filled in rather than left undefined.
  assert.equal(s.colors.length, 8)
  assert.deepEqual(s.looks, {})
})

test('a look attached to an old output follows its name to the new key', () => {
  const s = migrate({
    devices: [
      { id: 'a', name: 'LEDCAR-01', driverId: 'ffe0', outputs: [{ ch: 1, label: 'fita' }] },
    ],
    looks: { 'a#1': { colorHex: '#00ff00' } },
  })
  assert.equal((s.devices[0] as Record<string, unknown>).outputs, undefined)
  assert.equal(s.labels['a#0'], 'fita')
  assert.deepEqual(s.looks['a#0'], { colorHex: '#00ff00' })
})

test('old channel keys that overlap new index keys land on the right output', () => {
  // ch 1 and ch 2 become #0 and #1, and the old `a#1` is also the new key of output 2.
  const s = migrate({
    devices: [
      {
        id: 'a',
        name: 'LEDBLE-02',
        outputs: [
          { ch: 1, label: 'um' },
          { ch: 2, label: 'dois' },
        ],
      },
    ],
    looks: { 'a#1': { colorHex: '#111111' }, 'a#2': { colorHex: '#222222' } },
    groups: [{ id: 'g', name: 'g', deviceIds: ['a#2'] }],
    scenes: [{ id: 's', name: 's', entries: [{ key: 'a#1', look: {} }] }],
  })
  assert.deepEqual(s.looks, { 'a#0': { colorHex: '#111111' }, 'a#1': { colorHex: '#222222' } })
  assert.deepEqual(s.groups[0].deviceIds, ['a#1'])
  assert.equal(s.scenes[0].entries[0].key, 'a#0')
})

test('an output with no old look does not inherit its neighbour', () => {
  const s = migrate({
    devices: [{ id: 'a', name: 'LEDBLE-02', outputs: [{ ch: 1, label: 'um' }, { ch: 2, label: 'dois' }] }],
    looks: { 'a#1': { colorHex: '#111111' } },
  })
  assert.deepEqual(s.looks, { 'a#0': { colorHex: '#111111' } })
})

test('one malformed field is repaired without losing the others', () => {
  const s = migrate({
    devices: [{ id: 'a', name: 'BLEDIM' }, null, 'x'],
    scenes: {},
    looks: [],
    labels: ['x'],
    groups: 'nope',
    customEffects: [{ id: 'c', name: 'c', colors: ['#ffffff'], speed: 50, fade: false }, 7],
  })
  assert.deepEqual(s.devices.map((d) => d.id), ['a'])
  assert.deepEqual(s.scenes, [])
  assert.deepEqual(s.looks, {})
  assert.deepEqual(s.labels, {})
  assert.deepEqual(s.groups, [])
  assert.equal(s.customEffects.length, 1)
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

test('a device picked again under a new id keeps everything saved for it', () => {
  const s = migrate({
    devices: [{ id: 'old', name: 'LEDBLE-02', label: 'Carro', channelMode: 3 }],
    looks: { 'old#0': { colorHex: '#ff0000' }, other: { power: true } },
    labels: { 'old#1': 'maçaneta' },
    groups: [{ id: 'g', name: 'g', deviceIds: ['old#0', 'other'] }],
    scenes: [{ id: 's', name: 's', entries: [{ key: 'old#1', look: {} }] }],
  })
  // The chooser already re-saved the device under its new id, with no label.
  s.devices.push({ id: 'new', name: 'LEDBLE-02', driverId: 'ffe0' })
  rekeyDevice(s, 'old', 'new')
  assert.deepEqual(s.devices.map((d) => [d.id, d.label]), [['new', 'Carro']])
  assert.equal(s.devices[0].channelMode, 3)
  assert.deepEqual(s.looks, { 'new#0': { colorHex: '#ff0000' }, other: { power: true } })
  assert.deepEqual(s.labels, { 'new#1': 'maçaneta' })
  assert.deepEqual(s.groups[0].deviceIds, ['new#0', 'other'])
  assert.equal(s.scenes[0].entries[0].key, 'new#1')
})

test('panel info, panel looks and stealth survive a reload; old stores load without them', () => {
  const saved = {
    devices: [
      { id: 'p', name: 'LED_BLE_1', driverId: 'ipixel', panel: { type: 0x81, width: 32, height: 32, orientation: 2 } },
    ],
    looks: { p: { power: true, panel: { kind: 'slot', slot: 3 } } },
    stealth: { since: '2026-10-31T00:00:00Z', snapshot: { p: { power: true } } },
  }
  const s = migrate(JSON.parse(JSON.stringify(saved)))
  assert.deepEqual(s.devices[0].panel, saved.devices[0].panel)
  assert.deepEqual(s.looks.p.panel, { kind: 'slot', slot: 3 })
  assert.deepEqual(s.stealth, saved.stealth)

  const old = migrate({ devices: [{ id: 'a', name: 'BLEDIM', driverId: 'bledim' }] })
  assert.equal(old.devices[0].panel, undefined)
  assert.equal(old.stealth, undefined)

  assert.equal(migrate({ stealth: { snapshot: 'bad' } }).stealth, undefined)
})

test('rekeying a device moves its stealth snapshot too', () => {
  const s = empty()
  s.stealth = { since: 'x', snapshot: { old: { power: true }, 'old#1': { power: false } } }
  rekeyDevice(s, 'old', 'new')
  assert.deepEqual(Object.keys(s.stealth.snapshot).sort(), ['new', 'new#1'])
})

test('motion settings survive a reload; a malformed one is dropped', () => {
  const motion = {
    rules: [{ id: 'r', name: 'Brake', enabled: true, targets: ['a', 'a#1', 'b'], input: 'gLong', kind: 'trigger' }],
    places: [{ id: 'h', name: 'Home', lat: 1, lon: 2, radius: 100 }],
  }
  assert.deepEqual(migrate({ ...empty(), motion }).motion, motion)
  assert.equal(migrate({ ...empty(), motion: { rules: 'x' } }).motion, undefined)
  assert.equal(migrate(empty()).motion, undefined)
})

test('motion targets follow a rekey and drop with a forgotten device', () => {
  const s = migrate({
    ...empty(),
    motion: { rules: [{ id: 'r', name: 'n', enabled: true, targets: ['a', 'a#1', 'b'], input: 'speed', kind: 'map' }], places: [] },
  })
  rekeyDevice(s, 'a', 'z')
  assert.deepEqual(s.motion!.rules[0].targets, ['z', 'z#1', 'b'])
  dropMotionTargets(s, 'z')
  assert.deepEqual(s.motion!.rules[0].targets, ['b'])
})
