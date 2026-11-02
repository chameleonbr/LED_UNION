import type { Caps, CustomEffectSpec, Driver, Effect } from './types.ts'
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
  ENABLE_HW_AUDIO: 0x8b,
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

/**
 * Speed and brightness travel in one command, so changing one means resending the
 * other. Keyed per device: two BLEDIM controllers must not share one memory, or
 * setting brightness on one would push it onto the other.
 *
 * Defaults match the app's own ScenePara constructor.
 */
type DeviceState = {
  speed: number
  brightness: number
  strobe: number
  /** Last static colour sent, unscaled, or undefined while an effect is playing. */
  color?: { r: number; g: number; b: number; w: number }
}
const states = new Map<string, DeviceState>()
const stateFor = (name: string): DeviceState => {
  let s = states.get(name)
  if (!s) {
    s = { speed: 192, brightness: 255, strobe: 0 }
    states.set(name, s)
  }
  return s
}

/** 255 means "no stored scene" — i.e. apply live rather than editing a saved one. */
const FREE_SCENE = 0xff

function speedBrightness(name: string, commit = true): Uint8Array {
  const s = stateFor(name)
  return frame(CMD.SPEED_BRIGHTNESS, [
    FREE_SCENE,
    commit ? 1 : 0,
    s.speed,
    s.brightness,
    s.strobe,
    0,
  ])
}

const SCENE_PARA_SIZE = 72
/** ScenePara.MAX_COLOR_QTY in the original app. */
const MAX_COLOR_QTY = 14

type Rgb = { r: number; g: number; b: number }
const c = (r: number, g: number, b: number): Rgb => ({ r, g, b })
const RAINBOW = [c(255, 0, 0), c(0, 255, 0), c(0, 0, 255), c(255, 255, 0), c(255, 0, 255), c(0, 255, 255), c(255, 255, 255)]
const RGB3 = RAINBOW.slice(0, 3)
const BLACK = c(0, 0, 0)
/** FlushDynamicColor's "with black" flag: a dark step after every colour. */
const gaps = (cs: Rgb[]) => cs.flatMap((x) => [x, BLACK])

/**
 * On PWM wiring (DIM, CCT, RGB, RGBW) the app has no effect ids: its effect buttons are
 * colour-list scenes, jump or fade, from MyData.Flush3CHScenes. Byte 14's mode index
 * belongs to addressable chase mode, which this driver does not offer; a PWM controller
 * ignores it. The first six are the app's own; the last two use the same builder.
 */
const PRESETS: Array<{ name: string; fade: boolean; colors: Rgb[]; strobe?: number }> = [
  { name: 'Jump 7 colours', fade: false, colors: RAINBOW },
  { name: 'Flash 3 colours', fade: false, colors: gaps(RGB3) },
  { name: 'Fade 3 colours', fade: true, colors: RGB3 },
  { name: 'Pulse 7 colours', fade: true, colors: gaps(RAINBOW) },
  { name: 'Breathe red', fade: true, colors: gaps([RAINBOW[0]]) },
  // FlushTwoColor(0, red, blue, 1, 255): the 255 lands on the strobe byte.
  { name: 'Police', fade: false, colors: gaps([RAINBOW[0], RAINBOW[2]]), strobe: 255 },
  { name: 'Jump 3 colours', fade: false, colors: RGB3 },
  { name: 'Fade 7 colours', fade: true, colors: RAINBOW },
]

export const effects: Effect[] = PRESETS.map((p, id) => ({ id, name: p.name }))

/** A colour-list scene: what both the built-in effects and custom sequences send. */
function listScene(name: string, colors: Rgb[], fade: boolean, strobe?: number): Uint8Array {
  const s = stateFor(name)
  const list = colors.slice(0, MAX_COLOR_QTY)
  const p = new Array(SCENE_PARA_SIZE).fill(0)
  p[0] = fade ? 1 : 0
  p[1] = s.speed
  p[2] = s.brightness
  p[3] = list.length
  // Offset 4 is the scene slot, and the app zeroes it on every buffer it builds.
  // Not to be confused with the 0x88 command's own scene field, which uses 255.
  p[6] = strobe ?? s.strobe
  // Byte 14 stays 0, as in every PWM scene the app builds.
  list.forEach((x, i) => {
    const o = 16 + i * 4
    p[o] = 0 // white channel
    p[o + 1] = byte(x.r)
    p[o + 2] = byte(x.g)
    p[o + 3] = byte(x.b)
  })
  return frame(CMD.IMMEDIATE_SCENE, p)
}

