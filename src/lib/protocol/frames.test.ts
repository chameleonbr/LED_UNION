import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fff0 } from './fff0.ts'
import { ffe0, authFrame } from './ffe0.ts'
import { driverFor } from './index.ts'
import { elk, ledble, melk } from './effects.ts'

const hex = (b: Uint8Array) =>
  [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ')

// Byte templates below are transcribed from docs/protocol/. If a builder drifts from
// the documented wire format, these fail.

test('fff0: frames match docs/protocol/elk-melk.md', () => {
  assert.equal(hex(fff0.power(true, 'MELK-OC')), '7e 04 04 01 00 01 ff 00 ef')
  assert.equal(hex(fff0.power(false, 'MELK-OC')), '7e 04 04 00 00 00 ff 00 ef')
  assert.equal(hex(fff0.rgb(255, 0, 0, 'MELK-OC')), '7e 07 05 03 ff 00 00 10 ef')
  assert.equal(hex(fff0.brightness(50, 'MELK-OC')), '7e 04 01 32 ff ff ff 00 ef')
  assert.equal(hex(fff0.speed(100, 'MELK-OC')), '7e 04 02 64 ff ff ff 00 ef')
  assert.equal(hex(fff0.white!(75, 'MELK-OW')), '7e 05 05 01 4b ff ff 08 ef')
  assert.equal(hex(fff0.cct!(30, 70, 'MELK-CT')), '7e 06 05 02 1e 46 ff 08 ef')
})

test('fff0: INTRO devices use 0xff in the power frame', () => {
  assert.equal(hex(fff0.power(true, 'ELK-INTRO')), '7e 04 04 ff 00 01 ff 00 ef')
})

test('fff0: effect opcode differs between MELK and ELK generations', () => {
  // MELK sends the raw id with sub-opcode 0x06.
  assert.equal(
    hex(fff0.effect({ id: 193, group: 'Basic', name: '7-Color Jump' }, 'MELK-OC')),
    '7e 05 03 c1 06 ff ff 00 ef',
  )
  // ELK ids are already in 0x80..0x9C and use sub-opcode 0x03.
  assert.equal(
    hex(fff0.effect({ id: 0x87, name: 'Three Color Jumping Change' }, 'ELK-BLEDOM')),
    '7e 05 03 87 03 ff ff 00 ef',
  )
  // Scenes are a distinct opcode, MELK only.
  assert.equal(
    hex(fff0.effect({ id: 5, group: 'Scenes', name: 'Fireworks' }, 'MELK-OC')),
    '7e 05 31 05 07 ff ff 01 ef',
  )
})

test('ffe0: frames match docs/protocol/ledble.md', () => {
  assert.equal(hex(ffe0.power(true, 'LEDBLE-001')), '7e ff 04 01 00 ff ff 00 ef')
  assert.equal(hex(ffe0.power(false, 'LEDBLE-001')), '7e ff 04 00 00 ff ff 00 ef')
  assert.equal(hex(ffe0.rgb(0, 255, 0, 'LEDBLE-001')), '7e ff 05 03 00 ff 00 ff ef')
  assert.equal(hex(ffe0.brightness(100, 'LEDBLE-001')), '7e ff 01 64 00 ff ff ff ef')
  assert.equal(hex(ffe0.speed(1, 'LEDBLE-001')), '7e ff 02 01 00 ff ff ff ef')
  assert.equal(
    hex(ffe0.effect({ id: 135, name: 'Tricolor jump' }, 'LEDBLE-001')),
    '7e 00 0e 87 ff ff ff ff ef',
  )
  // LEDSTAGE/LEDLIGHT take a different power frame.
  assert.equal(hex(ffe0.power(true, 'LEDSTAGE-1')), '7e ff 04 01 ff ff ff ff ef')
})

test('ffe0: auth frame packs weekday and clock as the app does', () => {
  // Wednesday 2026-09-02, 14:37. Calendar weekIndex for Wednesday is 3.
  const frame = authFrame(new Date(2026, 8, 2, 14, 37))
  assert.equal(hex(frame), '2a 02 a1 23 45 67 6e 25 af')
  assert.equal(frame[6], (3 << 5) | 14)

  // Sunday must map to 7, not 0 — the app remaps Calendar.DAY_OF_WEEK.
  const sunday = authFrame(new Date(2026, 8, 6, 0, 0))
  assert.equal(sunday[6], (7 << 5) | 0)
})

test('values are clamped and rounded, never emitted raw', () => {
  assert.equal(fff0.brightness(999, 'MELK-OC')[3], 100)
  assert.equal(fff0.brightness(-5, 'MELK-OC')[3], 0)
  assert.equal(fff0.rgb(300, -1, 12.6, 'MELK-OC')[4], 255)
  assert.equal(fff0.rgb(300, -1, 12.6, 'MELK-OC')[5], 0)
  assert.equal(fff0.rgb(300, -1, 12.6, 'MELK-OC')[6], 13)
})

test('every frame is 9 bytes and correctly bracketed', () => {
  const cases: Array<[Uint8Array, number, number]> = [
    [fff0.power(true, 'MELK-OC'), 0x7e, 0xef],
    [fff0.rgb(1, 2, 3, 'MELK-OC'), 0x7e, 0xef],
    [ffe0.power(true, 'LEDBLE-1'), 0x7e, 0xef],
    [ffe0.rgb(1, 2, 3, 'LEDBLE-1'), 0x7e, 0xef],
    [authFrame(), 0x2a, 0xaf],
  ]
  for (const [frame, head, tail] of cases) {
    assert.equal(frame.length, 9)
    assert.equal(frame[0], head)
    assert.equal(frame[8], tail)
    assert.ok([...frame].every((b) => b >= 0 && b <= 255))
  }
})

test('device names route to the right driver', () => {
  assert.equal(driverFor('MELK-OB-1234')?.id, 'fff0')
  assert.equal(driverFor('ELK-BLEDOM')?.id, 'fff0')
  assert.equal(driverFor('XSL-Light')?.id, 'fff0')
  assert.equal(driverFor('LEDBLE-00-9B07')?.id, 'ffe0')
  assert.equal(driverFor('LED_BLE_00203032')?.id, 'ffe0')
  // BLEDIM shares the FFF0 service but not the protocol, so it gets its own driver.
  assert.equal(driverFor('BLEDIM')?.id, 'bledim')
  assert.equal(driverFor('Some Random Speaker'), undefined)
})

test('capabilities follow the name rules the original apps use', () => {
  assert.equal(fff0.caps('MELK-OC').scenes, true)
  assert.equal(fff0.caps('ELK-BLEDOM').scenes, false)
  assert.equal(fff0.caps('MELK-OBCT').cct, true)
  assert.equal(fff0.caps('MELK-OB').cct, false)
})

test('effect tables are populated and in range', () => {
  assert.equal(melk.length, 241)
  assert.equal(elk.length, 29)
  assert.equal(ledble.length, 23)
  assert.ok(elk.every((e) => e.id >= 0x80 && e.id <= 0x9c))
  assert.ok(ledble.every((e) => e.id >= 135 && e.id <= 157))
  assert.ok(melk.every((e) => e.id >= 0 && e.id <= 255))
  assert.equal(fff0.effects('MELK-OC').length, 241)
  assert.equal(fff0.effects('ELK-BLEDOM').length, 29)
})

test('parseHex accepts the formats a human actually types', async () => {
  const { parseHex } = await import('../hex.ts')
  const want = [0x7e, 0x04, 0x04, 0x01]
  for (const input of ['7E040401', '7e 04 04 01', '0x7E 0x04 0x04 0x01', '7E:04:04:01']) {
    assert.deepEqual([...parseHex(input)], want, `failed on ${input}`)
  }
  assert.throws(() => parseHex('7E0'), /ímpar|inválido/i)
  assert.throws(() => parseHex(''), /inválido/i)
})

test('endpoint keys round-trip device and channel', async () => {
  const { epKey, parseEp } = await import('../endpoint.ts')
  assert.equal(epKey('abc'), 'abc')
  assert.equal(epKey('abc', 0), 'abc#0')
  assert.equal(epKey('abc', 2), 'abc#2')
  assert.deepEqual(parseEp('abc'), { deviceId: 'abc' })
  assert.deepEqual(parseEp('abc#0'), { deviceId: 'abc', ch: 0 })
  assert.deepEqual(parseEp('abc#2'), { deviceId: 'abc', ch: 2 })
  // Device ids from Web Bluetooth are base64ish and can contain odd characters.
  assert.deepEqual(parseEp('a/b+c=#1'), { deviceId: 'a/b+c=', ch: 1 })
})

test('ffe0 puts the channel in byte 7, and keeps the default without one', async () => {
  const { ffe0 } = await import('./ffe0.ts')
  const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ')
  assert.equal(hexOf(ffe0.rgb(255, 0, 0, 'LEDBLE-00', 1)), '7e ff 05 03 ff 00 00 01 ef')
  assert.equal(hexOf(ffe0.rgb(255, 0, 0, 'LEDBLE-00', 0)), '7e ff 05 03 ff 00 00 00 ef')
  assert.equal(hexOf(ffe0.rgb(255, 0, 0, 'LEDBLE-00')), '7e ff 05 03 ff 00 00 ff ef')
  assert.equal(ffe0.brightness(50, 'LEDBLE-00', 2)[7], 2)
  assert.equal(ffe0.power(true, 'LEDBLE-00', 2)[7], 2)
  assert.equal(ffe0.hasChannels, true)
})

test('ffe0 routes each name prefix to the right wire layout', async () => {
  const { layoutFor } = await import('./ffe0.ts')
  assert.equal(layoutFor('LEDBLE-00-9B67'), 'ble')
  assert.equal(layoutFor('LED_BLE_00203032'), 'ble')
  assert.equal(layoutFor('LEDSTAGE-1'), 'ble')
  assert.equal(layoutFor('LEDCAR-00-ABCD'), 'ble')
  assert.equal(layoutFor('LEDCAR-01-ABCD'), 'dmx')
  assert.equal(layoutFor('LEDDMX-00-ABCD'), 'dmx')
  assert.equal(layoutFor('LEDDMX-03-ABCD'), 'dmx')
  assert.equal(layoutFor('LEDDMX-02-ABCD'), 'dmxs')
  assert.equal(layoutFor('LEDDMX-04-ABCD'), 'dmxs')
  assert.equal(layoutFor('LEDCAR-02-ABCD'), 'dmxs')
})

test('LEDDMX 7B FF frames match docs/protocol/ledble.md', () => {
  const n = 'LEDDMX-00-ABCD'
  assert.equal(hex(ffe0.power(true, n)), '7b 04 04 01 ff ff ff ff bf')
  assert.equal(hex(ffe0.power(false, n)), '7b 04 04 00 ff ff ff ff bf')
  assert.equal(hex(ffe0.rgb(255, 0, 0, n)), '7b ff 07 ff 00 00 00 ff bf')
  assert.equal(hex(ffe0.speed(50, n)), '7b ff 02 32 ff 00 ff ff bf')
  assert.equal(hex(ffe0.effect({ id: 7, name: 'x' }, n)), '7b ff 13 07 ff ff ff ff bf')
  // This family sends brightness twice: scaled to 0..32, then raw.
  assert.equal(hex(ffe0.brightness(100, n)), '7b ff 01 20 64 00 ff ff bf')
  assert.equal(hex(ffe0.brightness(50, n)), '7b ff 01 10 32 00 ff ff bf')
  assert.equal(hex(ffe0.brightness(0, n)), '7b ff 01 00 00 00 ff ff bf')
})

test('LEDDMX-02 and LEDCAR-02 shift every parameter one byte left', () => {
  const n = 'LEDDMX-02-ABCD'
  assert.equal(hex(ffe0.power(true, n)), '7b 04 01 ff ff ff ff ff bf')
  assert.equal(hex(ffe0.rgb(255, 0, 0, n)), '7b 07 ff 00 00 00 ff ff bf')
  assert.equal(hex(ffe0.brightness(50, n)), '7b 01 32 00 ff ff ff ff bf')
  assert.equal(hex(ffe0.speed(50, n)), '7b 02 32 00 ff ff ff ff bf')
  assert.equal(hex(ffe0.effect({ id: 7, name: 'x' }, n)), '7b 13 07 ff ff ff ff ff bf')
  assert.equal(hex(ffe0.cct!(30, 70, n)), '7b 0a 46 ff ff ff ff ff bf')
  assert.equal(hex(ffe0.white!(75, n)), '7b 07 00 00 00 4b ff ff bf')
  // LEDCAR-02 shares the layout.
  assert.equal(hex(ffe0.power(true, 'LEDCAR-02-1')), '7b 04 01 ff ff ff ff ff bf')
})

test('every family emits 9 bytes with the right header and trailer', () => {
  const cases: Array<[string, number, number]> = [
    ['LEDBLE-00-1', 0x7e, 0xef],
    ['LEDCAR-00-1', 0x7e, 0xef],
    ['LEDDMX-00-1', 0x7b, 0xbf],
    ['LEDCAR-01-1', 0x7b, 0xbf],
    ['LEDDMX-02-1', 0x7b, 0xbf],
    ['LEDCAR-02-1', 0x7b, 0xbf],
  ]
  for (const [name, head, tail] of cases) {
    for (const frame of [
      ffe0.power(true, name),
      ffe0.rgb(1, 2, 3, name),
      ffe0.brightness(50, name),
      ffe0.speed(50, name),
      ffe0.effect({ id: 9, name: 'x' }, name),
    ]) {
      assert.equal(frame.length, 9, name)
      assert.equal(frame[0], head, `${name} header`)
      assert.equal(frame[8], tail, `${name} trailer`)
    }
  }
})

test('effect tables are picked per family', () => {
  assert.equal(ffe0.effects('LEDBLE-00-1').length, 23)
  // LEDCAR keeps its own table even on the 7B variants.
  assert.equal(ffe0.effects('LEDCAR-01-1').length, 23)
  assert.equal(ffe0.effects('LEDCAR-02-1').length, 23)
  assert.equal(ffe0.effects('LEDDMX-00-1').length, 211)
  assert.equal(driverFor('LEDDMX-00-ABCD')?.id, 'ffe0')
  assert.equal(driverFor('LEDCAR-02-ABCD')?.id, 'ffe0')
})

test('bledim frames carry a valid header, length and checksum', async () => {
  const { bledim, frame, serialCodeFrame } = await import('./bledim.ts')

  const f = frame(0x80, [1])
  assert.equal(f.length, 8, '6 header + 1 payload + 1 checksum')
  assert.equal(f[0], 0x55)
  assert.equal(f[1], 0xaa)
  assert.equal(f[3], 0x80)
  assert.equal(f[4], 0x00, 'length high byte')
  assert.equal(f[5], 0x01, 'length low byte counts payload only')
  // Checksum is an additive sum of everything before it, sync bytes included.
  let sum = 0
  for (let i = 0; i < f.length - 1; i++) sum += f[i]
  assert.equal(f[f.length - 1], sum & 0xff)

  // Length is big-endian across both bytes.
  const big = frame(0x82, new Array(300).fill(0))
  assert.equal(big[4], 1)
  assert.equal(big[5], 300 - 256)
  assert.equal(big.length, 6 + 300 + 1)

  // The sequence byte advances so two identical commands differ on the wire.
  assert.notEqual(frame(0x80, [1])[2], frame(0x80, [1])[2])

  const auth = serialCodeFrame(new Date(2026, 8, 4, 12, 0, 30, 200))
  assert.equal(auth[3], 0x89)
  assert.equal(auth[5], 2)
  assert.equal(auth[6], 30, 'seconds')
  assert.equal(auth[7], 200, 'milliseconds & 0xff')

  assert.equal(bledim.writeWithResponse, true)
  assert.equal(bledim.chunkSize, 20)
})

test('bledim commands match docs/protocol/bledim.md', async () => {
  const { bledim } = await import('./bledim.ts')
  const body = (f: Uint8Array) => [...f.subarray(6, f.length - 1)]

  assert.deepEqual(body(bledim.power(true, 'BLEDIM')), [1])
  assert.deepEqual(body(bledim.power(false, 'BLEDIM')), [0])
  // Colour payload is W, R, G, B — white first.
  assert.deepEqual(body(bledim.rgb(10, 20, 30, 'BLEDIM')), [0, 10, 20, 30])
  assert.deepEqual(body(bledim.white!(100, 'BLEDIM')), [255, 0, 0, 0])

  // Percent in, 0..255 on the wire, and speed/brightness share one command.
  const bright = body(bledim.brightness(100, 'BLEDIM'))
  assert.equal(bright.length, 6)
  assert.equal(bright[0], 0xff, 'free scene')
  assert.equal(bright[3], 255, 'brightness scaled to 0..255')
  const slow = body(bledim.speed(0, 'BLEDIM'))
  assert.equal(slow[2], 0, 'speed scaled')
  assert.equal(slow[3], 255, 'brightness survives a speed change')

  // An effect ships a whole 72-byte scene, with the id in byte 14 plus the chase bit.
  const eff = bledim.effect({ id: 4, name: 'M5' }, 'BLEDIM')
  assert.equal(eff.length, 6 + 72 + 1, 'SCENE_PACKET_SIZE is 79')
  assert.equal(body(eff)[14], 0x84, 'id 4 with bit 7 set')
  assert.equal(bledim.effects('BLEDIM').length, 13)
})

test('bledim claims only genuine names, never clone modules or the ELK family', async () => {
  assert.equal(driverFor('BLEDIM')?.id, 'bledim')
  assert.equal(driverFor('LanQianTech')?.id, 'bledim')
  // Default names of bare BLE-UART modules — the original app treats these as fakes.
  assert.equal(driverFor('JDY-10'), undefined)
  assert.equal(driverFor('Ble_Light'), undefined)
  // Same service, different protocol — these must still reach fff0.
  assert.equal(driverFor('MELK-OC')?.id, 'fff0')
  assert.equal(driverFor('ELK-BLEDOM')?.id, 'fff0')
})

test('ffe0 routes the remaining LED+LAMP families', async () => {
  const { layoutFor } = await import('./ffe0.ts')
  assert.equal(layoutFor('LEDSMART-01'), 'smart')
  assert.equal(layoutFor('LEDSUN-02'), 'sun')
  assert.equal(layoutFor('LEDLIKE-03'), 'like')
  assert.equal(layoutFor('LEDPHO-04'), 'pho')
  for (const n of ['LEDSMART-1', 'LEDSUN-1', 'LEDLIKE-1', 'LEDPHO-1']) {
    assert.equal(driverFor(n)?.id, 'ffe0', n)
  }
})

test('LEDSMART, LEDSUN, LEDLIKE and LEDPHO frames match the decompiled source', () => {
  // LEDSMART 7D .. DF
  assert.equal(hex(ffe0.power(true, 'LEDSMART-1')), '7d 01 01 01 ff ff ff ff df')
  assert.equal(hex(ffe0.power(false, 'LEDSMART-1')), '7d 01 01 00 ff ff ff ff df')
  assert.equal(hex(ffe0.rgb(1, 2, 3, 'LEDSMART-1')), '7d 02 01 ff 01 02 03 ff df')
  assert.equal(hex(ffe0.brightness(50, 'LEDSMART-1')), '7d 02 02 32 ff ff ff ff df')
  assert.equal(hex(ffe0.speed(50, 'LEDSMART-1')), '7d 02 04 32 ff ff ff ff df')
  assert.equal(hex(ffe0.effect({ id: 7, name: 'x' }, 'LEDSMART-1')), '7d 02 05 07 ff ff ff ff df')
  assert.equal(hex(ffe0.white!(40, 'LEDSMART-1')), '7d 02 07 28 ff ff ff ff df')

  // LEDSUN 7A .. AF
  assert.equal(hex(ffe0.power(true, 'LEDSUN-1')), '7a 01 01 ff ff ff ff ff af')
  assert.equal(hex(ffe0.brightness(50, 'LEDSUN-1')), '7a 02 32 ff ff ff ff ff af')
  assert.equal(hex(ffe0.speed(50, 'LEDSUN-1')), '7a 03 32 ff ff ff ff ff af')
  assert.equal(hex(ffe0.cct!(30, 70, 'LEDSUN-1')), '7a 05 1e ff ff ff ff ff af')
  assert.equal(hex(ffe0.effect({ id: 3, name: 'x' }, 'LEDSUN-1')), '7a 06 03 ff ff ff ff ff af')

  // LEDLIKE 70 .. 0F
  assert.equal(hex(ffe0.power(true, 'LEDLIKE-1')), '70 01 01 ff ff ff ff ff 0f')
  assert.equal(hex(ffe0.brightness(50, 'LEDLIKE-1')), '70 02 32 ff ff ff ff ff 0f')
  assert.equal(hex(ffe0.speed(50, 'LEDLIKE-1')), '70 03 32 ff ff ff ff ff 0f')
  assert.equal(hex(ffe0.effect({ id: 5, name: 'x' }, 'LEDLIKE-1')), '70 ff 05 ff ff ff ff ff 0f')

  // LEDPHO 72 .. 2F — the last three params are the group address, zero = broadcast.
  assert.equal(hex(ffe0.power(true, 'LEDPHO-1')), '72 01 01 00 ff 00 00 00 2f')
  assert.equal(hex(ffe0.rgb(255, 0, 0, 'LEDPHO-1')), '72 04 ff 00 00 00 00 00 2f')
  assert.equal(hex(ffe0.brightness(50, 'LEDPHO-1')), '72 02 32 00 ff 00 00 00 2f')
  assert.equal(hex(ffe0.speed(50, 'LEDPHO-1')), '72 09 32 ff ff 00 00 00 2f')
  assert.equal(hex(ffe0.cct!(60, 40, 'LEDPHO-1')), '72 05 3c ff ff 00 00 00 2f')
  assert.equal(hex(ffe0.effect({ id: 9, name: 'x' }, 'LEDPHO-1')), '72 08 09 ff ff 00 00 00 2f')
})

test('white-only families drive the white channel instead of faking RGB', () => {
  // LEDSUN and LEDLIKE hardware has no colour channel at all.
  assert.equal(ffe0.caps('LEDSUN-1').rgb, false)
  assert.equal(ffe0.caps('LEDLIKE-1').rgb, false)
  assert.equal(ffe0.caps('LEDSMART-1').rgb, true)
  assert.equal(ffe0.caps('LEDPHO-1').rgb, true)
  // Asking for colour anyway maps to luminance rather than emitting a bogus frame.
  assert.equal(hex(ffe0.rgb(255, 255, 255, 'LEDSUN-1')), '7a 02 64 ff ff ff ff ff af')
  assert.equal(hex(ffe0.rgb(0, 0, 0, 'LEDLIKE-1')), '70 02 00 ff ff ff ff ff 0f')
})

test('only the families that use it get the 2A handshake', () => {
  assert.equal(ffe0.onConnect!('LEDBLE-00-1').length, 1)
  assert.equal(ffe0.onConnect!('LEDDMX-00-1').length, 1)
  assert.equal(ffe0.onConnect!('LEDSMART-1').length, 0)
  assert.equal(ffe0.onConnect!('LEDPHO-1').length, 0)
})

test('all nine layouts stay 9 bytes with matching header and trailer', () => {
  const cases: Array<[string, number, number]> = [
    ['LEDBLE-00-1', 0x7e, 0xef],
    ['LEDDMX-00-1', 0x7b, 0xbf],
    ['LEDDMX-02-1', 0x7b, 0xbf],
    ['LEDCAR-01-1', 0x7b, 0xbf],
    ['LEDCAR-02-1', 0x7b, 0xbf],
    ['LEDSMART-1', 0x7d, 0xdf],
    ['LEDSUN-1', 0x7a, 0xaf],
    ['LEDLIKE-1', 0x70, 0x0f],
    ['LEDPHO-1', 0x72, 0x2f],
  ]
  for (const [name, head, tail] of cases) {
    for (const frame of [
      ffe0.power(true, name),
      ffe0.rgb(1, 2, 3, name),
      ffe0.brightness(50, name),
      ffe0.speed(50, name),
      ffe0.effect({ id: 9, name: 'x' }, name),
      ffe0.white!(50, name),
    ]) {
      assert.equal(frame.length, 9, name)
      assert.equal(frame[0], head, `${name} header`)
      assert.equal(frame[8], tail, `${name} trailer`)
    }
  }
})

test('effect tables follow the family', () => {
  assert.equal(ffe0.effects('LEDLIKE-1').length, 8)
  assert.equal(ffe0.effects('LEDPHO-1').length, 16)
  // No table ships for these two, so ids are exposed plainly.
  assert.equal(ffe0.effects('LEDSMART-1').length, 16)
  assert.equal(ffe0.effects('LEDSUN-1').length, 16)
})

test('bledim scene struct matches the buffers the app itself builds', async () => {
  const { bledim } = await import('./bledim.ts')
  const p = [...bledim.effect({ id: 0, name: 'M1' }, 'BLEDIM')].slice(6, -1)
  assert.equal(p.length, 72)
  assert.equal(p[0], 0, 'fade off')
  // The app zeroes the scene slot on every buffer it builds. The 0x88 command has a
  // separate scene field that does use 255 — conflating the two was a real bug.
  assert.equal(p[4], 0, 'iSceneNo is 0 here, not the 0x88 free-scene sentinel')
  assert.equal(p[14] & 0x80, 0x80, 'chase bit set')
  assert.equal(p[14] & 0x7f, 0, 'effect index in the low 7 bits')
})
