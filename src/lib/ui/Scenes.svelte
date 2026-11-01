<script lang="ts">
  import { leaveStealth } from '../ble.svelte.ts'
  import { applyScene } from '../look.ts'
  import { store, removeScene, type Scene } from '../store.svelte.ts'
  import { t } from '../i18n.svelte.ts'

  // Scenes may run side by side; each Apply stays disabled only while its own runs.
  let running = $state<string[]>([])
  let error = $state('')

  /**
   * Only the devices stored in the scene are touched. Anything the user left out keeps
   * whatever it was doing — that is the whole point of choosing what to save.
   *
   * applyTo reconnects a device that dropped offline, so walking back into the car and
   * hitting a scene works without connecting by hand first.
   */
  async function run(s: Scene) {
    if (running.includes(s.id)) return
    // Ask once for the whole scene, not once per frame.
    if (!leaveStealth()) return
    running = [...running, s.id]
    error = ''
    try {
      await applyScene(s)
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
        <div class="small muted">
          {t('scenes.count', { n: s.entries.length })}
          {#each s.entries.filter((e) => e.look.panel) as e (e.key)}
            · {t('scenes.slot', { n: e.look.panel!.slot })}
          {/each}
        </div>
      </div>
      <button class="primary small" onclick={() => run(s)} disabled={running.includes(s.id)}>
        {t('scenes.apply')}
      </button>
      <button class="ghost danger small" title={t('common.remove')}
              onclick={() => removeScene(s.id)}>✕</button>
    </div>
  {/each}
</div>
