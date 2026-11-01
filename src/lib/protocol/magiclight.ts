import type { Caps, CustomEffectSpec, Driver, Effect } from './types.ts'
import { byte, pct } from './types.ts'

// Protocol: docs/protocol/magiclight.md
// Magic Light - BLE (com.Zengge.LEDBluetoothV2), the classic Zengge LEDENET byte
// family. Writes go to FFE5/FFE9, replies come back on FFE0/FFE4. Every frame is a
// fixed opcode and trailer byte; only type 4 bulbs carry a checksum.

const SERVICE = '0000ffe5-0000-1000-8000-00805f9b34fb'
const WRITE_CHAR = '0000ffe9-0000-1000-8000-00805f9b34fb'
const NOTIFY_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb'
const NOTIFY_CHAR = '0000ffe4-0000-1000-8000-00805f9b34fb'

const f = (...b: number[]) => new Uint8Array(b)

/** The app's built-in modes (v0/e.java), named as in its English strings.xml. */
const MODES = [
  'Seven color cross fade', 'Red gradual change', 'Green gradual change',
  'Blue gradual change', 'Yellow gradual change', 'Cyan gradual change',
  'Purple gradual change', 'White gradual change', 'Red green cross fade',
  'Red blue cross fade', 'Green blue cross fade', 'Seven color strobe flash',
  'Red strobe flash', 'Green strobe flash', 'Blue strobe flash', 'Yellow strobe flash',
  'Cyan strobe flash', 'Purple strobe flash', 'White strobe flash',
  'Seven color jumping change',
]
const EFFECTS: Effect[] = MODES.map((name, i) => ({ id: 0x25 + i, name }))

/**
 * The app has no brightness command for these: its colour screen bakes brightness into
 * the RGB, and an effect has none. So the last colour is kept per device and rescaled.
 */
type DeviceState = {
  /** Device type byte from the state reply; it picks the frame variant. */
  type?: number
  color?: { r: number; g: number; b: number }
  white?: number
  effect?: number
  /** The colour list playing, kept so a later speed change can resend it. */
  custom?: CustomEffectSpec
  brightness: number
  speed: number
}
const states = new Map<string, DeviceState>()
const stateFor = (name: string): DeviceState => {
  let s = states.get(name)
  if (!s) {
    s = { brightness: 100, speed: 50 }
    states.set(name, s)
  }
  return s
}

const scale = (v: number, s: DeviceState) => Math.round((byte(v) * s.brightness) / 100)

// LEDFunctionsFragment: round(slider/100 × 30), sent as 31 − that, so 1 is fastest.
const speedByte = (s: DeviceState) => 31 - Math.round((s.speed * 30) / 100)

function colorFrame(s: DeviceState): Uint8Array {
  const { r, g, b } = s.color!
  // LEDRGBFragment.k1: types 3 and 19 take the short form without the F0 mask.
  if (s.type === 3 || s.type === 19) return f(0x56, scale(r, s), scale(g, s), scale(b, s), 0x00, 0xaa)
  return f(0x56, scale(r, s), scale(g, s), scale(b, s), 0x00, 0xf0, 0xaa)
}

function whiteFrame(s: DeviceState): Uint8Array {
  const w = Math.round((pct(s.white!) * 255 * s.brightness) / 10000)
  // LEDSceneFragment.k1: type 4 is the only checksummed frame; 84/5 use the 5A mask.
  if (s.type === 4) {
    const fr = [0x31, 0x00, 0x00, 0x00, w, 0x00, 0x00]
    return f(...fr, fr.reduce((a, v) => a + v, 0) & 0xff)
  }
  if (s.type === 84 || s.type === 5) return f(0x56, 0x00, 0x00, 0x00, w, 0x5a, 0xaa)
  return f(0x56, 0x00, 0x00, 0x00, w, 0x0f, 0xaa)
}

const effectFrame = (s: DeviceState) => f(0xbb, s.effect!, speedByte(s), 0x44)

