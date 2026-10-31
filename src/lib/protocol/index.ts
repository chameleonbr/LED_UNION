import type { Driver } from './types.ts'
import { fff0 } from './fff0.ts'
import { ffe0 } from './ffe0.ts'
import { bledim } from './bledim.ts'
import { ipixel } from './ipixel.ts'

export * from './types.ts'
export { fff0, ffe0, bledim, ipixel }

// bledim shares fff0's service, so it must be probed first — matching is by name
// and the service alone cannot tell them apart.
// ffe0 also claims LED_BLE_xx names; on an iPixel panel the GATT probe falls through
// to ipixel's own service, so it can sit last.
export const drivers: Driver[] = [bledim, fff0, ffe0, ipixel]

export const driverFor = (name: string): Driver | undefined =>
  drivers.find((d) => d.matches(name))

/** Every service uuid Web Bluetooth must be told about up front. */
export const allServices = drivers.map((d) => d.service)
