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
  /** Real W channel, 0..100. A static mode like colorHex and cct: one replaces the others. */
  white?: number
  /** Warm share of a CCT mix, 0..100 (cool is the rest). */
  cct?: number
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

/**
 * Move everything saved for one device to a new id: its entry, the looks and names of
 * its outputs, and its place in groups and scenes. Chrome can hand the same physical
 * device back under a new id when it is picked again in the chooser.
 */
export function rekeyDevice(s: Persisted, from: string, to: string) {
  if (from === to) return
  const move = (k: string) =>
    k === from ? to : k.startsWith(`${from}#`) ? to + k.slice(from.length) : k
  const old = s.devices.find((d) => d.id === from)
  s.devices = s.devices.filter((d) => d.id !== to)
  if (old) old.id = to
  for (const map of [s.looks, s.labels] as Array<Record<string, unknown>>) {
    for (const k of Object.keys(map)) {
      const n = move(k)
      if (n !== k) {
        map[n] = map[k]
        delete map[k]
      }
    }
  }
  for (const g of s.groups) g.deviceIds = g.deviceIds.map(move)
  for (const sc of s.scenes) sc.entries = sc.entries.map((e) => ({ ...e, key: move(e.key) }))
}

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
  // Each field is repaired on its own: one bad field must not cost the user the rest.
  const isRecord = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  if (!isRecord(merged.looks)) merged.looks = {}
  if (!isRecord(merged.labels)) merged.labels = {}
  merged.customEffects = list(merged.customEffects).filter(
    (e: any) => isRecord(e) && typeof e.id === 'string' && Array.isArray(e.colors),
  )
  merged.devices = list(merged.devices).filter(
    (d: any) => isRecord(d) && typeof d.id === 'string',
  )
  merged.groups = list(merged.groups).filter(
    (g: any) => isRecord(g) && Array.isArray(g.deviceIds),
  )

  // Outputs used to be declared by hand and stored per device. They are derived from
  // the model now — the vendor apps know a LEDCAR-01 has two without asking — so the
  // stored list goes, but the names the owner gave them are carried across in order.
  // Old keys were `id#ch`, new ones `id#index`, and the two overlap (ch 1 vs index 1),
  // so every key is moved from a snapshot rather than in place.
  const moved = new Map<string, string>()
  for (const d of merged.devices as Array<Record<string, any>>) {
    const legacy = d.outputs as Array<{ ch: number; label: string }> | undefined
    if (legacy?.length) {
      legacy.forEach((o, i) => {
        const key = `${d.id}#${i}`
        if (o.label && !merged.labels[key]) merged.labels[key] = o.label
        moved.set(`${d.id}#${o.ch}`, key)
      })
      delete d.outputs
    }
  }
  const oldLooks = { ...merged.looks }
  for (const from of moved.keys()) delete merged.looks[from]
  for (const [from, to] of moved) if (oldLooks[from]) merged.looks[to] = oldLooks[from]
  const move = (key: string) => moved.get(key) ?? key
  for (const g of merged.groups) g.deviceIds = g.deviceIds.map(move)

  // Scenes used to hold a single colour/effect with no notion of which device it was
  // for. There is no faithful way to map that onto per-device entries, so the old ones
  // are dropped rather than silently applied to the wrong lights.
  merged.scenes = list(merged.scenes).filter(
    (s: any) => isRecord(s) && Array.isArray(s.entries),
  ) as Scene[]
  for (const s of merged.scenes) {
    s.entries = s.entries.map((e) => ({ ...e, key: move(e.key) }))
  }

  return merged
}

