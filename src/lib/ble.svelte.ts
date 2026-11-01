import { SvelteMap } from 'svelte/reactivity'
import { WriteQueue } from './queue.ts'
import { t } from './i18n.svelte.ts'
export { parseHex, toHex, BadHexError } from './hex.ts'
import { toHex } from './hex.ts'
import { trace } from './trace.ts'
import { epKey, parseEp } from './endpoint.ts'
export { epKey, parseEp }
import { allServices, driverFor, drivers, type Driver } from './protocol/index.ts'
import { parseAck, windowSize, windows, type ContentKind } from './protocol/ipixel-content.ts'
import {
  forgetDevice,
  lookOf,
  rekey,
  rememberDevice,
  save,
  setDriverId,
  setPanel,
  patchPanel,
  store,
} from './store.svelte.ts'

/** What to show a human. Never pass this to a driver. */
export const displayName = (c: { name: string; label?: string }) => c.label || c.name

/**
 * The `name` builders get. Stateful families key their memory by it, and every BLEDIM
 * advertises as "BLEDIM", so two of them would share one memory under the plain name.
 */
const builderName = (c: Conn) => (c.driver.keysStateByName ? `${c.name}@${c.id}` : c.name)

export type ConnState = 'offline' | 'connecting' | 'online' | 'error'

export type Conn = {
  id: string
  /** Advertised name — what the drivers branch on. */
  name: string
  /** User-chosen display name, if any. */
  label?: string
  driver: Driver
  state: ConnState
  error?: string
  /** ms the link stayed up before the device dropped it, if it ever did. */
  lastLinkMs?: number
}

type Live = {
  device: BluetoothDevice
  char?: BluetoothRemoteGATTCharacteristic
  queue: WriteQueue
}

/** UI-visible connection state, keyed by device id. */
export const conns = $state<Record<string, Conn>>({})

/** Which devices commands apply to. Empty means nothing is targeted. */
export const selection = $state<{ ids: string[] }>({ ids: [] })

// Reactive so the UI can count devices this session can no longer reach.
const live = new SvelteMap<string, Live>()

/** Whether this session holds a handle to the device, i.e. connect() can work without the chooser. */
export const linked = (id: string) => live.has(id)
const connectedAt = new Map<string, number>()

export const supported = () =>
  typeof navigator !== 'undefined' && 'bluetooth' in navigator

// Re-adding or restoring the same device must not stack a second disconnect listener.
const listening = new WeakSet<BluetoothDevice>()

function track(device: BluetoothDevice, guess: Driver) {
  const name = device.name ?? t('devices.unnamed')
  const saved = store.devices.find((d) => d.id === device.id)
  // A family the probe confirmed earlier beats a guess from the name.
  const driver = drivers.find((d) => d.id === saved?.driverId) ?? guess
  conns[device.id] ??= { id: device.id, name, driver, state: 'offline' }
  Object.assign(conns[device.id], { name, label: saved?.label })
  if (!live.has(device.id)) {
    live.set(device.id, { device, queue: new WriteQueue(driver.minGapMs) })
  }
  if (!listening.has(device)) {
    listening.add(device)
    device.addEventListener('gattserverdisconnected', () => {
      const c = conns[device.id]
      trace({ kind: 'disconnect', id: device.id, name: device.name })
      if (c) {
        c.state = 'offline'
        const up = connectedAt.get(device.id)
        // A link that dies in under a couple of seconds usually means the device
        // expected a handshake we did not send.
        if (up) c.lastLinkMs = Date.now() - up
      }
      connectedAt.delete(device.id)
      const l = live.get(device.id)
      if (l) l.char = undefined
    })
  }
  rememberDevice({ id: device.id, name, label: saved?.label, driverId: driver.id })
}

/**
 * Re-adopt devices the browser already has permission for, so a reload does not
 * force the user back through the chooser. Chrome may gate getDevices() behind a
 * flag; when it is missing or empty the saved list still drives the UI and each
 * device is re-paired on demand.
 */
