import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EVENTS, amountOf, eventOf, setAmount, setEvent, type MotionEvent } from './events.ts'
import { accelRule, brakeLight, cornerRule } from './engine.ts'

test('every event reads back as itself, with a positive amount', () => {
  const r = brakeLight('x', 'x', [])
  for (const ev of Object.keys(EVENTS) as MotionEvent[]) {
    setEvent(r, ev)
    assert.equal(eventOf(r), ev)
    assert.ok(amountOf(r) > 0)
  }
})

test('presets name themselves; braking stays negative on the wire', () => {
  assert.equal(eventOf(brakeLight('a', 'a', [])), 'brake')
  assert.equal(eventOf(accelRule('a', 'a', [])), 'accel')
  assert.equal(eventOf(cornerRule('a', 'a', [])), 'corner')
  const r = brakeLight('a', 'a', [])
  setAmount(r, 0.55)
  assert.equal(r.trigger!.threshold, -0.55)
  // Same unit keeps the amount; a new unit starts from the event's own default.
  setEvent(r, 'corner')
  assert.equal(r.trigger!.threshold, 0.55)
  setEvent(r, 'faster')
  assert.deepEqual([r.input, r.trigger!.op, r.trigger!.threshold], ['speed', '>=', 30])
})

test('a hand-made rule no event fits keeps its raw threshold', () => {
  const r = cornerRule('a', 'a', [])
  r.input = 'gTotal'
  assert.equal(eventOf(r), undefined)
  setAmount(r, 0.7)
  assert.equal(r.trigger!.threshold, 0.7)
})
