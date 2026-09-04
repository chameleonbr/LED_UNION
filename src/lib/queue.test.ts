import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WriteQueue } from './queue.ts'

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms) })

test('writes run in order, never concurrently', async () => {
  const q = new WriteQueue(0)
  const seen: number[] = []
  let inFlight = 0
  const op = (n: number) => async () => {
    assert.equal(inFlight, 0, 'writes overlapped')
    inFlight++
    await sleep(5)
    seen.push(n)
    inFlight--
  }
  await Promise.all([q.push(op(1)), q.push(op(2)), q.push(op(3))])
  assert.deepEqual(seen, [1, 2, 3])
})

test('gap is enforced between writes', async () => {
  const q = new WriteQueue(40)
  const t0 = Date.now()
  await q.push(async () => {})
  await q.push(async () => {})
  assert.ok(Date.now() - t0 >= 40, 'second write ran too soon')
})

test('pushLatest keeps the final value and drops superseded ones', async () => {
  const q = new WriteQueue(10)
  const seen: number[] = []
  // Block the chain so the rest pile up behind it.
  const blocker = q.push(() => sleep(30))
  for (const n of [1, 2, 3, 4]) {
    q.pushLatest('rgb', async () => {
      seen.push(n)
    })
  }
  await blocker
  await q.push(async () => {})
  assert.deepEqual(seen, [4], 'only the newest value should reach the device')
})

test('pushLatest keys are independent', async () => {
  const q = new WriteQueue(0)
  const seen: string[] = []
  const blocker = q.push(() => sleep(20))
  q.pushLatest('rgb', async () => void seen.push('rgb'))
  q.pushLatest('bri', async () => void seen.push('bri'))
  await blocker
  await q.push(async () => {})
  assert.deepEqual(seen.sort(), ['bri', 'rgb'])
})

test('a failed write does not wedge the queue', async () => {
  const q = new WriteQueue(0)
  await assert.rejects(q.push(async () => { throw new Error('gatt busy') }))
  let ran = false
  await q.push(async () => { ran = true })
  assert.ok(ran, 'queue stalled after an error')
})
