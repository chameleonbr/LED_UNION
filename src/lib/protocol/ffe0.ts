import type { Caps, CustomEffectSpec, Driver, Effect, SoundSource } from './types.ts'
import { byte, pct } from './types.ts'
import effects from './effects.ts'

// Protocol: docs/protocol/ledble.md
// Every family in the LED+LAMP app shares one characteristic and differs only in the
// envelope and the byte layout, selected by the advertised name prefix. Frames are
// always 9 bytes; only the header, trailer and parameter positions move.

const SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb'
const WRITE_CHAR = '0000ffe1-0000-1000-8000-00805f9b34fb'

const DEFAULT_PASSWORD = [0xa1, 0x23, 0x45, 0x67]
const F = 0xff

const f = (...b: number[]) => new Uint8Array(b)

/**
 * Seven wire layouts:
 *  - `ble`   `7E … EF`  LEDBLE, LEDSTAGE, LEDLIGHT, LEDCAR-00
 *  - `dmx`   `7B FF …`  LEDDMX-00/01/03, LEDCAR-01
 *  - `dmxs`  `7B …`     LEDDMX-02/04, LEDCAR-02 — no `FF` filler, params shift left
 *  - `smart` `7D … DF`  LEDSMART
 *  - `sun`   `7A … AF`  LEDSUN
 *  - `like`  `70 … 0F`  LEDLIKE
 *  - `pho`   `72 … 2F`  LEDPHO — carries a group address in the last three params
 *
 * LEDCAR-01 is dual-protocol in the original app (a runtime flag picks `7E` or `7B`);
 * we default it to `dmx`, which is what the DMX-capable hardware expects.
 */
export type Layout = 'ble' | 'dmx' | 'dmxs' | 'smart' | 'sun' | 'like' | 'pho'

export function layoutFor(name: string): Layout {
  if (/^LEDSMART/i.test(name)) return 'smart'
  if (/^LEDSUN/i.test(name)) return 'sun'
  if (/^LEDLIKE/i.test(name)) return 'like'
  if (/^LEDPHO/i.test(name)) return 'pho'
  if (/^(LEDDMX-0[24]|LEDCAR-02)/i.test(name)) return 'dmxs'
  if (/^(LEDDMX|LEDCAR-01)/i.test(name)) return 'dmx'
  return 'ble'
}

// LEDSTAGE and LEDLIGHT use a different power frame than the rest of the 7E family.
const isStage = (name: string) => /^(LEDSTAGE|LEDLIGHT)/i.test(name)
// LEDCAR-01 shares the 7B FF layout with LEDDMX but has its own power frame.
const isCar01 = (name: string) => /^LEDCAR-01/i.test(name)
// LEDCAR-02 shares the shifted layout with LEDDMX-02/04 but differs on some flags.
const isCar02 = (name: string) => /^LEDCAR-02/i.test(name)

/**
 * LEDPHO addresses a group with three trailing bytes. The app leaves them at zero
 * until the user builds a group, and zero reaches every fixture.
 */
const PHO_GROUP = [0, 0, 0]
/** Second parameter of the LEDPHO power and brightness frames: fixture segment. */
const PHO_SEGMENT = 0

/**
 * The DIY slot the LEDSMART and LEDSTAGE uploads write into. The app passes it through
 * from its UI; slot 0 is the one a user gets by default.
 */
const DIY_SLOT = 0

/** The `7B FF` family sends brightness twice: scaled to 0..32, then raw. */
const scale32 = (v: number) => Math.round((pct(v) * 32) / 100)

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
  f(0x2a, 0x05, F, F, F, F, F, F, 0xaf)

/** Families whose hardware has no colour channel at all — white and CCT only. */
const WHITE_ONLY: Layout[] = ['sun', 'like']

/** Only these families are known to accept the `2A` handshake. */
const NEEDS_AUTH = /^(LEDBLE|LEDDMX|LEDCAR|LED[_ ]BLE)/i

