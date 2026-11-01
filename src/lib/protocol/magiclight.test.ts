import { test } from 'node:test'
import assert from 'node:assert/strict'
import { magiclight as m } from './magiclight.ts'
import { allServices, driverFor } from './index.ts'

const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, '0')).join(' ')
let n = 0
// Builders keep state per name, so each test gets a fresh device.
const dev = () => `LEDBlue-${++n}@id`

test('magiclight names: LEDBLE stays ffe0 until the probe finds FFE5', () => {
  assert.equal(driverFor('LEDBLE-1A2B')?.id, 'ffe0')
  assert.ok(m.matches('LEDBLE-1A2B'))
  assert.equal(driverFor('LEDBlue-1A2B')?.id, 'magiclight')
  assert.equal(driverFor('FluxBlue')?.id, 'magiclight')
  for (const u of ['ffe5', 'ffe0']) {
    assert.ok(allServices.includes(`0000${u}-0000-1000-8000-00805f9b34fb`))
  }
})

// Byte templates from r0/g.java in the decompiled app.
test('magiclight power and state query', () => {
  const d = dev()
  assert.equal(hex(m.power(true, d)), 'cc 23 33')
  assert.equal(hex(m.power(false, d)), 'cc 24 33')
  assert.deepEqual(m.onConnect!(d).map(hex), ['ef 01 77'])
})

test('magiclight colour, and brightness rescales it', () => {
  const d = dev()
  assert.equal(hex(m.rgb(255, 0, 0, d)), '56 ff 00 00 00 f0 aa')
  assert.equal(hex(m.brightness(50, d)), '56 80 00 00 00 f0 aa')
})

test('magiclight type byte from the state reply picks the short colour frame', () => {
  const d = dev()
  m.onNotify!(new Uint8Array([0x66, 0x03, 0x23, 0x41, 0x21, 0x10, 1, 2, 3, 0, 4, 0x99]), d)
  assert.equal(hex(m.rgb(1, 2, 3, d)), '56 01 02 03 00 aa')
})

test('magiclight white per type', () => {
  const d = dev()
  assert.equal(hex(m.white!(100, d)), '56 00 00 00 ff 0f aa')
  const t4 = dev()
  m.onNotify!(new Uint8Array([0x66, 0x04, 0x23, 0x41, 0x21, 0x10, 0, 0, 0, 0, 4, 0x99]), t4)
  // Type 4 is the only checksummed frame.
  assert.equal(hex(m.white!(100, t4)), '31 00 00 00 ff 00 00 30')
})

test('magiclight effect and speed: 31 - round(pct × 30 / 100), 1 is fastest', () => {
  const d = dev()
  assert.equal(m.effects(d).length, 20)
  assert.equal(m.effects(d)[0].id, 0x25)
  // Speed alone with no effect running sends nothing.
  assert.equal(m.speed(100, d).length, 0)
  assert.equal(hex(m.effect({ id: 0x25, name: '' }, d)), 'bb 25 01 44')
  assert.equal(hex(m.speed(0, d)), 'bb 25 1f 44')
  // An effect has no brightness byte.
  assert.equal(m.brightness(10, d).length, 0)
})

test('magiclight colour list: 53 bytes, placeholders, transition', () => {
  const d = dev()
  const [fr] = m.customEffect!({ colors: [{ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }], fade: true }, d)
  assert.equal(fr.length, 53)
  assert.equal(hex(fr.subarray(0, 10)), '99 ff 00 00 00 00 ff 01 02 03')
  assert.equal(hex(fr.subarray(49)), '10 3a ff 66')
  // A later speed change resends the list rather than dropping it.
  const again = m.speed(100, d)
  assert.equal(again.length, 53)
  assert.equal(again[49], 0x01)
})
