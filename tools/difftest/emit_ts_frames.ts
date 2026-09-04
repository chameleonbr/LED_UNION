/**
 * Emit every frame our drivers produce, as JSON, so it can be diffed against the
 * literals extracted from the decompiled originals.
 *
 * Run: node --experimental-strip-types tools/difftest/emit_ts_frames.ts
 */
import { drivers } from '../../src/lib/protocol/index.ts'
import type { Driver } from '../../src/lib/protocol/types.ts'

/** One representative advertised name per wire layout we claim to support. */
const NAMES = [
  'LEDBLE-00-9B67',
  'LEDSTAGE-1',
  'LEDDMX-00-1',
  'LEDDMX-02-1',
  'LEDCAR-00-1',
  'LEDCAR-01-1',
  'LEDCAR-02-1',
  'LEDSMART-1',
  'LEDSUN-1',
  'LEDLIKE-1',
  'LEDPHO-1',
  'MELK-OC-1',
  'MELK-OBCT-1',
  'ELK-BLEDOM',
  'XSL-Light',
  'BLEDIM',
]

/** Fixed probe values: distinctive enough that a swapped position is obvious. */
const R = 0x11
const G = 0x22
const B = 0x33
const PCTV = 50

type Row = {
  driver: string
  name: string
  command: string
  frame: number[]
}

function framesFor(d: Driver, name: string): Row[] {
  const rows: Row[] = []
  const add = (command: string, f: Uint8Array | undefined) => {
    if (f) rows.push({ driver: d.id, name, command, frame: [...f] })
  }
  add('power_on', d.power(true, name))
  add('power_off', d.power(false, name))
  add('rgb', d.rgb(R, G, B, name))
  add('brightness', d.brightness(PCTV, name))
  add('speed', d.speed(PCTV, name))
  add('white', d.white?.(PCTV, name))
  add('cct', d.cct?.(30, 70, name))
  const fx = d.effects(name)[0]
  if (fx) add('effect', d.effect(fx, name))
  for (const ch of [0, 1, 2]) {
    if (!d.hasChannels) break
    add(`rgb_ch${ch}`, d.rgb(R, G, B, name, ch))
  }
  for (const f of d.onConnect?.(name, new Date(2026, 8, 2, 14, 37)) ?? []) {
    add('on_connect', f)
  }
  return rows
}

const out: Row[] = []
for (const name of NAMES) {
  const d = drivers.find((x) => x.matches(name))
  if (!d) {
    console.error(`no driver claims ${name}`)
    continue
  }
  out.push(...framesFor(d, name))
}
console.log(JSON.stringify(out, null, 1))
