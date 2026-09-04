const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms) })

/**
 * Serial write queue for one device.
 *
 * These controllers drop or mangle concurrent writes, so everything for a device
 * goes through one chain with a minimum gap between frames. The original apps
 * *discard* writes inside that window; dragging a colour picker there loses the
 * final value. We coalesce instead: a queued op can be superseded by a newer one
 * with the same key, so the last value always lands.
 */
export class WriteQueue {
  #tail: Promise<void> = Promise.resolve()
  #last = 0
  #pending = new Map<string, () => Promise<void>>()
  #gapMs: number

  constructor(gapMs: number) {
    this.#gapMs = gapMs
  }

  /** Queue an op that must not be dropped (power, handshake, effect changes). */
  push(op: () => Promise<void>): Promise<void> {
    return this.#chain(op)
  }

  /**
   * Queue an op that only the newest value matters for (colour, brightness).
   * A later call with the same key replaces one still waiting its turn.
   */
  pushLatest(key: string, op: () => Promise<void>): Promise<void> {
    const superseded = this.#pending.has(key)
    this.#pending.set(key, op)
    if (superseded) return this.#tail
    return this.#chain(async () => {
      const latest = this.#pending.get(key)
      this.#pending.delete(key)
      if (latest) await latest()
    })
  }

  #chain(op: () => Promise<void>): Promise<void> {
    this.#tail = this.#tail.then(async () => {
      const wait = this.#gapMs - (Date.now() - this.#last)
      if (wait > 0) await sleep(wait)
      this.#last = Date.now()
      await op()
    })
    // Keep the chain alive after a failed write; the caller sees the rejection.
    const result = this.#tail
    this.#tail = this.#tail.catch(() => {})
    return result
  }
}
