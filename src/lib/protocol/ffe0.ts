import type { Caps, Driver, Effect } from './types.ts'
import { byte, pct } from './types.ts'
import effects from './effects.ts'

// Protocol: docs/protocol/ledble.md
// The LED+LAMP app covers many families behind one characteristic; this driver
// implements the plain LEDBLE `7E .. EF` layout. LEDDMX/LEDSMART/LEDSUN/LEDLIKE/LEDPHO
// use different headers and byte layouts — add them when a device turns up.

const SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb'
const WRITE_CHAR = '0000ffe1-0000-1000-8000-00805f9b34fb'

const DEFAULT_PASSWORD = [0xa1, 0x23, 0x45, 0x67]

const f = (...b: number[]) => new Uint8Array(b)

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

export const ffe0: Driver = {
  id: 'ffe0',
  label: 'LEDBLE',
  service: SERVICE,
  writeChar: WRITE_CHAR,
  minGapMs: 50,
  hasChannels: true,

  // Names in the wild use both LEDBLE-xx and LED_BLE_xx.
  matches: (name) => /^(LED[_ ]?BLE|LEDSTAGE|LEDLIGHT)/i.test(name),

  caps: (): Caps => ({
    rgb: true,
    white: true,
    cct: true,
    speed: true,
    effects: true,
    scenes: false,
  }),

  effects: (): Effect[] => effects.ledble,

  onConnect: (_name, now) => [authFrame(now)],

  power(on, name, ch) {
    const v = on ? 0x01 : 0x00
    return isStage(name)
      ? f(0x7e, 0xff, 0x04, v, 0xff, 0xff, 0xff, 0xff, 0xef)
      : f(0x7e, 0xff, 0x04, v, 0x00, 0xff, 0xff, ch ?? 0x00, 0xef)
  },

  rgb: (r, g, b, _name, ch) =>
    f(0x7e, 0xff, 0x05, 0x03, byte(r), byte(g), byte(b), ch ?? 0xff, 0xef),

  brightness: (v, _name, ch) =>
    f(0x7e, 0xff, 0x01, pct(v), 0x00, 0xff, 0xff, ch ?? 0xff, 0xef),

  speed: (v, _name, ch) =>
    f(0x7e, 0xff, 0x02, pct(v), 0x00, 0xff, 0xff, ch ?? 0xff, 0xef),

  white: (v) => f(0x7e, 0xff, 0x05, 0x01, pct(v), 0xff, 0xff, 0xff, 0xef),

  cct: (warm, cool) =>
    f(0x7e, 0xff, 0x05, 0x02, pct(warm), pct(cool), 0xff, 0xff, 0xef),

  effect: (e, _name, ch) =>
    f(0x7e, 0x00, 0x0e, byte(e.id), 0xff, 0xff, 0xff, ch ?? 0xff, 0xef),
}
