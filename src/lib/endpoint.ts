/**
 * A selection entry is either a whole device or one of its physical outputs.
 * Encoding both in one string keeps selection, groups and scenes as flat id lists.
 */
export const epKey = (deviceId: string, ch?: number) =>
  ch === undefined ? deviceId : `${deviceId}#${ch}`

export function parseEp(key: string): { deviceId: string; ch?: number } {
  const i = key.indexOf('#')
  if (i < 0) return { deviceId: key }
  const ch = Number(key.slice(i + 1))
  return Number.isFinite(ch)
    ? { deviceId: key.slice(0, i), ch }
    : { deviceId: key }
}
