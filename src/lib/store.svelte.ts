import type { Effect } from './protocol/index.ts'

export type SavedDevice = { id: string; name: string; driverId: string }
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

const KEY = 'led-onion/v1'
const empty: Persisted = { devices: [], groups: [], scenes: [] }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
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
