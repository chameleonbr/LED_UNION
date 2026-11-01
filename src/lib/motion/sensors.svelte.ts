/**
 * Browser side of motion mode: Geolocation and DeviceMotion in, engine actions out,
 * plus the Wake Lock. Chrome stops both sensors for a hidden or locked page, so the
 * mode only runs on screen (Dark screen keeps it there with the display black).
 */
import { save, store } from '../store.svelte.ts'
import type { MotionSettings, Vec3 } from '../persist.ts'
import {
  calibrate, fixStale, newEngine, onFix, onMotion, simulatedDrive, SIM_CAL,
  type Action, type Engine, type Fix,
} from './engine.ts'
import { begin, end, execute, stats } from './run.ts'

export type SensorState = 'off' | 'waiting' | 'ok' | 'lost' | 'denied' | 'none'

/** What the Motion tab shows. Updated at most 10 times a second. */
export const live = $state({
  running: false,
  simulating: false,
  speed: 0,
  gLong: 0,
  gLat: 0,
  gps: 'off' as SensorState,
  accel: 'off' as SensorState,
  paused: '' as '' | 'hidden' | 'stealth',
  lastTrigger: '',
  /** Writes that failed this run (the device's own card says why). */
  errors: 0,
  calibrating: false,
  recalibrate: false,
})

const settings = (): MotionSettings => (store.motion ??= { rules: [], places: [] })
const rules = () => settings().rules

let engine: Engine = newEngine()
let watchId: number | undefined
let wake: { release(): Promise<void> } | undefined
let ticker: ReturnType<typeof setInterval> | undefined
let lastMotionAt = 0
let calSamples: Vec3[] | undefined
let learnSaved = false
/** Without a calibration, the first half second after Start is taken as "at rest". */
let autoSamples: Vec3[] = []

function handle(actions: Action[]) {
  // Calibrating while stopped also listens to the sensor; that must never reach the lights.
  if (!actions.length || !live.running) return
  if (store.stealth || live.paused) return
  for (const a of actions) if (a.kind === 'fire') live.lastTrigger = a.rule.name
  void execute(actions)
}

function onDeviceMotion(ev: DeviceMotionEvent) {
  const a = ev.accelerationIncludingGravity
  if (a?.x == null || a.y == null || a.z == null) return
  const v: Vec3 = [a.x, a.y, a.z]
  lastMotionAt = performance.now()
  calSamples?.push(v)
  if (!engine.cal && !live.simulating) {
    autoSamples.push(v)
    if (autoSamples.length >= 30) {
      engine.cal = settings().calibration = calibrate(autoSamples)
      save()
    }
  }
  handle(onMotion(engine, lastMotionAt, v, rules()))
  if (engine.learned && !learnSaved && engine.cal) {
    learnSaved = true
    settings().calibration = engine.cal
    save()
  }
}

function onPosition(p: GeolocationPosition) {
  const fix: Fix = {
    t: performance.now(), lat: p.coords.latitude, lon: p.coords.longitude,
    speed: p.coords.speed, accuracy: p.coords.accuracy,
  }
  live.gps = 'ok'
  handle(onFix(engine, fix, rules(), settings().places))
}

async function lock() {
  try {
    wake = await (navigator as any).wakeLock?.request('screen')
  } catch {
    wake = undefined
  }
}

function onVisibility() {
  if (!live.running || live.simulating) return
  if (document.hidden) {
    live.paused = 'hidden'
    try { navigator.vibrate?.(200) } catch { /* not allowed now */ }
  } else {
    live.paused = ''
    void lock()
  }
}

function tick() {
  const now = performance.now()
  live.speed = engine.readings.speed ?? 0
  live.gLong = engine.readings.gLong ?? 0
  live.gLat = engine.readings.gLat ?? 0
  live.recalibrate = engine.drifted
  live.errors = stats.errors
  if (live.simulating) return
  if (store.stealth) live.paused = 'stealth'
  else if (live.paused === 'stealth') live.paused = ''
  if (live.gps === 'ok' && fixStale(engine, now)) live.gps = 'waiting'
  if (live.accel === 'waiting' || live.accel === 'ok') {
    live.accel = lastMotionAt && now - lastMotionAt < 2000 ? 'ok' : lastMotionAt ? 'lost' : 'waiting'
  }
}

export async function start() {
  if (live.running) return
  // iOS-style permission; Chrome on Android has none and fires events directly.
  const DM = (globalThis as any).DeviceMotionEvent
  if (!DM) live.accel = 'none'
  else {
    live.accel = 'waiting'
    try {
      if (typeof DM.requestPermission === 'function' && (await DM.requestPermission()) !== 'granted') live.accel = 'denied'
    } catch {
      live.accel = 'denied'
    }
  }
  engine = newEngine(settings().calibration)
  lastMotionAt = 0
  learnSaved = false
  autoSamples = []
  live.lastTrigger = ''
  live.paused = ''
  begin(rules())
  live.running = true
  if (live.accel === 'waiting') addEventListener('devicemotion', onDeviceMotion)
  if ('geolocation' in navigator) {
    live.gps = 'waiting'
    watchId = navigator.geolocation.watchPosition(onPosition, (e) => {
      live.gps = e.code === e.PERMISSION_DENIED ? 'denied' : 'waiting'
    }, { enableHighAccuracy: true, maximumAge: 0 })
  } else live.gps = 'none'
  document.addEventListener('visibilitychange', onVisibility)
  ticker = setInterval(tick, 100)
  await lock()
}

export async function stop() {
  if (!live.running) return
  live.running = false
  live.simulating = false
  removeEventListener('devicemotion', onDeviceMotion)
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
  watchId = undefined
  document.removeEventListener('visibilitychange', onVisibility)
  clearInterval(ticker)
  live.gps = live.accel = 'off'
  live.paused = ''
  await wake?.release().catch(() => {})
  wake = undefined
  await end()
}

/** Hold the phone still in the holder for a second; gravity is measured from that. */
export async function calibrateNow(): Promise<boolean> {
  const listening = live.running
  if (!listening) addEventListener('devicemotion', onDeviceMotion)
  live.calibrating = true
  calSamples = []
  await new Promise((r) => setTimeout(r, 1000))
  const samples = calSamples
  calSamples = undefined
  live.calibrating = false
  if (!listening) removeEventListener('devicemotion', onDeviceMotion)
  if (samples.length < 5) return false
  settings().calibration = calibrate(samples)
  engine.cal = settings().calibration
  engine.drifted = false
  save()
  return true
}

/** Debug: drive the real lights with a synthetic trip, parked. */
export async function simulate() {
  if (live.running) return
  engine = newEngine(SIM_CAL)
  live.running = live.simulating = true
  live.gps = live.accel = 'ok'
  live.lastTrigger = ''
  begin(rules())
  ticker = setInterval(tick, 100)
  const t0 = performance.now()
  for (const s of simulatedDrive()) {
    if (!live.simulating) break
    const wait = t0 + s.t - performance.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    handle(s.a ? onMotion(engine, s.t, s.a, rules()) : onFix(engine, s.fix!, rules(), []))
  }
  await stop()
}

/** One-off position for saving a place; never stored except as the place itself. */
export const here = () =>
  new Promise<GeolocationPosition>((ok, fail) =>
    navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 15000 }),
  )