export async function restore(): Promise<void> {
  if (!supported()) return
  for (const d of store.devices) {
    // The probe may have confirmed a different family than the name suggests (an iPixel
    // advertises LED_BLE_xx like FFE0 controllers do), so the saved id wins.
    const driver = drivers.find((x) => x.id === d.driverId) ?? driverFor(d.name)
    if (driver) {
      conns[d.id] ??= { id: d.id, name: d.name, label: d.label, driver, state: 'offline' }
    }
  }
  const getDevices = (navigator.bluetooth as any).getDevices?.bind(navigator.bluetooth)
  if (!getDevices) return
  try {
    for (const device of (await getDevices()) as BluetoothDevice[]) {
      const driver = driverFor(device.name ?? '')
      if (driver) track(device, driver)
    }
  } catch {
    // Not fatal — the chooser path still works.
  }

  // Best-effort: walking in with the app already connected is the point. Chrome may
  // still require a user gesture for the first connect after load, so a failure here
  // is silent and the "Connect all" button remains the reliable path.
  await Promise.allSettled(
    Object.keys(conns).map((id) => connect(id).catch(() => {})),
  )
}

/**
 * Chrome can return a device picked again in the chooser under a new id, and without
 * the new permissions backend getDevices() returns nothing after a reload. Either way
 * the saved name, outputs, looks and groups would stay behind on the old id, so the
 * new id takes them over.
 */
function adopt(device: BluetoothDevice, savedId: string) {
  if (savedId === device.id) return
  disconnect(savedId)
  delete conns[savedId]
  live.delete(savedId)
  connectedAt.delete(savedId)
  const moved = (k: string) => (parseEp(k).deviceId === savedId ? device.id + k.slice(savedId.length) : k)
  selection.ids = selection.ids.map(moved)
  rekey(savedId, device.id)
}

async function pickAndConnect(device: BluetoothDevice, savedId?: string) {
  if (savedId) adopt(device, savedId)
  // The chooser already filtered on our service uuids, so anything that comes back
  // speaks one of them. The name is only a hint for which; connect() confirms.
  track(device, driverFor(device.name ?? '') ?? drivers[0])
  await connect(device.id)
  return conns[device.id]
}

/** Opens the browser's device chooser. One device per call, by design. */
export async function addDevice(): Promise<Conn | undefined> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [
      ...allServices.map((s) => ({ services: [s] })),
      // Some panels advertise only their name, not the service.
      ...drivers.flatMap((d) => (d.namePrefix ? [{ namePrefix: d.namePrefix }] : [])),
    ],
    optionalServices: allServices,
  })
  // A device already saved under another id is most likely this one coming back. Only
  // a single unlinked match is safe to take over: two "BLEDIM"s cannot be told apart.
  const known = store.devices.some((d) => d.id === device.id)
  const same = store.devices.filter((d) => d.name === device.name && !live.has(d.id))
  return pickAndConnect(device, !known && same.length === 1 ? same[0].id : undefined)
}

/**
 * Re-pair one saved device the browser no longer hands back. The chooser is narrowed
 * to its name, and whatever is picked inherits everything saved for it.
 */
export async function relink(savedId: string): Promise<Conn | undefined> {
  const saved = store.devices.find((d) => d.id === savedId)
  if (!saved) return addDevice()
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ name: saved.name }],
    optionalServices: allServices,
  })
  return pickAndConnect(device, savedId)
}

/** Connect, or re-pair first when this session has no link to the device yet. */
export const connectOrRelink = (id: string) =>
  live.has(id) ? connect(id) : relink(id).then(() => {})

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms) })

/**
 * First connects to a BLE peripheral fail often on Android — the radio is busy, the
 * previous app has not released the link yet, or the device is mid-advertising. A
 * couple of retries turns most of those into a success.
 */