/**
 * One colour, no effect — ScenePara.FlushStaticBuf.
 *
 * Speed 192 and brightness 255 are what the app hard-codes for a static colour; its
 * colour screen has no brightness slider, so brightness is baked into the RGB value
 * instead. Slot 0, the same slot the app's own colour buttons write.
 */
function staticScene(r: number, g: number, b: number, w: number): Uint8Array {
  const p = new Array(SCENE_PARA_SIZE).fill(0)
  p[1] = 192
  p[2] = 255
  p[3] = 1 // one colour entry
  // Colour entries start at 16 and are [W, R, G, B].
  p[16] = byte(w)
  p[17] = byte(r)
  p[18] = byte(g)
  p[19] = byte(b)
  return frame(CMD.IMMEDIATE_SCENE, p)
}

/** The remembered static colour at the remembered brightness, never compounding. */
function scaledStatic(s: DeviceState): Uint8Array {
  const c = s.color!
  const k = s.brightness / 255
  return staticScene(byte(c.r * k), byte(c.g * k), byte(c.b * k), byte(c.w * k))
}

export const bledim: Driver = {
  id: 'bledim',
  keysStateByName: true,
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
    custom: true,
    sensitivity: true,
  }),

  effects: () => effects,

  onConnect: (_name, now) => [serialCodeFrame(now)],

  power: (on) => frame(CMD.ONOFF, [on ? 1 : 0]),

  /**
   * A static colour is sent as a one-colour scene, not as 0x81.
   *
   * 0x81 (selectColor) is the app's live preview while the colour wheel is dragged —
   * the controller lights it but does not keep it. What survives a power cycle is the
   * scene, which is why the app's Save button packs a ScenePara and sends 0x82. Using
   * 0x81 alone left the controller booting back to its stored slot, and the app seeds
   * slot 0 white (MyData: FlushStaticBuf(255, 255, 255, 0)).
   *
   * The shape is ScenePara.FlushStaticBuf: one colour, no effect, speed 192.
   */
  rgb(r, g, b, name) {
    const s = stateFor(name)
    s.color = { r: byte(r), g: byte(g), b: byte(b), w: 0 }
    return scaledStatic(s)
  },

  // On RGB-only wiring there is no white channel, so a white-only scene reads as off.
  // The card sends r = g = b there instead; this is for the wirings that do have one.
  // Remembered like a colour, or a later brightness change would bring the old RGB back.
  white(v, name) {
    const s = stateFor(name)
    s.color = { r: 0, g: 0, b: 0, w: from100(v) }
    return scaledStatic(s)
  },

  /**
   * The original app has no brightness slider on its colour screen: brightness there is
   * baked into the RGB value, and 0x88 belongs to the effects screen. So with a static
   * colour showing, scale the colour; otherwise drive the effect.
   */
  brightness(v, name) {
    const s = stateFor(name)
    s.brightness = from100(v)
    return s.color ? scaledStatic(s) : speedBrightness(name)
  },

  speed(v, name) {
    stateFor(name).speed = from100(v)
    return speedBrightness(name)
  },

  effect(e, name) {
    delete stateFor(name).color
    const p = PRESETS[clamp(e.id, 0, PRESETS.length - 1)]
    return listScene(name, p.colors, p.fade, p.strobe)
  },

  /**
   * A whole colour sequence fits in one scene frame: the structure already carries up
   * to MAX_COLOR_QTY = 14 entries, plus the fade flag and speed. No upload dance.
   */
  customEffect(spec, name): Uint8Array[] {
    if (spec.colors.length === 0) return []
    delete stateFor(name).color
    return [listScene(name, spec.colors, spec.fade)]
  },

  /** This family toggles its hardware microphone explicitly. */
  soundEnable: (on) => frame(CMD.ENABLE_HW_AUDIO, [on ? 1 : 0, 0, 0, 0]),

  soundSensitivity: (v) => frame(CMD.AUDIO_SENSE, [from100(v)]),
}

/** Tells the controller how its outputs are wired: 1=DIM 2=CCT 3=RGB 4=RGBW. */
export const switchChannelsFrame = (qty: number) =>
  frame(CMD.SWITCH_CHANNELS, [clamp(qty, 1, 4)])

/** Asks the controller to report power, scene count, channel count and stored scenes. */
export const readInfoFrame = (selector = 0) => frame(CMD.READ_INFO, [selector])

export const audioSenseFrame = (v: number) => frame(CMD.AUDIO_SENSE, [from100(v)])
