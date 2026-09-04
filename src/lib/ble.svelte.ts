import { WriteQueue } from './queue.ts'
export { parseHex, toHex } from './hex.ts'
import { epKey, parseEp } from './endpoint.ts'
export { epKey, parseEp }
import { allServices, driverFor, drivers, type Driver } from './protocol/index.ts'
import { rememberDevice, store } from './store.svelte.ts'

/** What to show a human. Never pass this to a driver. */
export const displayName = (c: { name: string; label?: string }) => c.label || c.name

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

const live = new Map<string, Live>()
const connectedAt = new Map<string, number>()

export const supported = () =>
  typeof navigator !== 'undefined' && 'bluetooth' in navigator

function track(device: BluetoothDevice, driver: Driver) {
  const name = device.name ?? '(sem nome)'
  const saved = store.devices.find((d) => d.id === device.id)
  conns[device.id] ??= { id: device.id, name, driver, state: 'offline' }
  Object.assign(conns[device.id], { name, label: saved?.label })
  if (!live.has(device.id)) {
    live.set(device.id, { device, queue: new WriteQueue(driver.minGapMs) })
  }
  device.addEventListener('gattserverdisconnected', () => {
    const c = conns[device.id]
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
    const driver = driverFor(d.name)
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

/** Opens the browser's device chooser. One device per call, by design. */
export async function addDevice(): Promise<Conn | undefined> {
  const device = await navigator.bluetooth.requestDevice({
    filters: allServices.map((s) => ({ services: [s] })),
    optionalServices: allServices,
  })
  // The chooser already filtered on our service uuids, so anything that comes back
  // speaks one of them. The name is only a hint for which; connect() confirms.
  track(device, driverFor(device.name ?? '') ?? drivers[0])
  await connect(device.id)
  return conns[device.id]
}

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
      await sleep(400 * (attempt + 1))
    }
  }
  throw last
}

/** Turn a DOMException into something that says what to actually do about it. */
function explain(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/NetworkError|GATT Server is disconnected|connection attempt failed/i.test(raw)) {
    return `${raw} — outro app pode estar segurando o aparelho; force a parada dele e tente de novo`
  }
  if (/No Services matching UUID|Nenhum serviço conhecido/i.test(raw)) {
    return `${raw} — use a aba Debug para listar o que o aparelho realmente expõe`
  }
  if (/SecurityError|not allowed/i.test(raw)) {
    return `${raw} — origem sem permissão; confira que a página está em HTTPS`
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
      ? `Serviço encontrado, mas sem característica gravável. Vistas: ${seen.join(', ')}`
      : 'Nenhum serviço conhecido encontrado neste aparelho',
  )
}

export async function connect(id: string): Promise<void> {
  const l = live.get(id)
  const c = conns[id]
  if (!l || !c) throw new Error('Aparelho não pareado nesta sessão — use Adicionar')
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
    l.char = resolved.char
    c.state = 'online'
    // Some families ignore every command until they get a handshake frame.
    for (const frame of c.driver.onConnect?.(c.name) ?? []) {
      await l.queue.push(() => writeRaw(l, frame, c.driver))
    }
  } catch (e) {
    c.state = 'error'
    c.error = explain(e)
    throw new Error(c.error)
  }
}

export function disconnect(id: string) {
  const l = live.get(id)
  if (l?.device.gatt?.connected) l.device.gatt.disconnect()
  const c = conns[id]
  if (c) c.state = 'offline'
}

const sleepMs = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms) })

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

async function writeRaw(l: Live, frame: Uint8Array, driver?: Driver) {
  const char = l.char
  if (!char) throw new Error('Não conectado')
  const chunk = driver?.chunkSize
  const withResponse = driver?.writeWithResponse ?? false

  if (!chunk || frame.length <= chunk) {
    await writeOnce(char, frame, withResponse)
    return
  }
  // Families with a fixed MTU assumption split the frame themselves and pace the
  // pieces; the gap is the only flow control they have.
  for (let i = 0; i < frame.length; i += chunk) {
    if (i > 0) await sleepMs(driver?.minGapMs ?? 30)
    await writeOnce(char, frame.subarray(i, i + chunk), withResponse)
  }
}

/** Devices the current selection resolves to, skipping ones that are not live. */
export const targets = () =>
  [...new Set(selection.ids.map((k) => parseEp(k).deviceId))]
    .map((id) => conns[id])
    .filter(Boolean)

/**
 * Build a frame per device (drivers differ) and write it to everything selected.
 * `coalesceKey` marks a stream where only the newest value matters.
 */
export async function applyTo(
  keys: string[],
  build: (driver: Driver, name: string, ch?: number) => Uint8Array | undefined,
  coalesceKey?: string,
): Promise<void> {
  await Promise.allSettled(
    keys.map(async (key) => {
      const { deviceId, ch } = parseEp(key)
      const c = conns[deviceId]
      const l = live.get(deviceId)
      if (!c || !l) return
      if (c.state !== 'online') await connect(deviceId)
      const frame = build(c.driver, c.name, ch)
      if (!frame) return
      const op = () => writeRaw(l, frame, c.driver)
      // Coalescing is per output, or two outputs would cancel each other out.
      return coalesceKey
        ? l.queue.pushLatest(`${coalesceKey}:${ch ?? ''}`, op)
        : l.queue.push(op)
    }),
  )
}

/** Applies to whatever is currently selected. */
export const apply = (
  build: (driver: Driver, name: string, ch?: number) => Uint8Array | undefined,
  coalesceKey?: string,
) => applyTo(selection.ids, build, coalesceKey)

/**
 * Send an ordered sequence of frames to one logical device.
 *
 * Uploading a custom effect means one frame per colour followed by a start command, and
 * the device rejects the lot if a colour goes missing. So this always uses `push` —
 * never `pushLatest`, whose whole job is to drop superseded writes.
 */
export async function sendFrames(
  key: string,
  build: (driver: Driver, name: string, ch?: number) => Uint8Array[],
): Promise<void> {
  const { deviceId, ch } = parseEp(key)
  const c = conns[deviceId]
  const l = live.get(deviceId)
  if (!c || !l) throw new Error('Aparelho não pareado nesta sessão')
  if (c.state !== 'online') await connect(deviceId)

  for (const frame of build(c.driver, c.name, ch)) {
    await l.queue.push(() => writeRaw(l, frame, c.driver))
  }
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
  if (!l) throw new Error('Aparelho não pareado nesta sessão')
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
  if (!l || !c) throw new Error('Aparelho não pareado nesta sessão')

  if (charUuid && charUuid !== l.char?.uuid) {
    const server = await connectGatt(l.device)
    for (const service of await server.getPrimaryServices()) {
      for (const ch of await service.getCharacteristics()) {
        if (ch.uuid === charUuid) {
          await l.queue.push(() => writeRaw({ ...l, char: ch }, frame, c.driver))
          return
        }
      }
    }
    throw new Error(`Característica ${charUuid} não encontrada`)
  }
  if (c.state !== 'online') await connect(id)
  await l.queue.push(() => writeRaw(l, frame, c.driver))
}