export const ffe0: Driver = {
  id: 'ffe0',
  label: 'LEDBLE / DMX / CAR / SMART / SUN / LIKE / PHO',
  service: SERVICE,
  writeChar: WRITE_CHAR,
  minGapMs: 50,
  hasChannels: true,

  // Names in the wild use both LEDBLE-xx and LED_BLE_xx.
  matches: (name) =>
    /^(LED[_ ]?BLE|LEDSTAGE|LEDLIGHT|LEDDMX|LEDCAR|LEDSMART|LEDSUN|LEDLIKE|LEDPHO)/i
      .test(name),

  caps(name): Caps {
    const l = layoutFor(name)
    return {
      rgb: !WHITE_ONLY.includes(l),
      white: l === 'dmxs' || l === 'smart',
      cct: l === 'sun' || l === 'pho' || l === 'dmxs' || l === 'ble',
      speed: true,
      effects: true,
      scenes: false,
    }
  },

  effects(name): Effect[] {
    // LEDCAR ships its own table, and keeps it even on the variants that speak the
    // 7B envelope.
    if (/^LEDCAR/i.test(name)) return effects.ledcar
    switch (layoutFor(name)) {
      case 'dmx':
      case 'dmxs':
        return effects.leddmx
      case 'like':
        return effects.ledlike
      case 'pho':
        return effects.ledpho
      case 'smart':
      case 'sun':
        // No name table ships in the app's resources for these two, but the mode
        // command exists, so expose the ids plainly rather than hiding the feature.
        return Array.from({ length: 16 }, (_, i) => ({ id: i, name: `Modo ${i + 1}` }))
      default:
        return effects.ledble
    }
  },

  onConnect: (name, now) => (NEEDS_AUTH.test(name) ? [authFrame(now)] : []),

  power(on, name, ch) {
    const v = on ? 0x01 : 0x00
    switch (layoutFor(name)) {
      case 'dmxs':
        return f(0x7b, 0x04, v, F, F, F, F, F, 0xbf)
      case 'dmx':
        return isCar01(name)
          ? f(0x7b, F, 0x04, v, F, F, F, F, 0xbf)
          : f(0x7b, 0x04, 0x04, v, F, F, F, F, 0xbf)
      case 'smart':
        return f(0x7d, 0x01, 0x01, v, F, F, F, F, 0xdf)
      case 'sun':
        return f(0x7a, 0x01, v, F, F, F, F, F, 0xaf)
      case 'like':
        return f(0x70, 0x01, v, F, F, F, F, F, 0x0f)
      case 'pho':
        return f(0x72, 0x01, v, PHO_SEGMENT, F, ...PHO_GROUP, 0x2f)
      default:
        return isStage(name)
          ? f(0x7e, F, 0x04, v, F, F, F, F, 0xef)
          : f(0x7e, F, 0x04, v, 0x00, F, F, ch ?? 0x00, 0xef)
    }
  },

  rgb(r, g, b, name, ch) {
    const [R, G, B] = [byte(r), byte(g), byte(b)]
    switch (layoutFor(name)) {
      case 'dmxs':
        // Byte 6 is the white channel; 0 keeps it out of the mix.
        return f(0x7b, 0x07, R, G, B, 0x00, F, F, 0xbf)
      case 'dmx':
        return f(0x7b, F, 0x07, R, G, B, 0x00, F, 0xbf)
      case 'smart':
        return f(0x7d, 0x02, 0x01, F, R, G, B, F, 0xdf)
      case 'pho':
        return f(0x72, 0x04, R, G, B, ...PHO_GROUP, 0x2f)
      case 'sun':
      case 'like':
        // White-only hardware: fall back to driving the white channel by luminance.
        return ffe0.white!(Math.round(((R + G + B) / 3 / 255) * 100), name)
      default:
        return f(0x7e, F, 0x05, 0x03, R, G, B, ch ?? F, 0xef)
    }
  },

  brightness(v, name, ch) {
    const b = pct(v)
    switch (layoutFor(name)) {
      case 'dmxs':
        return f(0x7b, 0x01, b, 0x00, F, F, F, F, 0xbf)
      case 'dmx':
        return f(0x7b, F, 0x01, scale32(b), b, 0x00, F, F, 0xbf)
      case 'smart':
        return f(0x7d, 0x02, 0x02, b, F, F, F, F, 0xdf)
      case 'sun':
        return f(0x7a, 0x02, b, F, F, F, F, F, 0xaf)
      case 'like':
        return f(0x70, 0x02, b, F, F, F, F, F, 0x0f)
      case 'pho':
        return f(0x72, 0x02, b, PHO_SEGMENT, F, ...PHO_GROUP, 0x2f)
      default:
        return f(0x7e, F, 0x01, b, 0x00, F, F, ch ?? F, 0xef)
    }
  },

  speed(v, name, ch) {
    const s = pct(v)
    switch (layoutFor(name)) {
      case 'dmxs':
        return f(0x7b, 0x02, s, 0x00, F, F, F, F, 0xbf)
      case 'dmx':
        return f(0x7b, F, 0x02, s, F, 0x00, F, F, 0xbf)
      case 'smart':
        return f(0x7d, 0x02, 0x04, s, F, F, F, F, 0xdf)
      case 'sun':
        return f(0x7a, 0x03, s, F, F, F, F, F, 0xaf)
      case 'like':
        return f(0x70, 0x03, s, F, F, F, F, F, 0x0f)
      case 'pho':
        return f(0x72, 0x09, s, F, F, ...PHO_GROUP, 0x2f)
      default:
        return f(0x7e, F, 0x02, s, 0x00, F, F, ch ?? F, 0xef)
    }
  },

  effect(e, name, ch) {
    const id = byte(e.id)
    switch (layoutFor(name)) {
      // 0x03 selects a built-in mode; 0x13 is the user's DIY patterns. Feeding the
      // built-in table's ids to 0x13 was a bug.
      case 'dmxs':
        return f(0x7b, 0x03, id, F, F, F, F, F, 0xbf)
      case 'dmx':
        return f(0x7b, F, 0x03, id, F, F, F, F, 0xbf)
      case 'smart':
        return f(0x7d, 0x02, 0x05, id, F, F, F, F, 0xdf)
      case 'sun':
        return f(0x7a, 0x06, id, F, F, F, F, F, 0xaf)
      case 'like':
        return f(0x70, F, id, F, F, F, F, F, 0x0f)
      case 'pho':
        return f(0x72, 0x08, id, F, F, ...PHO_GROUP, 0x2f)
      default:
        return f(0x7e, 0x00, 0x0e, id, F, F, F, ch ?? F, 0xef)
    }
  },

  white(v, name) {
    const w = pct(v)
    switch (layoutFor(name)) {
      case 'dmxs':
        // This layout has its own dim opcode; do not borrow the rgb frame's white slot.
        return f(0x7b, 0x09, w, F, F, F, F, F, 0xbf)
      case 'dmx':
        // Same double-encoding as brightness: scaled to 0..32, then raw.
        return f(0x7b, F, 0x09, scale32(w), w, F, F, F, 0xbf)
      case 'smart':
        // The app calls this "dim" — the separate white/dimming channel.
        return f(0x7d, 0x02, 0x07, w, F, F, F, F, 0xdf)
      case 'sun':
        return f(0x7a, 0x02, w, F, F, F, F, F, 0xaf)
      case 'like':
        return f(0x70, 0x02, w, F, F, F, F, F, 0x0f)
      case 'pho':
        // No separate white channel on this fixture — warm the colour temperature.
        return f(0x72, 0x05, w, F, F, ...PHO_GROUP, 0x2f)
      default:
        return f(0x7e, F, 0x05, 0x01, w, F, F, F, 0xef)
    }
  },

  /**
   * Most families use one opcode for both sound sources and a flag byte to pick
   * between them: the controller's own mic, or audio streamed from the phone.
   */
  soundMode(mode, name, source, ch) {
    const m = byte(mode)
    const music = source === 'music'
    switch (layoutFor(name)) {
      case 'dmxs':
        // No phone-audio variant exists here: the app only ever sends the mic mode,
        // and the flag byte differs between LEDCAR-02 and LEDDMX-02/04.
        return isCar02(name)
          ? f(0x7b, 0x0b, m, 0x00, F, F, F, F, 0xbf)
          : f(0x7b, 0x0b, m, F, F, F, F, F, 0xbf)
      case 'dmx':
        return f(0x7b, F, 0x0b, m, music ? 0x01 : 0x00, F, F, F, 0xbf)
      case 'like':
        return music
          ? f(0x70, 0x04, m, 0x00, F, F, F, F, 0x0f)
          : f(0x70, F, m, 0x01, F, F, F, F, 0x0f)
      case 'sun':
        return f(0x7a, 0x07, m, F, F, F, F, F, 0xaf)
      case 'smart':
        return f(0x7d, 0x02, 0x05, m, F, F, F, F, 0xdf)
      case 'pho':
        return f(0x72, 0x08, m, F, F, ...PHO_GROUP, 0x2f)
      default:
        // Byte 1 is the source: 0 = microphone, 2 = phone audio.
        return f(0x7e, music ? 0x02 : 0x00, 0x0e, m, F, F, F, ch ?? F, 0xef)
    }
  },

  soundSensitivity(v, name) {
    const s = pct(v)
    switch (layoutFor(name)) {
      case 'dmxs':
        return f(0x7b, 0x0c, s, F, F, F, F, F, 0xbf)
      case 'dmx':
        return f(0x7b, F, 0x0c, s, 0x00, F, F, F, 0xbf)
      case 'sun':
        return f(0x7a, 0x08, s, F, F, F, F, F, 0xaf)
      case 'like':
        return f(0x70, 0x08, s, F, F, F, F, F, 0x0f)
      default:
        return f(0x7e, F, 0x07, s, F, F, F, F, 0xef)
    }
  },

  /**
   * Upload one frame per colour, then start the cycle.
   *
   * Two things bite here. The index is **1-based**, and LEDSMART/LEDSTAGE have no
   * start command at all — the app's own setCustomCycle explicitly skips them, so
   * sending one would be inventing a frame.
   */
  customEffect(spec, name): Uint8Array[] {
    const l = layoutFor(name)
    // These families have no colour-list command anywhere in the original app.
    if (l === 'sun' || l === 'like' || l === 'pho') return []

    const total = byte(spec.colors.length)
    if (!total) return []
    // 254 fades between colours, 253 jumps. The app also has a 252 for LEDBLE whose
    // meaning is unclear, so we stay on the two both families agree on.
    const mode = spec.fade ? 0xfe : 0xfd
    const out: Uint8Array[] = []

    spec.colors.forEach((c, i) => {
      const idx = byte(i + 1)
      const [R, G, B] = [byte(c.r), byte(c.g), byte(c.b)]
      switch (l) {
        case 'dmxs':
          out.push(f(0x7b, 0x0e, R, G, B, total, idx, mode, 0xbf))
          break
        case 'dmx':
          out.push(f(0x7b, idx, 0x0e, mode, R, G, B, total, 0xbf))
          break
        case 'smart':
          // No per-colour index here: the app sends a constant DIY slot and the
          // controller appends in arrival order.
          out.push(f(0x7d, 0x02, 0x03, DIY_SLOT, R, G, B, total, 0xdf))
          break
        default:
          out.push(
            isStage(name)
              ? f(0x7e, F, 0x06, DIY_SLOT, R, G, B, total, 0xef)
              : f(0x7e, idx, 0x0d, mode, R, G, B, total, 0xef),
          )
      }
    })

    switch (l) {
      case 'dmxs':
        out.push(f(0x7b, 0x0f, F, F, F, F, F, F, 0xbf))
        break
      case 'dmx':
        out.push(f(0x7b, F, 0x0f, 0x01, F, F, F, F, 0xbf))
        break
      case 'smart':
        break // no start command
      default:
        if (!isStage(name)) out.push(f(0x7e, F, 0x0f, 0x00, F, F, F, F, 0xef))
    }
    return out
  },

  cct(warm, cool, name) {
    switch (layoutFor(name)) {
      case 'dmxs':
        return f(0x7b, 0x0a, pct(cool), F, F, F, F, F, 0xbf)
      case 'sun':
        return f(0x7a, 0x05, pct(warm), F, F, F, F, F, 0xaf)
      case 'pho':
        return f(0x72, 0x05, pct(warm), F, F, ...PHO_GROUP, 0x2f)
      default:
        return f(0x7e, F, 0x05, 0x02, pct(warm), pct(cool), F, F, 0xef)
    }
  },
}

