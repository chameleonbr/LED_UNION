import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  G, SIM_CAL, brakeLight, brightnessBySpeed, calibrate, gradient, haversine, lowPass, mapValue,
  newEngine, onFix, onMotion, project, simulatedDrive, speedKmh, fixStale, type Fix,
} from './engine.ts'
import type { MotionRule, Place } from '../persist.ts'

const fix = (t: number, lat: number, lon: number, speed: number | null = null, accuracy = 5): Fix =>
  ({ t, lat, lon, speed, accuracy })

test('speed from the fix, else from distance, with a dead band', () => {
  assert.equal(Math.round(speedKmh(fix(0, 0, 0, 10))), 36)
  // ~111 m north in 4 s ≈ 100 km/h
  assert.equal(Math.round(speedKmh(fix(4000, 0.001, 0), fix(0, 0, 0)) / 10), 10)
  assert.equal(speedKmh(fix(0, 0, 0, 0.5)), 0)
  assert.equal(Math.round(haversine({ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 })), 111)
})

test('a fix older than 5 s is stale', () => {
  const e = newEngine()
  assert.equal(fixStale(e, 0), true)
  onFix(e, fix(1000, 0, 0, 10), [], [])
  assert.equal(fixStale(e, 5000), false)
  assert.equal(fixStale(e, 7000), true)
})

test('low-pass moves part way towards the input', () => {
  assert.deepEqual(lowPass(undefined, [1, 2, 3], 0.1), [1, 2, 3])
  const y = lowPass([0, 0, 0], [1, 0, 0], 0.3)
  assert.equal(y[0], 0.5)
})

test('calibration finds gravity and projects braking and a right turn', () => {
  // Upright in a holder, screen to the driver: gravity on +y, forward out of the back.
  const cal = calibrate([[0, G, 0], [0, G, 0]])
  assert.deepEqual(cal.forward.map((v) => Math.round(v)), [0, 0, -1])
  // Braking pushes the phone forward: the accelerometer reads −0.5 G along forward.
  const brake = project([0, G, 0.5 * G], cal)
  assert.equal(Math.round(brake.gLong * 10), -5)
  // Phone flat, top edge forward: a right turn pulls towards +x.
  const right = project([0.4 * G, 0, G], SIM_CAL)
  assert.equal(Math.round(right.gLat * 10), 4)
  assert.equal(Math.round(right.gLong * 10), 0)
})

test('forward is learned from the first push while GPS speed rises', () => {
  // Wrong guess on purpose: forward set to +x, real motion along +y.
  const e = newEngine({ gravity: [0, 0, G], forward: [1, 0, 0], at: '' })
  onFix(e, fix(0, 0, 0, 0), [], [])
  onFix(e, fix(1000, 0, 0, 2), [], [])
  assert.equal(e.speedRising, true)
  for (let t = 1000; t < 2000; t += 50) onMotion(e, t, [0, 0.3 * G, G], [])
  assert.equal(e.learned, true)
  assert.ok(e.readings.gLong! > 0.25)
})

test('map clamps and interpolates', () => {
  assert.equal(mapValue(50, 0, 100, 20, 100), 60)
  assert.equal(mapValue(-5, 0, 100, 20, 100), 20)
  assert.equal(mapValue(500, 0, 100, 20, 100), 100)
  assert.equal(gradient(['#000000', '#ff0000'], 0.5), '#800000')
  assert.equal(gradient(['#00ff00', '#0000ff', '#ff0000'], 1), '#ff0000')
})

test('brake trigger holds 200 ms, fires once per crossing, respects cooldown', () => {
  const rule = brakeLight('b', 'Brake', ['x'])
  const e = newEngine(SIM_CAL)
  const fired: number[] = []
  const run = (from: number, to: number, long: number) => {
    for (let t = from; t < to; t += 20) {
      if (onMotion(e, t, [0, long * G, G], [rule]).length) fired.push(t)
    }
  }
  run(0, 400, 0)
  run(400, 450, -0.6) // too short after the filter
  run(450, 1000, 0)
  assert.equal(fired.length, 0)
  run(1000, 2000, -0.6) // held: fires once
  assert.equal(fired.length, 1)
  run(2000, 2600, 0)
  run(2600, 3200, -0.6) // a new crossing, but inside the 2 s cooldown
  assert.equal(fired.length, 1)
  run(3200, 3600, 0)
  run(3600, 4500, -0.6) // cooled down: fires again
  assert.equal(fired.length, 2)
  assert.ok(fired[1] - fired[0] >= 2000)
})

test('map output is throttled to 10 per second', () => {
  const rule: MotionRule = { ...brightnessBySpeed('s', 'Speed', ['x']), input: 'gTotal', map: { from: 0, to: 1, out: 'brightness', min: 0, max: 100 } }
  const e = newEngine(SIM_CAL)
  let n = 0
  for (let t = 0; t < 1000; t += 16) n += onMotion(e, t, [0, (t / 1000) * G, G], [rule]).length
  assert.ok(n <= 10, `got ${n}`)
  assert.ok(n >= 5)
})

test('place fires on a real crossing only, with hysteresis', () => {
  const home: Place = { id: 'h', name: 'Home', lat: 0, lon: 0, radius: 100 }
  const rule: MotionRule = {
    id: 'p', name: 'Arrive', enabled: true, targets: [], input: 'speed', kind: 'place',
    place: { placeId: 'h', on: 'enter', action: { kind: 'scene', sceneId: 's' } },
  }
  const e = newEngine()
  const at = (t: number, m: number) => onFix(e, fix(t, m / 111000, 0), [rule], [home]).filter((a) => a.kind === 'fire')
  assert.equal(at(0, 50).length, 0) // starts inside: no fire
  assert.equal(at(1000, 110).length, 0) // between r and 1.2r: still inside
  assert.equal(at(2000, 90).length, 0)
  assert.equal(at(3000, 130).length, 0) // left
  assert.equal(at(4000, 80).length, 1) // arrived
  assert.equal(at(5000, 70).length, 0)
  // A fix less accurate than the radius is ignored.
  assert.equal(onFix(e, fix(6000, 1, 0, null, 500), [rule], [home]).length, 0)
})

test('the simulated drive brakes once and drives brightness up', () => {
  const brake = brakeLight('b', 'Brake', ['x'])
  const speed = brightnessBySpeed('s', 'Speed', ['x'])
  const e = newEngine(SIM_CAL)
  const acts = simulatedDrive().flatMap((s) =>
    s.a ? onMotion(e, s.t, s.a, [brake, speed]) : onFix(e, s.fix!, [brake, speed], []),
  )
  assert.equal(acts.filter((a) => a.kind === 'fire').length, 1)
  const levels = acts.filter((a) => a.kind === 'map').map((a) => a.value as number)
  assert.equal(levels[0], 20)
  assert.equal(Math.max(...levels), 68)
})