async function connectGatt(device: BluetoothDevice): Promise<BluetoothRemoteGATTServer> {
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const server = await device.gatt!.connect()
      connectedAt.set(device.id, Date.now())
      return server
    } catch (e) {
      last = e
      if (device.gatt?.connected) device.gatt.disconnect()
      // A handle from getDevices() is "out of range" until Chrome hears the device
      // advertise again this session; waiting for that beats re-adding it.
      if (/no longer in range/i.test(String(e)) && (await heardAdvert(device))) continue
      await sleep(400 * (attempt + 1))
    }
  }
  throw last
}

/** Wait up to `ms` for one advertisement from the device. False when unsupported or silent. */
async function heardAdvert(device: BluetoothDevice, ms = 6000): Promise<boolean> {
  if (!device.watchAdvertisements) return false
  const stop = new AbortController()
  try {
    const heard = new Promise<boolean>((resolve) => {
      device.addEventListener('advertisementreceived', () => resolve(true), { once: true, signal: stop.signal })
      setTimeout(() => resolve(false), ms)
    })
    await device.watchAdvertisements({ signal: stop.signal })
    return await heard
  } catch {
    return false
  } finally {
    stop.abort()
  }
}

/** Turn a DOMException into something that says what to actually do about it. */
function explain(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/NetworkError|GATT Server is disconnected|connection attempt failed/i.test(raw)) {
    return `${raw} — ${t('err.hintBusy')}`
  }
  if (/No Services matching UUID/i.test(raw) || raw === t('err.noService')) {
    return `${raw} — ${t('err.hintDebug')}`
  }
  if (/SecurityError|not allowed/i.test(raw)) {
    return `${raw} — ${t('err.hintHttps')}`
  }
  return raw
}

/**
 * Device names are not reliable (BLEDIM, LED_BLE_xx and MELK-xx all turn up), so the
 * name is only a first guess. Whichever driver's service and characteristic actually
 * exist on the device is the one we use.
 */
async function resolveDriver(
  server: BluetoothRemoteGATTServer,
  guess: Driver,
): Promise<{ driver: Driver; char: BluetoothRemoteGATTCharacteristic }> {
  const order = [guess, ...drivers.filter((d) => d !== guess)]
  const seen: string[] = []
  for (const driver of order) {
    let service: BluetoothRemoteGATTService
    try {
      service = await server.getPrimaryService(driver.service)
    } catch {
      continue // Different family.
    }

    // The documented characteristic is the happy path, but vendors reuse the same
    // service with a different write handle — BLEDIM does. Any writable
    // characteristic in the right service beats refusing to connect.
    try {
      return { driver, char: await service.getCharacteristic(driver.writeChar) }
    } catch {
      const chars = await service.getCharacteristics()
      seen.push(...chars.map((c) => c.uuid.slice(4, 8)))
      const writable = chars.find(
        (c) => c.properties.write || c.properties.writeWithoutResponse,
      )
      if (writable) return { driver, char: writable }
    }
  }
  throw new Error(
    seen.length
      ? t('err.noWritable', { seen: seen.join(', ') })
      : t('err.noService'),
  )
}

/** Last notification per device, in hex, for the Debug screen. */
export const lastNotify = $state<Record<string, string>>({})

// A reconnect can hand back the same characteristic object; one listener is enough.
const notifying = new WeakSet<BluetoothRemoteGATTCharacteristic>()

async function listen(id: string, server: BluetoothRemoteGATTServer, driver: Driver) {
  if (!driver.notifyChar) return
  try {
    const service = await server.getPrimaryService(driver.service)
    const ch = await service.getCharacteristic(driver.notifyChar)
    if (!notifying.has(ch)) {
      notifying.add(ch)
      ch.addEventListener('characteristicvaluechanged', () => {
        const v = ch.value
        if (!v) return
        const data = new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
        lastNotify[id] = toHex(data)
        trace({ kind: 'notify', id, char: ch.uuid, hex: lastNotify[id] })
        ackWaiters.get(id)?.(data)
        const report = conns[id]?.driver.onNotify?.(data)
        if (report?.panel) setPanel(id, report.panel)
        if (report?.mcu !== undefined) patchPanel(id, { mcu: report.mcu })
      })
    }
    await ch.startNotifications()
  } catch (e) {
    // Commands still work without replies; only the panel size stays unknown.
    trace({ kind: 'error', id, err: `notify: ${explain(e)}` })
  }
}

