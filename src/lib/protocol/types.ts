export type Caps = {
  rgb: boolean
  white: boolean
  cct: boolean
  speed: boolean
  effects: boolean
  scenes: boolean
  /** Has a user-built colour sequence command. Lets the UI ask without building frames. */
  custom: boolean
  /** Has a sound sensitivity command in its own layout. */
  sensitivity: boolean
}

export type Effect = { id: number; name: string; group?: string }

/**
 * One physical output of a controller, as the model defines it.
 *
 * `ch` is a channel byte; `variant` selects a whole protocol envelope. A model has
 * either kind, never both.
 */
export type DriverOutput = { label: string; ch?: number; variant?: string }

/** Where the sound comes from: the controller's own mic, or audio from the phone. */
export type SoundSource = 'mic' | 'music'

/**
 * A user-built colour sequence. Black is just another colour, so green → black → amber
 * is a strobe.
 */
export type CustomEffectSpec = {
  /** In play order, 0..255 per channel. */
  colors: Array<{ r: number; g: number; b: number }>
  /** Cross-fade between colours instead of jumping. */
  fade: boolean
}

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
  /**
   * The builders remember state between calls and key it by their `name` argument.
   * Callers then pass a per-device key there, since every unit of the family
   * advertises the same name.
   */
  keysStateByName?: boolean

  matches(name: string): boolean
  caps(name: string, variant?: string): Caps
  effects(name: string, variant?: string): Effect[]

  /** Frames to write right after connecting, if the family needs a handshake. */
  onConnect?(name: string, now?: Date): Uint8Array[]

  /**
   * `ch` addresses one physical output on a multi-output controller. Drivers that
   * have no such concept ignore it. Undefined means "whatever the family's default
   * byte is", which is not always the same as "all outputs".
   */
  power(on: boolean, name: string, ch?: number, variant?: string): Uint8Array
  rgb(r: number, g: number, b: number, name: string, ch?: number, variant?: string): Uint8Array
  /** pct 0..100 */
  brightness(pct: number, name: string, ch?: number, variant?: string): Uint8Array
  /** pct 0..100 */
  speed(pct: number, name: string, ch?: number, variant?: string): Uint8Array
  effect(e: Effect, name: string, ch?: number, variant?: string): Uint8Array
  /** True when the family puts an output selector in the frame. */
  hasChannels?: boolean
  /**
   * The outputs this model drives, derived from the advertised name.
   *
   * How many lights a controller feeds is a property of the model, and the original
   * apps know it without asking — LEDCAR-01 always has an RGB output and a strip
   * output, LEDBLE-02 always has LED1 and LED2. Fewer than two means a single light.
   */
  outputs?(name: string): DriverOutput[]
  /** Split writes into chunks of this many bytes. Undefined sends the frame whole. */
  chunkSize?: number
  /** Some families need write-with-response; most take write-without-response. */
  writeWithResponse?: boolean
  /** Outputs this controller exposes, when the count is fixed by the protocol. */
  channelValues?: number[]

  /**
   * Sound-reactive control. `mic` is the controller's own microphone; `music` is the
   * phone streaming its audio, which most families encode as the same command with a
   * different flag. Not every family offers all three calls.
   */
  soundMode?(mode: number, name: string, source: SoundSource, ch?: number, variant?: string): Uint8Array
  /** Explicit on/off, for families that separate enabling from picking a mode. */
  soundEnable?(on: boolean, name: string): Uint8Array
  /** Microphone sensitivity, 0..100. */
  soundSensitivity?(pct: number, name: string, variant?: string): Uint8Array

  /**
   * Frames for a user-built colour sequence, in the order they must be sent.
   *
   * Returns a list because the families differ wildly: BLEDIM fits the whole sequence
   * in one frame, while the FFE0 families upload one frame per colour and then a start
   * command. An empty list means the family has no such command at all.
   */
  customEffect?(spec: CustomEffectSpec, name: string, ch?: number, variant?: string): Uint8Array[]
  /** pct 0..100 */
  white?(pct: number, name: string, variant?: string): Uint8Array
  /** warm/cool 0..100 */
  cct?(warm: number, cool: number, name: string, variant?: string): Uint8Array

  /** Also offer devices whose name starts with this, for units that do not advertise the service. */
  namePrefix?: string
  /** Characteristic the family answers on. Only families that reply set it. */
  notifyChar?: string
  /** Decode one notification. Undefined when it carries nothing the app keeps. */
  onNotify?(data: Uint8Array): DeviceReport | undefined

  /** LED panels: show content already stored in a numbered slot. */
  showSlot?(slot: number, name: string): Uint8Array
  /** LED panels: rotate the picture, 0..3. */
  orientation?(v: number, name: string): Uint8Array
  /** LED panels: wipe every stored slot. */
  deleteAll?(name: string): Uint8Array
}

/** What a panel says about itself. Size is absent when the type byte is not in the table. */
export type PanelInfo = { type: number; width?: number; height?: number; locked?: boolean }

/** `mcu` is the firmware version as major*100 + minor (HW-info reply). */
export type DeviceReport = { panel?: PanelInfo; mcu?: number }

export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : Math.round(v)

// NaN would otherwise slip through clamp and land on the wire as 00 with no warning.
const finite = (v: number) => (Number.isFinite(v) ? v : 0)
export const pct = (v: number) => clamp(finite(v), 0, 100)
export const byte = (v: number) => clamp(finite(v), 0, 255)
