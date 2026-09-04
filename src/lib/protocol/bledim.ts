import type { Caps, Driver, Effect } from './types.ts'
import { byte, clamp, pct } from './types.ts'

// Protocol: docs/protocol/bledim.md
// Shares the FFF0 service with the ELK/MELK family and nothing else: variable-length
// packets, a real checksum, and 0..255 ranges instead of 0..100.

const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb'
// Same characteristic carries writes and notifications.
const WRITE_CHAR = '0000fff1-0000-1000-8000-00805f9b34fb'

const CMD = {
  ONOFF: 0x80,
  SELECT_COLOR: 0x81,
  IMMEDIATE_SCENE: 0x82,
  SWITCH_CHANNELS: 0x86,
  READ_INFO: 0x87,
  SPEED_BRIGHTNESS: 0x88,
  SERIAL_CODE: 0x89,
  AUDIO_SENSE: 0x8c,
} as const

/** Free-running packet counter. The device does not validate it. */
let seq = 0

/**
 * `55 AA <seq> <cmd> <lenHi> <lenLo> <payload…> <checksum>`
 *
 * Length counts the payload only, big-endian. The checksum is a plain additive sum
 * of every byte before it — sync bytes and header included — truncated to 8 bits.
 */
export function frame(cmd: number, payload: number[] = []): Uint8Array {
  const len = payload.length
  const out = new Uint8Array(6 + len + 1)
  out[0] = 0x55
  out[1] = 0xaa
  out[2] = seq++ & 0xff
  out[3] = cmd
  out[4] = (len >> 8) & 0xff
  out[5] = len & 0xff
  out.set(payload.map(byte), 6)
  let sum = 0
  for (let i = 0; i < out.length - 1; i++) sum += out[i]
  out[out.length - 1] = sum & 0xff
  return out
}

/**
 * The app derives a password from the current clock and expects the device to echo a
 * value derived from it. That check is enforced on the phone side only — nothing shows
 * the device refusing unauthenticated commands — but sending it keeps us honest with
 * what the original app does, and it is what makes the device report its state back.
 */
export function serialCodeFrame(now = new Date()): Uint8Array {
  return frame(CMD.SERIAL_CODE, [now.getSeconds(), now.getMilliseconds() & 0xff])
}

/** This family speaks 0..255; the Driver interface speaks percent. */
const from100 = (v: number) => Math.round((pct(v) * 255) / 100)

// Speed and brightness travel in one command, so the last value of each has to be
// remembered to change one without resetting the other.
const state = { speed: 192, brightness: 255, strobe: 0 }

/** 255 means "no stored scene" — i.e. apply live rather than editing a saved one. */
const FREE_SCENE = 0xff

function speedBrightness(commit = true): Uint8Array {
  return frame(CMD.SPEED_BRIGHTNESS, [
    FREE_SCENE,
    commit ? 1 : 0,
    state.speed,
    state.brightness,
    state.strobe,
    0,
  ])
}

/**
 * The 13 built-in effects. The app has no names for them — its own UI labels them
 * M1..M13 from the index — so we do the same rather than inventing names.
 */
export const effects: Effect[] = Array.from({ length: 13 }, (_, i) => ({
  id: i,
  name: `M${i + 1}`,
}))

const SCENE_PARA_SIZE = 72

/**
 * An effect is applied by sending a whole 72-byte scene description, not an id.
 * Everything not named here stays zero, which is what the app sends for a freshly
 * built scene.
 */
function sceneFrame(effectId: number, r = 255, g = 255, b = 255): Uint8Array {
  const p = new Array(SCENE_PARA_SIZE).fill(0)
  p[0] = 0 // fade off
  p[1] = state.speed
  p[2] = state.brightness
  p[3] = 1 // one colour entry
  p[4] = FREE_SCENE
  p[6] = state.strobe
  // Low 7 bits are the effect index; bit 7 turns the chase/dynamic mode on.
  p[14] = (clamp(effectId, 0, 0x7f) | 0x80) & 0xff
  // Colour entries start at 16 and are [W, R, G, B].
  p[16] = 0
  p[17] = byte(r)
  p[18] = byte(g)
  p[19] = byte(b)
  return frame(CMD.IMMEDIATE_SCENE, p)
}

export const bledim: Driver = {
  id: 'bledim',
  label: 'BLEDIM',
  service: SERVICE,
  writeChar: WRITE_CHAR,
  // The app sleeps 30 ms per chunk and never waits for onCharacteristicWrite, so the
  // gap is the only flow control the protocol has.
  minGapMs: 30,
  chunkSize: 20,
  writeWithResponse: true,
  hasChannels: true,
  // 1 = dimming, 2 = CCT, 3 = RGB, 4 = RGBW. This is a wiring mode, not an output
  // selector like LEDBLE's, so it is exposed separately rather than as a channel.
  channelValues: [1, 2, 3, 4],

  // "LanQianTech" is the other name genuine hardware advertises. "JDY-10" and
  // "Ble_Light" are the default names of bare BLE-UART modules; the original app
  // flags those as clones, so we simply do not claim them.
  matches: (name) => /^(BLEDIM|LanQianTech)$/i.test(name),

  caps: (): Caps => ({
    rgb: true,
    white: true,
    cct: false,
    speed: true,
    effects: true,
    scenes: false,
  }),

  effects: () => effects,

  onConnect: (_name, now) => [serialCodeFrame(now)],

  power: (on) => frame(CMD.ONOFF, [on ? 1 : 0]),

  // Payload order is W, R, G, B — white first.
  rgb: (r, g, b) => frame(CMD.SELECT_COLOR, [0, byte(r), byte(g), byte(b)]),

  white: (v) => frame(CMD.SELECT_COLOR, [from100(v), 0, 0, 0]),

  brightness(v) {
    state.brightness = from100(v)
    return speedBrightness()
  },

  speed(v) {
    state.speed = from100(v)
    return speedBrightness()
  },

  effect: (e) => sceneFrame(e.id),
}

/** Tells the controller how its outputs are wired: 1=DIM 2=CCT 3=RGB 4=RGBW. */
export const switchChannelsFrame = (qty: number) =>
  frame(CMD.SWITCH_CHANNELS, [clamp(qty, 1, 4)])

/** Asks the controller to report power, scene count, channel count and stored scenes. */
export const readInfoFrame = (selector = 0) => frame(CMD.READ_INFO, [selector])

export const audioSenseFrame = (v: number) => frame(CMD.AUDIO_SENSE, [from100(v)])