// A scene or the Everything card can ask for the same offline device several times at
// once; they all wait on one GATT connect instead of racing each other.
const connecting = new Map<string, Promise<void>>()

export function connect(id: string): Promise<void> {
  const pending = connecting.get(id)
  if (pending) return pending
  const p = connectOnce(id).finally(() => connecting.delete(id))
  connecting.set(id, p)
  return p
}

async function connectOnce(id: string): Promise<void> {
  const l = live.get(id)
  const c = conns[id]
  if (!l || !c) throw new Error(t('err.notPairedAdd'))
  if (c.state === 'online' && l.char) return

  c.state = 'connecting'
  c.error = undefined
  try {
    const server = await connectGatt(l.device)
    const resolved = await resolveDriver(server, c.driver)
    if (resolved.driver !== c.driver) {
      c.driver = resolved.driver
      // Pacing is per-family, so the queue has to follow the driver.
      l.queue = new WriteQueue(resolved.driver.minGapMs)
    }
    setDriverId(id, c.driver.id)
    l.char = resolved.char
    c.state = 'online'
    trace({ kind: 'connect', id, name: c.name, driver: c.driver.id, char: l.char.uuid })
    // Listen before the handshake: its reply is what tells the panel's size.
    await listen(id, server, c.driver)
    // Some families ignore every command until they get a handshake frame.
    for (const frame of c.driver.onConnect?.(c.name) ?? []) {
      await l.queue.push(() => writeRaw(l, frame, c.driver, 'connect'))
    }
    // A light that wakes up during stealth must not be the one that gives the car away.
    if (store.stealth) {
      const outs: Array<{ ch?: number; variant?: string }> = c.driver.outputs?.(c.name) ?? []
      const many = outs.length > 1
      for (const [i, o] of (many ? outs : [{}]).entries()) {
        // Joining late still means it gets its look back when stealth ends.
        const key = many ? epKey(id, i) : id
        store.stealth.snapshot[key] ??= JSON.parse(JSON.stringify(lookOf(key)))
        const frame = c.driver.power(false, builderName(c), o.ch, o.variant)
        await l.queue.push(() => writeRaw(l, frame, c.driver, 'stealth'))
      }
      save()
    }
  } catch (e) {
    c.state = 'error'
    c.error = explain(e)
    trace({ kind: 'error', id, name: c.name, err: c.error })
    throw new Error(c.error)
  }
}

/**
 * Forget a device everywhere.
 *
 * Dropping it from the store alone left it on screen, because the lists render from
 * `conns` — which `restore()` also repopulates from the saved devices on every load.
 * So the connection state has to go too, or a deleted device comes straight back.
 */
export function forget(id: string) {
  disconnect(id)
  delete conns[id]
  live.delete(id)
  connectedAt.delete(id)
  selection.ids = selection.ids.filter((k) => parseEp(k).deviceId !== id)
  forgetDevice(id)
}

export function disconnect(id: string) {
  const l = live.get(id)
  if (l?.device.gatt?.connected) l.device.gatt.disconnect()
  const c = conns[id]
  if (c) c.state = 'offline'
}

async function writeOnce(
  char: BluetoothRemoteGATTCharacteristic,
  part: Uint8Array,
  withResponse: boolean,
) {
  const buf = part as unknown as BufferSource
  if (withResponse) {
    await char.writeValue(buf)
    return
  }
  try {
    // Most of these controllers advertise write-without-response, which is also the
    // only mode fast enough for a colour slider.
    await char.writeValueWithoutResponse(buf)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotSupportedError') {
      await char.writeValue(buf)
      return
    }
    throw e
  }
}

