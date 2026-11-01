import type { Driver } from './types.ts'
import { fff0 } from './fff0.ts'
import { ffe0 } from './ffe0.ts'
import { bledim } from './bledim.ts'
import { ipixel } from './ipixel.ts'
import { magiclight } from './magiclight.ts'
import { zengge } from './zengge.ts'

export * from './types.ts'
export { fff0, ffe0, bledim, ipixel, magiclight, zengge }

// bledim shares fff0's service, so it must be probed first — matching is by name
// and the service alone cannot tell them apart.
// ffe0 also claims LED_BLE_xx names; on an iPixel panel the GATT probe falls through
// to ipixel's own service, so it can sit last. Magic Light advertises LEDBLE-xx too;
// the probe finds its FFE5/FFE9 pair, so it sits after ffe0 and existing LEDBLE
// controllers keep their family.
export const drivers: Driver[] = [bledim, fff0, ffe0, ipixel, magiclight, zengge]

export const driverFor = (name: string): Driver | undefined =>
  drivers.find((d) => d.matches(name))

/** Every service uuid Web Bluetooth must be told about up front. */
export const allServices = [
  ...new Set(drivers.flatMap((d) => [d.service, d.notifyService ?? d.service])),
]

/** Every company id whose advertised manufacturer data some family reads. */
export const manufacturerIds = drivers.flatMap((d) => d.manufacturerIds ?? [])
