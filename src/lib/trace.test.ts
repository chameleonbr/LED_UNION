import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trace, traceLog, clearTrace, flushTrace, traceDocument, TRACE_MAX } from './trace.ts'

test('trace keeps only the newest TRACE_MAX entries', () => {
  clearTrace()
  for (let i = 0; i < TRACE_MAX + 5; i++) trace({ kind: 'write', id: 'd', hex: String(i) })
  flushTrace()
  assert.equal(traceLog.entries.length, TRACE_MAX)
  assert.equal(traceLog.entries[0].hex, '5')
})

test('trace survives storage that throws', () => {
  const g = globalThis as any
  const before = g.localStorage
  g.localStorage = { getItem: () => null, setItem: () => { throw new Error('quota') } }
  try {
    clearTrace()
    trace({ kind: 'notify', id: 'd', hex: '05 00 08 80 01' })
    assert.doesNotThrow(flushTrace)
    assert.equal(traceLog.entries.length, 1)
  } finally {
    g.localStorage = before
  }
})

test('recording off writes nothing', () => {
  clearTrace()
  traceLog.on = false
  trace({ kind: 'write', id: 'd' })
  traceLog.on = true
  assert.equal(traceLog.entries.length, 0)
})

test('export document carries devices and entries', () => {
  clearTrace()
  trace({ kind: 'connect', id: 'd', name: 'LED_BLE_1', driver: 'ipixel' })
  flushTrace()
  const doc = traceDocument([{ id: 'd', name: 'LED_BLE_1' }])
  assert.equal(doc.app, 'led-union')
  assert.ok(doc.exportedAt)
  assert.deepEqual(doc.devices, [{ id: 'd', name: 'LED_BLE_1' }])
  assert.equal(doc.entries[0].kind, 'connect')
})
