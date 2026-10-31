import {
  empty,
  migrate,
  rekeyDevice,
  KEY,
  LEGACY_KEY,
  seedColors,
  type CustomEffect,
  type Group,
  type Look,
  type Persisted,
  type SavedColor,
  type SavedDevice,
  type Scene,
  type StripConfig,
} from './persist.ts'
import type { PanelInfo } from './protocol/index.ts'

export {
  seedColors,
  migrate,
  type CustomEffect,
  type Group,
  type Look,
  type SavedColor,
  type SavedDevice,
  type Scene,
  type StripConfig,
} from './persist.ts'

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    return migrate(raw ? JSON.parse(raw) : null)
  } catch {
    // Private windows and blocked site data both land here; start clean.
    return empty()
  }
}

export const store = $state<Persisted>(load())

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Nothing here is worth failing a command over.
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10)

// --- devices -----------------------------------------------------------------------

export function rememberDevice(d: SavedDevice) {
  const existing = store.devices.find((x) => x.id === d.id)
  if (existing) Object.assign(existing, d)
  else store.devices.push(d)
  save()
}

export function renameDevice(id: string, label: string) {
  const d = store.devices.find((x) => x.id === id)
  if (!d) return
  const trimmed = label.trim()
  if (trimmed) d.label = trimmed
  else delete d.label
  save()
}


export function setChannelMode(id: string, mode: number) {
  const d = store.devices.find((x) => x.id === id)
  if (!d) return
  d.channelMode = mode
  save()
}

export function setStrip(id: string, strip: StripConfig) {
  const d = store.devices.find((x) => x.id === id)
  if (!d) return
  d.strip = strip
  save()
}

/** User name for one output, falling back to the model's own label. */
export const labelOf = (key: string, fallback: string) => store.labels[key] ?? fallback

export function renameEndpoint(key: string, label: string) {
  const trimmed = label.trim()
  if (trimmed) store.labels[key] = trimmed
  else delete store.labels[key]
  save()
}

export function rekey(from: string, to: string) {
  rekeyDevice(store, from, to)
  save()
}

export function forgetDevice(id: string) {
  store.devices = store.devices.filter((d) => d.id !== id)
  for (const g of store.groups) {
    g.deviceIds = g.deviceIds.filter((x) => x !== id && !x.startsWith(`${id}#`))
  }
  // Drop everything keyed to this device, including its outputs' looks.
  for (const map of [store.looks, store.labels, store.stealth?.snapshot ?? {}] as Array<
    Record<string, unknown>
  >) {
    for (const key of Object.keys(map)) {
      if (key === id || key.startsWith(`${id}#`)) delete map[key]
    }
  }
  for (const s of store.scenes) {
    s.entries = s.entries.filter((e) => e.key !== id && !e.key.startsWith(`${id}#`))
  }
  store.scenes = store.scenes.filter((s) => s.entries.length > 0)
  save()
}

/** Hardware facts a panel reported: saved whether or not anything else worked (BR-36). */
export function setPanel(id: string, info: PanelInfo) {
  const d = store.devices.find((x) => x.id === id)
  if (!d) return
  // A reply without a known size must not wipe a size an earlier reply gave.
  const known = info.width === undefined && d.panel?.width !== undefined
  d.panel = { ...d.panel!, ...(known ? { locked: info.locked } : info) }
  save()
}

/** Panel facts that do not come from the device-info reply. */
export function patchPanel(id: string, patch: { orientation?: number; mcu?: number; lastSlot?: number }) {
  const d = store.devices.find((x) => x.id === id)
  if (!d) return
  d.panel = { type: d.panel?.type ?? -1, ...d.panel, ...patch }
  save()
}

/** The family a probe confirmed, so the next load shows the right controls before connecting. */
export function setDriverId(id: string, driverId: string) {
  const d = store.devices.find((x) => x.id === id)
  if (d && d.driverId !== driverId) {
    d.driverId = driverId
    save()
  }
}

// --- groups ------------------------------------------------------------------------

export function addGroup(name: string, deviceIds: string[]): Group {
  const g: Group = { id: uid(), name, deviceIds }
  store.groups.push(g)
  save()
  return g
}

export function removeGroup(id: string) {
  store.groups = store.groups.filter((g) => g.id !== id)
  save()
}

// --- looks -------------------------------------------------------------------------

export const lookOf = (key: string): Look => store.looks[key] ?? {}

export function setLook(key: string, patch: Look) {
  store.looks[key] = { ...store.looks[key], ...patch }
  save()
}

// --- palette -----------------------------------------------------------------------

export function addColor(name: string, hex: string): SavedColor {
  const c: SavedColor = { id: uid(), name: name.trim() || hex, hex }
  store.colors.push(c)
  save()
  return c
}

export function removeColor(id: string) {
  store.colors = store.colors.filter((c) => c.id !== id)
  save()
}

export function resetColors() {
  store.colors = seedColors()
  save()
}

// --- custom effects ----------------------------------------------------------------

export function addCustomEffect(e: Omit<CustomEffect, 'id'>): CustomEffect {
  const fx: CustomEffect = { ...e, id: uid() }
  store.customEffects.push(fx)
  save()
  return fx
}

export function updateCustomEffect(id: string, patch: Partial<CustomEffect>) {
  const fx = store.customEffects.find((x) => x.id === id)
  if (!fx) return
  Object.assign(fx, patch)
  save()
}

export function removeCustomEffect(id: string) {
  store.customEffects = store.customEffects.filter((e) => e.id !== id)
  // A look pointing at a deleted effect would render a blank name forever.
  // Scenes hold the effect by reference, so their entries are cleared the same way.
  const scenes = store.scenes.flatMap((s) => s.entries.map((e) => e.look))
  for (const look of [...Object.values(store.looks), ...scenes]) {
    if (look.customEffectId === id) delete look.customEffectId
  }
  save()
}

// --- scenes ------------------------------------------------------------------------

export function addScene(name: string, keys: string[]): Scene {
  const scene: Scene = {
    id: uid(),
    name,
    // Snapshot the looks now: the scene must not change when the lights do.
    // $state.snapshot, not structuredClone: the stored look is a proxy, which cannot be cloned.
    entries: keys.map((key) => ({ key, look: $state.snapshot(lookOf(key)) })),
  }
  store.scenes.push(scene)
  save()
  return scene
}

export function removeScene(id: string) {
  store.scenes = store.scenes.filter((s) => s.id !== id)
  save()
}

// --- locale ------------------------------------------------------------------------

export function setLocale(locale: string | undefined) {
  if (locale) store.locale = locale
  else delete store.locale
  save()
}
