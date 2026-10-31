import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  crc32, windowSize, windows, parseAck, packGlyph, charBlock, textPayload, newTextFormat,
  type Glyph,
} from './ipixel-content.ts'

const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, '0')).join(' ')
const bytes = (s: string) => new TextEncoder().encode(s)

test('crc32 matches zlib', () => {
  assert.equal(crc32(bytes('123456789')), 0xcbf43926)
  assert.equal(crc32(new Uint8Array(0)), 0)
})

test('window size follows the panel type', () => {
  assert.equal(windowSize({ type: 0x81, width: 32, height: 32 }), 12288)
  assert.equal(windowSize({ type: 0x8a, width: 64, height: 32 }), 4096)
  assert.equal(windowSize({ type: 0x8a, mcu: 205 }), 12288)
  assert.equal(windowSize(undefined), 4096)
})

test('one window carries the full header', () => {
  const content = bytes('123456789')
  const [w, ...rest] = windows('image', 7, content, 12288)
  assert.equal(rest.length, 0)
  assert.equal(hex(w.subarray(0, 15)), '18 00 02 00 00 09 00 00 00 26 39 f4 cb 00 07')
  assert.equal(hex(w.subarray(15)), hex(content))
})

test('later windows repeat total and crc with option 02', () => {
  const content = new Uint8Array(10).map((_, i) => i)
  const ws = windows('gif', 3, content, 4)
  assert.equal(ws.length, 3)
  assert.deepEqual(ws.map((w) => w[4]), [0, 2, 2])
  assert.deepEqual(ws.map((w) => w.length), [19, 19, 17])
  const crc = hex(ws[0].subarray(5, 13))
  for (const w of ws) {
    assert.equal(hex(w.subarray(2, 4)), '03 00')
    assert.equal(hex(w.subarray(5, 13)), crc)
    assert.equal(w[13], 0x02)
    assert.equal(w[14], 3)
  }
  assert.equal(hex(ws[2].subarray(15)), '08 09')
})

test('acks map per data type', () => {
  const a = (...b: number[]) => new Uint8Array(b)
  assert.equal(parseAck(a(5, 0, 2, 0, 1), 'image'), 'next')
  assert.equal(parseAck(a(5, 0, 2, 0, 3), 'image'), 'done')
  assert.equal(parseAck(a(5, 0, 3, 0, 0), 'gif'), 'rejected')
  assert.equal(parseAck(a(5, 0, 0, 1, 2), 'text'), 'full')
  // A brightness ack or another type's ack is not this upload's answer.
  assert.equal(parseAck(a(5, 0, 4, 0x80, 1), 'image'), undefined)
  assert.equal(parseAck(a(5, 0, 3, 0, 1), 'image'), undefined)
})

const glyph = (w: number, h: number, lit: Array<[number, number]>): Glyph => {
  const on = new Array(w * h).fill(false)
  for (const [x, y] of lit) on[y * w + x] = true
  return { w, h, on }
}

test('glyph bits are LSB first, rows padded to bytes', () => {
  const g = glyph(10, 2, [[0, 0], [9, 0], [7, 1]])
  assert.equal(hex(packGlyph(g)), '01 02 80 00')
  assert.equal(hex(packGlyph(g, true)), '80 40 01 00')
})

test('legacy char block size byte: half-width even, square odd', () => {
  const half = charBlock(glyph(16, 32, []), [1, 2, 3])
  assert.equal(hex(half.subarray(0, 4)), '02 01 02 03')
  assert.equal(half.length, 4 + 64)
  assert.equal(charBlock(glyph(32, 32, []), [0, 0, 0])[0], 3)
  assert.equal(charBlock(glyph(8, 16, []), [0, 0, 0])[0], 0)
})

test('new char block carries width and height', () => {
  const b = charBlock(glyph(12, 20, []), [9, 8, 7], { newFormat: true })
  assert.equal(hex(b.subarray(0, 6)), '80 09 08 07 0c 14')
  assert.equal(b.length, 6 + 2 * 20)
})

test('text header then blocks', () => {
  const p = textPayload([glyph(16, 32, []), glyph(16, 32, [])], { rgb: [255, 0, 0], effect: 1, speed: 80 })
  assert.equal(hex(p.subarray(0, 14)), '02 00 01 01 01 50 01 ff 00 00 00 00 00 00')
  assert.equal(p.length, 14 + 2 * 68)
})

test('new text format only for listed firmware ranges', () => {
  assert.equal(newTextFormat(1809), true)
  assert.equal(newTextFormat(1700), false)
  assert.equal(newTextFormat(undefined), false)
})
