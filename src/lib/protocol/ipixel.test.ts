import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ipixel, parseDeviceInfo } from './ipixel.ts'
import { driverFor, allServices } from './index.ts'

const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, '0')).join(' ')
const N = 'LED_BLE_1A2B'

// FFE0 controllers also advertise LED_BLE_xx, so the name stays an ffe0 hint and the
// GATT probe picks ipixel on a panel (no FFE0 service there). Existing names keep
// resolving exactly as before.
test('ipixel claims LED_BLE names without taking them from ffe0', () => {
  assert.ok(ipixel.matches(N))
  assert.equal(driverFor(N)?.id, 'ffe0')
  assert.equal(ipixel.matches('LEDBLE-00-9B67'), false)
  assert.ok(allServices.includes('000000fa-0000-1000-8000-00805f9b34fb'))
})

test('ipixel power', () => {
  assert.equal(hex(ipixel.power(true, N)), '05 00 07 01 01')
  assert.equal(hex(ipixel.power(false, N)), '05 00 07 01 00')
})

test('ipixel brightness clamps to 10..100', () => {
  assert.equal(hex(ipixel.brightness(50, N)), '05 00 04 80 32')
  assert.equal(hex(ipixel.brightness(0, N)), '05 00 04 80 0a')
  assert.equal(hex(ipixel.brightness(150, N)), '05 00 04 80 64')
})

test('ipixel orientation clamps to 0..3', () => {
  assert.equal(hex(ipixel.orientation!(2, N)), '05 00 06 80 02')
  assert.equal(hex(ipixel.orientation!(4, N)), '05 00 06 80 03')
})

test('ipixel show slot and delete all', () => {
  assert.equal(hex(ipixel.showSlot!(3, N)), '07 00 08 80 01 00 03')
  assert.equal(hex(ipixel.deleteAll!(N)), '04 00 03 80')
})

test('ipixel device info query carries local time', () => {
  const [q] = ipixel.onConnect!(N, new Date(2026, 9, 31, 21, 5, 9))
  assert.equal(hex(q), '08 00 01 80 15 05 09 00')
})

test('ipixel has no colour, speed or effect frames', () => {
  assert.equal(ipixel.rgb(1, 2, 3, N).length, 0)
  assert.equal(ipixel.speed(50, N).length, 0)
  assert.equal(ipixel.effect({ id: 1, name: 'x' }, N).length, 0)
})

test('device info reply maps type to panel size', () => {
  assert.deepEqual(parseDeviceInfo(new Uint8Array([0x0b, 0, 0x01, 0x80, 0x81, 0, 0, 0])), {
    type: 0x81, width: 32, height: 32,
  })
  assert.deepEqual(
    parseDeviceInfo(new Uint8Array([0x0b, 0, 0x01, 0x80, 0x8a, 0, 0, 0, 0, 0, 1])),
    { type: 0x8a, width: 64, height: 32, locked: true },
  )
})

test('unknown type keeps the type with no size', () => {
  assert.deepEqual(parseDeviceInfo(new Uint8Array([8, 0, 1, 0x80, 0x7f])), { type: 0x7f })
})

test('an ack is not mistaken for device info', () => {
  assert.equal(parseDeviceInfo(new Uint8Array([0x05, 0x00, 0x08, 0x80, 0x01])), undefined)
  assert.equal(ipixel.onNotify!(new Uint8Array([0x05, 0x00, 0x08, 0x80, 0x01])), undefined)
})
