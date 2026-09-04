import type { Caps, Driver, Effect } from './types.ts'
import { byte, pct } from './types.ts'
import effects from './effects.ts'

// Protocol: docs/protocol/ledble.md
// Every family in the LED+LAMP app shares one characteristic and differs only in
// the envelope and the byte layout, selected by the advertised name prefix.

const SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb'
const WRITE_CHAR = '0000ffe1-0000-1000-8000-00805f9b34fb'

const DEFAULT_PASSWORD = [0xa1, 0x23, 0x45, 0x67]

const f = (...b: number[]) => new Uint8Array(b)

/**
 * Three wire layouts:
 *  - `ble`   `7E … EF`, the LEDBLE/LEDSTAGE/LEDLIGHT/LEDCAR-00 family
 *  - `dmx`   `7B FF <cmd> … BF`, LEDDMX-00/01/03 and LEDCAR-01
 *  - `dmxs`  `7B <cmd> … BF`, LEDDMX-02/04 and LEDCAR-02 — the `FF` filler is
 *            dropped and every parameter shifts one byte left
 *
 * LEDCAR-01 is dual-protocol in the original app (a runtime flag picks `7E` or
 * `7B`); we default it to `dmx`, which is what the DMX-capable hardware expects.
 */
type Layout = 'ble' | 'dmx' | 'dmxs'

export function layoutFor(name: string): Layout {
  if (/^(LEDDMX-0[24]|LEDCAR-02)/i.test(name)) return 'dmxs'
  if (/^(LEDDMX|LEDCAR-01)/i.test(name)) return 'dmx'
  return 'ble'
}

// LEDSTAGE and LEDLIGHT use a different power frame than the rest of the 7E family.
const isStage = (name: string) => /^(LEDSTAGE|LEDLIGHT)/i.test(name)

/**
 * The controller ignores every command until it gets this frame. The original app
 * sends it 300 ms after connecting.
 *
 * `weekIndex` follows java.util.Calendar.DAY_OF_WEEK remapped as
 * {Sun:7, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6}.
 */
export function authFrame(now = new Date(), password = DEFAULT_PASSWORD): Uint8Array {
  const day = now.getDay() // 0 = Sunday
  const weekIndex = day === 0 ? 7 : day
  const tb = ((weekIndex << 5) | now.getHours()) & 0xff
  return f(0x2a, 0x02, ...password, tb, now.getMinutes(), 0xaf)
}

/** Asks the controller to report password status. Also what enables notifications. */
export const passwordQueryFrame = () =>
  f(0x2a, 0x05, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xaf)

/** The `7B FF` family sends brightness twice: scaled to 0..32, then raw. */
const scale32 = (v: number) => Math.round((pct(v) * 32) / 100)

export const ffe0: Driver = {
  id: 'ffe0',
  label: 'LEDBLE / LEDDMX / LEDCAR',
  service: SERVICE,
  writeChar: WRITE_CHAR,
  minGapMs: 50,
  hasChannels: true,

  // Names in the wild use both LEDBLE-xx and LED_BLE_xx.
  matches: (name) =>
    /^(LED[_ ]?BLE|LEDSTAGE|LEDLIGHT|LEDDMX|LEDCAR)/i.test(name),

  caps: (name): Caps => ({
    rgb: true,
    white: layoutFor(name) === 'dmxs',
    cct: layoutFor(name) !== 'dmx',
    speed: true,
    effects: true,
    scenes: false,
  }),

  effects(name): Effect[] {
    if (/^LEDDMX/i.test(name)) return effects.leddmx
    if (/^LEDCAR/i.test(name)) return effects.ledcar
    return effects.ledble
  },

  onConnect: (_name, now) => [authFrame(now)],

  power(on, name, ch) {
    const v = on ? 0x01 : 0x00
    switch (layoutFor(name)) {
      case 'dmxs':
        return f(0x7b, 0x04, v, 0xff, 0xff, 0xff, 0xff, 0xff, 0xbf)
      case 'dmx':
        return f(0x7b, 0x04, 0x04, v, 0xff, 0xff, 0xff, 0xff, 0xbf)
      default:
        return isStage(name)
          ? f(0x7e, 0xff, 0x04, v, 0xff, 0xff, 0xff, 0xff, 0xef)
          : f(0x7e, 0xff, 0x04, v, 0x00, 0xff, 0xff, ch ?? 0x00, 0xef)
    }
  },

  rgb(r, g, b, name, ch) {
    const [R, G, B] = [byte(r), byte(g), byte(b)]
    switch (layoutFor(name)) {
      case 'dmxs':
        // Byte 6 is the white channel; 0 keeps it out of the mix.
        return f(0x7b, 0x07, R, G, B, 0x00, 0xff, 0xff, 0xbf)
      case 'dmx':
        return f(0x7b, 0xff, 0x07, R, G, B, 0x00, 0xff, 0xbf)
      default:
        return f(0x7e, 0xff, 0x05, 0x03, R, G, B, ch ?? 0xff, 0xef)
    }
  },

  brightness(v, name, ch) {
    const b = pct(v)
    switch (layoutFor(name)) {
      case 'dmxs':
        return f(0x7b, 0x01, b, 0x00, 0xff, 0xff, 0xff, 0xff, 0xbf)
      case 'dmx':
        return f(0x7b, 0xff, 0x01, scale32(b), b, 0x00, 0xff, 0xff, 0xbf)
      default:
        return f(0x7e, 0xff, 0x01, b, 0x00, 0xff, 0xff, ch ?? 0xff, 0xef)
    }
  },

  speed(v, name, ch) {
    const s = pct(v)
    switch (layoutFor(name)) {
      case 'dmxs':
        return f(0x7b, 0x02, s, 0x00, 0xff, 0xff, 0xff, 0xff, 0xbf)
      case 'dmx':
        return f(0x7b, 0xff, 0x02, s, 0xff, 0x00, 0xff, 0xff, 0xbf)
      default:
        return f(0x7e, 0xff, 0x02, s, 0x00, 0xff, 0xff, ch ?? 0xff, 0xef)
    }
  },

  effect(e, name, ch) {
    const id = byte(e.id)
    switch (layoutFor(name)) {
      case 'dmxs':
        return f(0x7b, 0x13, id, 0xff, 0xff, 0xff, 0xff, 0xff, 0xbf)
      case 'dmx':
        return f(0x7b, 0xff, 0x13, id, 0xff, 0xff, 0xff, 0xff, 0xbf)
      default:
        return f(0x7e, 0x00, 0x0e, id, 0xff, 0xff, 0xff, ch ?? 0xff, 0xef)
    }
  },

  white(v, name) {
    // Only the shifted DMX layout carries a dedicated white byte in the rgb frame.
    if (layoutFor(name) === 'dmxs') {
      return f(0x7b, 0x07, 0x00, 0x00, 0x00, pct(v), 0xff, 0xff, 0xbf)
    }
    return f(0x7e, 0xff, 0x05, 0x01, pct(v), 0xff, 0xff, 0xff, 0xef)
  },

  cct(warm, cool, name) {
    if (layoutFor(name) === 'dmxs') {
      return f(0x7b, 0x0a, pct(cool), 0xff, 0xff, 0xff, 0xff, 0xff, 0xbf)
    }
    return f(0x7e, 0xff, 0x05, 0x02, pct(warm), pct(cool), 0xff, 0xff, 0xef)
  },
}
