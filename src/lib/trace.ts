/**
 * Command log: every frame written, every reply and every link change, so a session on
 * real hardware can be downloaded and checked byte by byte afterwards.
 *
 * Kept in memory and flushed to its own storage key at most once a second: a slider
 * writes up to ten times a second, and re-serialising the whole log on each would cost
 * more than the write it records. Losing the log never affects a command.
 */
export type TraceEntry = {
  t: string
  kind: 'write' | 'notify' | 'connect' | 'disconnect' | 'error'
  id: string
  name?: string
  driver?: string
  char?: string
  hex?: string
  /** Who asked: card, scene:<name>, stealth, debug, connect. */
  source?: string
  ok?: boolean
  err?: string
}

export const TRACE_KEY = 'led-union/trace'
export const TRACE_MAX = 2000

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void }
const storage = (): Storage | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function read(): TraceEntry[] {
  try {
    const v = JSON.parse(storage()?.getItem(TRACE_KEY) ?? '[]')
    return Array.isArray(v) ? v.slice(-TRACE_MAX) : []
  } catch {
    return []
  }
}

export const traceLog: { on: boolean; entries: TraceEntry[] } = { on: true, entries: read() }

let timer: ReturnType<typeof setTimeout> | undefined
export function flushTrace() {
  clearTimeout(timer)
  timer = undefined
  try {
    storage()?.setItem(TRACE_KEY, JSON.stringify(traceLog.entries))
  } catch {
    // Quota or private mode: the in-memory log still works for this session.
  }
}

export function trace(e: Omit<TraceEntry, 't'>) {
  if (!traceLog.on) return
  traceLog.entries.push({ t: new Date().toISOString(), ...e })
  if (traceLog.entries.length > TRACE_MAX) {
    traceLog.entries.splice(0, traceLog.entries.length - TRACE_MAX)
  }
  timer ??= setTimeout(flushTrace, 1000)
}

export function clearTrace() {
  traceLog.entries.length = 0
  flushTrace()
}

/** The downloadable document; `devices` lets the reader map ids to names and drivers. */
export const traceDocument = (devices: unknown) => ({
  app: 'led-union',
  exportedAt: new Date().toISOString(),
  userAgent: globalThis.navigator?.userAgent,
  devices,
  entries: traceLog.entries,
})

export function downloadTrace(devices: unknown) {
  const blob = new Blob([JSON.stringify(traceDocument(devices), null, 1)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `led-union-trace-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  document.body.append(a)
  a.click()
  a.remove()
  // Revoking right away can cancel the download on some browsers (Android among them).
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', flushTrace)
  addEventListener('visibilitychange', flushTrace)
}
