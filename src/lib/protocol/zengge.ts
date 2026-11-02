import type { Advert, Caps, Driver, Effect } from './types.ts'
import { byte, pct } from './types.ts'

// Protocol: docs/protocol/zengge.md
// ZENGGE app (com.zengge.blev2), devices advertising as LEDnetWF<mac>. Every payload
// rides in a transport header with a per-device sequence number, and the payload ends
// in a sum-8 checksum. The model comes from the advertisement (product id), and it
// decides which command family the device takes.

const SERVICE = '0000ffff-0000-1000-8000-00805f9b34fb'
const WRITE_CHAR = '0000ff01-0000-1000-8000-00805f9b34fb'
const NOTIFY_CHAR = '0000ff02-0000-1000-8000-00805f9b34fb'

/** Company ids LEDnetWF devices advertise under: the 0x5A00..0x5AFF block. */
const COMPANY_IDS = Array.from({ length: 0x100 }, (_, i) => 0x5a00 + i)

/** cmdId 0x0B: a command the device does not answer (BleAppConnectionManager). */
const NO_REPLY = 0x0b

const sum8 = (b: number[]) => b.reduce((a, v) => a + v, 0) & 0xff
const ck = (...b: number[]) => [...b, sum8(b)]

/**
 * How a product takes colour and effects, from the product id table of the
 * lednetwf_ble project (which reads the same vendor json), cross-checked against the
 * app's Java builders.
 *
 * simple: 0x31 RGB with brightness baked in, 0x61 effects 37..56 with inverted speed.
 * simple38: 0x31 RGB, but effects go through 0x38 with ids we could not pin down.
 * symphony: 0x3B HSV colour, 0x42 effects 1..100 (addressable strip controllers).
 * ring53: 0x3B HSV colour, 0x38 effects 1..113 without checksum.
 * white: no colour channel; 0x31 warm/cool only.
 */
type Kind = 'simple' | 'simple38' | 'symphony' | 'ring53' | 'white' | 'dim' | 'switch'

const KINDS: Record<Kind, number[]> = {
  simple: [4, 6, 7, 16, 26, 27, 32, 37, 38, 39, 41, 14, 30, 53, 59, 68, 72],
  simple38: [8, 51, 60, 84, 91],
  symphony: [86, 128, 161, 162, 163, 164, 166, 167, 169, 170, 171, 172, 173],
  ring53: [29, 83],
  white: [9, 22, 28, 82, 98, 225, 226],
  dim: [23, 33, 65],
  switch: [11, 147, 148, 149, 150, 151],
}
const kindOf = (product?: number): Kind | undefined =>
  product === undefined
    ? undefined
    : (Object.keys(KINDS) as Kind[]).find((k) => KINDS[k].includes(product))

/** Products with a warm-white channel next to RGB, and the ones that also have cool white. */
const HAS_WW = [4, 6, 7, 14, 30, 32, 37, 38, 39, 41, 53, 59, 68, 72, 84, 29, 83]
const HAS_CW = [7, 14, 30, 37, 41, 53, 59, 29, 83]

const SIMPLE_EFFECTS = [
  'Seven color cross fade', 'Red gradual change', 'Green gradual change',
  'Blue gradual change', 'Yellow gradual change', 'Cyan gradual change',
  'Purple gradual change', 'White gradual change', 'Red/green cross fade',
  'Red/blue cross fade', 'Green/blue cross fade', 'Seven color strobe flash',
  'Red strobe flash', 'Green strobe flash', 'Blue strobe flash', 'Yellow strobe flash',
  'Cyan strobe flash', 'Purple strobe flash', 'White strobe flash',
  'Seven color jumping change',
].map((name, i): Effect => ({ id: 37 + i, name }))

// The vendor ships these as numbers only.
const numbered = (n: number): Effect[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `M${i + 1}` }))
const SYMPHONY_EFFECTS = numbered(100)
const RING_EFFECTS = numbered(113)

type DeviceState = {
  /** From the advertisement; undefined until one was heard. */
  product?: number
  bleVersion?: number
  ledVersion?: number
  seq: number
  color?: { r: number; g: number; b: number }
  white?: { ww: number; cw: number }
  effect?: number
  brightness: number
  speed: number
}
const states = new Map<string, DeviceState>()
const stateFor = (name: string): DeviceState => {
  let s = states.get(name)
  if (!s) {
    s = { seq: 0, brightness: 100, speed: 50 }
    states.set(name, s)
  }
  return s
}

