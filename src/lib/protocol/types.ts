export type Caps = {
  rgb: boolean
  white: boolean
  cct: boolean
  speed: boolean
  effects: boolean
  scenes: boolean
}

export type Effect = { id: number; name: string; group?: string }

/**
 * One protocol family. Frames are built pure — no I/O here, so every builder is
 * unit-testable against the byte templates in docs/protocol/.
 */
export type Driver = {
  id: string
  label: string
  service: string
  writeChar: string
  /** Minimum gap between writes to one device, per the original app's throttle. */
  minGapMs: number

  matches(name: string): boolean
  caps(name: string): Caps
  effects(name: string): Effect[]

  /** Frames to write right after connecting, if the family needs a handshake. */
  onConnect?(name: string, now?: Date): Uint8Array[]

  /**
   * `ch` addresses one physical output on a multi-output controller. Drivers that
   * have no such concept ignore it. Undefined means "whatever the family's default
   * byte is", which is not always the same as "all outputs".
   */
  power(on: boolean, name: string, ch?: number): Uint8Array
  rgb(r: number, g: number, b: number, name: string, ch?: number): Uint8Array
  /** pct 0..100 */
  brightness(pct: number, name: string, ch?: number): Uint8Array
  /** pct 0..100 */
  speed(pct: number, name: string, ch?: number): Uint8Array
  effect(e: Effect, name: string, ch?: number): Uint8Array
  /** True when the family puts an output selector in the frame. */
  hasChannels?: boolean
  /** pct 0..100 */
  white?(pct: number, name: string): Uint8Array
  /** warm/cool 0..100 */
  cct?(warm: number, cool: number, name: string): Uint8Array
}

export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : Math.round(v)

export const pct = (v: number) => clamp(v, 0, 100)
export const byte = (v: number) => clamp(v, 0, 255)
