import { applyTo, sendFrames, type SendOpts } from './ble.svelte.ts'
import { store, setLook, type Look } from './store.svelte.ts'

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/**
 * Apply one entry. Order matters on these controllers: an effect overrides a static
 * colour, so whichever is sent last wins. A panel's slot goes last for the same reason.
 */
export async function applyLook(key: string, look: Look, opts?: SendOpts) {
  const keys = [key]
  if (look.power !== undefined) {
    await applyTo(keys, (d, n, c, v) => d.power(look.power!, n, c, v), undefined, opts)
  }
  if (look.brightness !== undefined) {
    await applyTo(keys, (d, n, c, v) => d.brightness(look.brightness!, n, c, v), undefined, opts)
  }
  if (look.speed !== undefined) {
    await applyTo(keys, (d, n, c, v) => d.speed(look.speed!, n, c, v), undefined, opts)
  }
  if (look.colorHex) {
    const { r, g, b } = rgb(look.colorHex)
    await applyTo(keys, (d, n, c, v) => d.rgb(r, g, b, n, c, v), undefined, opts)
  } else if (look.white !== undefined) {
    await applyTo(keys, (d, n, _c, v) => d.white?.(look.white!, n, v), undefined, opts)
  } else if (look.cct !== undefined) {
    await applyTo(keys, (d, n, _c, v) => d.cct?.(look.cct!, 100 - look.cct!, n, v), undefined, opts)
  }
  if (look.customEffectId) {
    const fx = store.customEffects.find((f) => f.id === look.customEffectId)
    if (fx) {
      await sendFrames(
        key,
        (d, n, c, v) =>
          d.customEffect?.({ colors: fx.colors.map(rgb), fade: fx.fade }, n, c, v) ?? [],
        opts,
      )
      // Same as DeviceCard.runCustom: the sequence plays at its own speed.
      await applyTo(keys, (d, n, c, v) => d.speed(fx.speed, n, c, v), undefined, opts)
    }
  } else if (look.effect) {
    await applyTo(keys, (d, n, c, v) => d.effect(look.effect!, n, c, v), undefined, opts)
  }
  if (look.panel?.kind === 'slot') {
    const slot = look.panel.slot
    await applyTo(keys, (d, n) => d.showSlot?.(slot, n), undefined, opts)
  }
  setLook(key, look)
}
