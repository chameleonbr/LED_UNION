// Protocol: docs/protocol/ipixel.md §2 (windows, ACKs) and §5 (image, GIF, text).
// Content goes up as windows: one frame per window with a 15-byte header, and the panel
// ACKs each one before the next. Everything here builds bytes only; ble.svelte.ts sends.

import type { PanelInfo } from './types.ts'

export const DATA = {
  image: [0x02, 0x00],
  gif: [0x03, 0x00],
  text: [0x00, 0x01],
} as const
export type ContentKind = keyof typeof DATA

const SUB_TYPE: Record<ContentKind, number> = { image: 0x00, gif: 0x02, text: 0x00 }

let table: Uint32Array | undefined
/** CRC-32 (IEEE), the same as zlib.crc32. */
export function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** The vendor app uses 12 KB windows only on the 64×64 and 32×32 boards, 4 KB elsewhere. */
export const windowSize = (panel?: PanelInfo & { mcu?: number }) =>
  panel && ([0x00, 0x80, 0x81].includes(panel.type) || Math.floor((panel.mcu ?? 0) / 100) === 2)
    ? 12288
    : 4096

const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]

/** Split content into window frames; total size and CRC cover the whole content in every window. */
export function windows(kind: ContentKind, slot: number, content: Uint8Array, size: number): Uint8Array[] {
  const total = u32(content.length)
  const crc = u32(crc32(content))
  const out: Uint8Array[] = []
  for (let pos = 0; pos < content.length; pos += size) {
    const part = content.subarray(pos, pos + size)
    const len = 15 + part.length
    const f = new Uint8Array(len)
    f.set([len & 0xff, len >> 8, ...DATA[kind], pos ? 0x02 : 0x00, ...total, ...crc, SUB_TYPE[kind], slot])
    f.set(part, 15)
    out.push(f)
  }
  return out
}

export type Ack = 'next' | 'done' | 'rejected' | 'full'

/** `05 00 <t0> <t1> <status>` for the data type just sent; anything else is not ours. */
export function parseAck(d: Uint8Array, kind: ContentKind): Ack | undefined {
  if (d.length !== 5 || d[0] !== 0x05 || d[1] !== 0x00) return undefined
  if (d[2] !== DATA[kind][0] || d[3] !== DATA[kind][1]) return undefined
  return ({ 1: 'next', 3: 'done', 0: 'rejected', 2: 'full' } as const)[d[4] as 0 | 1 | 2 | 3]
}

/** One glyph: `w × h` pixels, row-major, true = lit. */
export type Glyph = { w: number; h: number; on: boolean[] }

/**
 * Pack a glyph row-major, each row padded to whole bytes. The app puts the first pixel in
 * bit 0 (`TextAgreement.java`); `msbFirst` flips that for firmware that disagrees.
 */
export function packGlyph(g: Glyph, msbFirst = false): Uint8Array {
  const rowBytes = Math.ceil(g.w / 8)
  const out = new Uint8Array(rowBytes * g.h)
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!g.on[y * g.w + x]) continue
      out[y * rowBytes + (x >> 3)] |= msbFirst ? 0x80 >> (x & 7) : 1 << (x & 7)
    }
  }
  return out
}

/** Firmware ranges that take the explicit-size char block (`TextActivity.java:1951`). */
export const newTextFormat = (mcu?: number) =>
  mcu !== undefined &&
  ((mcu >= 1809 && mcu <= 1899) || (mcu >= 1412 && mcu <= 1499) ||
    (mcu >= 2100 && mcu <= 2699) || (mcu >= 2800 && mcu <= 5999))

/** Legacy size byte: 16/32/48/64 px high, odd when the cell is square. */
const sizeType = (g: Glyph) => (Math.min(4, Math.max(1, g.h / 16)) - 1) * 2 + (g.w * 2 === g.h ? 0 : 1)

export function charBlock(g: Glyph, rgb: [number, number, number], opts: { newFormat?: boolean; msbFirst?: boolean } = {}) {
  const bits = packGlyph(g, opts.msbFirst)
  const head = opts.newFormat ? [0x80, ...rgb, g.w, g.h] : [sizeType(g), ...rgb]
  const out = new Uint8Array(head.length + bits.length)
  out.set(head)
  out.set(bits, head.length)
  return out
}

export type TextOpts = {
  rgb: [number, number, number]
  /** 0 fixed, 1 left, 2 right, 3 up, 4 down, 5 blink, 6 breath, 7 snow, 8 laser */
  effect: number
  /** 0..100 */
  speed: number
  newFormat?: boolean
  msbFirst?: boolean
}

/** Text window content: 14-byte header (`ITextProcess.getTextHead`) then one block per glyph. */
export function textPayload(glyphs: Glyph[], o: TextOpts): Uint8Array {
  const n = glyphs.length
  const head = [n & 0xff, n >> 8, 1, 1, o.effect & 0xff, Math.max(0, Math.min(100, Math.round(o.speed))), 1, ...o.rgb, 0, 0, 0, 0]
  const blocks = glyphs.map((g) => charBlock(g, o.rgb, o))
  const out = new Uint8Array(head.length + blocks.reduce((s, b) => s + b.length, 0))
  out.set(head)
  let at = head.length
  for (const b of blocks) {
    out.set(b, at)
    at += b.length
  }
  return out
}
