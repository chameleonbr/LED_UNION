import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAdvert, zengge as z } from './zengge.ts'
import { allServices, driverFor, manufacturerIds } from './index.ts'

const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, '0')).join(' ')
let n = 0
const dev = () => `LEDnetWF0100${++n}@id`

/** 27 bytes after the company id: sta, bleVersion, mac, product id, fw, ledVersion. */
function advert(name: string, product: number, ble = 5, led = 5) {
  const b = new Uint8Array(27)
  b[1] = ble
  b[8] = product >> 8
  b[9] = product & 0xff
  b[11] = led
  z.onAdvert!(name, { manufacturerData: new Map([[0x5a53, new DataView(b.buffer)]]), serviceData: new Map() })
}
const FFFF = '0000ffff-0000-1000-8000-00805f9b34fb'

test('zengge is found by name and service, and asks for its company ids', () => {
  assert.equal(driverFor('LEDnetWF02003308A1B2')?.id, 'zengge')
  assert.ok(allServices.includes('0000ffff-0000-1000-8000-00805f9b34fb'))
  assert.ok(manufacturerIds.includes(0x5a00) && manufacturerIds.includes(0x5aff))
})

test('zengge advert: manufacturer record, service data, and what is left unread', () => {
  const m = new Uint8Array(27)
  m[1] = 8
  m[9] = 0xa1
  m[11] = 6
  const mfr = (b: Uint8Array) => new Map([[0x5a53, new DataView(b.buffer)]])
  assert.deepEqual(
    parseAdvert({ manufacturerData: mfr(m), serviceData: new Map() }),
    { bleVersion: 8, product: 0xa1, ledVersion: 6 },
  )
  // Newer firmware: header in service data, state in a longer manufacturer record.
  const sd = new Uint8Array(16)
  sd[3] = 7
  sd[11] = 0x33
  sd[13] = 5
  const state = new Uint8Array(29).fill(0xee)
  assert.deepEqual(
    parseAdvert({ manufacturerData: mfr(state), serviceData: new Map([[FFFF, new DataView(sd.buffer)]]) }),
    { bleVersion: 7, product: 0x33, ledVersion: 5 },
  )
  // A state-only record must not be read as a header.
  assert.equal(parseAdvert({ manufacturerData: mfr(state), serviceData: new Map() }), undefined)
  // IOTBT reuses the ids with another protocol.
  const iot = new Uint8Array(27)
  iot[1] = 0x23
  assert.equal(parseAdvert({ manufacturerData: mfr(iot), serviceData: new Map() }), undefined)
})

// Frames hand-checked against LowerTransportLayerEncoder and Protocol/b.java, d.java.
test('zengge power: 3B with a 0.5 s fade, sequence counts from 1', () => {
  const d = dev()
  assert.equal(hex(z.power(true, d)), '00 01 80 00 00 0d 0e 0b 3b 23 00 00 00 00 00 00 00 32 00 00 90')
  assert.equal(hex(z.power(false, d)), '00 02 80 00 00 0d 0e 0b 3b 24 00 00 00 00 00 00 00 32 00 00 91')
})

test('zengge power: LED firmware below 5 keeps 71', () => {
  const d = dev()
  advert(d, 51, 4, 4)
  assert.equal(hex(z.power(true, d)), '00 01 80 00 00 04 05 0b 71 23 0f a3')
})

test('zengge simple products take 31 RGB with brightness baked in', () => {
  const d = dev()
  advert(d, 51)
  assert.equal(hex(z.rgb(255, 0, 0, d)), '00 01 80 00 00 09 0a 0b 31 ff 00 00 00 00 f0 0f 2f')
  assert.equal(hex(z.brightness(50, d)).slice(24), '31 80 00 00 00 00 f0 0f b0')
})

test('zengge symphony and unknown products take 3B A1 HSV', () => {
  const unknown = dev()
  assert.equal(hex(z.rgb(255, 0, 0, unknown)).slice(24), '3b a1 00 64 64 00 00 00 00 00 00 00 a4')
  const g = dev()
  advert(g, 0xa1)
  // Hue 120 packs as (120 << 7) | 100.
  assert.equal(hex(z.rgb(0, 255, 0, g)).slice(24), '3b a1 3c 64 64 00 00 00 00 00 00 00 e0')
  assert.equal(hex(z.rgb(0, 0, 0, g)).slice(24, 38), '3b a1 00 00 00')
})

test('zengge BLE version 8 uses the 9-byte header', () => {
  const d = dev()
  advert(d, 51, 8)
  assert.equal(hex(z.power(true, d)).slice(0, 26), '01 01 80 00 00 0d 00 0e 0b')
})

test('zengge effects follow the product', () => {
  const s = dev()
  advert(s, 51) // simple38: no effect table we trust
  assert.equal(z.caps(s).effects, false)

  const simple = dev()
  advert(simple, 0x44)
  assert.equal(z.effects(simple)[0].id, 37)
  z.speed(100, simple)
  assert.equal(hex(z.effect({ id: 37, name: '' }, simple)).slice(24), '61 25 01 0f 96')

  const sym = dev()
  advert(sym, 0xa1)
  assert.equal(z.effects(sym).length, 100)
  assert.equal(hex(z.effect({ id: 5, name: '' }, sym)).slice(24), '42 05 32 64 dd')

  const ring = dev()
  advert(ring, 83)
  // No checksum on this family: the last byte is brightness.
  assert.equal(hex(z.effect({ id: 1, name: '' }, ring)).slice(24), '38 01 32 64')
})

test('zengge white and CCT on 31 with the white mask', () => {
  const d = dev()
  advert(d, 7)
  assert.equal(hex(z.white!(100, d)).slice(24), '31 00 00 00 ff 00 0f 0f 4e')
  assert.equal(hex(z.cct!(0, 100, d)).slice(24), '31 00 00 00 00 ff 0f 0f 4e')
})
