/**
 * Saved panel content. The source files are binary and can be large, so they live in
 * IndexedDB; localStorage holds strings only and about 5 MB.
 */
export type PanelItem = {
  id: string
  name: string
  kind: 'image' | 'gif' | 'text'
  /** Original file (image, gif). */
  source?: Blob
  fit?: { mode: 'cover' | 'contain' | 'stretch'; maxFrames: number }
  text?: { value: string; color: string; effect: number; speed: number }
  /** PNG of the last render, for the grid. */
  thumb?: Blob
  giphyId?: string
  /** deviceId → slot last sent to. */
  slots: Record<string, number>
  updatedAt: string
}

export class StorageFull extends Error {}

const DB = 'led-union-items'
const STORE = 'items'

let db: Promise<IDBDatabase> | undefined
function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => {
      db = undefined
      reject(r.error)
    }
  })
  return db
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await open()).transaction(STORE, mode)
  const req = fn(tx.objectStore(STORE))
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result)
    // A quota error aborts the whole transaction, so nothing partial is left behind.
    tx.onabort = tx.onerror = () =>
      reject(tx.error?.name === 'QuotaExceededError' ? new StorageFull() : tx.error)
  })
}

export const listItems = async () =>
  (await run('readonly', (s) => s.getAll() as IDBRequest<PanelItem[]>)).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )
export const putItem = (item: PanelItem) => run('readwrite', (s) => s.put(plain(item)))
export const removeItem = (id: string) => run('readwrite', (s) => s.delete(id))

/** Svelte state proxies cannot be structured-cloned; Blobs survive a plain copy. */
function plain(item: PanelItem): PanelItem {
  return { ...item, fit: item.fit && { ...item.fit }, text: item.text && { ...item.text }, slots: { ...item.slots } }
}
