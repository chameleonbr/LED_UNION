/**
 * Motion engine: phone sensor samples in, light actions out. Pure — no browser types,
 * no I/O — so every rule can be checked on a recorded or synthetic drive.
 *
 * Axes are the W3C device frame (x right, y top edge, z out of the screen). The
 * accelerometer reads "including gravity", so at rest it points up with 9.81 m/s².
 */
import type { Calibration, MotionAction, MotionRule, Place, Vec3 } from '../persist.ts'

export const G = 9.81
/** Below this GPS speed noise is taken as standing still. */
export const DEAD_BAND_KMH = 3
/** A fix older than this no longer drives speed rules. */
export const FIX_STALE_MS = 5000
/** Per rule, so a 60 Hz sensor never floods the BLE queue (≤ 10 writes/s). */
export const MIN_EMIT_MS = 100
const TAU_S = 0.3
const LEARN_G = 0.15
const PLACE_EXIT = 1.2

export type Fix = { t: number; lat: number; lon: number; speed: number | null; accuracy: number }
export type Readings = { speed?: number; gLong?: number; gLat?: number; gTotal?: number }

export type Action =
  | { kind: 'map'; rule: MotionRule; value: number | string }
  | { kind: 'fire'; rule: MotionRule; action: MotionAction }

type RuleState = { since?: number; armed: boolean; lastFire?: number; lastEmit?: number; lastOut?: number | string }

export type Engine = {
  cal?: Calibration
  /** Set when the forward axis was learned this drive, so the caller can save it. */
  learned: boolean
  filt?: Vec3
  lastT?: number
  fix?: Fix
  prevFix?: Fix
  speedRising: boolean
  readings: Readings
  /** Gravity moved more than 20° from the calibrated one: the phone shifted in the holder. */
  drifted: boolean
  rules: Record<string, RuleState>
  inside: Record<string, boolean>
}

// --- vectors --------------------------------------------------------------------
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): Vec3 => scale(a, 1 / (norm(a) || 1))
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
/** The part of `a` in the plane perpendicular to `up`. */
const horizontal = (a: Vec3, up: Vec3): Vec3 => sub(a, scale(up, dot(a, up)))

// --- signal ---------------------------------------------------------------------
export function lowPass(prev: Vec3 | undefined, x: Vec3, dtS: number, tau = TAU_S): Vec3 {
  if (!prev) return x
  const k = dtS / (tau + dtS)
  return [prev[0] + k * (x[0] - prev[0]), prev[1] + k * (x[1] - prev[1]), prev[2] + k * (x[2] - prev[2])]
}

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (d: number) => (d * Math.PI) / 180
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

/** km/h from the fix's own speed, else from the distance to the previous fix. */
export function speedKmh(cur: Fix, prev?: Fix): number {
  let v = 0
  if (cur.speed !== null && Number.isFinite(cur.speed)) v = cur.speed * 3.6
  else if (prev && cur.t > prev.t) v = (haversine(prev, cur) / ((cur.t - prev.t) / 1000)) * 3.6
  return v < DEAD_BAND_KMH ? 0 : v
}

/**
 * Gravity from samples taken at rest, and a first guess at forward: out of the phone's
 * back (holder facing the driver), or its top edge when the phone lies flat.
 */
export function calibrate(samples: Vec3[], at = new Date().toISOString()): Calibration {
  const n = samples.length || 1
  const gravity = samples.reduce<Vec3>((s, a) => [s[0] + a[0] / n, s[1] + a[1] / n, s[2] + a[2] / n], [0, 0, 0])
  const up = unit(gravity)
  let f = horizontal([0, 0, -1], up)
  if (norm(f) < 0.3) f = horizontal([0, 1, 0], up)
  return { gravity, forward: unit(f), at }
}

/** Longitudinal (+ accelerating, − braking) and lateral (+ to the right) G. */
export function project(a: Vec3, cal: Calibration): { gLong: number; gLat: number } {
  const up = unit(cal.gravity)
  const h = horizontal(sub(a, cal.gravity), up)
  const f = unit(horizontal(cal.forward, up))
  return { gLong: dot(h, f) / G, gLat: dot(h, cross(f, up)) / G }
}