/**
 * One 53-byte frame (r0/g.java h): 16 colour slots, unused ones filled with the app's
 * 01 02 03 placeholder, then speed, the transition and FF 66.
 */
function customFrame(s: DeviceState): Uint8Array {
  const { colors, fade } = s.custom!
  const out = [0x99]
  for (let i = 0; i < 16; i++) {
    const c = colors[i]
    out.push(...(c ? [byte(c.r), byte(c.g), byte(c.b)] : [0x01, 0x02, 0x03]))
  }
  // 3A gradual, 3B jump (3C strobe is a jump through black, which the list can say).
  out.push(speedByte(s), fade ? 0x3a : 0x3b, 0xff, 0x66)
  return new Uint8Array(out)
}

/** Whatever was playing gives way to the new thing. */
const clear = (s: DeviceState) => {
  delete s.color
  delete s.white
  delete s.effect
  delete s.custom
}

export const magiclight: Driver = {
  id: 'magiclight',
  label: 'Magic Light (Zengge BLE)',
  service: SERVICE,
  writeChar: WRITE_CHAR,
  notifyService: NOTIFY_SERVICE,
  notifyChar: NOTIFY_CHAR,
  // The app splits long frames into 20-byte pieces 60 ms apart.
  chunkSize: 20,
  minGapMs: 60,
  keysStateByName: true,

  // The plain client takes these names; anything else is the timer client, of which
  // FluxBlue is the one seen in the wild. LEDBLE also matches ffe0, and the GATT probe
  // tells them apart.
  matches: (name) => /^(LEDBLE|LEDBlue|LEDSpeaker|LEDShoe|TIBURN|FluxBlue)/i.test(name),
  namePrefix: ['LEDBLE', 'LEDBlue', 'LEDSpeaker', 'LEDShoe', 'TIBURN', 'FluxBlue'],

  caps: (): Caps => ({
    rgb: true,
    white: true,
    cct: false,
    speed: true,
    effects: true,
    scenes: false,
    custom: true,
    sensitivity: false,
  }),

  effects: () => EFFECTS,

  // Asks for the state reply, whose type byte picks the frame variants above.
  onConnect: () => [f(0xef, 0x01, 0x77)],

  onNotify(d, name) {
    // 66 type power mode run speed R G B W version 99 (r0/g.java E).
    if (name && d.length >= 12 && d[0] === 0x66 && (d[11] === 0x99 || d[14] === 0x99)) {
      stateFor(name).type = d[1]
    }
    return undefined
  },

  power: (on) => f(0xcc, on ? 0x23 : 0x24, 0x33),

  rgb(r, g, b, name) {
    const s = stateFor(name)
    clear(s)
    s.color = { r: byte(r), g: byte(g), b: byte(b) }
    return colorFrame(s)
  },

  white(v, name) {
    const s = stateFor(name)
    clear(s)
    s.white = pct(v)
    return whiteFrame(s)
  },

  brightness(v, name) {
    const s = stateFor(name)
    s.brightness = pct(v)
    if (s.color) return colorFrame(s)
    if (s.white !== undefined) return whiteFrame(s)
    // An effect has no brightness byte here.
    return new Uint8Array()
  },

  speed(v, name) {
    const s = stateFor(name)
    s.speed = pct(v)
    // Only a running effect has a speed; otherwise it waits for the next one.
    if (s.effect !== undefined) return effectFrame(s)
    if (s.custom) return customFrame(s)
    return new Uint8Array()
  },

  effect(e, name) {
    const s = stateFor(name)
    clear(s)
    s.effect = byte(e.id)
    return effectFrame(s)
  },

  customEffect(spec, name): Uint8Array[] {
    if (spec.colors.length === 0) return []
    const s = stateFor(name)
    clear(s)
    s.custom = { colors: spec.colors.slice(0, 16), fade: spec.fade }
    return [customFrame(s)]
  },
}
