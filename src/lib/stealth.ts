import { applyTo, conns, displayName } from './ble.svelte.ts'
import { epKey, parseEp } from './endpoint.ts'
import { applyLook } from './look.ts'
import { lookOf, save, setLook, store, type Look } from './store.svelte.ts'

/** Every output of every connected device, as endpoint keys. */
function onlineKeys(): string[] {
  return Object.values(conns)
    .filter((c) => c.state === 'online')
    .flatMap((c) => {
      const n = c.driver.outputs?.(c.name).length ?? 0
      return n > 1 ? Array.from({ length: n }, (_, i) => epKey(c.id, i)) : [c.id]
    })
}

/** Lights out everywhere, remembering what each one showed. */
export async function enterStealth() {
  if (store.stealth) return
  const keys = onlineKeys()
  const snapshot: Record<string, Look> = {}
  // A plain copy: the stored look is a reactive proxy.
  for (const k of keys) snapshot[k] = JSON.parse(JSON.stringify(lookOf(k)))
  store.stealth = { since: new Date().toISOString(), snapshot }
  save()
  await applyTo(keys, (d, n, c, v) => d.power(false, n, c, v), undefined, {
    force: true,
    source: 'stealth',
  })
  // The record is of what was sent (BR-30), and what was sent is "off".
  for (const k of keys) setLook(k, { power: false })
}

/** Put every light back as it was. Returns the names that could not be reached. */
export async function exitStealth(): Promise<string[]> {
  const snap = store.stealth?.snapshot ?? {}
  store.stealth = undefined
  save()
  const missed: string[] = []
  for (const [key, look] of Object.entries(snap)) {
    const c = conns[parseEp(key).deviceId]
    if (!c) continue
    try {
      // Stealth only darkened lights that were on, so no recorded power means on.
      await applyLook(key, { power: true, ...look }, { force: true, source: 'stealth' })
      if (c.state !== 'online') missed.push(displayName(c))
    } catch {
      missed.push(displayName(c))
    }
  }
  return [...new Set(missed)]
}