/**
 * The transport header (LowerTransportLayerEncoder). Version 0 is 8 bytes; devices
 * with BLE version 8 or later take version 1, which widens the length field. Our
 * payloads always fit one segment, so the segment field is the "last" marker 80 00.
 */
function wrap(s: DeviceState, payload: number[], cmdId = NO_REPLY): Uint8Array {
  // The app starts each device at 1 and wraps at 8 bits (SequenceUtils).
  s.seq = (s.seq + 1) & 0xff
  const n = payload.length
  const head = (s.bleVersion ?? 0) >= 8
    ? [0x01, s.seq, 0x80, 0x00, n >> 8, n & 0xff, (n + 1) >> 8, (n + 1) & 0xff, cmdId]
    : [0x00, s.seq, 0x80, 0x00, n >> 8, n & 0xff, (n + 1) & 0xff, cmdId]
  return new Uint8Array([...head, ...payload])
}

/** Hue 0..360, saturation and value 0..100, rounded the way Android's colorToHSV + round does. */
function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h: Math.round(h) % 360, s: max ? Math.round((d / max) * 100) : 0, v: Math.round((max / 255) * 100) }
}

/** HSV colour types: the app's own 0x3B family, and anything we have no table entry for. */
const usesHsv = (s: DeviceState) => {
  const k = kindOf(s.product)
  // Product 39 on BLE 5+ moves to the unified protocol (uses_color_v2).
  if (s.product === 39 && (s.bleVersion ?? 0) >= 5) return true
  return k === undefined || k === 'symphony' || k === 'ring53'
}

function colorPayload(s: DeviceState): number[] {
  const { r, g, b } = s.color!
  if (usesHsv(s)) {
    // 3B A1 hue:sat value, then params, a 24-bit fade time and a 16-bit gradient, all
    // zero as the app sends them (Protocol/d.java). A non-zero time makes it fade slowly.
    const c = hsv(r, g, b)
    // A dim but lit colour must not round down to 0, which reads as off.
    const v = c.v && s.brightness ? Math.max(1, Math.round((c.v * s.brightness) / 100)) : 0
    const hs = (c.h << 7) | c.s
    return ck(0x3b, 0xa1, hs >> 8, hs & 0xff, v, 0, 0, 0, 0, 0, 0, 0)
  }
  const k = (v: number) => Math.round((v * s.brightness) / 100)
  // 31 R G B WW CW mask persist: F0 = colour channels only, 0F = do not save.
  return ck(0x31, k(r), k(g), k(b), 0x00, 0x00, 0xf0, 0x0f)
}

function whitePayload(s: DeviceState): number[] {
  const k = (v: number) => Math.round((v * 255 * s.brightness) / 10000)
  // 0F in the mask byte: white channels only.
  return ck(0x31, 0x00, 0x00, 0x00, k(s.white!.ww), k(s.white!.cw), 0x0f, 0x0f)
}

function effectPayload(s: DeviceState): number[] | undefined {
  const id = s.effect!
  switch (kindOf(s.product)) {
    case 'simple':
      // 0x61 has no brightness byte; speed runs 1 (fast) .. 31 (slow).
      return ck(0x61, id, 1 + Math.round(30 * (1 - s.speed / 100)), 0x0f)
    case 'symphony':
      return ck(0x42, id, s.speed, Math.max(1, s.brightness))
    case 'ring53':
      // This one family carries no checksum: the last byte is brightness.
      return [0x38, id, s.speed, Math.max(1, s.brightness)]
  }
  return undefined
}

const send = (s: DeviceState, p: number[] | undefined) => (p ? wrap(s, p) : new Uint8Array())

type AdInfo = { bleVersion: number; product: number; ledVersion: number }

/**
 * Where the model lives in the advertisement (ZGHBDevice.newDevice). Newer firmware
 * puts the header in service data under FFFF (16 or 29 bytes, laid out like the raw
 * record: status, company, BLE version at 3, product at 10..11, LED version at 13) and
 * moves state into the manufacturer record. Older firmware has only the manufacturer
 * record: exactly 27 bytes after the company id, BLE version at 1, product at 8..9,
 * LED version at 11. Anything else is left unread, which keeps the safe defaults.
 */
