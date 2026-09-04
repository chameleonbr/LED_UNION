import type { Effect } from './protocol/index.ts'

export type SavedDevice = {
  id: string
  /** Advertised name. Drives protocol decisions — never edit it. */
  name: string
  /** What the user calls it, e.g. "Car · strip + door handle". */
  label?: string
  driverId: string
  /** Wiring of an addressable strip. Only the owner knows what is soldered on. */
  strip?: StripConfig
  /**
   * BLEDIM channel mode: 1 = dimming, 2 = CCT, 3 = RGB, 4 = RGBW. There is no white
   * channel in RGB mode, so the white control has to follow this.
   */
  channelMode?: number
}

/** How an addressable strip is physically wired. */
export type StripConfig = {
  /** Number of addressable pixels. */
  pixels: number
  /** Channel order id, from the rgb_order table. */
  order: number
}

export type Group = { id: string; name: string; deviceIds: string[] }

/**
 * What we last told one logical device to do.
 *
 * This is a record of commands sent, not a reading: BLE gives nothing back, so if the
 * vendor app is used in between, this drifts out of sync with reality. The UI must not
 * present it as the device's state.
 */
export type Look = {
  power?: boolean
  /** '#rrggbb' — 0..255 per channel, unlike the 0..100 the drivers take elsewhere. */
  colorHex?: string
  brightness?: number
  speed?: number
  effect?: Effect
  /** Id of a CustomEffect, when a user-built sequence is what is playing. */
  customEffectId?: string
}

/** A colour in the palette. `key` marks a seeded one so its name can be translated. */
export type SavedColor = { id: string; name: string; hex: string; key?: string }

/** A user-built colour sequence: green → black → amber is a strobe. */
export type CustomEffect = {
  id: string
  name: string
  /** '#rrggbb' each, in play order. */
  colors: string[]
  speed: number
  /** Cross-fade between colours rather than jumping. */
  fade: boolean
}

/** A snapshot of several logical devices, re-applied on demand. */
export type Scene = {
  id: string
  name: string
  /** `key` is an endpoint key from endpoint.ts: `deviceId` or `deviceId#channel`. */
  entries: { key: string; look: Look }[]
}

export type Persisted = {
  devices: SavedDevice[]
  groups: Group[]
  scenes: Scene[]
  looks: Record<string, Look>
  /** User names for outputs, keyed by endpoint key. The set of outputs is derived. */
  labels: Record<string, string>
  colors: SavedColor[]
  customEffects: CustomEffect[]
  /** Explicit language choice; absent means follow the browser. */
  locale?: string
}

export const seedColors = (): SavedColor[] =>
  [
    ['red', '#ff0000'],
    ['orange', '#ff8800'],
    ['yellow', '#ffdd00'],
    ['green', '#00ff44'],
    ['cyan', '#00ddff'],
    ['blue', '#0044ff'],
    ['purple', '#aa00ff'],
    ['white', '#ffffff'],
  ].map(([key, hex]) => ({ id: key, key, name: key, hex }))

export const KEY = 'led-union/v1'
/** The project was renamed; carry a previous install's devices and groups over. */
export const LEGACY_KEY = 'led-onion/v1'

export const empty = (): Persisted => ({
  devices: [],
  groups: [],
  scenes: [],
  looks: {},
  labels: {},
  colors: seedColors(),
  customEffects: [],
})

export function migrate(raw: unknown): Persisted {
  const base = empty()
  if (!raw || typeof raw !== 'object') return base
  const old = raw as Partial<Persisted> & { scenes?: unknown[] }

  const merged: Persisted = { ...base, ...(old as Partial<Persisted>) }

  // A saved palette of zero colours is indistinguishable from a fresh install here,
  // and leaving the user with no palette at all is worse than re-seeding.
  if (!Array.isArray(merged.colors) || merged.colors.length === 0) {
    merged.colors = seedColors()
  }
  if (!merged.looks || typeof merged.looks !== 'object') merged.looks = {}
  if (!merged.labels || typeof merged.labels !== 'object') merged.labels = {}
  if (!Array.isArray(merged.customEffects)) merged.customEffects = []

  // Outputs used to be declared by hand and stored per device. They are derived from
  // the model now — the vendor apps know a LEDCAR-01 has two without asking — so the
  // stored list goes, but the names the owner gave them are carried across in order.
  for (const d of (merged.devices ?? []) as Array<Record<string, any>>) {
    const legacy = d.outputs as Array<{ ch: number; label: string }> | undefined
    if (legacy?.length) {
      legacy.forEach((o, i) => {
        const key = `${d.id}#${i}`
        if (o.label && !merged.labels[key]) merged.labels[key] = o.label
        const oldLook = merged.looks[`${d.id}#${o.ch}`]
        if (oldLook && !merged.looks[key]) merged.looks[key] = oldLook
      })
      delete d.outputs
    }
  }

  // Scenes used to hold a single colour/effect with no notion of which device it was
  // for. There is no faithful way to map that onto per-device entries, so the old ones
  // are dropped rather than silently applied to the wrong lights.
  merged.scenes = (merged.scenes ?? []).filter(
    (s: any) => s && Array.isArray(s.entries),
  ) as Scene[]

  return merged
}