// --- rules ----------------------------------------------------------------------
export function mapValue(v: number, from: number, to: number, min: number, max: number): number {
  if (to === from) return v >= to ? max : min
  const k = Math.min(1, Math.max(0, (v - from) / (to - from)))
  return min + k * (max - min)
}

const hex = (c: string) => {
  const n = parseInt(c.replace('#', ''), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** A colour at `k` (0..1) across evenly spaced stops. */
export function gradient(colors: string[], k: number): string {
  if (colors.length === 0) return '#000000'
  if (colors.length === 1) return colors[0]
  const x = Math.min(1, Math.max(0, k)) * (colors.length - 1)
  const i = Math.min(colors.length - 2, Math.floor(x))
  const [a, b] = [hex(colors[i]), hex(colors[i + 1])]
  const f = x - i
  return '#' + a.map((v, j) => Math.round(v + (b[j] - v) * f).toString(16).padStart(2, '0')).join('')
}

const beyond = (op: '>=' | '<=' | 'abs>=', v: number, th: number) =>
  op === '>=' ? v >= th : op === '<=' ? v <= th : Math.abs(v) >= th

export function newEngine(cal?: Calibration): Engine {
  return { cal, learned: false, speedRising: false, readings: {}, drifted: false, rules: {}, inside: {} }
}

const ruleState = (e: Engine, id: string) => (e.rules[id] ??= { armed: true })

/** Evaluate map and trigger rules whose input is in `inputs`. */
function evaluate(e: Engine, t: number, rules: MotionRule[], inputs: Array<keyof Readings>): Action[] {
  const out: Action[] = []
  for (const rule of rules) {
    if (!rule.enabled || rule.kind === 'place' || !inputs.includes(rule.input)) continue
    const v = e.readings[rule.input]
    if (v === undefined) continue
    const st = ruleState(e, rule.id)
    if (rule.kind === 'map' && rule.map) {
      const m = rule.map
      const raw = mapValue(v, m.from, m.to, m.min, m.max)
      const value = m.out === 'gradient'
        ? gradient(m.colors ?? [], (raw - m.min) / (m.max - m.min || 1))
        : Math.round(raw)
      if (value === st.lastOut || (st.lastEmit !== undefined && t - st.lastEmit < MIN_EMIT_MS)) continue
      st.lastOut = value
      st.lastEmit = t
      out.push({ kind: 'map', rule, value })
    } else if (rule.kind === 'trigger' && rule.trigger) {
      const tr = rule.trigger
      if (!beyond(tr.op, v, tr.threshold)) {
        st.since = undefined
        st.armed = true
        continue
      }
      st.since ??= t
      const cooled = st.lastFire === undefined || t - st.lastFire >= tr.cooldownMs
      // Once per crossing: the input has to come back before it can fire again.
      if (st.armed && cooled && t - st.since >= tr.holdMs) {
        st.armed = false
        st.lastFire = t
        out.push({ kind: 'fire', rule, action: tr.action })
      }
    }
  }
  return out
}

/** One accelerometer sample (m/s², including gravity) at time `t` ms. */
export function onMotion(e: Engine, t: number, a: Vec3, rules: MotionRule[]): Action[] {
  const dt = e.lastT === undefined ? 0 : Math.max(0, (t - e.lastT) / 1000)
  e.lastT = t
  e.filt = lowPass(e.filt, a, dt)
  if (!e.cal) return []
  const up = unit(e.cal.gravity)
  const h = horizontal(sub(e.filt, e.cal.gravity), up)
  // The first firm push while GPS says we are speeding up is forward, whatever the mount.
  if (!e.learned && e.speedRising && norm(h) >= LEARN_G * G) {
    e.cal = { ...e.cal, forward: unit(h) }
    e.learned = true
  }
  const { gLong, gLat } = project(e.filt, e.cal)
  e.readings = { ...e.readings, gLong, gLat, gTotal: Math.hypot(gLong, gLat) }
  const quiet = Math.abs(norm(e.filt) - G) < 0.5
  if (quiet) e.drifted = Math.acos(Math.min(1, dot(unit(e.filt), up))) > (20 * Math.PI) / 180
  return evaluate(e, t, rules, ['gLong', 'gLat', 'gTotal'])
}

/** One GPS fix: speed rules, then place enter/leave. */
export function onFix(e: Engine, fix: Fix, rules: MotionRule[], places: Place[]): Action[] {
  const speed = speedKmh(fix, e.fix)
  e.speedRising = e.readings.speed !== undefined && speed - e.readings.speed >= 2 && fix.t - (e.fix?.t ?? 0) <= 3000
  e.prevFix = e.fix
  e.fix = fix
  e.readings = { ...e.readings, speed }
  const out = evaluate(e, fix.t, rules, ['speed'])

  for (const p of places) {
    if (fix.accuracy > p.radius) continue
    const d = haversine(p, fix)
    const was = e.inside[p.id]
    const now = d <= p.radius ? true : d > p.radius * PLACE_EXIT ? false : was ?? false
    e.inside[p.id] = now
    // The first fix only tells where we are; arriving needs a real crossing.
    if (was === undefined || was === now) continue
    for (const rule of rules) {
      if (rule.enabled && rule.kind === 'place' && rule.place?.placeId === p.id &&
          rule.place.on === (now ? 'enter' : 'leave')) {
        out.push({ kind: 'fire', rule, action: rule.place.action })
      }
    }
  }
  return out
}

/** Speed rules hold their last output when the fix goes stale. */
export const fixStale = (e: Engine, now: number) => !e.fix || now - e.fix.t > FIX_STALE_MS

// --- presets (FR-21) ---------------------------------------------------------------
export const brakeLight = (id: string, name: string, targets: string[]): MotionRule => ({
  id, name, enabled: true, targets, input: 'gLong', kind: 'trigger',
  trigger: { op: '<=', threshold: -0.4, holdMs: 200, cooldownMs: 2000, action: { kind: 'flash', color: '#ff0000', times: 3 } },
})

export const brightnessBySpeed = (id: string, name: string, targets: string[]): MotionRule => ({
  id, name, enabled: true, targets, input: 'speed', kind: 'map',
  map: { from: 0, to: 100, out: 'brightness', min: 20, max: 100 },
})

export const cornerRule = (id: string, name: string, targets: string[]): MotionRule => ({
  id, name, enabled: true, targets, input: 'gLat', kind: 'trigger',
  trigger: { op: 'abs>=', threshold: 0.4, holdMs: 200, cooldownMs: 2000, action: { kind: 'flash', color: '#ff8800', times: 2 } },
})

export const accelRule = (id: string, name: string, targets: string[]): MotionRule => ({
  id, name, enabled: true, targets, input: 'gLong', kind: 'trigger',
  trigger: { op: '>=', threshold: 0.3, holdMs: 200, cooldownMs: 2000, action: { kind: 'flash', color: '#00ff44', times: 2 } },
})

/**
 * A synthetic drive for the Debug simulator and the tests: speed up to 60 km/h, brake
 * at −0.5 G, then a right-hand corner at +0.45 G. Phone flat, top edge forward.
 */
export const SIM_CAL: Calibration = { gravity: [0, 0, G], forward: [0, 1, 0], at: '' }
export function simulatedDrive(stepMs = 50): Array<{ t: number; a?: Vec3; fix?: Fix }> {
  const out: Array<{ t: number; a?: Vec3; fix?: Fix }> = []
  const accel = (t: number): [number, number] =>
    t < 6000 ? [0.28, 0] : t >= 7000 && t < 8000 ? [-0.5, 0] : t >= 9000 && t < 10000 ? [0, 0.45] : [0, 0]
  for (let t = 0; t <= 11000; t += stepMs) {
    const [long, lat] = accel(t)
    out.push({ t, a: [lat * G, long * G, G] })
    if (t % 1000 === 0) {
      const kmh = t <= 6000 ? t / 100 : t < 8000 ? 60 - (t - 6000) / 100 : 40
      out.push({ t, fix: { t, lat: 0, lon: 0, speed: kmh / 3.6, accuracy: 5 } })
    }
  }
  return out
}
