import type { Caps, DeviceReport, Driver, PanelInfo } from './types.ts'
import { clamp, pct } from './types.ts'

// Protocol: docs/protocol/ipixel.md
// iPixel Color LED matrices (LED_BLE_*). Frames are [len_lo len_hi cmd type payload…],
// len counting itself. The panel answers on its own notify characteristic, which is how
// the app learns the matrix size: the advertised name does not carry it.

const SERVICE = '000000fa-0000-1000-8000-00805f9b34fb'
const WRITE_CHAR = '0000fa02-0000-1000-8000-00805f9b34fb'
const NOTIFY_CHAR = '0000fa03-0000-1000-8000-00805f9b34fb'

const f = (...b: number[]) => new Uint8Array(b)
const none = () => new Uint8Array(0)

/** Device type byte (device-info reply, offset 4) to width × height. ipixel.md §3. */
export const PANEL_SIZES: Record<number, [number, number]> = {
  0x00: [64, 64], 0x80: [64, 64], 0x81: [32, 32], 0x82: [32, 16], 0x83: [64, 16],
  0x84: [96, 16], 0x85: [64, 20], 0x86: [128, 32], 0x87: [144, 16], 0x88: [192, 16],
  0x89: [48, 24], 0x8a: [64, 32], 0x8b: [96, 32], 0x8c: [128, 32], 0x8d: [96, 32],
  0x8e: [160, 32], 0x8f: [192, 32], 0x90: [256, 32], 0x91: [320, 32], 0x92: [384, 32],
  0x93: [448, 32], 0x94: [16, 16], 0x95: [64, 64], 0x96: [96, 64], 0x97: [128, 64],
  0x98: [160, 64], 0x99: [192, 64], 0x9a: [256, 64], 0x9b: [320, 64], 0x9c: [384, 64],
  0x9d: [448, 64], 0x9e: [512, 64], 0x9f: [576, 64], 0xa0: [640, 64],
}

/**
 * Read the device-info reply. Command acks arrive on the same characteristic
 * (`05 00 08 80 01` after show-slot), so only a frame echoing the query's `01 80` counts;
 * reading byte 4 of an ack would wipe a known size.
 */
export function parseDeviceInfo(d: Uint8Array): PanelInfo | undefined {
  if (d.length < 5 || d[2] !== 0x01 || d[3] !== 0x80) return undefined
  const type = d[4]
  const size = PANEL_SIZES[type]
  return {
    type,
    ...(size && { width: size[0], height: size[1] }),
    ...(d.length > 10 && { locked: d[10] === 1 }),
  }
}

/** HW-info reply `08 00 05 80 <major> <minor> …` → major*100 + minor (`OtaUpData.java`). */
export function parseHwInfo(d: Uint8Array): number | undefined {
  if (d.length < 6 || d[2] !== 0x05 || d[3] !== 0x80) return undefined
  return d[4] * 100 + d[5]
}

const CAPS: Caps = {
  rgb: false, white: false, cct: false, speed: false, effects: false,
  scenes: false, custom: false, sensitivity: false,
}

export const ipixel: Driver = {
  id: 'ipixel',
  label: 'iPixel',
  service: SERVICE,
  writeChar: WRITE_CHAR,
  notifyChar: NOTIFY_CHAR,
  namePrefix: 'LED_BLE',
  // The vendor brightness slider sends at most every 100 ms.
  minGapMs: 100,
  writeWithResponse: true,
  // The vendor app's 509 needs MTU 512, which the browser neither grants on request nor
  // reports; 244 fits the common 247 and is what the reference clients use.
  chunkSize: 244,

  matches: (name) => name.includes('LED_BLE'),
  caps: () => CAPS,
  effects: () => [],

  // Device info doubles as the clock sync; lang 00 = not Chinese. HW info gives the
  // firmware version, which picks the text format.
  onConnect: (_name, now = new Date()) => [
    f(0x08, 0x00, 0x01, 0x80, now.getHours(), now.getMinutes(), now.getSeconds(), 0x00),
    f(0x04, 0x00, 0x05, 0x80),
  ],
  onNotify: (d): DeviceReport | undefined => {
    const mcu = parseHwInfo(d)
    if (mcu !== undefined) return { mcu }
    const panel = parseDeviceInfo(d)
    return panel && { panel }
  },

  power: (on) => f(0x05, 0x00, 0x07, 0x01, on ? 1 : 0),
  // The vendor slider floors at 10; below that the panel goes dark rather than dim.
  brightness: (v) => f(0x05, 0x00, 0x04, 0x80, clamp(pct(v), 10, 100)),
  // No solid colour, speed or effect list on these panels (BR-21): nothing to send.
  rgb: none,
  speed: none,
  effect: none,

  showSlot: (slot) => f(0x07, 0x00, 0x08, 0x80, 0x01, 0x00, clamp(slot, 1, 255)),
  orientation: (v) => f(0x05, 0x00, 0x06, 0x80, clamp(v, 0, 3)),
  deleteAll: () => f(0x04, 0x00, 0x03, 0x80),
}
