/**
 * Turns engine actions into writes through the usual paths (applyTo / applyLook), so
 * drivers, queue, coalescing and the trace all apply. Motion output is transient: it is
 * not recorded as looks, and Stop puts back what every touched light had before Start.
 */
import { applyTo, conns, type SendOpts } from '../ble.svelte.ts'
import { parseEp } from '../endpoint.ts'
import { applyLook, applyScene } from '../look.ts'
import { lookOf, store, type Look } from '../store.svelte.ts'
import type { MotionRule } from '../persist.ts'
import type { Action } from './engine.ts'

const FLASH_MS = 150
const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms) })

let snapshot: Record<string, Look> = {}
/** What map rules last set per endpoint, so a flash returns to it rather than to the old look. */
let mapped: Record<string, Look> = {}
const flashing = new Set<string>()
const timers = new Set<ReturnType<typeof setTimeout>>()
/** Bumped by begin/end: a flash or revert from an earlier run must not touch the lights. */
let run = 0
export const stats = { errors: 0 }

/** applyTo keeps going past a failing device; count the ones that failed for the Motion tab. */
async function send(keys: string[], build: Parameters<typeof applyTo>[1], coalesce: string | undefined, rule: MotionRule) {
  await applyTo(keys, build, coalesce, opts(rule))
  stats.errors += keys.filter((k) => conns[parseEp(k).deviceId]?.error).length
}

function touched(rules: MotionRule[]): string[] {
  const keys = new Set<string>()
  for (const r of rules) {
    if (!r.enabled) continue
    r.targets.forEach((k) => keys.add(k))
    const a = r.trigger?.action ?? r.place?.action
    if (a?.kind === 'scene') store.scenes.find((s) => s.id === a.sceneId)?.entries.forEach((e) => keys.add(e.key))
  }
  return [...keys]
}

export function begin(rules: MotionRule[]) {
  run++
  stats.errors = 0
  mapped = {}
  flashing.clear()
  snapshot = {}
  // A plain copy: the stored look is a reactive proxy.
  for (const k of touched(rules)) snapshot[k] = JSON.parse(JSON.stringify(lookOf(k)))
}

export async function end() {
  run++
  timers.forEach(clearTimeout)
  timers.clear()
  flashing.clear()
  const snap = snapshot
  snapshot = {}
  mapped = {}
  // Stealth keeps its own snapshot of the same looks, and restores them when it ends.
  if (store.stealth) return
  for (const [key, look] of Object.entries(snap)) {
    await applyLook(key, look, { force: true, source: 'motion:stop' })
  }
}

const opts = (rule: MotionRule): SendOpts => ({ force: true, source: `motion:${rule.name}` })

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
}

async function flash(key: string, rule: MotionRule, color: string, times: number) {
  const mine = run
  flashing.add(key)
  const [r, g, b] = rgb(color)
  try {
    // Stealth can start mid-flash; from then on the lights stay as stealth left them.
    const live = () => mine === run && !store.stealth
    for (let i = 0; i < times && live(); i++) {
      await send([key], (d, n, c, v) => d.rgb(r, g, b, n, c, v), undefined, rule)
      await sleep(FLASH_MS)
      if (!live()) break
      await send([key], (d, n, c, v) => d.rgb(0, 0, 0, n, c, v), undefined, rule)
      await sleep(FLASH_MS)
    }
    if (live()) await applyLook(key, { ...lookOf(key), ...mapped[key] }, opts(rule), false)
  } finally {
    if (mine === run) flashing.delete(key)
  }
}

function later(ms: number, fn: () => void) {
  const mine = run
  const id = setTimeout(() => {
    timers.delete(id)
    if (mine === run && !store.stealth) fn()
  }, ms)
  timers.add(id)
}

/** Fire and forget: a slow device must not hold back the next sensor sample. */
export async function execute(actions: Action[]) {
  for (const act of actions) {
    // A sensor never asks to leave stealth; it just stays dark.
    if (store.stealth) return
    const { rule } = act
    const keys = rule.targets.filter((k) => !flashing.has(k))
    if (act.kind === 'map') {
      const v = act.value
      for (const k of keys) mapped[k] = { ...mapped[k], ...(typeof v === 'number' ? { brightness: v } : { colorHex: v }) }
      if (typeof v === 'number') {
        void send(keys, (d, n, c, va) => d.brightness(v, n, c, va), `motion:${rule.id}`, rule)
      } else {
        const [r, g, b] = rgb(v)
        void send(keys, (d, n, c, va) => d.rgb(r, g, b, n, c, va), `motion:${rule.id}`, rule)
      }
      continue
    }
    const a = act.action
    if (a.kind === 'flash') {
      for (const k of keys) void flash(k, rule, a.color, a.times)
    } else if (a.kind === 'look') {
      const look: Look = {}
      if (a.power !== undefined) look.power = a.power
      if (a.colorHex) look.colorHex = a.colorHex
      if (a.effect) look.effect = a.effect
      for (const k of keys) void applyLook(k, look, opts(rule), false)
    } else if (a.kind === 'scene') {
      const scene = store.scenes.find((s) => s.id === a.sceneId)
      if (scene) void applyScene(scene, opts(rule), false)
    } else if (a.kind === 'slot') {
      void send(keys, (d, n) => d.showSlot?.(a.slot, n), undefined, rule)
      later(a.seconds * 1000, () => {
        for (const k of keys) {
          const prev = lookOf(k).panel?.slot
          if (prev) void applyTo([k], (d, n) => d.showSlot?.(prev, n), undefined, opts(rule))
        }
      })
    }
  }
}
