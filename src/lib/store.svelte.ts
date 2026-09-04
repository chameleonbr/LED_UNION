import {
  empty,
  migrate,
  KEY,
  LEGACY_KEY,
  seedColors,
  type CustomEffect,
  type Group,
  type Look,
  type Output,
  type Persisted,
  type SavedColor,
  type SavedDevice,
  type Scene,
  type StripConfig,
} from './persist.ts'

export {
  defaultOutputs,
  seedColors,
  migrate,
  type CustomEffect,
  type Group,
  type Look,
  type Output,
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

export function setOutputs(id: string, outputs: Output[] | undefined) {
  const d = store.devices.find((x) => x.id === id)
  if (!d) return
  if (outputs) d.outputs = outputs
  else delete d.outputs
  save()
}

export function renameOutput(id: string, ch: number, label: string, fallback: string) {
  const o = store.devices.find((x) => x.id === id)?.outputs?.find((x) => x.ch === ch)
  if (!o) return
  o.label = label.trim() || fallback
  save()
}

export function setStrip(id: string, strip: StripConfig) {
  const d = store.devices.find((x) => x.id === id)
  if (!d) return
  d.strip = strip
  save()
}

export function forgetDevice(id: string) {
  store.devices = store.devices.filter((d) => d.id !== id)
  for (const g of store.groups) g.deviceIds = g.deviceIds.filter((x) => x !== id)
  // Drop everything keyed to this device, including its outputs' looks.
  for (const key of Object.keys(store.looks)) {
    if (key === id || key.startsWith(`${id}#`)) delete store.looks[key]
  }
  for (const s of store.scenes) {
    s.entries = s.entries.filter((e) => e.key !== id && !e.key.startsWith(`${id}#`))
  }
  store.scenes = store.scenes.filter((s) => s.entries.length > 0)
  save()
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
  for (const look of Object.values(store.looks)) {
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
    entries: keys.map((key) => ({ key, look: structuredClone(lookOf(key)) })),
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
