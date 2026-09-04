import type { Driver } from './types.ts'
import { fff0 } from './fff0.ts'
import { ffe0 } from './ffe0.ts'

export * from './types.ts'
export { fff0, ffe0 }

export const drivers: Driver[] = [fff0, ffe0]

export const driverFor = (name: string): Driver | undefined =>
  drivers.find((d) => d.matches(name))

/** Every service uuid Web Bluetooth must be told about up front. */
export const allServices = drivers.map((d) => d.service)