/**
 * `brief` is for upload windows: up to 12 KB each, so the log keeps the header and the
 * first bytes, and the chunks go back to back (write-with-response already paces them).
 */
async function writeRaw(l: Live, frame: Uint8Array, driver?: Driver, source?: string, brief = false) {
  const entry = {
    kind: 'write' as const,
    id: l.device.id,
    name: l.device.name,
    driver: driver?.id,
    char: l.char?.uuid,
    hex: brief && frame.length > 31 ? `${toHex(frame.subarray(0, 31))} … (${frame.length} B)` : toHex(frame),
    source,
  }
  try {
    await writeFrame(l, frame, driver, brief ? 0 : undefined)
    trace({ ...entry, ok: true })
  } catch (e) {
    trace({ ...entry, ok: false, err: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

async function writeFrame(l: Live, frame: Uint8Array, driver?: Driver, gapMs = driver?.minGapMs ?? 30) {
  const char = l.char
  if (!char) throw new Error(t('err.notConnected'))
  const chunk = driver?.chunkSize
  const withResponse = driver?.writeWithResponse ?? false

  if (!chunk || frame.length <= chunk) {
    await writeOnce(char, frame, withResponse)
    return
  }
  // Families with a fixed MTU assumption split the frame themselves and pace the
  // pieces; the gap is the only flow control they have.
  for (let i = 0; i < frame.length; i += chunk) {
    if (i > 0 && gapMs) await sleep(gapMs)
    await writeOnce(char, frame.subarray(i, i + chunk), withResponse)
  }
}

/**
 * An endpoint key is `deviceId#index`, where the index points into the model's own
 * output list. Resolving it gives the channel byte or protocol variant to send with.
 */
export function outputAt(deviceId: string, index?: number) {
  if (index === undefined) return {}
  const c = conns[deviceId]
  const out = c?.driver.outputs?.(c.name)?.[index]
  return { ch: out?.ch, variant: out?.variant }
}

/** `force` skips the stealth check (stealth itself, its restore); `source` tags the log. */
export type SendOpts = { force?: boolean; source?: string }

/**
 * While stealth is on, nothing lights up without the user saying so. Asking once and
 * dropping stealth on yes means a dragged slider prompts a single time.
 */
export function leaveStealth(): boolean {
  if (!store.stealth) return true
  if (typeof confirm !== 'function' || !confirm(t('stealth.leave'))) return false
  store.stealth = undefined
  save()
  return true
}

/**
 * Build a frame per device (drivers differ) and write it to everything selected.
 * `coalesceKey` marks a stream where only the newest value matters.
 */
export async function applyTo(
  keys: string[],
  build: (
    driver: Driver,
    name: string,
    ch?: number,
    variant?: string,
  ) => Uint8Array | undefined,
  coalesceKey?: string,
  opts?: SendOpts,
): Promise<boolean> {
  // False tells the caller nothing was sent, so it must not record a look (BR-30).
  if (!opts?.force && !leaveStealth()) return false
  await Promise.allSettled(
    keys.map(async (key) => {
      const { deviceId, ch } = parseEp(key)
      const c = conns[deviceId]
      const l = live.get(deviceId)
      if (!c || !l) return
      // One device failing must not stop the others, but the card has to say so.
      try {
        if (c.state !== 'online') await connect(deviceId)
        const o = outputAt(deviceId, ch)
        const frame = build(c.driver, builderName(c), o.ch, o.variant)
        // Empty means the family has no such command (BR-21).
        if (!frame?.length) return
        const op = () => writeRaw(l, frame, c.driver, opts?.source ?? 'card')
        // Coalescing is per output, or two outputs would cancel each other out.
        await (coalesceKey
          ? l.queue.pushLatest(`${coalesceKey}:${ch ?? ''}`, op)
          : l.queue.push(op))
        c.error = undefined
      } catch (e) {
        // connect() has already explained its own failure; explaining again doubles the hint.
        if (c.state !== 'error') c.error = explain(e)
      }
    }),
  )
  return true
}


/**
 * Send an ordered sequence of frames to one logical device.
 *
 * Uploading a custom effect means one frame per colour followed by a start command, and
 * the device rejects the lot if a colour goes missing. So this always uses `push` —
 * never `pushLatest`, whose whole job is to drop superseded writes.
 */
export async function sendFrames(
  key: string,
  build: (driver: Driver, name: string, ch?: number, variant?: string) => Uint8Array[],
  opts?: SendOpts,
): Promise<boolean> {
  if (!opts?.force && !leaveStealth()) return false
  const { deviceId, ch } = parseEp(key)
  const c = conns[deviceId]
  const l = live.get(deviceId)
  if (!c || !l) throw new Error(t('err.notPaired'))
  if (c.state !== 'online') await connect(deviceId)

  const o = outputAt(deviceId, ch)
  try {
    for (const frame of build(c.driver, builderName(c), o.ch, o.variant)) {
      await l.queue.push(() => writeRaw(l, frame, c.driver, opts?.source ?? 'card'))
    }
    c.error = undefined
  } catch (e) {
    if (c.state !== 'error') c.error = explain(e)
    throw new Error(c.error)
  }
  return true
}

export type CharInfo = { uuid: string; props: string[] }
export type ServiceInfo = { uuid: string; chars: CharInfo[] }

function propsOf(ch: BluetoothRemoteGATTCharacteristic): string[] {
  const p = ch.properties
  const names: Array<[boolean, string]> = [
    [p.read, 'READ'],
    [p.write, 'WRITE'],
    [p.writeWithoutResponse, 'WRITE_NR'],
    [p.notify, 'NOTIFY'],
    [p.indicate, 'INDICATE'],
  ]
  return names.filter(([on]) => on).map(([, n]) => n)
}

/**
 * Enumerate what the device actually exposes. Web Bluetooth only reveals services
 * declared up front, so an unlisted one is probed by uuid; characteristics inside a
 * service we can reach need no such declaration.
 */
export async function inspect(id: string): Promise<ServiceInfo[]> {
  const l = live.get(id)
  if (!l) throw new Error(t('err.notPaired'))
  const server = await connectGatt(l.device)

  let services: BluetoothRemoteGATTService[] = []
  try {
    services = await server.getPrimaryServices()
  } catch {
    for (const uuid of allServices) {
      try {
        services.push(await server.getPrimaryService(uuid))
      } catch {
        // Not on this device.
      }
    }
  }

  const out: ServiceInfo[] = []
  for (const service of services) {
    let chars: BluetoothRemoteGATTCharacteristic[] = []
    try {
      chars = await service.getCharacteristics()
    } catch {
      // Service present but characteristics not readable.
    }
    out.push({
      uuid: service.uuid,
      chars: chars.map((ch) => ({ uuid: ch.uuid, props: propsOf(ch) })),
    })
  }
  return out
}

/** Send an arbitrary frame to one device — the bench for an unknown protocol. */
export async function sendRaw(
  id: string,
  frame: Uint8Array,
  charUuid?: string,
): Promise<void> {
  const l = live.get(id)
  const c = conns[id]
  if (!l || !c) throw new Error(t('err.notPaired'))

  if (charUuid && charUuid !== l.char?.uuid) {
    const server = await connectGatt(l.device)
    for (const service of await server.getPrimaryServices()) {
      for (const ch of await service.getCharacteristics()) {
        if (ch.uuid === charUuid) {
          await l.queue.push(() => writeRaw({ ...l, char: ch }, frame, c.driver, 'debug'))
          return
        }
      }
    }
    throw new Error(t('err.charNotFound', { uuid: charUuid }))
  }
  if (c.state !== 'online') await connect(id)
  await l.queue.push(() => writeRaw(l, frame, c.driver, 'debug'))
}


// --- content upload (LED panels) ------------------------------------------------------

/** While an upload waits for its ACK, the device's notifications go here first. */
const ackWaiters = new Map<string, (d: Uint8Array) => void>()

export type UploadFailure = 'rejected' | 'full' | 'timeout' | 'cancelled'
export class UploadError extends Error {
  code: UploadFailure
  constructor(code: UploadFailure) {
    super(t(`upload.${code}`))
    this.code = code
  }
}

/**
 * Catch the panel's answer to a write. Listening starts now, before the write, so a fast
 * answer is not missed; the timeout only starts in `wait`, after the write has gone out:
 * a 12 KB window can take seconds to write on its own.
 */
function listenFor(id: string, match: (d: Uint8Array) => boolean) {
  let hit: Uint8Array | undefined
  let wake: ((d: Uint8Array) => void) | undefined
  const handler = (d: Uint8Array) => {
    if (!match(d)) return
    hit = d
    wake?.(d)
  }
  ackWaiters.set(id, handler)
  // Only remove our own: a stale listener must never unhook the next upload's.
  const stop = () => {
    if (ackWaiters.get(id) === handler) ackWaiters.delete(id)
  }
  const wait = (ms: number, signal?: AbortSignal) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const finish = (err?: UploadError, d?: Uint8Array) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        stop()
        if (err) reject(err)
        else resolve(d!)
      }
      const abort = () => finish(new UploadError('cancelled'))
      const timer = setTimeout(() => finish(new UploadError('timeout')), ms)
      if (hit) return finish(undefined, hit)
      if (signal?.aborted) return abort()
      signal?.addEventListener('abort', abort)
      wake = (d) => finish(undefined, d)
    })
  return { wait, stop }
}

/** Write, then wait for the matching answer; a failed write drops its listener. */
async function writeAndWait(
  l: Live, frame: Uint8Array, driver: Driver, source: string, brief: boolean,
  match: (d: Uint8Array) => boolean, ms: number, signal?: AbortSignal,
) {
  const answer = listenFor(l.device.id, match)
  try {
    await writeRaw(l, frame, driver, source, brief)
  } catch (e) {
    answer.stop()
    throw e
  }
  return answer.wait(ms, signal)
}

export type UploadOpts = {
  onProgress?: (sent: number, total: number) => void
  signal?: AbortSignal
  source?: string
}

/**
 * Store content in a panel slot. One queue op for the whole upload: windows are never
 * coalesced or interleaved with other writes, and each waits for the panel's ACK.
 */
export async function upload(id: string, kind: ContentKind, slot: number, content: Uint8Array, opts: UploadOpts = {}) {
  if (conns[id]?.state !== 'online') await connect(id)
  const l = live.get(id)
  const c = conns[id]
  if (!l || !c?.driver.showSlot) throw new Error(t('err.notConnected'))
  const panel = store.devices.find((d) => d.id === id)?.panel
  const frames = windows(kind, slot, content, windowSize(panel))
  const source = opts.source ?? `upload:${kind}`

  await l.queue.push(async () => {
    // Firmware 5+ wants the target slot selected first (ImageFragment.java:1867); an empty
    // slot may not answer, so silence is fine here.
    if ((panel?.mcu ?? 0) >= 500) {
      const selected = (d: Uint8Array) => d.length === 5 && d[2] === 0x08 && d[3] === 0x80
      await writeAndWait(l, c.driver.showSlot!(slot, c.name), c.driver, source, false, selected, 2000, opts.signal)
        .catch((e: UploadError) => { if (e.code === 'cancelled') throw e })
    }
    for (const [i, frame] of frames.entries()) {
      if (opts.signal?.aborted) throw new UploadError('cancelled')
      const d = await writeAndWait(l, frame, c.driver, source, true, (d) => parseAck(d, kind) !== undefined, 6000, opts.signal)
      const a = parseAck(d, kind)
      if (a === 'rejected' || a === 'full') throw new UploadError(a)
      opts.onProgress?.(i + 1, frames.length)
    }
  })
}
