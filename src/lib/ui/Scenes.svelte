<script lang="ts">
  import { applyTo, sendFrames } from '../ble.svelte.ts'
  import { store, removeScene, setLook, type Look, type Scene } from '../store.svelte.ts'
  import { t } from '../i18n.svelte.ts'

  // Scenes may run side by side; each Apply stays disabled only while its own runs.
  let running = $state<string[]>([])
  let error = $state('')

  function rgb(hex: string) {
    const n = parseInt(hex.slice(1), 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }

  /**
   * Apply one entry. Order matters on these controllers: an effect overrides a static
   * colour, so whichever is sent last wins.
   */
  async function applyLook(key: string, look: Look) {
    const keys = [key]
    if (look.power !== undefined) {
      await applyTo(keys, (d, n, c, v) => d.power(look.power!, n, c, v))
    }
    if (look.brightness !== undefined) {
      await applyTo(keys, (d, n, c, v) => d.brightness(look.brightness!, n, c, v))
    }
    if (look.speed !== undefined) {
      await applyTo(keys, (d, n, c, v) => d.speed(look.speed!, n, c, v))
    }
    if (look.colorHex) {
      const { r, g, b } = rgb(look.colorHex)
      await applyTo(keys, (d, n, c, v) => d.rgb(r, g, b, n, c, v))
    } else if (look.white !== undefined) {
      await applyTo(keys, (d, n, _c, v) => d.white?.(look.white!, n, v))
    } else if (look.cct !== undefined) {
      await applyTo(keys, (d, n, _c, v) => d.cct?.(look.cct!, 100 - look.cct!, n, v))
    }
    if (look.customEffectId) {
      const fx = store.customEffects.find((f) => f.id === look.customEffectId)
      if (fx) {
        await sendFrames(key, (d, n, c, v) =>
          d.customEffect?.({ colors: fx.colors.map(rgb), fade: fx.fade }, n, c, v) ?? [],
        )
        // Same as DeviceCard.runCustom: the sequence plays at its own speed.
        await applyTo(keys, (d, n, c, v) => d.speed(fx.speed, n, c, v))
      }
    } else if (look.effect) {
      await applyTo(keys, (d, n, c, v) => d.effect(look.effect!, n, c, v))
    }
    setLook(key, look)
  }

  /**
   * Only the devices stored in the scene are touched. Anything the user left out keeps
   * whatever it was doing — that is the whole point of choosing what to save.
   *
   * applyTo reconnects a device that dropped offline, so walking back into the car and
   * hitting a scene works without connecting by hand first.
   */
  async function run(s: Scene) {
    if (running.includes(s.id)) return
    running = [...running, s.id]
    error = ''
    try {
      for (const entry of s.entries) await applyLook(entry.key, entry.look)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      running = running.filter((id) => id !== s.id)
    }
  }
</script>

<div class="col">
  {#if store.scenes.length === 0}
    <div class="card muted">{t('scenes.empty')}</div>
  {/if}

  {#if error}
    <div class="card" style="border-color:var(--err); color:var(--err)">{error}</div>
  {/if}

  {#each store.scenes as s (s.id)}
    <div class="card row">
      <div class="grow col" style="gap:2px">
        <div class="truncate">{s.name}</div>
        <div class="small muted">{t('scenes.count', { n: s.entries.length })}</div>
      </div>
      <button class="primary small" onclick={() => run(s)} disabled={running.includes(s.id)}>
        {t('scenes.apply')}
      </button>
      <button class="ghost danger small" title={t('common.remove')}
              onclick={() => removeScene(s.id)}>✕</button>
    </div>
  {/each}
</div>
