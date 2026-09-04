import { WriteQueue } from './queue.ts'
export { parseHex, toHex } from './hex.ts'
import { allServices, driverFor, drivers, type Driver } from './protocol/index.ts'
import { rememberDevice, store } from './store.svelte.ts'

export type ConnState = 'offline' | 'connecting' | 'online' | 'error'

export type Conn = {
  id: string
  name: string
  driver: Driver
  state: ConnState
  error?: string
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

export const supported = () =>
  typeof navigator !== 'undefined' && 'bluetooth' in navigator

function track(device: BluetoothDevice, driver: Driver) {
  const name = device.name ?? '(sem nome)'
  conns[device.id] ??= { id: device.id, name, driver, state: 'offline' }
  Object.assign(conns[device.id], { name })
  if (!live.has(device.id)) {
    live.set(device.id, { device, queue: new WriteQueue(driver.minGapMs) })
  }
  device.addEventListener('gattserverdisconnected', () => {
    const c = conns[device.id]
    if (c) c.state = 'offline'
    const l = live.get(device.id)
    if (l) l.char = undefined
  })
  rememberDevice({ id: device.id, name, driverId: driver.id })
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
    if (driver) conns[d.id] ??= { id: d.id, name: d.name, driver, state: 'offline' }
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
  for (const driver of order) {
    try {
      const service = await server.getPrimaryService(driver.service)
      const char = await service.getCharacteristic(driver.writeChar)
      return { driver, char }
    } catch {
      // Wrong family — try the next one.
    }
  }
  throw new Error('Nenhum serviço conhecido encontrado neste aparelho')
}

export async function connect(id: string): Promise<void> {
  const l = live.get(id)
  const c = conns[id]
  if (!l || !c) throw new Error('Aparelho não pareado nesta sessão — use Adicionar')
  if (c.state === 'online' && l.char) return

  c.state = 'connecting'
  c.error = undefined
  try {
    const server = await l.device.gatt!.connect()
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
      await l.queue.push(() => writeRaw(l, frame))
    }
  } catch (e) {
    c.state = 'error'
    c.error = e instanceof Error ? e.message : String(e)
    throw e
  }
}

export function disconnect(id: string) {
  const l = live.get(id)
  if (l?.device.gatt?.connected) l.device.gatt.disconnect()
  const c = conns[id]
  if (c) c.state = 'offline'
}

async function writeRaw(l: Live, frame: Uint8Array) {
  const char = l.char
  if (!char) throw new Error('Não conectado')
  const buf = frame as unknown as BufferSource
  try {
    // These controllers advertise write-without-response, which is also the only
    // mode fast enough for a colour slider.
    await char.writeValueWithoutResponse(buf)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotSupportedError') {
      await char.writeValue(buf)
      return
    }
    throw e
  }
}

/** Devices the current selection resolves to, skipping ones that are not live. */
export const targets = () => selection.ids.map((id) => conns[id]).filter(Boolean)

/**
 * Build a frame per device (drivers differ) and write it to everything selected.
 * `coalesceKey` marks a stream where only the newest value matters.
 */
export async function apply(
  build: (driver: Driver, name: string) => Uint8Array | undefined,
  coalesceKey?: string,
): Promise<void> {
  await Promise.allSettled(
    selection.ids.map(async (id) => {
      const c = conns[id]
      const l = live.get(id)
      if (!c || !l) return
      if (c.state !== 'online') await connect(id)
      const frame = build(c.driver, c.name)
      if (!frame) return
      const op = () => writeRaw(l, frame)
      return coalesceKey ? l.queue.pushLatest(coalesceKey, op) : l.queue.push(op)
    }),
  )
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
  const server = await l.device.gatt!.connect()

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
  if (c.state !== 'online') await connect(id)

  if (charUuid && charUuid !== l.char?.uuid) {
    const server = await l.device.gatt!.connect()
    for (const service of await server.getPrimaryServices()) {
      for (const ch of await service.getCharacteristics()) {
        if (ch.uuid === charUuid) {
          await l.queue.push(() => writeRaw({ ...l, char: ch }, frame))
          return
        }
      }
    }
    throw new Error(`Característica ${charUuid} não encontrada`)
  }
  await l.queue.push(() => writeRaw(l, frame))
}

