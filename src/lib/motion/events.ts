/**
 * Plain-language names for trigger rules. A rule stays { input, op, threshold }; an
 * event is just a way to show and pick one, with the threshold as a positive amount
 * and the sign coming from the event (braking is negative G).
 */
import type { MotionInput, MotionRule } from '../persist.ts'

type Trigger = NonNullable<MotionRule['trigger']>

export const EVENTS = {
  brake: { input: 'gLong', op: '<=', sign: -1, start: 0.4 },
  accel: { input: 'gLong', op: '>=', sign: 1, start: 0.3 },
  corner: { input: 'gLat', op: 'abs>=', sign: 1, start: 0.4 },
  faster: { input: 'speed', op: '>=', sign: 1, start: 30 },
  slower: { input: 'speed', op: '<=', sign: 1, start: 10 },
} as const satisfies Record<string, { input: MotionInput; op: Trigger['op']; sign: 1 | -1; start: number }>

export type MotionEvent = keyof typeof EVENTS

/** Undefined for a rule no event describes (made before events, by hand). */
export function eventOf(rule: MotionRule): MotionEvent | undefined {
  const tr = rule.trigger
  if (!tr) return undefined
  return (Object.keys(EVENTS) as MotionEvent[]).find((k) => {
    const e = EVENTS[k]
    return e.input === rule.input && e.op === tr.op && Math.sign(tr.threshold) !== -e.sign
  })
}

export function setEvent(rule: MotionRule, ev: MotionEvent) {
  const tr = rule.trigger
  if (!tr) return
  const e = EVENTS[ev]
  // Keep the amount when the unit stays the same (brake 0.5 G → corner 0.5 G).
  const same = (rule.input === 'speed') === (e.input === 'speed')
  const amount = same ? Math.abs(tr.threshold) : e.start
  rule.input = e.input
  tr.op = e.op
  tr.threshold = e.sign * amount
}

export const amountOf = (rule: MotionRule) => {
  const ev = eventOf(rule)
  return ev ? Math.abs(rule.trigger!.threshold) : rule.trigger!.threshold
}

export function setAmount(rule: MotionRule, v: number) {
  const ev = eventOf(rule)
  rule.trigger!.threshold = ev ? EVENTS[ev].sign * v : v
}