// ---------------------------------------------------------------------------
// Addressable strips (SPI / pixel controllers)
//
// The DMX and CAR families drive individually addressable strips. Before the
// built-in effects render correctly the controller has to be told how the strip is
// physically wired: which driver IC, how many pixels, and what order the colour
// channels come in. Getting these wrong shows up as the wrong colours or only part
// of the strip lighting, not as a failure.

/** Only these layouts drive addressable strips. */
export const isAddressable = (name: string) => {
  const l = layoutFor(name)
  return l === 'dmx' || l === 'dmxs'
}

/** Channel orders. The shifted layouts only offer the six RGB permutations. */
export const rgbOrdersFor = (name: string) =>
  layoutFor(name) === 'dmxs' ? effects.rgbOrdersDmx02 : effects.rgbOrders

/**
 * Tell the controller how the strip is wired.
 *
 * `pixels` is sent big-endian across two bytes. Note the shifted layout reorders the
 * parameters — the channel order comes first there, and it carries no type field.
 *
 * The app hard-codes the type byte to 4 and never exposes it, so we do the same
 * rather than offering a control we cannot justify.
 */
const BANNER_TYPE = 0x04

export function spiConfigFrame(
  name: string,
  opts: { pixels: number; order: number },
): Uint8Array {
  const hi = (opts.pixels >> 8) & 0xff
  const lo = opts.pixels & 0xff
  const order = byte(opts.order)
  if (layoutFor(name) === 'dmxs') {
    return f(0x7b, 0x05, order, hi, lo, F, F, F, 0xbf)
  }
  return f(0x7b, F, 0x05, BANNER_TYPE, hi, lo, order, F, 0xbf)
}

/** Which end of the strip effects run from. */
export function directionFrame(name: string, forward: boolean): Uint8Array {
  const d = forward ? 0x01 : 0x00
  return layoutFor(name) === 'dmxs'
    ? f(0x7b, 0x0d, d, F, F, F, F, F, 0xbf)
    : f(0x7b, F, 0x0d, d, F, F, F, F, 0xbf)
}
