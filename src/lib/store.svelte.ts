import type { Effect } from './protocol/index.ts'

export type SavedDevice = {
  id: string
  /** Advertised name. Drives protocol decisions — never edit it. */
  name: string
  /** What the user calls it, e.g. "Carro · fita + maçaneta + soleira". */
  label?: string
  driverId: string
  /**
   * Physical outputs on a multi-output controller. Only the owner can see how the
   * strips are wired, so this is opt-in per device rather than guessed.
   */
  outputs?: Output[]
  /** Wiring of an addressable strip. Only the owner knows what is soldered on. */
  strip?: StripConfig
}

/** How an addressable strip is physically wired. */
export type StripConfig = {
  /** Number of addressable pixels. */
  pixels: number
  /** Channel order id, from the rgb_order table. */
  order: number
}

/** One physical output. `ch` goes straight into the frame's channel byte. */
export type Output = { ch: number; label: string }

/** Matches the LED1 / ALL / LED2 selector in the original app. */
export const defaultOutputs = (): Output[] => [
  { ch: 0, label: 'Todas' },
  { ch: 1, label: 'Saída 1' },
  { ch: 2, label: 'Saída 2' },
]
export type Group = { id: string; name: string; deviceIds: string[] }

/** A snapshot to re-apply later. Only the fields that were actually set. */
export type Scene = {
  id: string
  name: string
  color?: string
  brightness?: number
  speed?: number
  effect?: Effect
}

type Persisted = { devices: SavedDevice[]; groups: Group[]; scenes: Scene[] }

const KEY = 'led-union/v1'
/** The project was renamed; carry a previous install's devices and groups over. */
const LEGACY_KEY = 'led-onion/v1'
const empty: Persisted = { devices: [], groups: [], scenes: [] }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return structuredClone(empty)
    return { ...structuredClone(empty), ...JSON.parse(raw) }
  } catch {
    // Private windows and blocked site data both land here; start clean.
    return structuredClone(empty)
  }
}

const initial = load()

export const store = $state<Persisted>(initial)

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Nothing here is worth failing a command over.
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10)

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

export function renameOutput(id: string, ch: number, label: string) {
  const o = store.devices.find((x) => x.id === id)?.outputs?.find((x) => x.ch === ch)
  if (!o) return
  o.label = label.trim() || `Saída ${ch}`
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
  save()
}

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

export function addScene(s: Omit<Scene, 'id'>): Scene {
  const scene: Scene = { ...s, id: uid() }
  store.scenes.push(scene)
  save()
  return scene
}

export function removeScene(id: string) {
  store.scenes = store.scenes.filter((s) => s.id !== id)
  save()
}
