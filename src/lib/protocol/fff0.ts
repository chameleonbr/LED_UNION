import type { Caps, Driver, Effect } from './types.ts'
import { byte, pct } from './types.ts'
import effects from './effects.ts'

// Protocol: docs/protocol/elk-melk.md
// Magic Lantern (MELK-*) and Lotus Lantern (ELK-/XSL-/CLK-). Same 9-byte 7E..EF
// envelope on the same characteristic; they diverge only in the effect frame.

const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb'
const WRITE_CHAR = '0000fff3-0000-1000-8000-00805f9b34fb'

const f = (...b: number[]) => new Uint8Array(b)

const isMelk = (name: string) => /^MELK-/i.test(name)
// Lotus swaps 0x01 for 0xFF in the power frame on these.
const isIntro = (name: string) => /INTRO/i.test(name)

// LightMode selector in the brightness frame: ALL=0 RGB=1 W=2 CT=3, 255 = unspecified.
const LIGHT_MODE_ALL = 0xff

export const fff0: Driver = {
  id: 'fff0',
  label: 'ELK / MELK',
  service: SERVICE,
  writeChar: WRITE_CHAR,
  minGapMs: 5,

  // BLEDIM advertises this service too, but it is a dimmer/pixel controller from
  // another product line — the frames below are unverified on it. See docs/protocol/bledim.md.
  matches: (name) => /^(MELK-|ELK[-~_]|XSL-|CLK-|BLEDIM)/i.test(name),

  caps(name): Caps {
    return {
      rgb: true,
      // The original app gates these on the name; same rules here.
      white: /^MELK-.+W/i.test(name) || !isMelk(name),
      cct: /^MELK-.+CT/i.test(name) || !isMelk(name),
      speed: true,
      effects: true,
      scenes: isMelk(name),
    }
  },

  effects(name): Effect[] {
    if (!isMelk(name)) return effects.elk
    return effects.melk
  },

  power(on, name) {
    const v = on ? (isIntro(name) ? 0xff : 0x01) : 0x00
    return f(0x7e, 0x04, 0x04, v, 0x00, on ? 0x01 : 0x00, 0xff, 0x00, 0xef)
  },

  rgb: (r, g, b) => f(0x7e, 0x07, 0x05, 0x03, byte(r), byte(g), byte(b), 0x10, 0xef),

  brightness: (v) =>
    f(0x7e, 0x04, 0x01, pct(v), LIGHT_MODE_ALL, 0xff, 0xff, 0x00, 0xef),

  speed: (v) => f(0x7e, 0x04, 0x02, pct(v), 0xff, 0xff, 0xff, 0x00, 0xef),

  white: (v) => f(0x7e, 0x05, 0x05, 0x01, pct(v), 0xff, 0xff, 0x08, 0xef),

  cct: (warm, cool) =>
    f(0x7e, 0x06, 0x05, 0x02, pct(warm), pct(cool), 0xff, 0x08, 0xef),

  effect(e, name) {
    // Scenes are a separate opcode and only exist on MELK.
    if (e.group === 'Scenes') {
      return f(0x7e, 0x05, 0x31, byte(e.id), 0x07, 0xff, 0xff, 0x01, 0xef)
    }
    // ELK ids are already offset into 0x80..0x9C by the effect table; MELK ids are raw.
    const subOpcode = isMelk(name) ? 0x06 : 0x03
    return f(0x7e, 0x05, 0x03, byte(e.id), subOpcode, 0xff, 0xff, 0x00, 0xef)
  },
}