export function parseAdvert(ad: Advert): AdInfo | undefined {
  const sd = ad.serviceData.get(SERVICE)
  if (sd && (sd.byteLength === 16 || sd.byteLength === 29)) {
    return { bleVersion: sd.getUint8(3), product: sd.getUint16(10), ledVersion: sd.getUint8(13) }
  }
  for (const [id, dv] of ad.manufacturerData) {
    if (!COMPANY_IDS.includes(id) || dv.byteLength !== 27) continue
    // IOTBT units reuse the block with a power byte at 1 and product 0: another protocol.
    const product = dv.getUint16(8)
    if (product === 0 && (dv.getUint8(1) === 0x23 || dv.getUint8(1) === 0x24)) return undefined
    return { bleVersion: dv.getUint8(1), product, ledVersion: dv.getUint8(11) }
  }
  return undefined
}

export const zengge: Driver = {
  id: 'zengge',
  label: 'ZENGGE (LEDnetWF)',
  service: SERVICE,
  writeChar: WRITE_CHAR,
  notifyChar: NOTIFY_CHAR,
  minGapMs: 30,
  // No keysStateByName: every name embeds the MAC, so it is already per device, and
  // the UI asks caps() and effects() by the plain name.
  manufacturerIds: COMPANY_IDS,

  matches: (name) => /^LEDnetWF/i.test(name),
  namePrefix: 'LEDnetWF',

  onAdvert(name, ad) {
    const info = parseAdvert(ad)
    if (info) Object.assign(stateFor(name), info)
  },

  caps(name): Caps {
    const s = stateFor(name)
    const k = kindOf(s.product)
    const colour = k !== 'white' && k !== 'dim' && k !== 'switch'
    const ww = HAS_WW.includes(s.product ?? -1)
    return {
      rgb: colour,
      white: (ww && !usesHsv(s)) || k === 'white',
      cct: k === 'white' || (HAS_CW.includes(s.product ?? -1) && !usesHsv(s)),
      speed: k === 'simple' || k === 'symphony' || k === 'ring53',
      effects: k === 'simple' || k === 'symphony' || k === 'ring53',
      scenes: false,
      custom: false,
      sensitivity: false,
    }
  },

  effects(name): Effect[] {
    switch (kindOf(stateFor(name).product)) {
      case 'simple':
        return SIMPLE_EFFECTS
      case 'symphony':
        return SYMPHONY_EFFECTS
      case 'ring53':
        return RING_EFFECTS
    }
    return []
  },

  power(on, name) {
    const s = stateFor(name)
    const v = on ? 0x23 : 0x24
    // The app keeps 71 for LED firmware older than 5 (BaseDeviceInfo.E); the rest take
    // 3B with a 0.5 s fade (0x32 × 10 ms) in the 24-bit time field.
    if (s.ledVersion !== undefined && s.ledVersion < 5) return wrap(s, ck(0x71, v, 0x0f))
    return wrap(s, ck(0x3b, v, 0, 0, 0, 0, 0, 0, 0, 0x32, 0, 0))
  },

  rgb(r, g, b, name) {
    const s = stateFor(name)
    s.color = { r: byte(r), g: byte(g), b: byte(b) }
    delete s.white
    delete s.effect
    return wrap(s, colorPayload(s))
  },

  white(v, name) {
    const s = stateFor(name)
    s.white = { ww: pct(v), cw: 0 }
    delete s.color
    delete s.effect
    return wrap(s, whitePayload(s))
  },

  cct(warm, cool, name) {
    const s = stateFor(name)
    s.white = { ww: pct(warm), cw: pct(cool) }
    delete s.color
    delete s.effect
    return wrap(s, whitePayload(s))
  },

  brightness(v, name) {
    const s = stateFor(name)
    s.brightness = pct(v)
    if (s.color) return wrap(s, colorPayload(s))
    if (s.white) return wrap(s, whitePayload(s))
    if (s.effect !== undefined) return send(s, effectPayload(s))
    // Dimmer-only products: 3B 01 rescales whatever the device holds (bright_value_v2).
    if (kindOf(s.product) === 'dim') {
      return wrap(s, ck(0x3b, 0x01, 0, 0, s.brightness, 0, s.brightness, 0, 0, 0, 0, 0))
    }
    return new Uint8Array()
  },

  speed(v, name) {
    const s = stateFor(name)
    s.speed = pct(v)
    // Only a running effect has a speed; otherwise it waits for the next one.
    return s.effect !== undefined ? send(s, effectPayload(s)) : new Uint8Array()
  },

  effect(e, name) {
    const s = stateFor(name)
    s.effect = byte(e.id)
    delete s.color
    delete s.white
    return send(s, effectPayload(s))
  },
}
